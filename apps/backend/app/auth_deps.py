"""FastAPI dependencies for app-user auth (distinct from the DStv-session
`require_auth` in app.dependencies)."""

from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.user import User
from app.services.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(message: str = "Authentication required.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "UNAUTHENTICATED", "message": message},
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _resolve_user(jwt_token: str, db: AsyncSession) -> User:
    try:
        payload = decode_access_token(jwt_token)
    except jwt.PyJWTError:
        raise _unauthorized("Invalid or expired token.")
    sub = payload.get("sub")
    if not sub:
        raise _unauthorized("Invalid token.")
    try:
        user = await db.get(User, int(sub))
    except (TypeError, ValueError):
        raise _unauthorized("Invalid token.")
    if user is None or not user.is_active:
        raise _unauthorized("Account not found or disabled.")
    return user


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise _unauthorized()
    return await _resolve_user(creds.credentials, db)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Admin access required."},
        )
    return user


async def require_admin_download(
    token: Optional[str] = Query(default=None),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Admin auth that accepts the JWT from either Bearer header or ?token= query param.
    Used for file-download endpoints so the browser can open the URL directly."""
    jwt_token = (creds.credentials if creds else None) or token
    if not jwt_token:
        raise _unauthorized()
    user = await _resolve_user(jwt_token, db)
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Admin access required."},
        )
    return user
