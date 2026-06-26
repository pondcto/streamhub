"""Validate live (remote) channel thumbnail URLs — not local file paths."""

from __future__ import annotations

from urllib.parse import urlparse


class ThumbnailUrlError(ValueError):
    pass


EXAMPLE_LIVE_THUMBNAIL = (
    "https://images.dstv.stream/images/epg/guide2/original/"
    "701356_NextLiveEvent.png?presentation=small_16x9"
)


def normalize_live_thumbnail_url(raw: str, *, required: bool = True) -> str | None:
    url = (raw or "").strip()
    if not url:
        if required:
            raise ThumbnailUrlError("Thumbnail image URL is required.")
        return None

    if url.startswith("/") or url.startswith("./") or url.startswith("../"):
        raise ThumbnailUrlError(
            "Thumbnail must be a live remote image URL (https://…), not a local file path."
        )

    if url.lower().startswith("file:"):
        raise ThumbnailUrlError("Thumbnail must be a live remote image URL, not a file:// path.")

    if not url.startswith(("http://", "https://")):
        url = f"https://{url.lstrip('/')}"

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ThumbnailUrlError(
            "Thumbnail must be a valid http(s) URL, e.g. images.dstv.stream/images/epg/…"
        )

    return url
