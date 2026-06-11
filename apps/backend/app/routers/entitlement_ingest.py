import logging

from fastapi import APIRouter, HTTPException, status

from app.models.entitlement_ingest import EntitlementIngestRequest
from app.services.entitlement_ingest import ingest_entitlement_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/get-dstv-entitlement", tags=["entitlement-ingest"])


@router.post("/")
async def ingest_entitlement(payload: EntitlementIngestRequest) -> dict:
    """Store entitlement/session JSON captured in the browser for a specific title."""
    try:
        captured_at = ingest_entitlement_response(
            payload.content_id,
            payload.response_body,
            manifest_hint=payload.manifest_url,
            captured_at=payload.captured_at,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_ENTITLEMENT_PAYLOAD", "message": str(exc)},
        ) from exc

    logger.info(
        "Browser-ingested entitlement for %s (type %s).",
        payload.content_id,
        payload.content_type,
    )
    return {
        "status": "ok",
        "content_id": payload.content_id,
        "captured_at": captured_at.isoformat(),
    }
