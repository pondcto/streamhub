import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response

from app.dependencies import require_auth
from app.models.auth import SessionData
from app.models.playback import PlaybackRequest, PlaybackResponse, StopPlaybackRequest
from app.services.cdn_proxy import CdnProxyError, fetch_cdn_resource
from app.services.entitlement import EntitlementError, EntitlementService
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["playback"])
entitlement_service = EntitlementService()


@router.post("/playback/{content_id}", response_model=PlaybackResponse)
async def start_playback(
    content_id: str,
    body: PlaybackRequest,
    request: Request,
    session: SessionData = Depends(require_auth),
) -> PlaybackResponse:
    api_base = str(request.base_url).rstrip("/")
    try:
        return await entitlement_service.verify_and_build_playback(
            content_id=content_id,
            content_type=body.contentType,
            user_access_token=session.dstv_access_token,
            channel_tag=body.channelTag,
            manifest_hint=body.manifestHint,
            api_base=api_base,
        )
    except EntitlementError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


@router.get("/playback/cdn")
async def proxy_playback_cdn(
    url: str,
    _session: SessionData = Depends(require_auth),
) -> Response:
    """Proxy Akamai/DStv CDN requests with browser headers and outbound proxy."""
    settings = get_settings()
    try:
        body, content_type = await fetch_cdn_resource(settings, url)
    except CdnProxyError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": "CDN_PROXY_FAILED", "message": str(exc)},
        ) from exc

    return Response(
        content=body,
        media_type=content_type,
        headers={"Cache-Control": "no-store"},
    )


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
