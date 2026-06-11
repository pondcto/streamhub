import logging

from fastapi import APIRouter, HTTPException, status

from app.models.catalog import CatalogPageResponse, SeasonDetailResponse
from app.models.catalog_ingest import CatalogIngestRequest
from app.models.season_ingest import SeasonIngestRequest
from app.services.catalog_ingest import ingest_catalog_section, ingest_season_detail
from app.services.normalizers import normalize_season_detail
from app.services.cache import metadata_cache
from app.services.normalizers import normalize_catalog_page

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/get-dstv-catalog", tags=["catalog-ingest"])


@router.post("/", response_model=CatalogPageResponse)
async def ingest_catalog(payload: CatalogIngestRequest) -> CatalogPageResponse:
    """Store a DStv catalog API response captured in the user's browser."""
    section = payload.section
    rails = normalize_catalog_page(payload.response_body, section)
    if not rails:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_CATALOG_PAYLOAD",
                "message": "response_body did not contain recognizable catalog rails.",
            },
        )

    ingest_catalog_section(
        section,
        payload.response_body,
        captured_at=payload.captured_at,
        request_url=payload.request_url,
    )
    metadata_cache.invalidate(f"catalog:page:{section}")
    logger.info("Browser-ingested catalog for %s (%d rails).", section, len(rails))

    return CatalogPageResponse(
        section=section,
        rails=rails,
        source="browser_ingest",
    )


@router.post("/season", response_model=SeasonDetailResponse)
async def ingest_season(payload: SeasonIngestRequest) -> SeasonDetailResponse:
    """Store a granular_catalogue season response captured in the user's browser."""
    normalized = normalize_season_detail(payload.response_body)
    if not normalized.get("videos"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_SEASON_PAYLOAD",
                "message": "response_body did not contain any season videos.",
            },
        )

    ingest_season_detail(
        payload.stack_id,
        payload.program_id,
        payload.season_id,
        payload.response_body,
        captured_at=payload.captured_at,
        request_url=payload.request_url,
    )
    logger.info(
        "Browser-ingested season %s/%s/%s (%d videos).",
        payload.stack_id,
        payload.program_id,
        payload.season_id,
        len(normalized["videos"]),
    )

    normalized["stack_id"] = payload.stack_id
    normalized["program_id"] = payload.program_id
    return SeasonDetailResponse(**normalized)
