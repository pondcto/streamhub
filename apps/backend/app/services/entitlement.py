import logging
from datetime import datetime, timezone
from typing import Optional

from app.config import Settings, get_settings
from app.models.playback import DrmConfig, PlaybackResponse, WidevineConfig
from app.services.auth import (
    get_connect_token_remaining_seconds,
    get_irdeto_session,
    get_irdeto_session_for_content,
    parse_session_info,
)
from app.services.dstv_client import DStvAPIError, DStvClient, is_expired
from app.services.entitlement_response import parse_entitlement_response
from app.services.normalizers import normalize_live_channels

logger = logging.getLogger(__name__)


class EntitlementError(Exception):
    def __init__(self, message: str, status_code: int = 403, code: str = "ENTITLEMENT_DENIED"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class EntitlementService:
    """Handles authorized entitlement flow. Never caches session tokens."""

    DEFAULT_SESSION_TTL_SECONDS = 7200

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()

    @staticmethod
    def _normalize_manifest_url(manifest_url: str, client: DStvClient) -> str:
        if manifest_url.startswith("http"):
            return manifest_url
        return client.build_manifest_url(manifest_url)

    async def _resolve_manifest_hint(
        self,
        client: DStvClient,
        *,
        content_type: str,
        channel_tag: Optional[str],
        manifest_hint: Optional[str],
    ) -> Optional[str]:
        if manifest_hint:
            return manifest_hint
        if content_type != "live" or not channel_tag:
            return None

        try:
            raw = await client.get_live_channels()
            channels = normalize_live_channels(raw)
        except DStvAPIError:
            return None

        tag = channel_tag.strip().upper()
        for channel in channels:
            channel_tag_value = (channel.channelTag or "").upper()
            channel_id_value = (channel.channelId or "").upper()
            if tag in {channel_tag_value, channel_id_value} and channel.manifestHint:
                return channel.manifestHint
        return None

    async def _build_playback_from_irdeto_session(
        self,
        *,
        content_id: str,
        manifest_url: str,
        ls_session: str,
    ) -> PlaybackResponse:
        expires_at = parse_session_info(ls_session).expires_at or datetime.now(timezone.utc)
        if is_expired(expires_at):
            raise EntitlementError(
                "Irdeto session already expired. Paste a fresh session JWT on the admin page.",
                status_code=403,
                code="SESSION_EXPIRED",
            )

        client = DStvClient(self.settings)
        manifest_url = self._normalize_manifest_url(manifest_url, client)
        license_url = client.build_license_url(content_id=content_id, ls_session=ls_session)

        logger.info(
            "Playback authorized via saved Irdeto session for content %s, expires %s",
            content_id,
            expires_at.isoformat(),
        )

        return PlaybackResponse(
            manifestUrl=manifest_url,
            drm=DrmConfig(
                widevine=WidevineConfig(licenseUrl=license_url),
            ),
            expiresAt=expires_at,
        )

    async def verify_and_build_playback(
        self,
        content_id: str,
        content_type: str,
        user_access_token: Optional[str],
        channel_tag: Optional[str] = None,
        manifest_hint: Optional[str] = None,
    ) -> PlaybackResponse:
        async with DStvClient(self.settings) as client:
            resolved_manifest = await self._resolve_manifest_hint(
                client,
                content_type=content_type,
                channel_tag=channel_tag,
                manifest_hint=manifest_hint,
            )

            content_session = get_irdeto_session_for_content(content_id)
            manual_session = content_session or get_irdeto_session()

            if not user_access_token:
                if manual_session and not resolved_manifest:
                    raise EntitlementError(
                        "Manifest URL is required for playback. Open the channel from the dashboard "
                        "so StreamHub can resolve the live stream path, or add manifestHint to the watch URL.",
                        status_code=400,
                        code="MANIFEST_REQUIRED",
                    )
                raise EntitlementError(
                    "DStv user authorization required. Set SESSION in the environment file.",
                    status_code=403,
                    code="DSTV_AUTH_REQUIRED",
                )

            if get_connect_token_remaining_seconds() <= 0:
                if manual_session and resolved_manifest:
                    logger.info(
                        "Connect JWT expired for %s — using saved Irdeto session.",
                        content_id,
                    )
                    return await self._build_playback_from_irdeto_session(
                        content_id=content_id,
                        manifest_url=resolved_manifest,
                        ls_session=manual_session,
                    )
                raise EntitlementError(
                    "Connect JWT expired. Play the title on dstv.stream to capture a fresh session.",
                    status_code=403,
                    code="ENTITLEMENT_DENIED",
                )

            try:
                session_data = await client.request_entitlement_session(
                    content_id=content_id,
                    content_type=content_type,
                    user_access_token=user_access_token,
                    channel_tag=channel_tag,
                    manifest_hint=resolved_manifest,
                )
            except DStvAPIError as exc:
                if manual_session and resolved_manifest:
                    logger.info(
                        "Entitlement API failed for %s — falling back to saved Irdeto session.",
                        content_id,
                    )
                    return await self._build_playback_from_irdeto_session(
                        content_id=content_id,
                        manifest_url=resolved_manifest,
                        ls_session=manual_session,
                    )
                if exc.status_code in (401, 403):
                    raise EntitlementError(
                        "Entitlement denied or session expired.",
                        status_code=exc.status_code,
                        code="ENTITLEMENT_DENIED",
                    ) from exc
                raise EntitlementError(
                    "Failed to obtain entitlement session from authorized API.",
                    status_code=502,
                    code="ENTITLEMENT_API_ERROR",
                ) from exc

        manifest_url, ls_session, expires_at, drm_content_id, _ = parse_entitlement_response(
            session_data,
            content_id,
            resolved_manifest,
            self.settings,
        )

        if not manifest_url or not ls_session:
            manual_session = get_irdeto_session()
            if manual_session and resolved_manifest:
                return await self._build_playback_from_irdeto_session(
                    content_id=content_id,
                    manifest_url=resolved_manifest,
                    ls_session=manual_session,
                )
            logger.warning(
                "Entitlement response missing playback fields for content %s",
                content_id,
            )
            raise EntitlementError(
                "Entitlement succeeded but playback configuration was incomplete.",
                status_code=502,
                code="ENTITLEMENT_INCOMPLETE",
            )

        if is_expired(expires_at):
            raise EntitlementError(
                "Entitlement session already expired.",
                status_code=403,
                code="SESSION_EXPIRED",
            )

        license_url = DStvClient(self.settings).build_license_url(
            content_id=drm_content_id,
            ls_session=ls_session,
        )

        logger.info(
            "Playback authorized for content %s, expires %s",
            content_id,
            expires_at.isoformat(),
        )

        return PlaybackResponse(
            manifestUrl=manifest_url,
            drm=DrmConfig(
                widevine=WidevineConfig(licenseUrl=license_url),
            ),
            expiresAt=expires_at,
        )

    async def stop_playback(
        self,
        user_access_token: Optional[str],
        content_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> dict:
        if not user_access_token:
            raise EntitlementError("Authentication required.", status_code=401, code="UNAUTHORIZED")

        logger.info(
            "Playback stop requested for content %s (session redacted)",
            content_id or session_id or "unknown",
        )
        return {"status": "stopped", "message": "Stream stop acknowledged"}
