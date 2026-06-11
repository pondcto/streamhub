import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import get_settings
from app.services.dstv_client import is_expired
from app.services.entitlement_response import parse_entitlement_response

logger = logging.getLogger(__name__)

INGEST_STORE_PATH = Path(__file__).resolve().parents[2] / ".streamhub_entitlement_ingest.json"
DEFAULT_MAX_AGE_SECONDS = 7200

# content_id (upper) -> (ls_session, expires_at, drm_content_id, manifest_url, streaming_filter, captured_at)
_ingested: Dict[str, Tuple[str, datetime, str, Optional[str], Optional[str], datetime]] = {}


def _content_keys(content_id: str) -> List[str]:
    keys: List[str] = []
    normalized = content_id.strip().upper()
    if not normalized:
        return keys
    keys.append(normalized)
    if normalized.endswith("_EXT"):
        base = normalized[:-4]
        if base not in keys:
            keys.append(base)
    asset_match = re.match(r"^(SS\d+)", normalized)
    if asset_match:
        asset = asset_match.group(1)
        if asset not in keys:
            keys.append(asset)
    return keys


def _persist_ingested() -> None:
    if not _ingested:
        INGEST_STORE_PATH.unlink(missing_ok=True)
        return
    payload = {
        key: {
            "ls_session": entry[0],
            "expires_at": entry[1].isoformat(),
            "drm_content_id": entry[2],
            "manifest_url": entry[3],
            "streaming_filter": entry[4],
            "captured_at": entry[5].isoformat(),
        }
        for key, entry in _ingested.items()
    }
    INGEST_STORE_PATH.write_text(json.dumps(payload), encoding="utf-8")


def load_persisted_entitlement_ingest() -> None:
    if not INGEST_STORE_PATH.is_file():
        return
    try:
        payload = json.loads(INGEST_STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Ignoring invalid entitlement ingest file: %s", exc)
        return
    if not isinstance(payload, dict):
        return

    for key, entry in payload.items():
        if not isinstance(entry, dict) or not entry.get("ls_session"):
            continue
        try:
            expires_at = datetime.fromisoformat(
                str(entry.get("expires_at") or "").replace("Z", "+00:00")
            )
            captured_at = datetime.fromisoformat(
                str(entry.get("captured_at") or entry.get("expires_at") or "").replace("Z", "+00:00")
            )
        except ValueError:
            continue
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if captured_at.tzinfo is None:
            captured_at = captured_at.replace(tzinfo=timezone.utc)
        _ingested[str(key).upper()] = (
            str(entry["ls_session"]),
            expires_at,
            str(entry.get("drm_content_id") or key),
            entry.get("manifest_url"),
            entry.get("streaming_filter"),
            captured_at,
        )
    if _ingested:
        logger.info("Restored %d ingested entitlement session(s).", len(_ingested))


def ingest_entitlement_response(
    content_id: str,
    response_body: Dict[str, Any],
    *,
    manifest_hint: Optional[str] = None,
    captured_at: Optional[datetime] = None,
) -> datetime:
    captured = captured_at or datetime.now(timezone.utc)
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)

    manifest_url, ls_session, expires_at, drm_content_id, streaming_filter = parse_entitlement_response(
        response_body,
        content_id,
        manifest_hint,
        get_settings(),
    )
    if not ls_session:
        raise ValueError("Entitlement response did not include a session token.")

    entry = (
        ls_session,
        expires_at,
        str(drm_content_id),
        manifest_url,
        streaming_filter,
        captured,
    )
    for key in _content_keys(content_id) + _content_keys(str(drm_content_id)):
        _ingested[key] = entry

    _persist_ingested()
    logger.info("Ingested entitlement session for %s (drm %s).", content_id, drm_content_id)
    return captured


def get_ingested_entitlement_session(
    content_id: str,
    *,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
) -> Optional[dict]:
    now = datetime.now(timezone.utc)
    for key in _content_keys(content_id):
        entry = _ingested.get(key)
        if entry is None:
            continue
        ls_session, expires_at, drm_content_id, manifest_url, streaming_filter, captured_at = entry
        if (now - captured_at).total_seconds() > max_age_seconds:
            continue
        if is_expired(expires_at):
            continue
        return {
            "manifest_url": manifest_url,
            "ls_session": ls_session,
            "expires_at": expires_at,
            "drm_content_id": drm_content_id,
            "streaming_filter": streaming_filter,
            "source": "browser_entitlement",
        }
    return None
