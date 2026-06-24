"""Persistent proxy profiles and their per-channel assignments.

A proxy profile bundles an outbound user-agent and a SOCKS/HTTP proxy
(host/port/credentials). Admins create profiles here and assign one to each
channel; the assignment lives in ``channel_profiles`` keyed by the static
``content_id`` from ``test_items``.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProxyProfile(Base):
    __tablename__ = "proxy_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    # Outbound User-Agent header ("AGENT" in the profile sample).
    user_agent: Mapped[str] = mapped_column(String(512), default="", nullable=False)
    # "socks5" | "socks5h" | "http" | "https"
    proxy_type: Mapped[str] = mapped_column(String(16), default="socks5", nullable=False)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    username: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    password: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class ChannelProfile(Base):
    """One row per channel that has a proxy profile assigned (content_id is unique)."""

    __tablename__ = "channel_profiles"

    content_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("proxy_profiles.id", ondelete="CASCADE"), nullable=False
    )
