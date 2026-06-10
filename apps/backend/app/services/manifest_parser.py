import base64
import re
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import httpx
import xmltodict

from app.config import Settings

WIDEVINE_SYSTEM_ID = "urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"
PLAYREADY_SYSTEM_ID = "urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"


class ManifestParserError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _as_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def asset_id_from_mpd_url(mpd_url: str) -> str:
    path = urlparse(mpd_url).path
    parts = [part for part in path.split("/") if part]
    for part in reversed(parts):
        if part.endswith(".mpd"):
            return part[: -len(".mpd")]
        if part.endswith(".ism"):
            continue
        if re.match(r"^SS\d+_", part, re.IGNORECASE):
            return part
    raise ManifestParserError(f"Could not determine asset id from MPD URL: {mpd_url}", 400)


def _content_id_from_pssh_data(pssh_data: bytes) -> Optional[str]:
    text = "".join(chr(byte) if 32 <= byte < 127 else "." for byte in pssh_data)
    match = re.search(r"(SS\d+_[A-Z0-9_]+)", text)
    if not match:
        return None
    content_id = match.group(1)
    if not content_id.endswith("_ext"):
        content_id = f"{content_id}_ext"
    return content_id


def _content_id_from_playready_pssh(pssh_b64: str) -> Optional[str]:
    try:
        raw = base64.b64decode(pssh_b64)
        text = raw.decode("utf-16-le", errors="ignore")
    except (ValueError, UnicodeDecodeError):
        return None

    match = re.search(r"contentId=([^<&\s]+)", text, re.IGNORECASE)
    if not match:
        return None
    return match.group(1).replace("&amp;", "&").split("&")[0]


def parse_mpd_xml(mpd_xml: str, mpd_url: str) -> dict:
    parsed = xmltodict.parse(mpd_xml)
    mpd = parsed.get("MPD") or parsed
    period = mpd.get("Period")
    if isinstance(period, list):
        period = period[0]

    pssh = ""
    kid = ""
    playready_content_id = None
    base_url = period.get("BaseURL") if period else None
    if base_url and not str(base_url).startswith("http"):
        base_url = urljoin(mpd_url, str(base_url))

    for adaptation_set in _as_list(period.get("AdaptationSet") if period else None):
        for protection in _as_list(adaptation_set.get("ContentProtection")):
            scheme = str(protection.get("@schemeIdUri", "")).lower()
            if scheme == "urn:mpeg:dash:mp4protection:2011" and not kid:
                kid = str(protection.get("@cenc:default_KID", "")).replace("-", "").lower()
            if scheme == WIDEVINE_SYSTEM_ID and not pssh:
                pssh = protection.get("cenc:pssh") or protection.get("pssh") or ""
            if scheme == PLAYREADY_SYSTEM_ID and not playready_content_id:
                pr_pssh = protection.get("cenc:pssh") or protection.get("pssh") or ""
                playready_content_id = _content_id_from_playready_pssh(pr_pssh)

    asset_id = asset_id_from_mpd_url(mpd_url)
    drm_content_id = playready_content_id
    if not drm_content_id and pssh:
        try:
            pssh_raw = base64.b64decode(pssh)
            if len(pssh_raw) > 32:
                drm_content_id = _content_id_from_pssh_data(pssh_raw[32:])
        except (ValueError, TypeError):
            drm_content_id = None
    if not drm_content_id:
        drm_content_id = f"{asset_id}_ext"

    return {
        "asset_id": asset_id,
        "drm_content_id": drm_content_id,
        "pssh": pssh,
        "kid": kid,
        "mpd_url": mpd_url,
        "segment_base_url": base_url,
    }


async def fetch_manifest_drm_data(
    mpd_url: str,
    settings: Settings,
    client: Optional[httpx.AsyncClient] = None,
) -> dict:
    headers = {
        "Accept": "*/*",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/144.0.0.0 Safari/537.36"
        ),
        "Origin": settings.dstv_api_base_url.rstrip("/"),
        "Referer": f"{settings.dstv_api_base_url.rstrip('/')}/",
    }

    owns_client = client is None
    if owns_client:
        proxy = settings.dstv_proxy_url.strip() or None
        client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), proxy=proxy)

    try:
        response = await client.get(mpd_url, headers=headers, follow_redirects=True)
        if response.status_code >= 400:
            raise ManifestParserError(
                f"Failed to fetch manifest ({response.status_code})",
                status_code=response.status_code,
            )
        return parse_mpd_xml(response.text, mpd_url)
    finally:
        if owns_client:
            await client.aclose()
