import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from app.models.decryption import DecryptionKeysResponse
from app.models.tracked_session import TestKeyRefreshStatus
from app.services.auth import get_configured_session, get_effective_access_token
from app.services.decryption import DecryptionService
from app.services.dstv_client import is_expired
from app.services.entitlement import EntitlementError
from app.services.channel_registry import get_all_items
from app.services.test_items import TestItemSpec

logger = logging.getLogger(__name__)

KEY_STORE_PATH = Path(__file__).resolve().parents[2] / ".streamhub_test_keys.json"


class TestKeyRefreshResult:
    def __init__(
        self,
        item_id: str,
        status: Literal["ok", "error", "skipped"],
        message: Optional[str] = None,
        title: Optional[str] = None,
        keys: Optional[DecryptionKeysResponse] = None,
    ) -> None:
        self.item_id = item_id
        self.status = status
        self.message = message
        self.title = title
        self.keys = keys

    def to_dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "status": self.status,
            "message": self.message,
            "title": self.title,
        }


def _load_store() -> dict[str, Any]:
    if not KEY_STORE_PATH.is_file():
        return {"updated_at": None, "items": {}}
    try:
        payload = json.loads(KEY_STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Ignoring invalid test key store: %s", exc)
        return {"updated_at": None, "items": {}}
    if not isinstance(payload, dict):
        return {"updated_at": None, "items": {}}
    payload.setdefault("items", {})
    return payload


def _save_store(payload: dict[str, Any]) -> None:
    KEY_STORE_PATH.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def _serialize_keys(keys: DecryptionKeysResponse) -> dict[str, Any]:
    return keys.model_dump(mode="json")


def _deserialize_keys(data: dict[str, Any]) -> DecryptionKeysResponse:
    return DecryptionKeysResponse(**data)


def get_store_updated_at() -> Optional[datetime]:
    raw = _load_store().get("updated_at")
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def build_test_key_status(
    spec: TestItemSpec,
    *,
    status: Literal["ok", "error", "skipped", "missing", "expired"],
    message: Optional[str] = None,
    keys: Optional[DecryptionKeysResponse] = None,
    generated_at: Optional[str] = None,
) -> TestKeyRefreshStatus:
    title = spec.title or spec.id
    generated: Optional[datetime] = None
    if generated_at:
        try:
            generated = datetime.fromisoformat(str(generated_at).replace("Z", "+00:00"))
            if generated.tzinfo is None:
                generated = generated.replace(tzinfo=timezone.utc)
        except ValueError:
            generated = None

    if keys is None:
        return TestKeyRefreshStatus(
            item_id=spec.id,
            title=title,
            status=status,
            message=message,
            generated_at=generated,
        )

    decryption_key = keys.joinedKeys.strip()
    if not decryption_key and keys.keys:
        decryption_key = f"{keys.keys[0].kid}:{keys.keys[0].key}"

    return TestKeyRefreshStatus(
        item_id=spec.id,
        title=title,
        status=status,
        message=message,
        manifest_url=keys.manifestUrl,
        license_url=keys.licenseUrl,
        kid=keys.kid or (keys.keys[0].kid if keys.keys else None),
        decryption_key=decryption_key or None,
        generated_at=generated,
    )


def list_all_test_key_statuses() -> list[TestKeyRefreshStatus]:
    store = _load_store()
    items = store.get("items", {})
    results: list[TestKeyRefreshStatus] = []

    for spec in get_all_items():
        entry = items.get(spec.id) or {}
        entry_status = entry.get("status", "missing")
        generated_at = entry.get("generated_at")
        message = entry.get("message")

        if entry_status != "ok" or not entry.get("keys"):
            results.append(
                build_test_key_status(
                    spec,
                    status=entry_status if entry_status in {"ok", "error", "skipped"} else "missing",
                    message=message or ("No keys stored yet." if entry_status == "missing" else None),
                    generated_at=generated_at,
                )
            )
            continue

        keys = _deserialize_keys(entry["keys"])
        expires_at = keys.sessionExpiresAt
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if is_expired(expires_at):
            results.append(
                build_test_key_status(
                    spec,
                    status="expired",
                    message="Stored keys expired. Wait for the next session refresh.",
                    keys=keys,
                    generated_at=generated_at,
                )
            )
            continue

        results.append(
            build_test_key_status(
                spec,
                status="ok",
                keys=keys,
                generated_at=generated_at,
            )
        )

    return results


def get_stored_keys(item_id: str) -> Optional[DecryptionKeysResponse]:
    store = _load_store()
    entry = store.get("items", {}).get(item_id)
    if not entry or entry.get("status") != "ok" or not entry.get("keys"):
        return None

    keys = _deserialize_keys(entry["keys"])
    expires_at = keys.sessionExpiresAt
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if is_expired(expires_at):
        return None
    return keys


async def refresh_test_keys(
    specs: List[TestItemSpec],
    *,
    user_access_token: Optional[str] = None,
) -> list[TestKeyRefreshResult]:
    """Generate and persist decryption keys for the given test items.

    Only the listed items are (re)generated; every other item keeps its existing
    stored key. When generation fails for an item that already has a valid stored
    key, that key is preserved (the failure is recorded as a message) rather than
    clobbered — so capturing one channel can never wipe another channel's key.
    """
    if not specs:
        return []

    token = user_access_token or get_effective_access_token()
    session = get_configured_session()
    if session and session.dstv_access_token:
        token = session.dstv_access_token

    decryption = DecryptionService()
    store = _load_store()
    store.setdefault("items", {})
    results: list[TestKeyRefreshResult] = []
    now = datetime.now(timezone.utc).isoformat()

    for spec in specs:
        result, keys = await _refresh_single_test_key(decryption, spec, token)
        result.keys = keys
        results.append(result)

        if keys is not None:
            store["items"][spec.id] = {
                "status": result.status,
                "message": result.message,
                "generated_at": now,
                "title": result.title,
                "keys": _serialize_keys(keys),
            }
            continue

        # Generation failed. Keep a previously-stored good key instead of
        # overwriting it with an error, so accumulated keys survive.
        existing = store["items"].get(spec.id)
        if existing and existing.get("status") == "ok" and existing.get("keys"):
            existing = dict(existing)
            existing["message"] = result.message
            store["items"][spec.id] = existing
        else:
            store["items"][spec.id] = {
                "status": result.status,
                "message": result.message,
                "generated_at": now,
                "title": result.title,
            }

    store["updated_at"] = now
    _save_store(store)

    ok_count = sum(1 for item in results if item.status == "ok")
    logger.info("Refreshed %s stored test key(s): %s/%s succeeded.", len(results), ok_count, len(results))
    return results


async def refresh_all_test_keys(
    *,
    user_access_token: Optional[str] = None,
) -> list[TestKeyRefreshResult]:
    """Generate and persist decryption keys for all configured test videos."""
    return await refresh_test_keys(list(get_all_items()), user_access_token=user_access_token)


async def _refresh_single_test_key(
    decryption: DecryptionService,
    spec: TestItemSpec,
    user_access_token: Optional[str],
) -> Tuple[TestKeyRefreshResult, Optional[DecryptionKeysResponse]]:
    title = spec.title or spec.id

    if not spec.manifest_hint:
        return (
            TestKeyRefreshResult(
                item_id=spec.id,
                status="skipped",
                message="No manifest hint configured for this test item.",
                title=title,
            ),
            None,
        )

    try:
        keys = await decryption.generate_keys(
            content_id=spec.id,
            content_type=spec.content_type,
            user_access_token=user_access_token,
            manifest_url=spec.manifest_hint,
            channel_tag=spec.channel_tag,
        )
    except EntitlementError as exc:
        return (
            TestKeyRefreshResult(
                item_id=spec.id,
                status="error",
                message=str(exc),
                title=title,
            ),
            None,
        )
    except Exception as exc:
        logger.warning("Test key refresh failed for %s: %s", spec.id, exc)
        return (
            TestKeyRefreshResult(
                item_id=spec.id,
                status="error",
                message="Key generation failed.",
                title=title,
            ),
            None,
        )

    return TestKeyRefreshResult(item_id=spec.id, status="ok", title=title, keys=keys), keys
