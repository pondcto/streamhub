"""Admin controller — start/stop channel restreams and tail their logs.

All routes require an authenticated admin (role == "admin"). Reuses the shared
controller service so the admin and the user "Watch" flow drive the same
wv-mpd-streaming processes.
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_admin, require_admin_download
from app.config import get_settings
from app.db import get_db
from app.models.admin import AdminChannel, AdminChannelCreate, AdminChannelList, AdminChannelUpdate, LogChunk
from app.services import controller, proxies
from app.services.auth import get_stored_live_manifest_url
from app.services.channel_registry import (
    create_channel,
    delete_channel,
    find_test_item,
    get_all_items,
    update_channel,
)
from app.services.live_manifest import akamai_token_expires_at, is_akamai_token_expired
from app.services.test_items import TestItemSpec

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

# Separate router for endpoints that must accept a JWT via ?token= query param
# (e.g. file downloads opened directly in the browser, no Authorization header).
download_router = APIRouter(prefix="/api/admin", tags=["admin"])


def _manifest_for(channel_tag: str | None) -> str | None:
    return get_stored_live_manifest_url(channel_tag) if channel_tag else None


def _ensure_channel_stopped(content_id: str) -> None:
    if controller.is_running(content_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CHANNEL_RUNNING",
                "message": f"Stop {content_id} before editing or deleting it.",
            },
        )


def _admin_channel_from_spec(
    spec: TestItemSpec,
    *,
    profile_id: int | None = None,
    profile_name: str | None = None,
) -> AdminChannel:
    info = controller.get_status(spec.id)
    return AdminChannel(
        contentId=spec.id,
        channelTag=spec.channel_tag,
        channelNumber=spec.channel_number,
        title=spec.title,
        category=spec.category,
        contentType=spec.content_type,
        manifestHint=spec.manifest_hint,
        liveCdnHost=spec.live_cdn_host,
        liveManifestCdn=spec.live_manifest_cdn,
        hasManifest=bool(_manifest_for(spec.channel_tag)),
        running=info is not None,
        pid=info["pid"] if info else None,
        hlsUrl=info["hlsUrl"] if info else None,
        startedAt=info["startedAt"] if info else None,
        directHlsUrl=spec.direct_hls_url,
        imageUrl=spec.image_url,
        profileId=profile_id,
        profileName=profile_name,
    )


@router.get("/channels", response_model=AdminChannelList)
async def list_channels(db: AsyncSession = Depends(get_db)) -> AdminChannelList:
    assignments = await proxies.assignment_map(db)
    channels: list[AdminChannel] = []
    for spec in get_all_items():
        profile = assignments.get(spec.id)
        channels.append(
            _admin_channel_from_spec(
                spec,
                profile_id=profile.id if profile else None,
                profile_name=profile.name if profile else None,
            )
        )
    return AdminChannelList(channels=channels)


@router.post("/channels", response_model=AdminChannel, status_code=status.HTTP_201_CREATED)
async def register_channel(
    body: AdminChannelCreate, db: AsyncSession = Depends(get_db)
) -> AdminChannel:
    try:
        spec = await create_channel(
            db,
            content_id=body.contentId,
            channel_tag=body.channelTag,
            title=body.title,
            manifest_hint=body.manifestHint,
            live_cdn_host=body.liveCdnHost,
            category=body.category,
            channel_number=body.channelNumber,
            image_url=body.imageUrl,
            direct_hls_url=body.directHlsUrl,
            live_manifest_cdn=body.liveManifestCdn,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CHANNEL", "message": str(exc)},
        ) from exc
    return _admin_channel_from_spec(spec)


@router.patch("/channels/{content_id}", response_model=AdminChannel)
async def edit_channel(
    content_id: str,
    body: AdminChannelUpdate,
    db: AsyncSession = Depends(get_db),
) -> AdminChannel:
    if find_test_item(content_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "UNKNOWN_CHANNEL", "message": f"Unknown channel: {content_id}"},
        )
    _ensure_channel_stopped(content_id)

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_CHANGES", "message": "No fields to update."},
        )

    try:
        spec = await update_channel(
            db,
            content_id,
            channel_tag=updates.get("channelTag"),
            title=updates.get("title"),
            manifest_hint=updates.get("manifestHint"),
            live_cdn_host=updates.get("liveCdnHost"),
            category=updates.get("category"),
            channel_number=updates.get("channelNumber"),
            image_url=updates.get("imageUrl"),
            live_manifest_cdn=updates.get("liveManifestCdn"),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CHANNEL", "message": str(exc)},
        ) from exc

    assignments = await proxies.assignment_map(db)
    profile = assignments.get(spec.id)
    return _admin_channel_from_spec(
        spec,
        profile_id=profile.id if profile else None,
        profile_name=profile.name if profile else None,
    )


@router.delete("/channels/{content_id}")
async def remove_channel(content_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    if find_test_item(content_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "UNKNOWN_CHANNEL", "message": f"Unknown channel: {content_id}"},
        )
    _ensure_channel_stopped(content_id)

    try:
        await delete_channel(db, content_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CHANNEL", "message": str(exc)},
        ) from exc

    return {"contentId": content_id, "deleted": True}


@router.post("/channels/{content_id}/start", response_model=AdminChannel)
async def start_channel(content_id: str, db: AsyncSession = Depends(get_db)) -> AdminChannel:
    spec = find_test_item(content_id)
    if spec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "UNKNOWN_CHANNEL", "message": f"Unknown channel: {content_id}"},
        )
    manifest = _manifest_for(spec.channel_tag)
    if not manifest:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "NO_MANIFEST",
                "message": (
                    f"No captured manifest for {spec.channel_tag or spec.id}. "
                    "Play the channel on dstv.stream so the session tracker captures a "
                    "live_manifest_url, then start again."
                ),
            },
        )
    if is_akamai_token_expired(manifest):
        import datetime as _dt
        exp = akamai_token_expires_at(manifest)
        exp_str = _dt.datetime.utcfromtimestamp(exp).strftime("%Y-%m-%d %H:%M UTC") if exp else "unknown"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "MANIFEST_EXPIRED",
                "message": (
                    f"Stored manifest for {spec.channel_tag or spec.id} expired at {exp_str}. "
                    "Re-play the channel on dstv.stream to capture a fresh URL, then start again."
                ),
            },
        )
    profile = await proxies.assigned_profile(db, spec.id)
    if profile is not None:
        env_path = proxies.write_channel_env(spec.id, profile, get_settings().proxy_env_dir)
        logger.info("Wrote proxy env for %s -> %s", spec.id, env_path)
    else:
        logger.warning("No proxy profile assigned to %s; skipping env export", spec.id)

    try:
        info = await controller.start_channel(
            content_id=spec.id,
            manifest_url=manifest,
            content_type=spec.content_type,
            channel_tag=spec.channel_tag,
            admin_managed=True,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "BINARY_NOT_FOUND", "message": str(exc)},
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "STREAM_START_FAILED", "message": str(exc)},
        ) from exc

    profile = await proxies.assigned_profile(db, spec.id)
    return AdminChannel(
        contentId=spec.id,
        channelTag=spec.channel_tag,
        channelNumber=spec.channel_number,
        title=spec.title,
        category=spec.category,
        contentType=spec.content_type,
        manifestHint=spec.manifest_hint,
        liveCdnHost=spec.live_cdn_host,
        liveManifestCdn=spec.live_manifest_cdn,
        hasManifest=True,
        running=True,
        pid=info["pid"],
        hlsUrl=info["hlsUrl"],
        startedAt=info["startedAt"],
        directHlsUrl=spec.direct_hls_url,
        imageUrl=spec.image_url,
        profileId=profile.id if profile else None,
        profileName=profile.name if profile else None,
    )


@router.post("/channels/{content_id}/stop")
async def stop_channel(content_id: str) -> dict:
    return {"contentId": content_id, "stopped": controller.stop_channel(content_id)}


@router.get("/channels/{content_id}/logs", response_model=LogChunk)
async def channel_logs(content_id: str, offset: int = 0) -> LogChunk:
    content, new_offset = controller.read_log_since(content_id, offset)
    return LogChunk(content=content, offset=new_offset, running=controller.is_running(content_id))


@download_router.get("/channels/{content_id}/logs/download")
async def download_channel_logs(
    content_id: str,
    _: object = Depends(require_admin_download),
) -> FileResponse:
    settings = get_settings()
    log_path = Path(settings.hls_logs_dir) / f"{content_id}.log"
    if not log_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_LOGS", "message": f"No log file found for {content_id}."},
        )
    return FileResponse(log_path, media_type="application/octet-stream", filename=f"{content_id}.log")
