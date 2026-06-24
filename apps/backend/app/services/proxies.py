"""Helpers for resolving channel -> proxy-profile assignments."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.proxy_profile import ChannelProfile, ProxyProfile


async def assignment_map(db: AsyncSession) -> dict[str, ProxyProfile]:
    """Return content_id -> ProxyProfile for every assigned channel.

    Assignments pointing at a deleted profile are simply omitted.
    """
    rows = (await db.execute(select(ChannelProfile))).scalars().all()
    if not rows:
        return {}
    profiles = {
        p.id: p
        for p in (await db.execute(select(ProxyProfile))).scalars().all()
    }
    return {
        row.content_id: profiles[row.profile_id]
        for row in rows
        if row.profile_id in profiles
    }
