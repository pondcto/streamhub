import logging

from fastapi import APIRouter, HTTPException, status

from app.models.tracked_session import (
    TestKeyRefreshStatus,
    TrackedSessionRequest,
    TrackedSessionResponse,
)
from app.services.auth import apply_tracked_session
from app.services.cache import metadata_cache
from app.services.stored_test_keys import (
    build_test_key_status,
    get_store_updated_at,
    refresh_all_test_keys,
)
from app.services.test_items import TEST_ITEMS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/get-dstv-trackedsession", tags=["tracked-session"])


def _results_to_statuses(results) -> list[TestKeyRefreshStatus]:
    by_id = {item.item_id: item for item in results}
    statuses: list[TestKeyRefreshStatus] = []
    updated_at = get_store_updated_at()
    generated_at = updated_at.isoformat() if updated_at else None

    for spec in TEST_ITEMS:
        result = by_id.get(spec.id)
        if result is None:
            statuses.append(
                build_test_key_status(
                    spec,
                    status="missing",
                    message="Key refresh did not run for this item.",
                )
            )
            continue
        statuses.append(
            build_test_key_status(
                spec,
                status=result.status,
                message=result.message,
                keys=result.keys,
                generated_at=generated_at,
            )
        )
    return statuses


@router.post("/", response_model=TrackedSessionResponse)
async def ingest_tracked_session(payload: TrackedSessionRequest) -> TrackedSessionResponse:
    """Apply DStv session fields captured by an external browser tracker."""
    try:
        info = apply_tracked_session(
            authorization=payload.authorization,
            profile_id=payload.profile_id,
            waf_token=payload.waf_token,
            catalog_cookie=payload.catalog_cookie,
            irdeto_session_jwt=payload.irdeto_session_jwt,
            captured_at=payload.captured_at,
            source_url=payload.source_url,
            request_url=payload.request_url,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TRACKED_SESSION", "message": str(exc)},
        ) from exc

    metadata_cache.clear()

    key_results = await refresh_all_test_keys(user_access_token=info.connect_token)
    test_keys = _results_to_statuses(key_results)
    keys_updated_at = get_store_updated_at()

    ok_count = sum(1 for item in test_keys if item.status == "ok")
    logger.info(
        "Tracked session applied (connect %ss, irdeto %ss). Test keys: %s/%s ok.",
        info.remaining_seconds,
        info.irdeto_session_remaining_seconds,
        ok_count,
        len(test_keys),
    )

    return TrackedSessionResponse(
        session=info,
        test_keys=test_keys,
        keys_updated_at=keys_updated_at,
    )
