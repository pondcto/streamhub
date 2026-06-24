"""Helpers for resolving channel -> proxy-profile assignments."""

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.proxy_profile import ChannelProfile, ProxyProfile


async def assigned_profile(db: AsyncSession, content_id: str) -> ProxyProfile | None:
    """Return the ProxyProfile assigned to ``content_id``, or None if unassigned
    (or the assignment points at a deleted profile)."""
    row = (
        await db.execute(
            select(ChannelProfile).where(ChannelProfile.content_id == content_id)
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    return (
        await db.execute(
            select(ProxyProfile).where(ProxyProfile.id == row.profile_id)
        )
    ).scalar_one_or_none()


def render_profile_env(profile: ProxyProfile) -> str:
    """Render a proxy profile as DSTV_* env lines (one KEY=value per line)."""
    lines = [
        f"DSTV_UA={profile.user_agent}",
        f"DSTV_PROXY_TYPE={profile.proxy_type}",
        f"DSTV_PROXY_HOST={profile.host}",
        f"DSTV_PROXY_PORT={profile.port}",
        f"DSTV_PROXY_USERNAME={profile.username}",
        f"DSTV_PROXY_PASSWORD={profile.password}",
    ]
    return "\n".join(lines) + "\n"


def write_channel_env(content_id: str, profile: ProxyProfile, dest_dir: str) -> Path:
    """Write ``{content_id}.env`` holding ``profile`` into ``dest_dir`` and
    return the path. Creates the directory if needed."""
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / f"{content_id}.env"
    path.write_text(render_profile_env(profile), encoding="utf-8")
    return path


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
