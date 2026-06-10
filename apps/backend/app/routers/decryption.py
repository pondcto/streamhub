import logging

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import require_auth
from app.models.auth import SessionData
from app.models.decryption import DecryptionKeysRequest, DecryptionKeysResponse
from app.services.decryption import DecryptionService
from app.services.entitlement import EntitlementError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/decryption", tags=["decryption"])
decryption_service = DecryptionService()


@router.post("/keys", response_model=DecryptionKeysResponse)
async def generate_decryption_keys(
    body: DecryptionKeysRequest,
    session: SessionData = Depends(require_auth),
) -> DecryptionKeysResponse:
    try:
        return await decryption_service.generate_keys(
            content_id=body.contentId,
            content_type=body.contentType,
            user_access_token=session.dstv_access_token,
            manifest_url=body.manifestUrl,
            channel_tag=body.channelTag,
        )
    except EntitlementError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
