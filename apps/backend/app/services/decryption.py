import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from app.config import Settings, get_settings
from app.models.decryption import ContentKey, DecryptionKeysResponse
from app.services.auth import get_effective_access_token, get_irdeto_session, parse_session_info
from app.services.dstv_client import DStvAPIError, DStvClient, is_expired
from app.services.entitlement import EntitlementError
from app.services.entitlement_response import parse_entitlement_response
from app.services.live_manifest import ensure_fetchable_manifest_url
from app.services.manifest_parser import ManifestParserError, fetch_manifest_drm_data
from app.services.widevine_keys import WidevineKeyError, generate_widevine_keys

logger = logging.getLogger(__name__)


class DecryptionService:
    """Fetch DStv entitlement + manifest metadata and derive Widevine CONTENT keys."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()

    async def generate_keys(
        self,
        *,
        content_id: str,
        content_type: str,
        user_access_token: Optional[str],
        manifest_url: str,
        channel_tag: Optional[str] = None,
    ) -> DecryptionKeysResponse:
        if not manifest_url:
            raise EntitlementError(
                "manifestUrl is required to extract Widevine PSSH data.",
                status_code=400,
                code="MANIFEST_REQUIRED",
            )

        manual_session = get_irdeto_session()
        resolved_manifest_url = manifest_url
        effective_access_token = user_access_token or get_effective_access_token()

        if channel_tag and not manifest_url.startswith("http"):
            async with DStvClient(self.settings) as lookup_client:
                epg_path = await lookup_client.find_live_channel_manifest_path(channel_tag)
                if epg_path:
                    resolved_manifest_url = epg_path

        # Prefer browser-captured Irdeto session for VOD highlights (live linear needs entitlement).
        if manual_session and resolved_manifest_url and not channel_tag:
            logger.info(
                "Using saved Irdeto session for content %s (skipping entitlement API)",
                content_id,
            )
            return await self._generate_keys_with_manual_session(
                content_id=content_id,
                content_type=content_type,
                manifest_url=resolved_manifest_url,
                ls_session=manual_session,
                channel_tag=channel_tag,
            )

        if effective_access_token:
            async with DStvClient(self.settings) as client:
                try:
                    entitlement_data = await client.request_entitlement_session(
                        content_id=channel_tag or content_id,
                        content_type=content_type,
                        user_access_token=effective_access_token,
                        channel_tag=channel_tag,
                        manifest_hint=resolved_manifest_url,
                    )
                except DStvAPIError as exc:
                    if manual_session:
                        logger.info(
                            "Entitlement API failed for %s — falling back to saved Irdeto session.",
                            content_id,
                        )
                        return await self._generate_keys_with_manual_session(
                            content_id=content_id,
                            content_type=content_type,
                            manifest_url=resolved_manifest_url,
                            ls_session=manual_session,
                            channel_tag=channel_tag,
                        )
                    if exc.status_code in (401, 403):
                        raise EntitlementError(
                            "Entitlement denied or auth token expired.",
                            status_code=exc.status_code,
                            code="ENTITLEMENT_DENIED",
                        ) from exc
                    raise EntitlementError(
                        "Failed to obtain entitlement session from DStv API.",
                        status_code=502,
                        code="ENTITLEMENT_API_ERROR",
                    ) from exc

                resolved_manifest, ls_session, expires_at, drm_content_id, streaming_filter = (
                    parse_entitlement_response(
                        entitlement_data,
                        channel_tag or content_id,
                        resolved_manifest_url,
                        self.settings,
                    )
                )

                if not ls_session:
                    if manual_session:
                        logger.info(
                            "Entitlement response missing session for %s — using saved Irdeto session.",
                            content_id,
                        )
                        return await self._generate_keys_with_manual_session(
                            content_id=content_id,
                            content_type=content_type,
                            manifest_url=resolved_manifest_url,
                            ls_session=manual_session,
                            channel_tag=channel_tag,
                        )
                    raise EntitlementError(
                        "Entitlement response did not include a session token.",
                        status_code=502,
                        code="ENTITLEMENT_INCOMPLETE",
                    )

                if is_expired(expires_at):
                    raise EntitlementError(
                        "Entitlement session already expired.",
                        status_code=403,
                        code="SESSION_EXPIRED",
                    )

                return await self._generate_keys_with_session(
                    content_id=content_id,
                    content_type=content_type,
                    manifest_url=resolved_manifest or resolved_manifest_url,
                    ls_session=ls_session,
                    expires_at=expires_at,
                    drm_content_id=drm_content_id or channel_tag or content_id,
                    streaming_filter=streaming_filter,
                    channel_tag=channel_tag,
                    client=client,
                    user_access_token=effective_access_token,
                )

        if manual_session:
            logger.info("Using saved Irdeto session for content %s (no Connect JWT)", content_id)
            return await self._generate_keys_with_manual_session(
                content_id=content_id,
                content_type=content_type,
                manifest_url=resolved_manifest_url,
                ls_session=manual_session,
                channel_tag=channel_tag,
                user_access_token=effective_access_token,
            )

        raise EntitlementError(
            "DStv user authorization required. Set DSTV_CONNECT_TOKEN or use the tracked session import.",
            status_code=403,
            code="DSTV_AUTH_REQUIRED",
        )

    async def _generate_keys_with_manual_session(
        self,
        *,
        content_id: str,
        content_type: str,
        manifest_url: str,
        ls_session: str,
        channel_tag: Optional[str] = None,
        user_access_token: Optional[str] = None,
    ) -> DecryptionKeysResponse:
        expires_at = parse_session_info(ls_session).expires_at or datetime.now(timezone.utc)
        if is_expired(expires_at):
            raise EntitlementError(
                "Irdeto session already expired. Play the title on dstv.stream and paste a fresh session JWT.",
                status_code=403,
                code="SESSION_EXPIRED",
            )
        if channel_tag and user_access_token:
            async with DStvClient(self.settings) as client:
                return await self._generate_keys_with_session(
                    content_id=content_id,
                    content_type=content_type,
                    manifest_url=manifest_url,
                    ls_session=ls_session,
                    expires_at=expires_at,
                    drm_content_id=channel_tag or content_id,
                    streaming_filter=None,
                    channel_tag=channel_tag,
                    client=client,
                    user_access_token=user_access_token,
                )

        return await self._generate_keys_with_session(
            content_id=content_id,
            content_type=content_type,
            manifest_url=manifest_url,
            ls_session=ls_session,
            expires_at=expires_at,
            drm_content_id=channel_tag or content_id,
            streaming_filter=None,
            channel_tag=channel_tag,
            user_access_token=user_access_token,
        )

    async def _generate_keys_with_session(
        self,
        *,
        content_id: str,
        content_type: str,
        manifest_url: str,
        ls_session: str,
        expires_at: datetime,
        drm_content_id: str,
        streaming_filter: Optional[str],
        channel_tag: Optional[str] = None,
        client: Optional[DStvClient] = None,
        user_access_token: Optional[str] = None,
    ) -> DecryptionKeysResponse:
        if is_expired(expires_at):
            raise EntitlementError(
                "Entitlement session already expired.",
                status_code=403,
                code="SESSION_EXPIRED",
            )

        try:
            manifest_url = await ensure_fetchable_manifest_url(
                self.settings,
                manifest_url=manifest_url,
                ls_session=ls_session,
                content_type=content_type,
                channel_tag=channel_tag,
                streaming_filter=streaming_filter,
                dstv_client=client,
                user_access_token=user_access_token,
            )
        except ValueError as exc:
            raise EntitlementError(
                str(exc),
                status_code=502,
                code="MANIFEST_RESOLVE_FAILED",
            ) from exc

        try:
            manifest = await fetch_manifest_drm_data(
                manifest_url,
                self.settings,
            )
        except ManifestParserError as exc:
            raise EntitlementError(
                str(exc),
                status_code=exc.status_code,
                code="MANIFEST_ERROR",
            ) from exc

        drm_content_id = manifest.get("drm_content_id") or drm_content_id
        pssh = manifest.get("pssh") or ""
        kid = manifest.get("kid") or ""

        if not pssh:
            raise EntitlementError(
                "Manifest does not contain Widevine PSSH data.",
                status_code=502,
                code="PSSH_NOT_FOUND",
            )

        license_client = client or DStvClient(self.settings)
        owns_client = client is None
        if owns_client:
            await license_client.start()

        try:
            license_url = license_client.build_license_url(drm_content_id, ls_session)

            try:
                raw_keys = await asyncio.to_thread(
                    generate_widevine_keys,
                    settings=self.settings,
                    pssh_b64=pssh,
                    license_url=license_url,
                )
            except WidevineKeyError as exc:
                raise EntitlementError(
                    str(exc),
                    status_code=exc.status_code,
                    code="KEY_GENERATION_FAILED",
                ) from exc
        finally:
            if owns_client:
                await license_client.close()

        keys = [ContentKey(kid=item["kid"], key=item["key"]) for item in raw_keys]
        joined_keys = "".join(f"{item.kid}:{item.key} " for item in keys).strip()

        logger.info(
            "Generated %d decryption key(s) for content %s (asset %s)",
            len(keys),
            drm_content_id,
            manifest.get("asset_id"),
        )

        return DecryptionKeysResponse(
            assetId=str(manifest.get("asset_id") or content_id),
            drmContentId=drm_content_id,
            manifestUrl=manifest_url,
            pssh=pssh,
            kid=kid,
            licenseUrl=license_url,
            sessionExpiresAt=expires_at,
            streamingFilter=streaming_filter,
            keys=keys,
            joinedKeys=joined_keys,
        )
