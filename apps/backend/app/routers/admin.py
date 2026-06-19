"""Admin controller — start/stop channel restreams and tail their logs.

All routes require an authenticated admin (role == "admin"). Reuses the shared
controller service so the admin and the user "Watch" flow drive the same
wv-mpd-streaming processes.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth_deps import require_admin
from app.models.admin import AdminChannel, AdminChannelList, LogChunk
from app.services import controller
from app.services.auth import get_stored_live_manifest_url
from app.services.live_manifest import akamai_token_expires_at, is_akamai_token_expired
from app.services.test_items import TEST_ITEMS, find_test_item

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _manifest_for(channel_tag: str | None) -> str | None:
    return get_stored_live_manifest_url(channel_tag) if channel_tag else None


@router.get("/channels", response_model=AdminChannelList)
async def list_channels() -> AdminChannelList:
    channels: list[AdminChannel] = []
    for spec in TEST_ITEMS:
        info = controller.get_status(spec.id)
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
            )
        )
    return AdminChannelList(channels=channels)


@router.post("/channels/{content_id}/start", response_model=AdminChannel)
async def start_channel(content_id: str) -> AdminChannel:
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
