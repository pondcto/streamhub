from fastapi import HTTPException, status

from app.models.auth import SessionData, UserPublic
from app.services.auth import get_configured_session


async def require_auth() -> SessionData:
    session = get_configured_session()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "UNAUTHORIZED",
                "message": "No active session. Save Connect JWT and Irdeto session on the admin page.",
            },
        )
    return session


def session_to_user(session: SessionData) -> UserPublic:
    return UserPublic(
        id=session.user_id,
        email=session.email,
        display_name=session.display_name,
    )
