"""cURL (pycurl) backed HTTP client used for all proxied outbound requests.

DStv's live manifests are geo/IP-restricted, so proxied requests must egress
through the configured SOCKS proxy. libcurl's SOCKS handling is what was verified
to work (`curl --socks5-hostname …`), so when a proxy is configured every outbound
request goes through this adapter instead of httpx.

The adapter mimics the small subset of the httpx client/response interface the
codebase relies on (see http_client.httpx_async_client / httpx_sync_client):
  client:   async/sync `.get()`, `.post()`, `.request()`, context-manager, aclose/close
  response: `.status_code`, `.text`, `.content`, `.json()`, `.headers.get()`, `.url`
Network failures raise CurlError, a subclass of httpx.RequestError, so existing
`except httpx.RequestError` handlers keep working unchanged.
"""

import asyncio
import json as _json
from io import BytesIO
from typing import Any, Optional
from urllib.parse import urlencode

import httpx  # only for exception compatibility / Timeout introspection
import pycurl


class CurlError(httpx.RequestError):
    """A cURL transport error, catchable as httpx.RequestError."""


class _CaseInsensitiveHeaders:
    """Minimal case-insensitive view supporting the `.get()`/`in` access used."""

    def __init__(self, data: Optional[dict] = None) -> None:
        self._data: dict[str, str] = {}
        if data:
            for key, value in data.items():
                self._data[str(key).lower()] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(str(key).lower(), default)

    def __getitem__(self, key: str) -> str:
        return self._data[str(key).lower()]

    def __contains__(self, key: str) -> bool:
        return str(key).lower() in self._data

    def items(self):
        return self._data.items()


class CurlResponse:
    def __init__(self, status_code: int, headers: dict, content: bytes, url: str) -> None:
        self.status_code = status_code
        self.headers = _CaseInsensitiveHeaders(headers)
        self.content = content
        self.url = url

    @property
    def text(self) -> str:
        if not self.content:
            return ""
        charset = "utf-8"
        ctype = (self.headers.get("content-type", "") or "").lower()
        if "charset=" in ctype:
            charset = ctype.split("charset=", 1)[1].split(";")[0].strip() or "utf-8"
        try:
            return self.content.decode(charset, errors="replace")
        except (LookupError, UnicodeDecodeError):
            return self.content.decode("utf-8", errors="replace")

    def json(self) -> Any:
        return _json.loads(self.content.decode("utf-8"))


def _timeouts(timeout: Any) -> tuple[int, int]:
    """Return (total_seconds, connect_seconds) from an httpx.Timeout or number."""
    total, connect = 30, 10
    try:
        if isinstance(timeout, httpx.Timeout):
            if timeout.read:
                total = int(timeout.read)
            elif timeout.pool:
                total = int(timeout.pool)
            if timeout.connect:
                connect = int(timeout.connect)
        elif timeout is not None:
            total = int(float(timeout))
    except (TypeError, ValueError):
        pass
    return total, connect


def _normalize_proxy(proxy: str) -> str:
    """Use SOCKS5 with remote DNS (socks5h) to match `curl --socks5-hostname`."""
    if proxy.startswith("socks5://"):
        return "socks5h://" + proxy[len("socks5://"):]
    return proxy


def _perform(
    *,
    method: str,
    url: str,
    headers: dict,
    body: Optional[bytes],
    proxy: Optional[str],
    total_timeout: int,
    connect_timeout: int,
    follow_redirects: bool,
) -> CurlResponse:
    buf = BytesIO()
    resp_headers: dict[str, str] = {}

    def _header_fn(raw: bytes) -> None:
        try:
            line = raw.decode("iso-8859-1")
        except Exception:
            return
        if ":" in line:
            key, value = line.split(":", 1)
            resp_headers[key.strip().lower()] = value.strip()

    # Send our exact header set. Suppress libcurl's automatic "Expect:
    # 100-continue" on POST (some origins mishandle it) and its default
    # "Content-Type: application/x-www-form-urlencoded" when the caller didn't set
    # one — httpx sends binary bodies (e.g. the Widevine license challenge) with no
    # Content-Type, and we must match that exactly.
    header_list = [f"{k}: {v}" for k, v in headers.items()]
    header_list.append("Expect:")
    if not any(k.lower() == "content-type" for k in headers):
        header_list.append("Content-Type:")

    handle = pycurl.Curl()
    try:
        handle.setopt(pycurl.URL, url)
        handle.setopt(pycurl.WRITEDATA, buf)
        handle.setopt(pycurl.HEADERFUNCTION, _header_fn)
        handle.setopt(pycurl.HTTPHEADER, header_list)
        handle.setopt(pycurl.FOLLOWLOCATION, 1 if follow_redirects else 0)
        handle.setopt(pycurl.CONNECTTIMEOUT, connect_timeout)
        handle.setopt(pycurl.TIMEOUT, total_timeout)
        handle.setopt(pycurl.NOSIGNAL, 1)
        if proxy:
            handle.setopt(pycurl.PROXY, proxy)

        verb = method.upper()
        if verb == "GET":
            handle.setopt(pycurl.HTTPGET, 1)
        elif verb == "POST":
            data = body or b""
            handle.setopt(pycurl.POST, 1)
            handle.setopt(pycurl.POSTFIELDS, data)
            handle.setopt(pycurl.POSTFIELDSIZE, len(data))
        else:
            handle.setopt(pycurl.CUSTOMREQUEST, verb)
            if body:
                handle.setopt(pycurl.POSTFIELDS, body)
                handle.setopt(pycurl.POSTFIELDSIZE, len(body))

        try:
            handle.perform()
        except pycurl.error as exc:
            raise CurlError(f"cURL request to {url} failed: {exc}") from exc

        status = int(handle.getinfo(pycurl.RESPONSE_CODE))
        final_url = handle.getinfo(pycurl.EFFECTIVE_URL) or url
        return CurlResponse(status, resp_headers, buf.getvalue(), final_url)
    finally:
        handle.close()


class _BaseCurlClient:
    def __init__(
        self,
        *,
        proxy: Optional[str] = None,
        headers: Optional[dict] = None,
        base_url: str = "",
        timeout: Any = None,
        follow_redirects: bool = True,
        **_ignored: Any,
    ) -> None:
        self._proxy = _normalize_proxy(proxy) if proxy else None
        self._default_headers = dict(headers or {})
        self._base_url = (base_url or "").rstrip("/")
        self._total_timeout, self._connect_timeout = _timeouts(timeout)
        self._follow = bool(follow_redirects)

    def _build_url(self, url: str) -> str:
        text = str(url)
        if text.startswith("http://") or text.startswith("https://"):
            return text
        if self._base_url:
            return f"{self._base_url}/{text.lstrip('/')}"
        return text

    def _merge_headers(self, headers: Optional[dict], content_type: Optional[str]) -> dict:
        merged = dict(self._default_headers)
        if content_type and not any(k.lower() == "content-type" for k in merged):
            merged["Content-Type"] = content_type
        for key, value in (headers or {}).items():
            for existing in [k for k in merged if k.lower() == key.lower()]:
                merged.pop(existing, None)
            merged[key] = value
        return merged

    def _prepare(self, method, url, *, params=None, json=None, content=None, headers=None):
        full_url = self._build_url(url)
        if params:
            query = urlencode(params, doseq=True)
            full_url = f"{full_url}{'&' if '?' in full_url else '?'}{query}"
        body: Optional[bytes] = None
        content_type: Optional[str] = None
        if json is not None:
            body = _json.dumps(json).encode("utf-8")
            content_type = "application/json"
        elif content is not None:
            body = content if isinstance(content, (bytes, bytearray)) else str(content).encode("utf-8")
        return method, full_url, self._merge_headers(headers, content_type), body

    def _perform_kwargs(self, method, full_url, hdrs, body) -> dict:
        return dict(
            method=method,
            url=full_url,
            headers=hdrs,
            body=body,
            proxy=self._proxy,
            total_timeout=self._total_timeout,
            connect_timeout=self._connect_timeout,
            follow_redirects=self._follow,
        )


class CurlAsyncClient(_BaseCurlClient):
    async def request(self, method, url, *, params=None, json=None, content=None, headers=None):
        method, full_url, hdrs, body = self._prepare(
            method, url, params=params, json=json, content=content, headers=headers
        )
        return await asyncio.to_thread(_perform, **self._perform_kwargs(method, full_url, hdrs, body))

    async def get(self, url, *, params=None, headers=None):
        return await self.request("GET", url, params=params, headers=headers)

    async def post(self, url, *, params=None, json=None, content=None, headers=None):
        return await self.request("POST", url, params=params, json=json, content=content, headers=headers)

    async def aclose(self) -> None:
        return None

    async def __aenter__(self) -> "CurlAsyncClient":
        return self

    async def __aexit__(self, *exc) -> bool:
        return False


class CurlSyncClient(_BaseCurlClient):
    def request(self, method, url, *, params=None, json=None, content=None, headers=None):
        method, full_url, hdrs, body = self._prepare(
            method, url, params=params, json=json, content=content, headers=headers
        )
        return _perform(**self._perform_kwargs(method, full_url, hdrs, body))

    def get(self, url, *, params=None, headers=None):
        return self.request("GET", url, params=params, headers=headers)

    def post(self, url, *, params=None, json=None, content=None, headers=None):
        return self.request("POST", url, params=params, json=json, content=content, headers=headers)

    def close(self) -> None:
        return None

    def __enter__(self) -> "CurlSyncClient":
        return self

    def __exit__(self, *exc) -> bool:
        return False
