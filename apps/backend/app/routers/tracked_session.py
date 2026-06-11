import logging

from fastapi import APIRouter, HTTPException, status

from app.models.auth import SessionInfo
from app.models.tracked_session import TrackedSessionRequest
from app.services.auth import apply_tracked_session
from app.services.cache import metadata_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/get-dstv-trackedsession", tags=["tracked-session"])


@router.post("/", response_model=SessionInfo)
async def ingest_tracked_session(payload: TrackedSessionRequest) -> SessionInfo:
    """Apply DStv session fields captured by an external browser tracker."""
    try:
        info = apply_tracked_session(
            authorization=payload.authorization,
            profile_id=payload.profile_id,
            waf_token=payload.waf_token,
            catalog_cookie=payload.catalog_cookie,
            irdeto_session_jwt=payload.irdeto_session_jwt,
            captured_at=payload.captured_at,
            source_url=payload.source_url,
            request_url=payload.request_url,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TRACKED_SESSION", "message": str(exc)},
        ) from exc

    metadata_cache.clear()
    logger.info(
        "Tracked session applied (connect %ss, irdeto %ss).",
        info.remaining_seconds,
        info.irdeto_session_remaining_seconds,
    )
    return info
