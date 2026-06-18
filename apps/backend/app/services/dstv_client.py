import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, urljoin

import httpx

from app.config import Settings, get_settings
from app.services.auth import (
    get_catalog_connect_token,
    get_catalog_cookie,
    get_entitlement_access_token,
    get_playback_profile_id,
    get_playback_token,
    get_playback_waf_token,
    normalize_bearer_token,
    parse_session_info,
)
from app.utils.http_client import browser_request_headers, httpx_async_client
from app.utils.redact import redact_sensitive

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}
MAX_RETRIES = 3
RETRY_BACKOFF = 0.5

@dataclass(frozen=True)
class HeaderProfile:
    include_platform_id: bool = True
    profile_header: str = "x-profile-id"
    waf_header: str = "x-aws-waf-token"
    include_sec_fetch: bool = False
    send_cookie: bool = True


DEFAULT_HEADER_PROFILE = HeaderProfile()
PAGES_HEADER_PROFILE = HeaderProfile(
    include_platform_id=False,
    profile_header="X-Profile-Id",
    waf_header="X-Aws-Waf-Token",
    include_sec_fetch=True,
)
ENTITLEMENT_HEADER_PROFILE = HeaderProfile(
    include_platform_id=True,
    profile_header="X-Profile-Id",
    waf_header="X-Aws-Waf-Token",
    include_sec_fetch=True,
)


class DStvAPIError(Exception):
    def __init__(self, message: str, status_code: int = 502, detail: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


class DStvClient:
    """Authorized DStv API client. Uses SESSION from settings for metadata requests."""

    NAVIGATION_PATH = "/api/dstv_now/navigation_menu"
    VOD_SECTIONS: Dict[str, str] = {
        "home": "/api/dstv_now/pages/v2/vod_sections/home",
        "movies": "/api/dstv_now/pages/v2/vod_sections/movies",
        "sport": "/api/dstv_now/pages/v2/vod_sections/sports",
        "tvshows": "/api/dstv_now/pages/v2/vod_sections/tv_shows",
        "kids": "/api/dstv_now/pages/v2/vod_sections/kids",
    }
    LIVE_CHANNELS_PATH = (
        "/api/cs-mobile/v7/epg-service/channels/events"
        ";genre=ALL;country={country};packageId={package_id};count=2"
    )
    ENTITLEMENT_SESSION_PATH = "/api/vod-auth/entitlement/session"
    VOD_VIDEO_META_PATH = "/api/dstv_now/vod/granular_catalogue/videos/{video_id}"
    VOD_SEASON_PATH = (
        "/api/dstv_now/vod/granular_catalogue/stacks/{stack_id}/programs/{program_id}/seasons/{season_id}"
    )

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "DStvClient":
        await self.start()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def start(self) -> None:
        if self._client is None:
            self._client = httpx_async_client(
                self.settings,
                base_url=self.settings.dstv_api_base_url.rstrip("/"),
                default_headers=browser_request_headers(
                    self.settings,
                    accept="application/json, text/plain, */*",
                ),
                log_label="API",
            )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def _sync_cookie_waf_token(cookie: str, waf_token: str) -> str:
        if "aws-waf-token=" in cookie:
            return re.sub(r"(?:^|;\s*)aws-waf-token=[^;]*", f"; aws-waf-token={waf_token}", cookie).lstrip("; ")
        return f"{cookie}; aws-waf-token={waf_token}"

    @staticmethod
    def _header_profile_for_path(path: str) -> HeaderProfile:
        if "/pages/" in path or "/vod-auth/" in path:
            return PAGES_HEADER_PROFILE
        return DEFAULT_HEADER_PROFILE

    def _build_headers(
        self,
        user_access_token: Optional[str] = None,
        cookie: Optional[str] = None,
        extra: Optional[Dict[str, str]] = None,
        method: str = "GET",
        *,
        profile: Optional[HeaderProfile] = None,
        path: str = "",
    ) -> Dict[str, str]:
        header_profile = profile or self._header_profile_for_path(path)
        headers = browser_request_headers(
            self.settings,
            accept="application/json, text/plain, */*",
        )
        if header_profile.include_platform_id:
            headers["X-Platform-Id"] = self.settings.dstv_platform_id
        if header_profile.include_sec_fetch:
            headers.update(
                {
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin",
                    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"Windows"',
                }
            )
        if method.upper() != "GET":
            headers["Content-Type"] = "application/json"

        if self.settings.dstv_send_client_ip_headers:
            client_ip = self.settings.dstv_client_ip.strip()
            if client_ip:
                headers.update(
                    {
                        "X-Forwarded-For": client_ip,
                        "X-Real-IP": client_ip,
                        "True-Client-IP": client_ip,
                        "X-Client-IP": client_ip,
                    }
                )

        bearer = normalize_bearer_token(user_access_token)
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"

        cookie_value = ""
        if cookie is None:
            cookie_value = (get_catalog_cookie() or self.settings.dstv_cookie.strip() or "")
        else:
            cookie_value = cookie.strip()

        profile_id = (get_playback_profile_id() or self.settings.dstv_profile_id).strip()
        if profile_id:
            headers[header_profile.profile_header] = profile_id

        waf_token = (get_playback_waf_token() or self.settings.dstv_waf_token).strip()
        if waf_token:
            headers[header_profile.waf_header] = waf_token
            if cookie_value and header_profile.send_cookie:
                cookie_value = self._sync_cookie_waf_token(cookie_value, waf_token)

        if cookie_value and header_profile.send_cookie:
            headers["Cookie"] = cookie_value

        if extra:
            headers.update(extra)

        if "/vod-auth/" in path:
            headers["Accept"] = "*/*"

        return headers

    async def _request_with_profile(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        user_access_token: Optional[str] = None,
        cookie: Optional[str] = None,
        retry: bool = True,
        header_profile: Optional[HeaderProfile] = None,
    ) -> Any:
        if self._client is None:
            await self.start()

        headers = self._build_headers(
            user_access_token,
            cookie=cookie,
            method=method,
            path=path,
            profile=header_profile,
        )
        return await self._send_request(
            method,
            path,
            params=params,
            json_body=json_body,
            headers=headers,
            retry=retry,
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        user_access_token: Optional[str] = None,
        cookie: Optional[str] = None,
        retry: bool = True,
    ) -> Any:
        if self._client is None:
            await self.start()

        headers = self._build_headers(
            user_access_token,
            cookie=cookie,
            method=method,
            path=path,
        )
        return await self._send_request(
            method,
            path,
            params=params,
            json_body=json_body,
            headers=headers,
            retry=retry,
        )

    async def _send_request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        headers: Dict[str, str],
        retry: bool,
    ) -> Any:
        if self._client is None:
            await self.start()

        attempts = MAX_RETRIES if retry and method.upper() == "GET" else 1
        last_error: Optional[Exception] = None

        for attempt in range(attempts):
            try:
                response = await self._client.request(
                    method,
                    path,
                    params=params,
                    json=json_body,
                    headers=headers,
                )
                if response.status_code >= 400:
                    body_preview = redact_sensitive(response.text[:500])
                    logger.warning(
                        "DStv API error %s %s -> %s: %s",
                        method,
                        path,
                        response.status_code,
                        body_preview,
                    )
                    if retry and method.upper() == "GET" and response.status_code in RETRYABLE_STATUS:
                        await asyncio.sleep(RETRY_BACKOFF * (attempt + 1))
                        continue
                    raise DStvAPIError(
                        f"DStv API request failed: {response.status_code}",
                        status_code=response.status_code,
                        detail=body_preview,
                    )
                if not response.content:
                    return {}
                try:
                    return response.json()
                except ValueError as exc:
                    body_preview = redact_sensitive(response.text[:500])
                    logger.warning(
                        "DStv API invalid JSON %s %s: %s",
                        method,
                        path,
                        body_preview,
                    )
                    raise DStvAPIError(
                        "DStv API returned invalid JSON",
                        status_code=502,
                        detail=body_preview,
                    ) from exc
            except httpx.RequestError as exc:
                last_error = exc
                logger.warning(
                    "DStv API network error %s %s (attempt %d): %s",
                    method,
                    path,
                    attempt + 1,
                    redact_sensitive(str(exc)),
                )
                if retry and method.upper() == "GET" and attempt < attempts - 1:
                    await asyncio.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                raise DStvAPIError(
                    "DStv API network error",
                    status_code=502,
                    detail=redact_sensitive(str(exc)),
                ) from exc

        if last_error:
            raise DStvAPIError("DStv API request failed after retries", status_code=502)
        raise DStvAPIError("DStv API request failed", status_code=502)

    def _catalog_bearer_token(self) -> Optional[str]:
        return (
            get_catalog_connect_token()
            or normalize_bearer_token(self.settings.dstv_connect_token)
            or get_playback_token()
        )

    def _catalog_cookie(self) -> Optional[str]:
        return get_catalog_cookie() or self.settings.dstv_cookie.strip() or None

    def _playback_token(self) -> Optional[str]:
        return get_playback_token() or None

    def has_catalog_auth(self) -> bool:
        return bool(self._catalog_bearer_token() or self._catalog_cookie())

    async def get_navigation_menu(self) -> Any:
        params = {
            "platform_id": self.settings.dstv_platform_id,
            "country_code": self.settings.dstv_country_code,
            "revision": 7,
            "subscription_package": self.settings.dstv_package_id,
        }
        return await self._request(
            "GET",
            self.NAVIGATION_PATH,
            params=params,
            user_access_token=self._catalog_bearer_token(),
            cookie=self._catalog_cookie(),
        )

    async def get_vod_section(self, section: str) -> Any:
        path = self.VOD_SECTIONS.get(section)
        if not path:
            raise DStvAPIError(f"Unknown section: {section}", status_code=404)
        params = {
            "platform_id": self.settings.dstv_platform_id,
            "country_code": self.settings.dstv_country_code,
            "subscription_package": self.settings.dstv_package_id,
        }
        bearer = self._catalog_bearer_token()
        cookie = self._catalog_cookie()
        attempts: List[HeaderProfile] = [
            PAGES_HEADER_PROFILE,
            HeaderProfile(
                include_platform_id=False,
                profile_header="x-profile-id",
                waf_header="x-aws-waf-token",
                include_sec_fetch=True,
                send_cookie=False,
            ),
            HeaderProfile(
                include_platform_id=False,
                profile_header="X-Profile-Id",
                waf_header="X-Aws-Waf-Token",
                include_sec_fetch=True,
                send_cookie=False,
            ),
        ]
        last_error: Optional[DStvAPIError] = None
        for index, header_profile in enumerate(attempts):
            try:
                return await self._request_with_profile(
                    "GET",
                    path,
                    params=params,
                    user_access_token=bearer,
                    cookie=cookie if header_profile.send_cookie else "",
                    header_profile=header_profile,
                )
            except DStvAPIError as exc:
                last_error = exc
                if exc.status_code != 401 or index == len(attempts) - 1:
                    raise
                logger.info(
                    "Catalog 401 for %s — retrying with alternate browser headers.",
                    path,
                )
        if last_error:
            raise last_error
        raise DStvAPIError("Catalog request failed", status_code=502)

    async def get_video_meta(self, video_id: str) -> Any:
        path = self.VOD_VIDEO_META_PATH.format(video_id=video_id)
        params = {
            "country": self.settings.dstv_country_code,
            "subscription_package": self.settings.dstv_package_id,
        }
        return await self._request_with_profile(
            "GET",
            path,
            params=params,
            user_access_token=self._catalog_bearer_token(),
            cookie=self._catalog_cookie(),
            header_profile=PAGES_HEADER_PROFILE,
        )

    async def get_season_catalogue(
        self,
        stack_id: str,
        program_id: str,
        season_id: str,
    ) -> Any:
        path = self.VOD_SEASON_PATH.format(
            stack_id=stack_id,
            program_id=program_id,
            season_id=season_id,
        )
        params = {
            "country": self.settings.dstv_country_code,
            "subscription_package": self.settings.dstv_package_id,
        }
        return await self._request_with_profile(
            "GET",
            path,
            params=params,
            user_access_token=self._catalog_bearer_token(),
            cookie=self._catalog_cookie(),
            header_profile=PAGES_HEADER_PROFILE,
        )

    async def get_live_channels(self) -> Any:
        path = self.LIVE_CHANNELS_PATH.format(
            country=self.settings.dstv_country_code,
            package_id=self.settings.dstv_package_id,
        )
        params = {"platformId": self.settings.dstv_platform_id}
        return await self._request(
            "GET",
            path,
            params=params,
            user_access_token=self._catalog_bearer_token(),
            cookie=self._catalog_cookie(),
        )

    async def get_epg_channel(self, channel_id: str) -> Any:
        path = f"/api/cs-mobile/epg/v7/getEpgChannel;channelId={channel_id};platformId={self.settings.dstv_platform_id}"
        return await self._request("GET", path)

    async def get_event(self, event_id: str) -> Any:
        path = f"/api/cs-mobile/v7/epg-service/event;eventId={event_id}"
        return await self._request("GET", path)

    async def request_entitlement_session(
        self,
        content_id: str,
        content_type: str,
        user_access_token: str,
        channel_tag: Optional[str] = None,
        manifest_hint: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Request short-lived entitlement session via official API."""
        payload: Dict[str, Any] = {
            "contentId": content_id,
            "contentType": content_type,
            "platformId": self.settings.dstv_platform_id,
            "countryCode": self.settings.dstv_country_code,
            "packageId": self.settings.dstv_package_id,
        }
        if channel_tag:
            payload["channelTag"] = channel_tag
        if manifest_hint:
            if str(manifest_hint).startswith("http"):
                payload["manifestUrl"] = manifest_hint
            else:
                payload["manifestPath"] = str(manifest_hint).strip()

        bearer = normalize_bearer_token(user_access_token) or self._catalog_bearer_token()
        cookie = self._catalog_cookie()
        attempts: List[HeaderProfile] = [
            ENTITLEMENT_HEADER_PROFILE,
            PAGES_HEADER_PROFILE,
            HeaderProfile(
                include_platform_id=True,
                profile_header="x-profile-id",
                waf_header="x-aws-waf-token",
                include_sec_fetch=True,
                send_cookie=True,
            ),
        ]
        last_error: Optional[DStvAPIError] = None
        for index, header_profile in enumerate(attempts):
            try:
                return await self._request_with_profile(
                    "POST",
                    self.ENTITLEMENT_SESSION_PATH,
                    json_body=payload,
                    user_access_token=bearer,
                    cookie=cookie if header_profile.send_cookie else "",
                    header_profile=header_profile,
                    retry=False,
                )
            except DStvAPIError as exc:
                last_error = exc
                if exc.status_code != 401 or index == len(attempts) - 1:
                    raise
                logger.info(
                    "Entitlement 401 for %s — retrying with alternate browser headers.",
                    content_id,
                )
        if last_error:
            raise last_error
        raise DStvAPIError("Entitlement request failed", status_code=502)

    async def find_live_channel_manifest_path(self, channel_tag: str) -> Optional[str]:
        from app.services.live_manifest import manifest_hint_from_player_url

        needle = channel_tag.strip().upper()
        try:
            raw = await self.get_live_channels()
        except DStvAPIError as exc:
            logger.warning("Live channel lookup failed for %s: %s", channel_tag, exc.detail or str(exc))
            return None

        items: List[Any] = []
        if isinstance(raw, list):
            items = raw
        elif isinstance(raw, dict):
            for key in ("items", "channels", "events", "results", "channelEvents"):
                val = raw.get(key)
                if isinstance(val, list):
                    items = val
                    break

        for item in items:
            if not isinstance(item, dict):
                continue
            channel = item.get("channel") if isinstance(item.get("channel"), dict) else {}
            tag = str(
                item.get("channelAlias")
                or item.get("channelTag")
                or channel.get("id")
                or ""
            ).upper()
            if tag != needle:
                continue
            streams = item.get("streams") if isinstance(item.get("streams"), list) else []
            for stream in streams:
                if not isinstance(stream, dict):
                    continue
                hint = manifest_hint_from_player_url(stream.get("playerUrl"))
                if hint:
                    return hint
        return None

    def _live_auth_bearers(
        self,
        user_access_token: Optional[str],
        ls_session: str,
    ) -> List[str]:
        bearers: List[str] = []
        seen: set[str] = set()

        for token in (
            get_entitlement_access_token(),
            normalize_bearer_token(user_access_token),
            normalize_bearer_token(ls_session),
        ):
            if not token or token in seen:
                continue
            seen.add(token)
            if token == ls_session:
                bearers.append(token)
                continue
            try:
                if parse_session_info(token).remaining_seconds > 60:
                    bearers.append(token)
            except ValueError:
                continue

        if ls_session not in seen:
            bearers.append(ls_session)
        return bearers

    async def request_live_playback_manifest(
        self,
        *,
        channel_tag: str,
        ls_session: str,
        manifest_path: str,
        user_access_token: Optional[str] = None,
        streaming_filter: Optional[str] = None,
    ) -> Optional[str]:
        from app.services.live_manifest import (
            DEFAULT_LIVE_STREAMING_FILTER,
            PLAYBACK_MANIFEST_PATHS,
            _extract_manifest_url,
        )

        payload: Dict[str, Any] = {
            "channelTag": channel_tag,
            "contentId": channel_tag,
            "contentType": "streaming",
            "platformId": self.settings.dstv_platform_id,
            "countryCode": self.settings.dstv_country_code,
            "packageId": self.settings.dstv_package_id,
            "session": ls_session,
            "ls_session": ls_session,
            "manifestPath": manifest_path,
        }
        filter_value = streaming_filter or DEFAULT_LIVE_STREAMING_FILTER
        payload["streamingFilter"] = filter_value
        payload["ucp_filter"] = filter_value
        payload["streaming_filter"] = filter_value

        for bearer in self._live_auth_bearers(user_access_token, ls_session):
            for path in PLAYBACK_MANIFEST_PATHS:
                if not path.endswith("/manifest") and not path.endswith("/playback"):
                    continue
                try:
                    data = await self._request_with_profile(
                        "POST",
                        path,
                        json_body=payload,
                        user_access_token=bearer,
                        cookie=self._catalog_cookie(),
                        header_profile=ENTITLEMENT_HEADER_PROFILE,
                        retry=False,
                    )
                except DStvAPIError as exc:
                    logger.debug(
                        "Playback manifest POST %s failed (%s): %s",
                        path,
                        "irdeto" if bearer == ls_session else "connect",
                        exc.status_code,
                    )
                    continue

                manifest = _extract_manifest_url(data)
                if manifest:
                    logger.info("Resolved live manifest for %s via %s", channel_tag, path)
                    return manifest

        return None

    async def request_live_stream_token(
        self,
        *,
        channel_tag: str,
        ls_session: str,
        manifest_path: str,
        user_access_token: Optional[str] = None,
        streaming_filter: Optional[str] = None,
    ) -> Optional[str]:
        from app.services.live_manifest import (
            DEFAULT_LIVE_STREAMING_FILTER,
            PLAYBACK_MANIFEST_PATHS,
            _extract_akamai_token,
            _extract_manifest_url,
        )

        payload: Dict[str, Any] = {
            "channelTag": channel_tag,
            "contentId": channel_tag,
            "contentType": "streaming",
            "platformId": self.settings.dstv_platform_id,
            "countryCode": self.settings.dstv_country_code,
            "packageId": self.settings.dstv_package_id,
            "session": ls_session,
            "ls_session": ls_session,
            "manifestPath": manifest_path,
        }
        filter_value = streaming_filter or DEFAULT_LIVE_STREAMING_FILTER
        payload["streamingFilter"] = filter_value
        payload["ucp_filter"] = filter_value
        payload["streaming_filter"] = filter_value

        for bearer in self._live_auth_bearers(user_access_token, ls_session):
            for path in PLAYBACK_MANIFEST_PATHS:
                if not path.endswith("/token"):
                    continue
                try:
                    data = await self._request_with_profile(
                        "POST",
                        path,
                        json_body=payload,
                        user_access_token=bearer,
                        cookie=self._catalog_cookie(),
                        header_profile=ENTITLEMENT_HEADER_PROFILE,
                        retry=False,
                    )
                except DStvAPIError as exc:
                    logger.debug(
                        "Stream token POST %s failed (%s): %s",
                        path,
                        "irdeto" if bearer == ls_session else "connect",
                        exc.status_code,
                    )
                    continue

                token = _extract_akamai_token(data)
                if token:
                    logger.info("Resolved Akamai token for %s via %s", channel_tag, path)
                    return token

                manifest = _extract_manifest_url(data)
                if manifest and ("hmac=" in manifest or "hdntl=" in manifest):
                    return manifest

        return None

    def build_license_url(
        self,
        content_id: str,
        ls_session: str,
    ) -> str:
        params = {
            "CrmId": self.settings.dstv_crm_id,
            "AccountId": self.settings.dstv_account_id,
            "ContentId": content_id,
            "ls_session": ls_session,
        }
        base = self.settings.dstv_license_base_url.rstrip("/")
        return f"{base}/widevine/getLicense?{urlencode(params)}"

    def build_manifest_url(self, manifest_path: str) -> str:
        if manifest_path.startswith("http"):
            return manifest_path
        return urljoin(self.settings.dstv_api_base_url.rstrip("/") + "/", manifest_path.lstrip("/"))


def parse_expiry(expires_at: Any) -> datetime:
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            return expires_at.replace(tzinfo=timezone.utc)
        return expires_at
    if isinstance(expires_at, (int, float)):
        return datetime.fromtimestamp(expires_at, tz=timezone.utc)
    if isinstance(expires_at, str):
        normalized = expires_at.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(normalized)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def is_expired(expires_at: datetime) -> bool:
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return now >= expires_at
