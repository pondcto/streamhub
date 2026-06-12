import logging
from typing import Optional
from urllib.parse import urlencode, urlparse

import httpx

from app.config import Settings
from app.constants import BROWSER_USER_AGENT
from app.services.auth import _decode_jwt_payload
from app.utils.http_client import httpx_client_kwargs

logger = logging.getLogger(__name__)

DEFAULT_LIVE_STREAMING_FILTER = (
    "?filter=%28type%3D%3D%22video%22%26%26MaxHeight%3C%3D576%29%7C%7C"
    "%28type%3D%3D%22audio%22%26%26systemBitrate%3E30000%29%7C%7C"
    "%28type%3D%3D%22textstream%22%29"
)


def is_signed_manifest_url(url: str) -> bool:
    lowered = url.lower()
    return any(
        marker in lowered
        for marker in ("hdntl=", "hdnea=", "__token__", "hmac=")
    )


def _manifest_from_session_jwt(ls_session: str) -> Optional[str]:
    try:
        claims = _decode_jwt_payload(ls_session)
    except ValueError:
        return None

    for key in ("manifestUrl", "manifest_url", "playbackUrl", "mpdUrl", "url"):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _browser_headers(settings: Settings, ls_session: str) -> dict[str, str]:
    origin = settings.dstv_api_base_url.rstrip("/")
    return {
        "Accept": "*/*",
        "User-Agent": BROWSER_USER_AGENT,
        "Origin": origin,
        "Referer": f"{origin}/",
        "Authorization": f"Bearer {ls_session}",
    }


def _is_mpd_response(response: httpx.Response) -> bool:
    content_type = (response.headers.get("content-type") or "").lower()
    if "dash+xml" in content_type or "xml" in content_type:
        return True
    body = response.text[:500]
    return "<MPD" in body


async def resolve_live_manifest_url(
    settings: Settings,
    *,
    manifest_path: str,
    ls_session: str,
    channel_tag: Optional[str] = None,
    streaming_filter: Optional[str] = None,
) -> str:
    """
    Turn an unsigned live path (e.g. USL02/TS2/TS2.isml/.mpd) into a fetchable
    Akamai-signed MPD URL using the Irdeto streaming session JWT.
    """
    if manifest_path.startswith("http"):
        if is_signed_manifest_url(manifest_path):
            return manifest_path
        path = urlparse(manifest_path).path.lstrip("/")
    else:
        path = manifest_path.strip().lstrip("/")

    jwt_manifest = _manifest_from_session_jwt(ls_session)
    if jwt_manifest:
        return jwt_manifest

    filter_suffix = streaming_filter or DEFAULT_LIVE_STREAMING_FILTER
    if filter_suffix and not filter_suffix.startswith("?"):
        filter_suffix = f"?{filter_suffix}"

    gtm_base = getattr(settings, "dstv_live_gtm_base_url", "https://i-live-gtm.dstv.com").rstrip("/")
    headers = _browser_headers(settings, ls_session)

    session_header_variants = [
        headers,
        {**headers, "X-Irdeto-Session": ls_session},
        {**headers, "x-irdeto-session": ls_session},
    ]

    query_params: dict[str, str] = {"ls_session": ls_session}
    if channel_tag:
        query_params["contentId"] = channel_tag

    candidate_urls = [
        f"{gtm_base}/{path}{filter_suffix}",
        f"{gtm_base}/{path}?{urlencode(query_params)}{filter_suffix.replace('?', '&', 1) if filter_suffix.startswith('?') else filter_suffix}",
    ]

    async with httpx.AsyncClient(
        **httpx_client_kwargs(settings, timeout=httpx.Timeout(30.0, connect=10.0), follow_redirects=True)
    ) as client:
        for url in candidate_urls:
            for variant_headers in session_header_variants:
                try:
                    response = await client.get(url, headers=variant_headers)
                except httpx.RequestError as exc:
                    logger.debug("Live manifest request failed for %s: %s", url, exc)
                    continue

                if response.status_code >= 400:
                    continue

                final_url = str(response.url)
                if _is_mpd_response(response):
                    logger.info(
                        "Resolved live manifest for %s -> %s",
                        channel_tag or path,
                        final_url[:120],
                    )
                    return final_url

    raise ValueError(
        f"Could not resolve signed live manifest for {channel_tag or path}. "
        "Ensure a fresh Irdeto session is imported from dstv.stream."
    )


async def ensure_fetchable_manifest_url(
    settings: Settings,
    *,
    manifest_url: str,
    ls_session: str,
    content_type: str,
    channel_tag: Optional[str] = None,
    streaming_filter: Optional[str] = None,
) -> str:
    if manifest_url.startswith("http") and is_signed_manifest_url(manifest_url):
        return manifest_url

    if content_type == "live" or (
        not manifest_url.startswith("http") and channel_tag
    ):
        return await resolve_live_manifest_url(
            settings,
            manifest_path=manifest_url,
            ls_session=ls_session,
            channel_tag=channel_tag,
            streaming_filter=streaming_filter,
        )

    return manifest_url
