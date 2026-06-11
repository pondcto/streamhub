from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.models.auth import SessionData, UserPublic
from app.services.auth import (    get_configured_session,
    get_effective_access_token,
    get_irdeto_session,
    parse_session_info,
)


async def require_auth() -> SessionData:
    session = get_configured_session()
    if session:
        return session

    token = get_effective_access_token()
    if token:
        try:
            info = parse_session_info(token)
            return SessionData(
                user_id=str(info.subject or "default"),
                email="session@streamhub.local",
                display_name="StreamHub",
                dstv_access_token=token,
                dstv_token_expires_at=info.expires_at,
                created_at=datetime.now(timezone.utc),
            )
        except ValueError:
            pass

    if get_irdeto_session():
        return SessionData(
            user_id="default",
            email="session@streamhub.local",
            display_name="StreamHub",
            dstv_access_token=None,
            dstv_token_expires_at=None,
            created_at=datetime.now(timezone.utc),
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "code": "UNAUTHORIZED",
            "message": "No active session. Set DSTV_CONNECT_TOKEN or use the tracked session import.",
        },
    )


def session_to_user(session: SessionData) -> UserPublic:
    return UserPublic(
        id=session.user_id,
        email=session.email,
        display_name=session.display_name,
    )
