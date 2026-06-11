import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.models.catalog import (
    CatalogCard,
    CatalogPageResponse,
    CatalogRail,
    CatalogResponse,
    SeasonDetailResponse,
    SeasonVideoCard,
)
from app.services.auth import catalog_auth_ready, get_connect_token_remaining_seconds
from app.services.catalog_ingest import (
    get_ingested_catalog_meta,
    get_ingested_catalog_raw,
    get_ingested_season_raw,
)
from app.services.cache import metadata_cache
from app.services.dstv_client import DStvAPIError, DStvClient
from app.services.normalizers import (
    _extract_image,
    live_channels_to_catalog_cards,
    normalize_catalog,
    normalize_catalog_page,
    normalize_live_channels,
    normalize_season_detail,
    pick_best_image,
)
from app.fixtures.sport_page import load_sport_page_fixture
from app.services.test_items import TEST_ITEMS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["catalog"])

VALID_SECTIONS = {"movies", "sport", "tvshows", "kids", "home"}

LIVE_FALLBACK_NOTICE = (
    "Showing live channels only. Save Connect JWT, profile ID, and WAF token on the Admin page "
    "for the full sport catalog."
)

CATALOG_AUTH_REJECTED_NOTICE = (
    "DStv blocked server-side catalog replay (AWS WAF). WAF tokens are tied to your browser IP "
    "and cannot be reused from the StreamHub server. POST the vod_sections/sports JSON response "
    "from your browser extension to /api/get-dstv-catalog/ — or refresh auth and try again."
)

CATALOG_WAF_BLOCKED_NOTICE = (
    "DStv returned an HTML WAF page instead of catalog JSON. Your Connect JWT may still be valid, "
    "but the WAF token cannot be replayed from the server IP. Use /api/get-dstv-catalog/ to push "
    "the sport catalog response captured in your browser."
)


def _catalog_failure_notice(exc: DStvAPIError | None, auth_issue: str | None) -> str:
    if auth_issue:
        return auth_issue
    if exc and exc.status_code in (401, 403):
        if get_connect_token_remaining_seconds() > 0:
            return CATALOG_WAF_BLOCKED_NOTICE
        return CATALOG_AUTH_REJECTED_NOTICE
    if exc:
        return str(exc) or CATALOG_AUTH_REJECTED_NOTICE
    return CATALOG_AUTH_REJECTED_NOTICE


FIXTURE_FALLBACK_NOTICE = (
    "Showing cached sport catalog layout with images. Live DStv API is unavailable from the "
    "server — POST vod_sections/sports to /api/get-dstv-catalog/ for fresh data."
)


def _rails_missing_images(rails: list[CatalogRail]) -> bool:
    if not rails:
        return True
    for rail in rails:
        for item in rail.items:
            if item.image:
                return False
    return True


def _sport_page_from_fixture(notice: str | None = None) -> CatalogPageResponse:
    raw = load_sport_page_fixture()
    rails = normalize_catalog_page(raw, "sport")
    return CatalogPageResponse(
        section="sport",
        rails=rails,
        source="fixture",
        notice=notice or FIXTURE_FALLBACK_NOTICE,
    )


def _find_sport_program_card(season_id: str) -> dict | None:
    raw = load_sport_page_fixture()
    for section in raw.get("sections") or []:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            if isinstance(item, dict) and str(item.get("id") or "") == season_id:
                return item
    return None


def _season_detail_fixture(
    stack_id: str,
    program_id: str,
    season_id: str,
) -> SeasonDetailResponse | None:
    for spec in TEST_ITEMS:
        if (
            spec.content_type == "streaming"
            and spec.season_id == season_id
            and spec.stack_id == stack_id
            and spec.program_id == program_id
            and spec.manifest_hint
        ):
            card = _find_sport_program_card(season_id)
            title = spec.title or (card or {}).get("title") or "Sport highlight"
            image = spec.image_hint
            if card and not image:
                image = pick_best_image(card.get("images") or []) or _extract_image(card)

            return SeasonDetailResponse(
                id=season_id,
                title=str(title),
                synopsis=spec.description,
                image=image,
                stack_id=stack_id,
                program_id=program_id,
                videos=[
                    SeasonVideoCard(
                        id=spec.id,
                        title=str(title),
                        synopsis=spec.description,
                        image=image,
                        manifest_hint=spec.manifest_hint,
                        content_type="streaming",
                    )
                ],
            )
    return None


def _season_detail_from_ingest(
    stack_id: str,
    program_id: str,
    season_id: str,
) -> SeasonDetailResponse | None:
    raw = get_ingested_season_raw(stack_id, program_id, season_id)
    if raw is None:
        return None
    normalized = normalize_season_detail(raw)
    if not normalized.get("videos"):
        return None
    normalized["stack_id"] = stack_id
    normalized["program_id"] = program_id
    return SeasonDetailResponse(**normalized)


def _sport_page_from_ingest() -> CatalogPageResponse | None:
    raw = get_ingested_catalog_raw("sport")
    if raw is None:
        return None
    rails = normalize_catalog_page(raw, "sport")
    if not rails:
        return None
    meta = get_ingested_catalog_meta("sport")
    notice = None
    if meta and meta["remaining_seconds"] <= 120:
        notice = (
            "Showing browser-ingested sport catalog (expires soon). "
            "Re-capture vod_sections/sports from dstv.stream."
        )
    return CatalogPageResponse(
        section="sport",
        rails=rails,
        source="browser_ingest",
        notice=notice,
    )


async def _live_fallback(
    client: DStvClient,
    section: str,
    *,
    notice: str | None = None,
) -> CatalogResponse:
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
        notice=notice if items else None,
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
    auth_ready, auth_issue = catalog_auth_ready()

    async with DStvClient(settings) as client:
        if not auth_ready:
            cache_key = f"catalog:fallback:{section}"
            cached = metadata_cache.get(cache_key)
            fallback_notice = auth_issue or LIVE_FALLBACK_NOTICE
            if cached is not None:
                return CatalogResponse(
                    section=section,
                    items=cached,
                    source="live_fallback",
                    notice=fallback_notice if cached else None,
                )
            response = await _live_fallback(client, section, notice=fallback_notice)
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
            response = await _live_fallback(
                client,
                section,
                notice=_catalog_failure_notice(exc, auth_issue),
            )
            metadata_cache.set(f"catalog:fallback:{section}", response.items, settings.cache_ttl_catalog)
            return response

        items = normalize_catalog(raw, section)
        if not items:
            response = await _live_fallback(client, section, notice=LIVE_FALLBACK_NOTICE)
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
                        image=spec.image_hint,
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

    response = CatalogPageResponse(
        section="sport",
        rails=rails,
        source="live_fallback",
        notice=notice or live_response.notice,
    )
    if _rails_missing_images(rails):
        return _sport_page_from_fixture(notice=response.notice)
    return response


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
    page = CatalogPageResponse(
        section=section,
        rails=rails,
        source="live_fallback",
        notice=notice or response.notice,
    )
    if section == "sport" and _rails_missing_images(rails):
        return _sport_page_from_fixture(notice=page.notice)
    return page


@router.get("/catalog/sport/page", response_model=CatalogPageResponse)
async def get_sport_page() -> CatalogPageResponse:
    section = "sport"
    settings = get_settings()
    auth_ready, auth_issue = catalog_auth_ready()

    ingested = _sport_page_from_ingest()
    if ingested is not None:
        return ingested

    async with DStvClient(settings) as client:
        if not auth_ready:
            notice = auth_issue or LIVE_FALLBACK_NOTICE
            response = await _live_fallback_rails(client, section, notice=notice)
            if _rails_missing_images(response.rails):
                return _sport_page_from_fixture(notice=response.notice or notice)
            return response

        cache_key = "catalog:page:sport"
        cached = metadata_cache.get(cache_key)
        if cached is not None:
            return CatalogPageResponse(section=section, rails=cached, source="catalog")

        try:
            raw = await client.get_vod_section(section)
        except DStvAPIError as exc:
            logger.warning("Sport page fetch failed: %s", exc.detail or str(exc))
            notice = _catalog_failure_notice(exc, auth_issue)
            response = await _sport_combined_fallback(client, notice=notice)
            return response

        rails = normalize_catalog_page(raw, section)
        if not rails:
            response = await _sport_combined_fallback(client, notice=LIVE_FALLBACK_NOTICE)
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
    ingested = _season_detail_from_ingest(stack_id, program_id, season_id)
    if ingested is not None:
        return ingested

    settings = get_settings()
    auth_ready, auth_issue = catalog_auth_ready()

    if auth_ready:
        async with DStvClient(settings) as client:
            try:
                meta = await client.get_season_catalogue(stack_id, program_id, season_id)
            except DStvAPIError as exc:
                logger.warning(
                    "Season fetch failed for %s/%s/%s: %s",
                    stack_id,
                    program_id,
                    season_id,
                    exc.detail or str(exc),
                )
            else:
                normalized = normalize_season_detail(meta)
                if normalized.get("videos"):
                    normalized["stack_id"] = stack_id
                    normalized["program_id"] = program_id
                    return SeasonDetailResponse(**normalized)

    fixture = _season_detail_fixture(stack_id, program_id, season_id)
    if fixture is not None:
        return fixture

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "CATALOG_WAF_BLOCKED",
            "message": (
                auth_issue
                or CATALOG_WAF_BLOCKED_NOTICE
                + " POST the season JSON to /api/get-dstv-catalog/season for this title."
            ),
        },
    )
