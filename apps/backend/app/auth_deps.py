"""FastAPI dependencies for app-user auth (distinct from the DStv-session
`require_auth` in app.dependencies)."""

from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
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


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise _unauthorized()
    try:
        payload = decode_access_token(creds.credentials)
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


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Admin access required."},
        )
    return user
