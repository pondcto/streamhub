import logging

from fastapi import APIRouter, HTTPException, status

from app.models.catalog import CatalogPageResponse
from app.models.catalog_ingest import CatalogIngestRequest
from app.services.catalog_ingest import ingest_catalog_section
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
