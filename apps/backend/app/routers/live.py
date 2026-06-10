import logging

from fastapi import APIRouter

from app.config import get_settings
from app.models.live import LiveChannelsResponse
from app.services.cache import metadata_cache
from app.services.dstv_client import DStvAPIError, DStvClient
from app.services.normalizers import normalize_live_channels

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["live"])


@router.get("/live/channels", response_model=LiveChannelsResponse)
async def get_live_channels() -> LiveChannelsResponse:
    settings = get_settings()
    cache_key = "live:channels"
    cached = metadata_cache.get(cache_key)
    if cached is not None:
        return LiveChannelsResponse(items=cached)

    try:
        async with DStvClient(settings) as client:
            raw = await client.get_live_channels()
    except DStvAPIError as exc:
        logger.warning("Live channels fetch failed: %s", exc.detail or str(exc))
        return LiveChannelsResponse(items=[])

    items = normalize_live_channels(raw)
    metadata_cache.set(cache_key, items, settings.cache_ttl_catalog)
    return LiveChannelsResponse(items=items)
