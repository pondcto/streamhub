import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from app.models.tracked_session import (
    TestKeyRefreshStatus,
    TrackedSessionRequest,
    TrackedSessionResponse,
)
from app.services.auth import (
    apply_tracked_session,
    extract_waf_token_from_cookie,
    get_stored_live_manifest_url,
    normalize_bearer_token,
    parse_session_info,
)
from app.services.live_manifest import (
    channel_tag_from_signed_manifest_url,
    is_signed_manifest_url,
)
from app.services.cache import metadata_cache
from app.services.stored_test_keys import (
    build_test_key_status,
    get_store_updated_at,
    refresh_all_test_keys,
)
from app.services.test_items import TEST_ITEMS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/get-dstv-trackedsession", tags=["tracked-session"])


def _jwt_ttl_seconds(token: Optional[str]) -> Optional[int]:
    normalized = normalize_bearer_token(token)
    if not normalized:
        return None
    try:
        return parse_session_info(normalized).remaining_seconds
    except ValueError:
        return None


def _preview(value: Optional[str], *, max_len: int = 160) -> str:
    text = str(value or "").strip()
    if not text:
        return "(not set)"
    if len(text) <= max_len:
        return text
    return f"{text[:max_len]}… [len={len(text)}]"


def log_tracked_session_payload(
    payload: TrackedSessionRequest,
    *,
    phase: str,
    stored_channel: Optional[str] = None,
) -> None:
    """Print a structured summary of Session-Track data to the backend console."""
    connect = normalize_bearer_token(payload.authorization)
    cookie = str(payload.catalog_cookie or "").strip()
    waf = str(payload.waf_token or "").strip()
    irdeto = str(payload.irdeto_session_jwt or "").strip()
    manifest = str(payload.live_manifest_url or "").strip()
    inferred_tag = channel_tag_from_signed_manifest_url(manifest) if manifest else ""
    effective_tag = (payload.channel_tag or inferred_tag or stored_channel or "").strip().upper()
    stored_manifest = get_stored_live_manifest_url(effective_tag) if effective_tag else None

    lines = [
        f"=== Session-Track payload ({phase}) ===",
        f"  captured_at:          {payload.captured_at or '(not set)'}",
        f"  source_url:           {_preview(payload.source_url)}",
        f"  request_url:          {_preview(payload.request_url)}",
        f"  channel_tag:          {payload.channel_tag or '(not set)'}",
        f"  live_manifest_url:    {_preview(manifest, max_len=220)}",
        f"  live_manifest_signed: {is_signed_manifest_url(manifest) if manifest else False}",
        f"  inferred_channel:     {inferred_tag or '(none)'}",
        f"  profile_id:           {payload.profile_id or '(not set)'}",
        (
            "  authorization:        "
            f"{'yes' if connect else 'no'}"
            f" (len={len(connect or '')}, ttl={_jwt_ttl_seconds(connect)}s)"
        ),
        f"  waf_token:            {'yes' if waf else 'no'} (len={len(waf)})",
        (
            "  catalog_cookie:       "
            f"{'yes' if cookie else 'no'}"
            f" (len={len(cookie)}, waf_in_cookie={'yes' if extract_waf_token_from_cookie(cookie) else 'no'})"
        ),
        (
            "  irdeto_session_jwt:   "
            f"{'yes' if irdeto else 'no'}"
            f" (len={len(irdeto)}, ttl={_jwt_ttl_seconds(irdeto)}s)"
        ),
        f"  stored_manifest[{effective_tag or '?'}]: {_preview(stored_manifest, max_len=220)}",
        "========================================",
    ]
    logger.info("\n%s", "\n".join(lines))


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
    log_tracked_session_payload(payload, phase="received")

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
            channel_tag=payload.channel_tag,
            live_manifest_url=payload.live_manifest_url,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_TRACKED_SESSION", "message": str(exc)},
        ) from exc

    stored_tag = (
        str(payload.channel_tag or "").strip().upper()
        or channel_tag_from_signed_manifest_url(str(payload.live_manifest_url or ""))
        or ""
    )
    log_tracked_session_payload(payload, phase="after apply", stored_channel=stored_tag or None)

    metadata_cache.clear()

    key_results = await refresh_all_test_keys(user_access_token=info.connect_token)
    test_keys = _results_to_statuses(key_results)
    keys_updated_at = get_store_updated_at()

    ok_count = sum(1 for item in test_keys if item.status == "ok")
    ts2_status = next((item for item in test_keys if item.item_id == "TS2"), None)
    if ts2_status and ts2_status.status != "ok":
        logger.warning(
            "TS2 key refresh failed: %s (live_manifest_url required from session tracker)",
            ts2_status.message or ts2_status.status,
        )
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
