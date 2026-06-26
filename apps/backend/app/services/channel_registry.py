"""Load, cache, and create channel definitions from the database."""

from __future__ import annotations

import logging
from typing import Literal, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.channel import Channel
from app.models.proxy_profile import ChannelProfile
from app.models.schedule import Schedule
from app.services.channel_thumbnail_url import ThumbnailUrlError, normalize_live_thumbnail_url
from app.services.test_items import DEFAULT_SEED_ITEMS, TestItemSpec

logger = logging.getLogger(__name__)

_items: tuple[TestItemSpec, ...] = DEFAULT_SEED_ITEMS


def get_all_items() -> tuple[TestItemSpec, ...]:
    return _items


def find_test_item(item_id: str) -> Optional[TestItemSpec]:
    needle = item_id.strip()
    for spec in _items:
        if spec.id == needle:
            return spec
    return None


def find_test_item_by_channel_tag(channel_tag: str) -> Optional[TestItemSpec]:
    needle = channel_tag.strip().upper()
    for spec in _items:
        if (spec.channel_tag or "").strip().upper() == needle:
            return spec
    return None


def _row_to_spec(row: Channel) -> TestItemSpec:
    content_type = row.content_type.strip().lower()
    if content_type not in ("vod", "live", "streaming"):
        content_type = "streaming"
    cdn: Optional[Literal["akamai", "gtm"]] = None
    if row.live_manifest_cdn in ("akamai", "gtm"):
        cdn = row.live_manifest_cdn  # type: ignore[assignment]
    return TestItemSpec(
        id=row.content_id,
        content_type=content_type,  # type: ignore[arg-type]
        channel_tag=row.channel_tag,
        channel_number=row.channel_number,
        vod_genref=row.vod_genref,
        stack_id=row.stack_id,
        program_id=row.program_id,
        season_id=row.season_id,
        asset_id=row.asset_id,
        manifest_hint=row.manifest_hint,
        live_manifest_cdn=cdn,
        live_cdn_host=row.live_cdn_host,
        title=row.title,
        description=row.description,
        category=row.category or "Live",
        direct_hls_url=row.direct_hls_url,
        image_url=row.image_url,
    )


def _spec_to_row(spec: TestItemSpec) -> Channel:
    return Channel(
        content_id=spec.id,
        content_type=spec.content_type,
        channel_tag=spec.channel_tag,
        channel_number=spec.channel_number,
        title=spec.title,
        description=spec.description,
        category=spec.category,
        manifest_hint=spec.manifest_hint,
        live_manifest_cdn=spec.live_manifest_cdn,
        live_cdn_host=spec.live_cdn_host,
        direct_hls_url=spec.direct_hls_url,
        image_url=spec.image_url,
        vod_genref=spec.vod_genref,
        stack_id=spec.stack_id,
        program_id=spec.program_id,
        season_id=spec.season_id,
        asset_id=spec.asset_id,
    )


async def _reload_cache(db: AsyncSession) -> None:
    global _items
    rows = (await db.execute(select(Channel).order_by(Channel.created_at, Channel.content_id))).scalars().all()
    _items = tuple(_row_to_spec(row) for row in rows)
    logger.info("Channel registry loaded %s channel(s) from database.", len(_items))


async def seed_default_channels(db: AsyncSession) -> None:
    """Insert built-in channels when the table is empty (first deploy / fresh DB)."""
    count = await db.scalar(select(func.count()).select_from(Channel))
    if count and count > 0:
        return
    for spec in DEFAULT_SEED_ITEMS:
        db.add(_spec_to_row(spec))
    await db.commit()
    logger.info("Seeded %s default channel(s) into database.", len(DEFAULT_SEED_ITEMS))


async def initialize_registry(db: AsyncSession) -> None:
    await seed_default_channels(db)
    await _reload_cache(db)


async def create_channel(
    db: AsyncSession,
    *,
    content_id: str,
    channel_tag: str,
    title: str,
    manifest_hint: str,
    live_cdn_host: str,
    category: str = "Live",
    channel_number: str | None = None,
    image_url: str | None = None,
    live_manifest_cdn: str = "akamai",
) -> TestItemSpec:
    content_id = content_id.strip()
    channel_tag = channel_tag.strip().upper()
    title = title.strip()
    manifest_hint = manifest_hint.strip()
    live_cdn_host = live_cdn_host.strip().lower()

    if not content_id:
        raise ValueError("Content ID is required.")
    if not channel_tag:
        raise ValueError("Channel tag is required.")
    if not title:
        raise ValueError("Title is required.")
    if not manifest_hint:
        raise ValueError("Manifest hint is required.")
    if not live_cdn_host:
        raise ValueError("Live CDN host is required.")
    if not image_url or not str(image_url).strip():
        raise ValueError("Thumbnail image URL is required.")
    try:
        image_url = normalize_live_thumbnail_url(str(image_url), required=True)
    except ThumbnailUrlError as exc:
        raise ValueError(str(exc)) from exc

    existing = await db.get(Channel, content_id)
    if existing is not None:
        raise ValueError(f"A channel with content ID '{content_id}' already exists.")

    tag_taken = await db.scalar(
        select(Channel.content_id).where(
            func.upper(Channel.channel_tag) == channel_tag,
        )
    )
    if tag_taken:
        raise ValueError(f"Channel tag '{channel_tag}' is already used by '{tag_taken}'.")

    cdn = live_manifest_cdn.strip().lower()
    if cdn not in ("akamai", "gtm"):
        cdn = "akamai"

    spec = TestItemSpec(
        id=content_id,
        content_type="streaming",
        channel_tag=channel_tag,
        channel_number=(channel_number or "").strip() or None,
        manifest_hint=manifest_hint,
        live_manifest_cdn=cdn,  # type: ignore[arg-type]
        live_cdn_host=live_cdn_host,
        title=title,
        description=f"Live linear — {title} ({live_cdn_host}, hdntl).",
        category=category.strip() or "Live",
        direct_hls_url=None,
        image_url=image_url,
    )
    db.add(_spec_to_row(spec))
    await db.commit()
    await _reload_cache(db)
    logger.info("Registered channel %s (%s).", content_id, channel_tag)
    return spec


async def update_channel(
    db: AsyncSession,
    content_id: str,
    *,
    channel_tag: str | None = None,
    title: str | None = None,
    manifest_hint: str | None = None,
    live_cdn_host: str | None = None,
    category: str | None = None,
    channel_number: str | None = None,
    image_url: str | None = None,
    live_manifest_cdn: str | None = None,
    clear_image_url: bool = False,
) -> TestItemSpec:
    content_id = content_id.strip()
    row = await db.get(Channel, content_id)
    if row is None:
        raise ValueError(f"Unknown channel: {content_id}")

    if channel_tag is not None:
        channel_tag = channel_tag.strip().upper()
        if not channel_tag:
            raise ValueError("Channel tag is required.")
        tag_taken = await db.scalar(
            select(Channel.content_id).where(
                func.upper(Channel.channel_tag) == channel_tag,
                Channel.content_id != content_id,
            )
        )
        if tag_taken:
            raise ValueError(f"Channel tag '{channel_tag}' is already used by '{tag_taken}'.")
        row.channel_tag = channel_tag

    if title is not None:
        title = title.strip()
        if not title:
            raise ValueError("Title is required.")
        row.title = title
        host = (row.live_cdn_host or "").strip()
        row.description = f"Live linear — {title} ({host}, hdntl)." if host else row.description

    if manifest_hint is not None:
        manifest_hint = manifest_hint.strip()
        if not manifest_hint:
            raise ValueError("Manifest hint is required.")
        row.manifest_hint = manifest_hint

    if live_cdn_host is not None:
        live_cdn_host = live_cdn_host.strip().lower()
        if not live_cdn_host:
            raise ValueError("Live CDN host is required.")
        row.live_cdn_host = live_cdn_host
        if row.title:
            row.description = f"Live linear — {row.title} ({live_cdn_host}, hdntl)."

    if category is not None:
        row.category = category.strip() or "Live"

    if channel_number is not None:
        row.channel_number = channel_number.strip() or None

    if clear_image_url:
        raise ValueError("Thumbnail image URL is required.")
    elif image_url is not None:
        try:
            row.image_url = normalize_live_thumbnail_url(image_url, required=True)
        except ThumbnailUrlError as exc:
            raise ValueError(str(exc)) from exc

    if live_manifest_cdn is not None:
        cdn = live_manifest_cdn.strip().lower()
        if cdn in ("akamai", "gtm"):
            row.live_manifest_cdn = cdn

    await db.commit()
    await _reload_cache(db)
    spec = find_test_item(content_id)
    if spec is None:
        raise ValueError(f"Unknown channel: {content_id}")
    logger.info("Updated channel %s.", content_id)
    return spec


async def delete_channel(db: AsyncSession, content_id: str) -> None:
    content_id = content_id.strip()
    row = await db.get(Channel, content_id)
    if row is None:
        raise ValueError(f"Unknown channel: {content_id}")

    await db.execute(delete(ChannelProfile).where(ChannelProfile.content_id == content_id))
    await db.execute(delete(Schedule).where(Schedule.content_id == content_id))
    await db.delete(row)
    await db.commit()
    await _reload_cache(db)
    logger.info("Deleted channel %s.", content_id)
