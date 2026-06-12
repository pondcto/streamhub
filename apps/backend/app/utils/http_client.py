import logging
from typing import Any, Optional

import httpx

from app.config import Settings
from app.constants import BROWSER_USER_AGENT

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


def browser_request_headers(
    settings: Settings,
    *,
    accept: str = "*/*",
    include_origin: bool = True,
    **extra: str,
) -> dict[str, str]:
    """Browser-like headers for outbound DStv, CDN, manifest, and license requests."""
    headers: dict[str, str] = {
        "Accept": accept,
        "Accept-Language": "en-ZA,en-US;q=0.9,en;q=0.8",
        "User-Agent": BROWSER_USER_AGENT,
    }
    if include_origin:
        origin = settings.dstv_api_base_url.rstrip("/")
        headers["Origin"] = origin
        headers["Referer"] = f"{origin}/"
    headers.update(extra)
    return headers


def httpx_client_kwargs(settings: Settings, **extra: Any) -> dict[str, Any]:
    """Return kwargs for httpx Client/AsyncClient, including proxy when configured."""
    kwargs = dict(extra)
    proxy_url = settings.dstv_proxy_url
    if proxy_url:
        kwargs["proxy"] = proxy_url
    return kwargs


def _log_proxy_usage(settings: Settings, client_kind: str) -> None:
    if not settings.dstv_proxy_configured:
        return
    logger.info(
        "DStv %s client using %s proxy at %s:%s",
        client_kind,
        settings.dstv_proxy_type,
        settings.dstv_proxy_host,
        settings.dstv_proxy_port,
    )


def httpx_async_client(
    settings: Settings,
    *,
    default_headers: Optional[dict[str, str]] = None,
    log_label: str = "HTTP",
    **extra: Any,
) -> httpx.AsyncClient:
    """Async httpx client with proxy and browser User-Agent defaults."""
    kwargs = httpx_client_kwargs(settings, **extra)
    kwargs.setdefault("timeout", _DEFAULT_TIMEOUT)
    kwargs.setdefault("follow_redirects", True)
    if default_headers is not None:
        kwargs["headers"] = default_headers
    elif "headers" not in kwargs:
        kwargs["headers"] = browser_request_headers(settings)
    _log_proxy_usage(settings, log_label)
    return httpx.AsyncClient(**kwargs)


def httpx_sync_client(
    settings: Settings,
    *,
    default_headers: Optional[dict[str, str]] = None,
    log_label: str = "HTTP",
    **extra: Any,
) -> httpx.Client:
    """Sync httpx client with proxy and browser User-Agent defaults."""
    kwargs = httpx_client_kwargs(settings, **extra)
    kwargs.setdefault("timeout", _DEFAULT_TIMEOUT)
    kwargs.setdefault("follow_redirects", True)
    if default_headers is not None:
        kwargs["headers"] = default_headers
    elif "headers" not in kwargs:
        kwargs["headers"] = browser_request_headers(settings)
    _log_proxy_usage(settings, log_label)
    return httpx.Client(**kwargs)
