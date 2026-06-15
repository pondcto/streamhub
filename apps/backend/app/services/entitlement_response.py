from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from app.config import Settings, get_settings
from app.services.dstv_client import DStvClient, parse_expiry

DEFAULT_SESSION_TTL_SECONDS = 7200


def parse_entitlement_response(
    data: dict,
    content_id: str,
    manifest_hint: Optional[str],
    settings: Optional[Settings] = None,
) -> Tuple[Optional[str], Optional[str], datetime, str, Optional[str]]:
    """Return manifest_url, ls_session, expires_at, drm_content_id, streaming_filter."""
    settings = settings or get_settings()
    root = data.get("data") if isinstance(data.get("data"), dict) else data
    session_field = root.get("session")
    session_obj = session_field if isinstance(session_field, dict) else {}

    manifest_url = (
        session_obj.get("manifestUrl")
        or session_obj.get("manifest_url")
        or session_obj.get("signedManifestUrl")
        or session_obj.get("streamUrl")
        or root.get("manifestUrl")
        or root.get("manifest_url")
        or root.get("signedManifestUrl")
        or root.get("playbackUrl")
        or root.get("streamUrl")
        or manifest_hint
    )
    streaming_filter = root.get("streaming_filter") or root.get("ucp_filter") or ""
    if manifest_url and streaming_filter and "?" not in manifest_url:
        manifest_url = f"{manifest_url}{streaming_filter}"

    if isinstance(session_field, str):
        ls_session = session_field
    else:
        ls_session = (
            session_obj.get("ls_session")
            or session_obj.get("lsSession")
            or session_obj.get("sessionToken")
            or root.get("ls_session")
            or root.get("token")
        )

    drm_content_id = (
        session_obj.get("contentId")
        or session_obj.get("drmContentId")
        or root.get("contentId")
        or content_id
    )

    expires_raw = (
        root.get("expiry_date")
        or session_obj.get("expiresAt")
        or session_obj.get("expiry")
        or session_obj.get("exp")
        or root.get("expiresAt")
    )
    expires_at = (
        parse_expiry(expires_raw)
        if expires_raw
        else datetime.now(timezone.utc) + timedelta(seconds=DEFAULT_SESSION_TTL_SECONDS)
    )

    if manifest_url and not manifest_url.startswith("http"):
        manifest_url = DStvClient(settings).build_manifest_url(manifest_url)

    return manifest_url, ls_session, expires_at, str(drm_content_id), streaming_filter or None
