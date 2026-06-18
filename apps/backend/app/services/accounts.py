"""Account helpers: serialization + admin seeding."""

import logging

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models.accounts import AccountPublic
from app.models.user import User
from app.services.security import hash_password

logger = logging.getLogger(__name__)


def to_public(user: User) -> AccountPublic:
    return AccountPublic(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        created_at=user.created_at,
    )


async def seed_admin() -> None:
    """Create or promote the admin account from ADMIN_EMAIL/ADMIN_PASSWORD env vars.

    No-op if those are unset. If the email already exists it is promoted to admin
    (the password is left untouched).
    """
    settings = get_settings()
    email = (settings.admin_email or "").strip().lower()
    password = settings.admin_password or ""
    if not email or not password:
        return

    async with SessionLocal() as db:
        existing = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing is not None:
            if existing.role != "admin":
                existing.role = "admin"
                await db.commit()
                logger.info("Promoted existing account %s to admin", email)
            return

        db.add(
            User(
                email=email,
                display_name="Administrator",
                hashed_password=hash_password(password),
                role="admin",
            )
        )
        await db.commit()
        logger.info("Seeded admin account %s", email)
