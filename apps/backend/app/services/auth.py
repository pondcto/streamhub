import base64
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.models.auth import SessionData, SessionInfo

logger = logging.getLogger(__name__)

SESSION_STORE_PATH = Path(__file__).resolve().parents[2] / ".streamhub_session.json"


def normalize_bearer_token(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    value = token.strip()
    if value.lower().startswith("bearer "):
        value = value[7:].strip()
    return value or None


def extract_waf_token_from_cookie(cookie: Optional[str]) -> Optional[str]:
    if not cookie:
        return None
    match = re.search(r"(?:^|;\s*)aws-waf-token=([^;]+)", cookie)
    if not match:
        return None
    return match.group(1).strip() or None

_configured_session: Optional[SessionData] = None
_active_token: Optional[str] = None
_catalog_connect_token: Optional[str] = None
_catalog_cookie: Optional[str] = None
_playback_profile_id: Optional[str] = None
_playback_waf_token: Optional[str] = None
_irdeto_session: Optional[str] = None


def _decode_jwt_payload(token: str) -> Dict[str, Any]:
    parts = token.strip().split(".")
    if len(parts) != 3:
        raise ValueError("Token must be a valid JWT with three segments.")
    payload = parts[1]
    payload += "=" * (-len(payload) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(payload))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Token payload is not valid JSON.") from exc


def parse_session_info(token: str) -> SessionInfo:
    claims = _decode_jwt_payload(token)
    exp = claims.get("exp")
    iat = claims.get("iat")
    expires_at = None
    issued_at = None
    remaining_seconds = 0

    if isinstance(exp, (int, float)):
        expires_at = datetime.fromtimestamp(int(exp), tz=timezone.utc)
        remaining_seconds = max(0, int(exp) - int(time.time()))

    if isinstance(iat, (int, float)):
        issued_at = datetime.fromtimestamp(int(iat), tz=timezone.utc)

    csmo = claims.get("csmo") if isinstance(claims.get("csmo"), dict) else {}
    ent = claims.get("ent") if isinstance(claims.get("ent"), list) else []

    return SessionInfo(
        issuer=claims.get("iss"),
        subject=claims.get("sub"),
        token_id=claims.get("jti"),
        account_id=claims.get("aid"),
        issued_at=issued_at,
        expires_at=expires_at,
        remaining_seconds=remaining_seconds,
        entitlement=ent,
        device_type=csmo.get("dt"),
        active=remaining_seconds > 0,
    )


def _catalog_auth_configured() -> bool:
    return bool(_catalog_connect_token or _catalog_cookie)


def _persist_session_state() -> None:
    if not _has_saved_settings():
        SESSION_STORE_PATH.unlink(missing_ok=True)
        return
    payload = {
        "token": _active_token,
        "catalog_token": _catalog_connect_token,
        "catalog_cookie": _catalog_cookie,
        "profile_id": _playback_profile_id,
        "waf_token": _playback_waf_token,
        "irdeto_session": _irdeto_session,
    }
    SESSION_STORE_PATH.write_text(json.dumps(payload), encoding="utf-8")


def _apply_persisted_fields(payload: Dict[str, Any]) -> None:
    global _active_token, _configured_session, _catalog_connect_token, _catalog_cookie
    global _playback_profile_id, _playback_waf_token, _irdeto_session

    token = normalize_bearer_token(payload.get("token"))
    if token:
        _active_token = token
        try:
            info = parse_session_info(token)
            _configured_session = SessionData(
                user_id=str(info.subject or "default"),
                email="session@streamhub.local",
                display_name="StreamHub",
                dstv_access_token=token,
                dstv_token_expires_at=info.expires_at,
                created_at=datetime.now(timezone.utc),
            )
        except ValueError:
            _configured_session = None

    catalog_token = payload.get("catalog_token")
    if catalog_token is not None:
        _catalog_connect_token = normalize_bearer_token(catalog_token) or None
    elif token:
        _catalog_connect_token = token

    if payload.get("catalog_cookie") is not None:
        value = str(payload.get("catalog_cookie") or "").strip()
        _catalog_cookie = value or None
        extracted_waf = extract_waf_token_from_cookie(value)
        if extracted_waf and not payload.get("waf_token"):
            _playback_waf_token = extracted_waf

    if payload.get("profile_id") is not None:
        value = str(payload.get("profile_id") or "").strip()
        _playback_profile_id = value or None
    if payload.get("waf_token") is not None:
        value = str(payload.get("waf_token") or "").strip()
        _playback_waf_token = value or None
    if payload.get("irdeto_session") is not None:
        value = str(payload.get("irdeto_session") or "").strip()
        _irdeto_session = value or None


def _load_persisted_session() -> bool:
    if not SESSION_STORE_PATH.is_file():
        return False
    try:
        payload = json.loads(SESSION_STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Ignoring invalid saved session file: %s", exc)
        return False

    if not isinstance(payload, dict):
        return False

    _apply_persisted_fields(payload)
    if not _has_saved_settings():
        SESSION_STORE_PATH.unlink(missing_ok=True)
        return False

    if _active_token:
        try:
            info = parse_session_info(_active_token)
            if info.remaining_seconds <= 0:
                logger.info(
                    "Restored saved session with expired Connect JWT (Irdeto/profile may still be valid)."
                )
            else:
                logger.info("Restored saved session (expires in %ss).", info.remaining_seconds)
        except ValueError:
            logger.info("Restored saved session settings without a valid Connect JWT.")
    else:
        logger.info("Restored saved session settings without Connect JWT.")
    return True


def set_session_token(
    token: Optional[str] = None,
    *,
    catalog_token: Optional[str] = None,
    catalog_cookie: Optional[str] = None,
    profile_id: Optional[str] = None,
    waf_token: Optional[str] = None,
    irdeto_session: Optional[str] = None,
) -> SessionInfo:
    global _configured_session, _active_token, _catalog_connect_token, _catalog_cookie
    global _playback_profile_id, _playback_waf_token, _irdeto_session

    normalized_token = normalize_bearer_token(token)
    if normalized_token:
        info = parse_session_info(normalized_token)
        _active_token = normalized_token
        _configured_session = SessionData(
            user_id=str(info.subject or "default"),
            email="session@streamhub.local",
            display_name="StreamHub",
            dstv_access_token=normalized_token,
            dstv_token_expires_at=info.expires_at,
            created_at=datetime.now(timezone.utc),
        )
        if info.remaining_seconds <= 0 and not (
            irdeto_session
            or profile_id
            or waf_token
            or catalog_cookie
            or _irdeto_session
            or _playback_profile_id
            or _playback_waf_token
            or _catalog_cookie
        ):
            raise ValueError("Session token has already expired.")
    elif _active_token:
        info = parse_session_info(_active_token)
    elif irdeto_session or profile_id or waf_token or catalog_cookie or _irdeto_session:
        info = SessionInfo(active=False, remaining_seconds=0)
    else:
        raise ValueError("Connect Authorization JWT is required.")

    if catalog_token is not None:
        value = normalize_bearer_token(catalog_token)
        _catalog_connect_token = value or None
    elif normalized_token:
        _catalog_connect_token = normalized_token

    if catalog_cookie is not None:
        value = catalog_cookie.strip()
        _catalog_cookie = value or None
        if waf_token is None and value:
            extracted_waf = extract_waf_token_from_cookie(value)
            if extracted_waf:
                _playback_waf_token = extracted_waf

    if profile_id is not None:
        value = profile_id.strip()
        _playback_profile_id = value or None
    if waf_token is not None:
        value = waf_token.strip()
        _playback_waf_token = value or None
    if irdeto_session is not None:
        value = irdeto_session.strip()
        if value:
            session_info = parse_session_info(value)
            if session_info.remaining_seconds <= 0:
                raise ValueError("Irdeto session token has already expired.")
            _irdeto_session = value
        else:
            _irdeto_session = None

    info.catalog_auth_configured = _catalog_auth_configured()
    info.profile_id_configured = bool(_playback_profile_id)
    info.waf_token_configured = bool(_playback_waf_token)
    info = _attach_saved_form_fields(info)
    _persist_session_state()
    logger.info("Session token updated (expires in %ss).", info.remaining_seconds)
    return info


def get_playback_token() -> Optional[str]:
    return _active_token


def get_catalog_connect_token() -> Optional[str]:
    return _catalog_connect_token


def get_catalog_cookie() -> Optional[str]:
    return _catalog_cookie


def get_playback_profile_id() -> Optional[str]:
    return _playback_profile_id


def get_playback_waf_token() -> Optional[str]:
    return _playback_waf_token


def _irdeto_session_remaining_seconds() -> int:
    if not _irdeto_session:
        return 0
    try:
        return parse_session_info(_irdeto_session).remaining_seconds
    except ValueError:
        return 0


def get_irdeto_session() -> Optional[str]:
    if not _irdeto_session:
        return None
    if _irdeto_session_remaining_seconds() <= 0:
        return None
    return _irdeto_session


def has_catalog_auth() -> bool:
    return _catalog_auth_configured()


def _ensure_session_data() -> Optional[SessionData]:
    if _configured_session is not None:
        return _configured_session
    if not get_irdeto_session():
        return None

    subject = "default"
    expires_at = None
    if _active_token:
        try:
            info = parse_session_info(_active_token)
            subject = str(info.subject or subject)
            expires_at = info.expires_at
        except ValueError:
            pass

    return SessionData(
        user_id=subject,
        email="session@streamhub.local",
        display_name="StreamHub",
        dstv_access_token=_active_token,
        dstv_token_expires_at=expires_at,
        created_at=datetime.now(timezone.utc),
    )


def get_configured_session() -> Optional[SessionData]:
    session = _ensure_session_data()
    if session is None:
        return None

    if session.dstv_token_expires_at:
        expires = session.dstv_token_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= expires:
            if get_irdeto_session():
                return session
            return None
    return session


def _attach_saved_form_fields(info: SessionInfo) -> SessionInfo:
    info.connect_token = _active_token
    info.profile_id = _playback_profile_id
    info.waf_token = _playback_waf_token
    info.catalog_cookie = _catalog_cookie
    info.irdeto_session = _irdeto_session
    if _irdeto_session:
        try:
            irdeto_info = parse_session_info(_irdeto_session)
            info.irdeto_session_expires_at = irdeto_info.expires_at
            info.irdeto_session_remaining_seconds = irdeto_info.remaining_seconds
            info.irdeto_session_configured = irdeto_info.remaining_seconds > 0
        except ValueError:
            info.irdeto_session_remaining_seconds = 0
            info.irdeto_session_configured = False
    return info


def _has_saved_settings() -> bool:
    return bool(
        _active_token
        or _playback_profile_id
        or _playback_waf_token
        or _catalog_cookie
        or _irdeto_session
    )


def get_session_info() -> Optional[SessionInfo]:
    if not _has_saved_settings():
        return None

    if _active_token:
        try:
            info = parse_session_info(_active_token)
            info.active = info.remaining_seconds > 0
        except ValueError:
            info = SessionInfo(active=False, remaining_seconds=0)
    else:
        info = SessionInfo(active=False, remaining_seconds=0)

    info.catalog_auth_configured = _catalog_auth_configured()
    info.profile_id_configured = bool(_playback_profile_id)
    info.waf_token_configured = bool(_playback_waf_token)
    return _attach_saved_form_fields(info)


def initialize_session() -> None:
    """Load a saved UI session when present."""
    if _load_persisted_session():
        info = get_session_info()
        if info:
            logger.info("Restored saved session (expires in %ss).", info.remaining_seconds)
            return
    if not _active_token:
        logger.info("No session configured — enter a token in the UI.")
