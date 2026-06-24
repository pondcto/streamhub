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
from app.models.admin import AdminChannel, AdminChannelList, LogChunk
from app.services import controller, proxies
from app.services.auth import get_stored_live_manifest_url
from app.services.live_manifest import akamai_token_expires_at, is_akamai_token_expired
from app.services.test_items import TEST_ITEMS, find_test_item

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

# Separate router for endpoints that must accept a JWT via ?token= query param
# (e.g. file downloads opened directly in the browser, no Authorization header).
download_router = APIRouter(prefix="/api/admin", tags=["admin"])


def _manifest_for(channel_tag: str | None) -> str | None:
    return get_stored_live_manifest_url(channel_tag) if channel_tag else None


@router.get("/channels", response_model=AdminChannelList)
async def list_channels(db: AsyncSession = Depends(get_db)) -> AdminChannelList:
    assignments = await proxies.assignment_map(db)
    channels: list[AdminChannel] = []
    for spec in TEST_ITEMS:
        info = controller.get_status(spec.id)
        profile = assignments.get(spec.id)
        channels.append(
            AdminChannel(
                contentId=spec.id,
                channelTag=spec.channel_tag,
                title=spec.title,
                category=spec.category,
                contentType=spec.content_type,
                hasManifest=bool(_manifest_for(spec.channel_tag)),
                running=info is not None,
                pid=info["pid"] if info else None,
                hlsUrl=info["hlsUrl"] if info else None,
                startedAt=info["startedAt"] if info else None,
                directHlsUrl=spec.direct_hls_url,
                profileId=profile.id if profile else None,
                profileName=profile.name if profile else None,
            )
        )
    return AdminChannelList(channels=channels)


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
    # Export the assigned proxy profile to {content_id}.env before the restream
    # starts, so the spawned process can pick up its DSTV_PROXY_* credentials.
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

    return AdminChannel(
        contentId=spec.id,
        channelTag=spec.channel_tag,
        title=spec.title,
        category=spec.category,
        contentType=spec.content_type,
        hasManifest=True,
        running=True,
        pid=info["pid"],
        hlsUrl=info["hlsUrl"],
        startedAt=info["startedAt"],
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
