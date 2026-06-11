import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

INGEST_STORE_PATH = Path(__file__).resolve().parents[2] / ".streamhub_catalog_ingest.json"
DEFAULT_MAX_AGE_SECONDS = 600

_ingested: Dict[str, Tuple[Dict[str, Any], datetime, Optional[str]]] = {}


def _persist_ingested() -> None:
    if not _ingested:
        INGEST_STORE_PATH.unlink(missing_ok=True)
        return
    payload = {
        section: {
            "response_body": body,
            "captured_at": captured_at.isoformat(),
            "request_url": request_url,
        }
        for section, (body, captured_at, request_url) in _ingested.items()
    }
    INGEST_STORE_PATH.write_text(json.dumps(payload), encoding="utf-8")


def load_persisted_ingest() -> None:
    if not INGEST_STORE_PATH.is_file():
        return
    try:
        payload = json.loads(INGEST_STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Ignoring invalid catalog ingest file: %s", exc)
        return
    if not isinstance(payload, dict):
        return

    for section, entry in payload.items():
        if not isinstance(entry, dict) or not isinstance(entry.get("response_body"), dict):
            continue
        captured_raw = entry.get("captured_at")
        captured_at = datetime.now(timezone.utc)
        if captured_raw:
            try:
                captured_at = datetime.fromisoformat(str(captured_raw).replace("Z", "+00:00"))
                if captured_at.tzinfo is None:
                    captured_at = captured_at.replace(tzinfo=timezone.utc)
            except ValueError:
                pass
        _ingested[str(section)] = (
            entry["response_body"],
            captured_at,
            str(entry.get("request_url") or "") or None,
        )
    if _ingested:
        logger.info("Restored %d ingested catalog section(s).", len(_ingested))


def season_ingest_key(stack_id: str, program_id: str, season_id: str) -> str:
    return f"season:{stack_id.strip()}:{program_id.strip()}:{season_id.strip()}"


def ingest_season_detail(
    stack_id: str,
    program_id: str,
    season_id: str,
    response_body: Dict[str, Any],
    *,
    captured_at: Optional[datetime] = None,
    request_url: Optional[str] = None,
) -> datetime:
    key = season_ingest_key(stack_id, program_id, season_id)
    return ingest_catalog_section(
        key,
        response_body,
        captured_at=captured_at,
        request_url=request_url,
    )


def get_ingested_season_raw(
    stack_id: str,
    program_id: str,
    season_id: str,
    *,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
) -> Optional[Dict[str, Any]]:
    return get_ingested_catalog_raw(
        season_ingest_key(stack_id, program_id, season_id),
        max_age_seconds=max_age_seconds,
    )


def ingest_catalog_section(
    section: str,
    response_body: Dict[str, Any],
    *,
    captured_at: Optional[datetime] = None,
    request_url: Optional[str] = None,
) -> datetime:
    captured = captured_at or datetime.now(timezone.utc)
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)
    _ingested[section] = (response_body, captured, request_url)
    _persist_ingested()
    logger.info("Ingested catalog section %s (captured %s).", section, captured.isoformat())
    return captured


def get_ingested_catalog_raw(
    section: str,
    *,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
) -> Optional[Dict[str, Any]]:
    entry = _ingested.get(section)
    if entry is None:
        return None
    body, captured_at, _ = entry
    age = (datetime.now(timezone.utc) - captured_at).total_seconds()
    if age > max_age_seconds:
        return None
    return body


def get_ingested_catalog_meta(section: str) -> Optional[Dict[str, Any]]:
    entry = _ingested.get(section)
    if entry is None:
        return None
    _, captured_at, request_url = entry
    remaining = max(
        0,
        int(DEFAULT_MAX_AGE_SECONDS - (datetime.now(timezone.utc) - captured_at).total_seconds()),
    )
    return {
        "section": section,
        "captured_at": captured_at,
        "request_url": request_url,
        "remaining_seconds": remaining,
    }
