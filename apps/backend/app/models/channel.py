"""Persistent channel catalog — replaces hard-coded TEST_ITEMS at runtime."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Channel(Base):
    __tablename__ = "channels"

    content_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(16), default="streaming", nullable=False)
    channel_tag: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    channel_number: Mapped[str | None] = mapped_column(String(16), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(64), default="Live", nullable=False)
    manifest_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    live_manifest_cdn: Mapped[str | None] = mapped_column(String(16), nullable=True)
    live_cdn_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    direct_hls_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    vod_genref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    stack_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    program_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    season_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    asset_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
