from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import require_auth, session_to_user
from app.models.auth import SessionData, SessionInfo, SessionSetRequest, UserPublic
from app.services.auth import get_session_info, set_session_token
from app.services.cache import metadata_cache

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/session", response_model=SessionInfo)
async def get_session() -> SessionInfo:
    info = get_session_info()
    if info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_SESSION", "message": "No session token configured."},
        )
    return info


@router.post("/session", response_model=SessionInfo)
async def update_session(payload: SessionSetRequest) -> SessionInfo:
    try:
        info = set_session_token(
            payload.token,
            catalog_token=payload.catalog_token,
            catalog_cookie=payload.catalog_cookie,
            profile_id=payload.profile_id,
            waf_token=payload.waf_token,
            irdeto_session=payload.irdeto_session,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_SESSION", "message": str(exc)},
        ) from exc

    metadata_cache.clear()
    return info


@router.get("/me", response_model=UserPublic)
async def me(session: SessionData = Depends(require_auth)) -> UserPublic:
    return session_to_user(session)
