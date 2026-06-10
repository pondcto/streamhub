import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import require_auth
from app.models.auth import SessionData
from app.models.playback import PlaybackRequest, PlaybackResponse, StopPlaybackRequest
from app.services.entitlement import EntitlementError, EntitlementService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["playback"])
entitlement_service = EntitlementService()


@router.post("/playback/{content_id}", response_model=PlaybackResponse)
async def start_playback(
    content_id: str,
    body: PlaybackRequest,
    session: SessionData = Depends(require_auth),
) -> PlaybackResponse:
    try:
        return await entitlement_service.verify_and_build_playback(
            content_id=content_id,
            content_type=body.contentType,
            user_access_token=session.dstv_access_token,
            channel_tag=body.channelTag,
            manifest_hint=body.manifestHint,
        )
    except EntitlementError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


@router.post("/playback/stop")
async def stop_playback(
    body: StopPlaybackRequest,
    session: SessionData = Depends(require_auth),
) -> dict:
    try:
        return await entitlement_service.stop_playback(
            user_access_token=session.dstv_access_token,
            content_id=body.contentId,
            session_id=body.sessionId,
        )
    except EntitlementError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
