import logging
import re
from typing import Any, Optional
from urllib.parse import quote, urlencode, urlparse

import httpx

from app.config import Settings
from app.services.auth import _decode_jwt_payload
from app.utils.http_client import browser_request_headers, httpx_async_client

logger = logging.getLogger(__name__)

DEFAULT_LIVE_STREAMING_FILTER = (
    "?filter=%28type%3D%3D%22video%22%26%26MaxHeight%3C%3D576%29%7C%7C"
    "%28type%3D%3D%22audio%22%26%26systemBitrate%3E30000%29%7C%7C"
    "%28type%3D%3D%22textstream%22%29"
)

PLAYBACK_MANIFEST_PATHS = (
    "/api/vod-auth/ucp/token",
    "/api/vod-auth/playback/token",
    "/api/vod-auth/streaming/token",
    "/api/vod-auth/playback/manifest",
    "/api/vod-auth/streaming/manifest",
    "/api/vod-auth/entitlement/manifest",
    "/api/vod-auth/ucp/manifest",
    "/api/vod-auth/media/manifest",
    "/api/vod-auth/media/playback",
)


def channel_tag_from_signed_manifest_url(url: str) -> Optional[str]:
    acl_match = re.search(r"acl=[^~]*%2f([^*%~]+)", url, re.IGNORECASE)
    if acl_match:
        return acl_match.group(1).upper()

    path = urlparse(url).path
    repeat_match = re.search(r"/([A-Za-z0-9]+)/\1\.isml", path, re.IGNORECASE)
    if repeat_match:
        return repeat_match.group(1).upper()

    parts = [part for part in path.split("/") if part]
    for part in reversed(parts):
        if part.endswith(".isml"):
            name = part[: -len(".isml")]
            if name and name.isalnum():
                return name.upper()
    return None


def is_signed_manifest_url(url: str) -> bool:
    lowered = url.lower()
    if any(marker in lowered for marker in ("hdntl=", "hdnea=", "__token__")):
        return True
    if "i-live-cache.akamaized.net" in lowered:
        path = urlparse(url).path.lower()
        return path.startswith("/hdntl=") or "/hdntl=" in path
    # hdnts query-param URLs also contain hmac= but are not playable signed manifests.
    return "hmac=" in lowered and "hdnts=" not in lowered


def manifest_hint_from_player_url(player_url: Optional[str]) -> Optional[str]:
    """Unsigned MPD path from a live channel playerUrl (no hdntl/hmac)."""
    if not player_url:
        return None
    parsed = urlparse(str(player_url).strip())
    if is_signed_manifest_url(str(player_url)):
        return str(player_url).strip()
    path = parsed.path.lstrip("/")
    if not path:
        return None
    if path.endswith(".ism"):
        return f"{path}/.mpd"
    if path.endswith(".mpd"):
        return path
    return None


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


def _extract_manifest_url(data: Any) -> Optional[str]:
    if not isinstance(data, dict):
        return None

    candidates: list[Any] = [data]
    nested = data.get("data")
    if isinstance(nested, dict):
        candidates.append(nested)

    for root in candidates:
        for key in (
            "manifestUrl",
            "manifest_url",
            "signedManifestUrl",
            "playbackUrl",
            "streamUrl",
            "url",
            "mpdUrl",
        ):
            value = root.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        session_field = root.get("session")
        if isinstance(session_field, dict):
            for key in ("manifestUrl", "manifest_url", "playbackUrl"):
                value = session_field.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

    return None


def _extract_akamai_token(data: Any) -> Optional[str]:
    if not isinstance(data, dict):
        return None

    candidates: list[Any] = [data]
    nested = data.get("data")
    if isinstance(nested, dict):
        candidates.append(nested)

    for root in candidates:
        for key in (
            "hdntl",
            "token",
            "akamaiToken",
            "edgeAuthToken",
            "playbackToken",
            "streamToken",
            "authToken",
        ):
            value = root.get(key)
            if isinstance(value, str) and value.strip():
                token = value.strip()
                if "hmac=" in token or token.startswith("hdntl="):
                    return token
    return None


def _browser_headers(settings: Settings, ls_session: str) -> dict[str, str]:
    return browser_request_headers(
        settings,
        Authorization=f"Bearer {ls_session}",
    )


def _is_mpd_response(response: httpx.Response) -> bool:
    content_type = (response.headers.get("content-type") or "").lower()
    if "dash+xml" in content_type or "xml" in content_type:
        return True
    body = response.text[:500]
    return "<MPD" in body


def _normalize_manifest_path(manifest_path: str) -> str:
    if manifest_path.startswith("http"):
        if is_signed_manifest_url(manifest_path):
            return manifest_path
        return urlparse(manifest_path).path.lstrip("/")
    return manifest_path.strip().lstrip("/")


def _path_variants(manifest_path: str) -> list[str]:
    path = _normalize_manifest_path(manifest_path)
    if path.startswith("http"):
        return [path]

    variants = [path]
    if path.endswith("/.mpd"):
        variants.append(path[: -len("/.mpd")])
    elif path.endswith(".mpd") and not path.endswith(".ism/.mpd"):
        variants.append(path[: -len(".mpd")])
    return list(dict.fromkeys(variants))


def _append_filter(url: str, streaming_filter: Optional[str]) -> str:
    suffix = streaming_filter or DEFAULT_LIVE_STREAMING_FILTER
    if not suffix:
        return url
    if not suffix.startswith("?"):
        suffix = f"?{suffix}"
    if "?" in url:
        return f"{url}&{suffix.lstrip('?')}"
    return f"{url}{suffix}"


def _build_signed_urls_from_token(
    settings: Settings,
    token: str,
    manifest_path: str,
    streaming_filter: Optional[str],
) -> list[str]:
    path = _normalize_manifest_path(manifest_path)
    if path.startswith("http"):
        return [path]

    token_body = token.strip()
    if token_body.startswith("hdntl="):
        token_body = token_body[len("hdntl=") :]

    cdn_base = settings.dstv_live_cdn_base_url.rstrip("/")
    gtm_base = settings.dstv_live_gtm_base_url.rstrip("/")
    encoded_token = quote(token_body, safe="")

    return [
        _append_filter(f"{cdn_base}/hdntl={token_body}/{path}", streaming_filter),
        _append_filter(f"{gtm_base}/__token__{encoded_token}/{path}", streaming_filter),
    ]


async def _probe_manifest_url(
    settings: Settings,
    url: str,
    headers: Optional[dict[str, str]] = None,
) -> Optional[str]:
    headers = headers or browser_request_headers(settings)
    async with httpx_async_client(settings, log_label="live-manifest") as client:
        try:
            response = await client.get(url, headers=headers)
        except httpx.RequestError as exc:
            logger.debug("Live manifest probe failed for %s: %s", url[:120], exc)
            return None

        if response.status_code >= 400:
            logger.debug(
                "Live manifest probe %s returned %s",
                url[:120],
                response.status_code,
            )
            return None

        final_url = str(response.url)
        if _is_mpd_response(response):
            return final_url
    return None


async def _probe_gtm_manifest_urls(
    settings: Settings,
    *,
    manifest_path: str,
    ls_session: str,
    channel_tag: Optional[str],
    streaming_filter: Optional[str],
) -> Optional[str]:
    gtm_base = settings.dstv_live_gtm_base_url.rstrip("/")
    headers = _browser_headers(settings, ls_session)
    session_header_variants = [
        headers,
        {**headers, "X-Irdeto-Session": ls_session},
        {**headers, "x-irdeto-session": ls_session},
        {k: v for k, v in headers.items() if k != "Authorization"},
    ]

    query_params: dict[str, str] = {"ls_session": ls_session}
    if channel_tag:
        query_params["contentId"] = channel_tag

    candidate_urls: list[str] = []
    for path in _path_variants(manifest_path):
        candidate_urls.append(_append_filter(f"{gtm_base}/{path}", streaming_filter))
        candidate_urls.append(
            _append_filter(
                f"{gtm_base}/{path}?{urlencode(query_params)}",
                streaming_filter,
            )
        )

    async with httpx_async_client(settings, log_label="live-manifest") as client:
        for url in candidate_urls:
            for variant_headers in session_header_variants:
                try:
                    response = await client.get(url, headers=variant_headers)
                except httpx.RequestError as exc:
                    logger.debug("GTM manifest request failed for %s: %s", url[:120], exc)
                    continue

                if response.status_code >= 400:
                    continue

                final_url = str(response.url)
                if is_signed_manifest_url(final_url) and _is_mpd_response(response):
                    logger.info(
                        "Resolved live manifest for %s via GTM -> %s",
                        channel_tag or manifest_path,
                        final_url[:120],
                    )
                    return final_url

    return None


async def _probe_signed_token_urls(
    settings: Settings,
    *,
    token: str,
    manifest_path: str,
    ls_session: str,
    streaming_filter: Optional[str],
) -> Optional[str]:
    headers = _browser_headers(settings, ls_session)
    for url in _build_signed_urls_from_token(settings, token, manifest_path, streaming_filter):
        resolved = await _probe_manifest_url(settings, url, headers)
        if resolved:
            logger.info("Resolved live manifest via Akamai token -> %s", resolved[:120])
            return resolved
    return None


async def _resolve_stored_live_manifest(
    settings: Settings,
    *,
    channel_tag: Optional[str],
) -> Optional[str]:
    if not channel_tag:
        return None

    from app.services.auth import get_stored_live_manifest_url

    stored = get_stored_live_manifest_url(channel_tag)
    if not stored or not is_signed_manifest_url(stored):
        logger.warning(
            "No stored signed live manifest for channel %s",
            channel_tag,
        )
        return None

    probed = await _probe_manifest_url(settings, stored)
    if probed:
        logger.info(
            "Using browser-captured live manifest for %s -> %s",
            channel_tag,
            probed[:120],
        )
        return probed

    logger.info(
        "Using stored live manifest for %s (probe skipped or failed validation).",
        channel_tag,
    )
    return stored


async def resolve_live_manifest_url(
    settings: Settings,
    *,
    manifest_path: str,
    ls_session: str,
    channel_tag: Optional[str] = None,
    streaming_filter: Optional[str] = None,
    dstv_client: Any = None,
    user_access_token: Optional[str] = None,
) -> str:
    """Turn an unsigned live path into a fetchable Akamai-signed MPD URL."""
    if manifest_path.startswith("http") and is_signed_manifest_url(manifest_path):
        return manifest_path

    stored_manifest = await _resolve_stored_live_manifest(
        settings,
        channel_tag=channel_tag,
    )
    if stored_manifest:
        return stored_manifest

    jwt_manifest = _manifest_from_session_jwt(ls_session)
    if jwt_manifest and is_signed_manifest_url(jwt_manifest):
        return jwt_manifest

    raise ValueError(
        f"Could not resolve signed live manifest for {channel_tag or manifest_path}. "
        "Play the channel on dstv.stream so the session tracker captures live_manifest_url "
        "(the i-live-cache.akamaized.net hdntl MPD request)."
    )


async def ensure_fetchable_manifest_url(
    settings: Settings,
    *,
    manifest_url: str,
    ls_session: str,
    content_type: str,
    channel_tag: Optional[str] = None,
    streaming_filter: Optional[str] = None,
    dstv_client: Any = None,
    user_access_token: Optional[str] = None,
) -> str:
    if manifest_url.startswith("http") and is_signed_manifest_url(manifest_url):
        return manifest_url

    if content_type in {"live", "streaming"} and channel_tag:
        return await resolve_live_manifest_url(
            settings,
            manifest_path=manifest_url,
            ls_session=ls_session,
            channel_tag=channel_tag,
            streaming_filter=streaming_filter,
            dstv_client=dstv_client,
            user_access_token=user_access_token,
        )

    if content_type == "live" or (not manifest_url.startswith("http") and channel_tag):
        return await resolve_live_manifest_url(
            settings,
            manifest_path=manifest_url,
            ls_session=ls_session,
            channel_tag=channel_tag,
            streaming_filter=streaming_filter,
            dstv_client=dstv_client,
            user_access_token=user_access_token,
        )

    return manifest_url
