import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.models.catalog import CatalogCard, CatalogPageResponse, CatalogRail, CatalogResponse, SeasonDetailResponse
from app.services.cache import metadata_cache
from app.services.dstv_client import DStvAPIError, DStvClient
from app.services.normalizers import (
    live_channels_to_catalog_cards,
    normalize_catalog,
    normalize_catalog_page,
    normalize_live_channels,
    normalize_season_detail,
)
from app.services.test_items import TEST_ITEMS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["catalog"])

VALID_SECTIONS = {"movies", "sport", "tvshows", "kids", "home"}

LIVE_FALLBACK_NOTICE = (
    "Showing live channels for this section. Catalog auth is missing — save Connect JWT, "
    "profile ID, and WAF token on the Admin page."
)

CATALOG_AUTH_FAILED_NOTICE = (
    "DStv blocks server-side replay of the sport VOD page API (401). "
    "Showing cached sport layout from fixture data. "
    "Save a fresh Connect JWT, profile ID, and WAF token on Admin every ~15 minutes."
)

SPORT_FIXTURE_NOTICE = (
    "Showing DStv sport layout from local fixture (Connect JWT expired or missing). "
    "Refresh catalog auth on the Admin page for live catalog data."
)


def _sport_fixture_rails() -> list[CatalogRail]:
    from app.fixtures.sport_page import load_sport_page_fixture

    raw = load_sport_page_fixture()
    rails = normalize_catalog_page(raw, "sport")
    return rails if rails else []


def _sport_fixture_response(notice: str | None = None) -> CatalogPageResponse | None:
    rails = _sport_fixture_rails()
    if not rails:
        return None
    return CatalogPageResponse(
        section="sport",
        rails=rails,
        source="fixture",
        notice=notice or SPORT_FIXTURE_NOTICE,
    )


async def _live_fallback(client: DStvClient, section: str) -> CatalogResponse:
    try:
        raw = await client.get_live_channels()
    except DStvAPIError as exc:
        logger.warning("Live fallback failed for %s: %s", section, exc.detail or str(exc))
        return CatalogResponse(section=section, items=[], source="live_fallback")

    try:
        channels = normalize_live_channels(raw)
        items = live_channels_to_catalog_cards(channels, section)
    except Exception as exc:
        logger.warning("Live fallback normalization failed for %s: %s", section, exc)
        return CatalogResponse(section=section, items=[], source="live_fallback")

    return CatalogResponse(
        section=section,
        items=items,
        source="live_fallback",
        notice=LIVE_FALLBACK_NOTICE if items else None,
    )


@router.get("/catalog/{section}", response_model=CatalogResponse)
async def get_catalog(
    section: Literal["movies", "sport", "tvshows", "kids", "home"],
) -> CatalogResponse:
    if section not in VALID_SECTIONS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Unknown catalog section: {section}"},
        )

    settings = get_settings()

    async with DStvClient(settings) as client:
        if not client.has_catalog_auth():
            cache_key = f"catalog:fallback:{section}"
            cached = metadata_cache.get(cache_key)
            if cached is not None:
                return CatalogResponse(
                    section=section,
                    items=cached,
                    source="live_fallback",
                    notice=LIVE_FALLBACK_NOTICE if cached else None,
                )
            response = await _live_fallback(client, section)
            metadata_cache.set(cache_key, response.items, settings.cache_ttl_catalog)
            return response

        cache_key = f"catalog:{section}"
        cached = metadata_cache.get(cache_key)
        if cached is not None:
            return CatalogResponse(section=section, items=cached, source="catalog")

        try:
            raw = await client.get_vod_section(section)
        except DStvAPIError as exc:
            if exc.status_code == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "NOT_FOUND", "message": f"Catalog section not found: {section}"},
                ) from exc
            logger.warning("Catalog fetch failed for %s: %s", section, exc.detail or str(exc))
            response = await _live_fallback(client, section)
            if exc.status_code in (401, 403):
                response.notice = CATALOG_AUTH_FAILED_NOTICE
            metadata_cache.set(f"catalog:fallback:{section}", response.items, settings.cache_ttl_catalog)
            return response

        items = normalize_catalog(raw, section)
        if not items:
            response = await _live_fallback(client, section)
            metadata_cache.set(f"catalog:fallback:{section}", response.items, settings.cache_ttl_catalog)
            return response

        metadata_cache.set(cache_key, items, settings.cache_ttl_catalog)
        return CatalogResponse(section=section, items=items, source="catalog")


async def _granular_curated_sport_rails(client: DStvClient) -> list[CatalogRail]:
    """Build sport VOD rails from granular_catalogue (works when vod_sections JWT replay fails)."""
    cards: list[CatalogCard] = []
    for spec in TEST_ITEMS:
        if spec.content_type != "streaming" or not spec.stack_id or not spec.program_id or not spec.season_id:
            continue
        try:
            meta = await client.get_season_catalogue(spec.stack_id, spec.program_id, spec.season_id)
            detail = normalize_season_detail(meta)
        except DStvAPIError as exc:
            logger.warning(
                "Granular sport fallback failed for %s/%s/%s: %s",
                spec.stack_id,
                spec.program_id,
                spec.season_id,
                exc.detail or str(exc),
            )
            if spec.title:
                cards.append(
                    CatalogCard(
                        id=spec.asset_id or spec.id,
                        title=spec.title,
                        type="streaming",
                        description=spec.description,
                        category=spec.category,
                        manifest_hint=spec.manifest_hint,
                        stack_id=spec.stack_id,
                        program_id=spec.program_id,
                        season_id=spec.season_id,
                        links=[],
                    )
                )
            continue

        for video in detail.get("videos") or []:
            cards.append(
                CatalogCard(
                    id=str(video.get("id") or spec.id),
                    title=str(video.get("title") or spec.title or "Sport"),
                    type="streaming",
                    description=video.get("synopsis") or spec.description,
                    image=video.get("image"),
                    category=spec.category,
                    duration=video.get("duration"),
                    manifest_hint=video.get("manifest_hint") or spec.manifest_hint,
                    stack_id=spec.stack_id,
                    program_id=spec.program_id,
                    season_id=spec.season_id,
                    links=[],
                )
            )

    if not cards:
        return []

    rails: list[CatalogRail] = [
        CatalogRail(id="sport-hero", title="Featured Sport", layout="hero", items=[cards[0]])
    ]
    if len(cards) > 1:
        rails.append(
            CatalogRail(
                id="sport-highlights",
                title="Sport Highlights",
                layout="landscape",
                items=cards[1:12],
            )
        )
    return rails


async def _sport_combined_fallback(
    client: DStvClient,
    *,
    notice: str | None = None,
) -> CatalogPageResponse:
    granular_rails = await _granular_curated_sport_rails(client)
    live_response = await _live_fallback(client, "sport")
    live_cards = live_response.items

    rails: list[CatalogRail] = list(granular_rails)
    if live_cards:
        if not rails:
            rails.append(CatalogRail(id="live-hero", title="Live Sport", layout="hero", items=live_cards[:1]))
            if len(live_cards) > 1:
                rails.append(
                    CatalogRail(
                        id="live-channels",
                        title="Live Channels",
                        layout="landscape",
                        items=live_cards[1:25],
                    )
                )
        else:
            rails.append(
                CatalogRail(
                    id="live-channels",
                    title="Live Sport Channels",
                    layout="landscape",
                    items=live_cards[:24],
                )
            )

    return CatalogPageResponse(
        section="sport",
        rails=rails,
        source="live_fallback",
        notice=notice or live_response.notice,
    )


async def _live_fallback_rails(client: DStvClient, section: str, notice: str | None = None) -> CatalogPageResponse:
    response = await _live_fallback(client, section)
    cards = response.items
    rails: list[CatalogRail] = []
    if cards:
        rails.append(CatalogRail(id="live-hero", title="Live Sport", layout="hero", items=cards[:1]))
        if len(cards) > 1:
            rails.append(
                CatalogRail(id="live-channels", title="Live Channels", layout="landscape", items=cards[1:25])
            )
    return CatalogPageResponse(
        section=section,
        rails=rails,
        source="live_fallback",
        notice=notice or response.notice,
    )


@router.get("/catalog/sport/page", response_model=CatalogPageResponse)
async def get_sport_page() -> CatalogPageResponse:
    section = "sport"
    settings = get_settings()

    async with DStvClient(settings) as client:
        if not client.has_catalog_auth():
            cache_key = "catalog:page:fixture:sport"
            cached = metadata_cache.get(cache_key)
            if cached is not None:
                return CatalogPageResponse(
                    section=section,
                    rails=cached,
                    source="fixture",
                    notice=SPORT_FIXTURE_NOTICE,
                )
            fixture = _sport_fixture_response()
            if fixture:
                metadata_cache.set(cache_key, fixture.rails, settings.cache_ttl_catalog)
                return fixture
            response = await _live_fallback_rails(client, section)
            metadata_cache.set("catalog:page:fallback:sport", response.rails, settings.cache_ttl_catalog)
            return response

        cache_key = "catalog:page:sport"
        cached = metadata_cache.get(cache_key)
        if cached is not None:
            return CatalogPageResponse(section=section, rails=cached, source="catalog")

        try:
            raw = await client.get_vod_section(section)
        except DStvAPIError as exc:
            logger.warning("Sport page fetch failed: %s", exc.detail or str(exc))
            notice = CATALOG_AUTH_FAILED_NOTICE if exc.status_code in (401, 403) else LIVE_FALLBACK_NOTICE
            fixture = _sport_fixture_response(notice=notice)
            if fixture:
                metadata_cache.set("catalog:page:fixture:sport", fixture.rails, settings.cache_ttl_catalog)
                return fixture
            response = await _sport_combined_fallback(client, notice=notice)
            metadata_cache.set("catalog:page:fallback:sport", response.rails, settings.cache_ttl_catalog)
            return response

        rails = normalize_catalog_page(raw, section)
        if not rails:
            fixture = _sport_fixture_response()
            if fixture:
                metadata_cache.set("catalog:page:fixture:sport", fixture.rails, settings.cache_ttl_catalog)
                return fixture
            response = await _sport_combined_fallback(client)
            metadata_cache.set("catalog:page:fallback:sport", response.rails, settings.cache_ttl_catalog)
            return response

        metadata_cache.set(cache_key, rails, settings.cache_ttl_catalog)
        return CatalogPageResponse(section=section, rails=rails, source="catalog")


@router.get(
    "/catalog/season/{stack_id}/{program_id}/{season_id}",
    response_model=SeasonDetailResponse,
)
async def get_season_detail(
    stack_id: str,
    program_id: str,
    season_id: str,
) -> SeasonDetailResponse:
    settings = get_settings()
    async with DStvClient(settings) as client:
        if not client.has_catalog_auth():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "DSTV_AUTH_REQUIRED", "message": "Catalog auth required on Admin page."},
            )
        try:
            meta = await client.get_season_catalogue(stack_id, program_id, season_id)
        except DStvAPIError as exc:
            raise HTTPException(
                status_code=exc.status_code,
                detail={"code": "CATALOG_ERROR", "message": "Failed to load season detail."},
            ) from exc

    normalized = normalize_season_detail(meta)
    normalized["stack_id"] = stack_id
    normalized["program_id"] = program_id
    return SeasonDetailResponse(**normalized)
