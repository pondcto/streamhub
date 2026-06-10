import logging

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.models.navigation import NavigationResponse
from app.services.cache import metadata_cache
from app.services.dstv_client import DStvAPIError, DStvClient
from app.services.normalizers import normalize_navigation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["navigation"])


@router.get("/navigation", response_model=NavigationResponse)
async def get_navigation() -> NavigationResponse:
    settings = get_settings()
    cache_key = "navigation"
    cached = metadata_cache.get(cache_key)
    if cached is not None:
        return NavigationResponse(sections=cached)

    try:
        async with DStvClient(settings) as client:
            raw = await client.get_navigation_menu()
    except DStvAPIError as exc:
        logger.warning("Navigation fetch failed: %s", exc.detail or str(exc))
        sections = normalize_navigation({})
        metadata_cache.set(cache_key, sections, settings.cache_ttl_navigation)
        return NavigationResponse(sections=sections)

    sections = normalize_navigation(raw)
    visible = [s for s in sections if s.visible]
    metadata_cache.set(cache_key, visible, settings.cache_ttl_navigation)
    return NavigationResponse(sections=visible)
