import logging
from typing import Optional
from urllib.parse import urlparse

import httpx

from app.config import Settings
from app.utils.http_client import browser_request_headers, httpx_async_client

logger = logging.getLogger(__name__)

_ALLOWED_CDN_HOSTS = frozenset(
    {
        "i-live-cache.akamaized.net",
        "r-live-cache.akamaized.net",
        "i-live-gtm.dstv.com",
        "v1.dstv.com",
        "dstv.stream",
    }
)


class CdnProxyError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def is_proxied_cdn_url(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return False
    host = host.lower()
    return any(
        host == allowed or host.endswith(f".{allowed}")
        for allowed in _ALLOWED_CDN_HOSTS
    )


def build_cdn_proxy_url(api_base: str, target_url: str) -> str:
    from urllib.parse import quote

    base = api_base.rstrip("/")
    return f"{base}/api/playback/cdn?url={quote(target_url, safe='')}"


async def fetch_cdn_resource(settings: Settings, url: str) -> tuple[bytes, str]:
    if not is_proxied_cdn_url(url):
        raise CdnProxyError("URL host is not allowed for CDN proxy.", status_code=400)

    headers = browser_request_headers(settings)
    async with httpx_async_client(settings, log_label="cdn-proxy") as client:
        response = await client.get(url, headers=headers)

    if response.status_code >= 400:
        logger.warning(
            "CDN proxy upstream %s returned HTTP %s",
            urlparse(url).hostname,
            response.status_code,
        )
        raise CdnProxyError(
            f"Upstream CDN returned HTTP {response.status_code}.",
            status_code=response.status_code,
        )

    content_type = response.headers.get("content-type") or "application/octet-stream"
    return response.content, content_type
