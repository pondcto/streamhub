from typing import Any

from app.config import Settings


def httpx_client_kwargs(settings: Settings, **extra: Any) -> dict[str, Any]:
    """Return kwargs for httpx Client/AsyncClient, including proxy when configured."""
    kwargs = dict(extra)
    proxy_url = settings.dstv_proxy_url
    if proxy_url:
        kwargs["proxy"] = proxy_url
    return kwargs
