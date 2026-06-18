"""HLS restream control — the user-facing "Watch" flow.

POST /api/stream/start spawns wv-mpd-streaming for a channel and returns the
HLS URL the frontend should play; /stop terminates it; /status lists running.
Requires a logged-in app user (not the DStv session).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth_deps import get_current_user
from app.models.stream import (
    StartStreamRequest,
    StopStreamRequest,
    StreamInfo,
    StreamListResponse,
)
from app.models.user import User
from app.services import controller

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stream", tags=["stream"])


@router.post("/start", response_model=StreamInfo)
async def start_stream(
    body: StartStreamRequest,
    _user: User = Depends(get_current_user),
) -> StreamInfo:
    try:
        info = await controller.start_channel(
            content_id=body.contentId,
            manifest_url=body.manifestUrl,
            content_type=body.contentType,
            channel_tag=body.channelTag,
            device_id=body.deviceId,
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
    return StreamInfo(**info)


@router.post("/stop")
async def stop_stream(
    body: StopStreamRequest,
    _user: User = Depends(get_current_user),
) -> dict:
    stopped = controller.stop_channel(body.contentId)
    return {"contentId": body.contentId, "stopped": stopped}


@router.get("/status", response_model=StreamListResponse)
async def stream_status(_user: User = Depends(get_current_user)) -> StreamListResponse:
    return StreamListResponse(running=[StreamInfo(**i) for i in controller.list_running()])
