import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

from app.config import Settings, get_settings
from app.models.decryption import ContentKey, DecryptionKeysResponse
from app.services.auth import (
    get_connect_token_remaining_seconds,
    get_irdeto_session,
    get_irdeto_session_for_content,
    parse_session_info,
)
from app.services.dstv_client import DStvAPIError, DStvClient, is_expired
from app.services.entitlement import EntitlementError
from app.services.entitlement_response import parse_entitlement_response
from app.services.irdeto_content import license_content_id_candidates
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
        entitlement_content_ids: Optional[List[str]] = None,
    ) -> DecryptionKeysResponse:
        if not manifest_url:
            raise EntitlementError(
                "manifestUrl is required to extract Widevine PSSH data.",
                status_code=400,
                code="MANIFEST_REQUIRED",
            )

        entitlement_ids = self._entitlement_id_candidates(content_id, entitlement_content_ids)
        session = await self._resolve_playback_session(
            content_id=content_id,
            content_type=content_type,
            user_access_token=user_access_token,
            manifest_url=manifest_url,
            channel_tag=channel_tag,
            entitlement_content_ids=entitlement_ids,
        )

        return await self._generate_keys_with_session(
            content_id=content_id,
            manifest_url=session["manifest_url"],
            ls_session=session["ls_session"],
            expires_at=session["expires_at"],
            drm_content_id=session["drm_content_id"],
            streaming_filter=session.get("streaming_filter"),
            session_source=session["source"],
        )

    @staticmethod
    def _entitlement_id_candidates(
        content_id: str,
        extra_ids: Optional[List[str]],
    ) -> List[str]:
        candidates: List[str] = []
        for value in [content_id, *(extra_ids or [])]:
            normalized = (value or "").strip()
            if normalized and normalized not in candidates:
                candidates.append(normalized)
        return candidates

    async def _resolve_playback_session(
        self,
        *,
        content_id: str,
        content_type: str,
        user_access_token: Optional[str],
        manifest_url: str,
        channel_tag: Optional[str],
        entitlement_content_ids: List[str],
    ) -> dict:
        content_session = get_irdeto_session_for_content(content_id)
        global_session = get_irdeto_session()
        connect_jwt_active = bool(
            user_access_token and get_connect_token_remaining_seconds() > 0
        )

        if connect_jwt_active:
            async with DStvClient(self.settings) as client:
                last_error: Optional[DStvAPIError] = None
                for entitlement_id in entitlement_content_ids:
                    try:
                        entitlement_data = await client.request_entitlement_session(
                            content_id=entitlement_id,
                            content_type=content_type,
                            user_access_token=user_access_token,
                            channel_tag=channel_tag,
                            manifest_hint=manifest_url,
                        )
                    except DStvAPIError as exc:
                        last_error = exc
                        logger.info(
                            "Entitlement API failed for %s (status %s).",
                            entitlement_id,
                            exc.status_code,
                        )
                        continue

                    resolved_manifest, ls_session, expires_at, drm_content_id, streaming_filter = (
                        parse_entitlement_response(
                            entitlement_data,
                            entitlement_id,
                            manifest_url,
                            self.settings,
                        )
                    )
                    if not ls_session:
                        continue
                    if is_expired(expires_at):
                        raise EntitlementError(
                            "Entitlement session already expired.",
                            status_code=403,
                            code="SESSION_EXPIRED",
                        )

                    logger.info(
                        "Using entitlement session for %s (requested as %s).",
                        content_id,
                        entitlement_id,
                    )
                    return {
                        "manifest_url": resolved_manifest or manifest_url,
                        "ls_session": ls_session,
                        "expires_at": expires_at,
                        "drm_content_id": drm_content_id,
                        "streaming_filter": streaming_filter,
                        "source": "entitlement",
                    }

                irdeto_fallback = self._irdeto_session_fallback(
                    content_id=content_id,
                    manifest_url=manifest_url,
                    content_session=content_session,
                    global_session=global_session,
                )
                if irdeto_fallback is not None:
                    return irdeto_fallback

                if last_error and last_error.status_code in (401, 403):
                    raise EntitlementError(
                        "Entitlement denied and no valid Irdeto session is saved for this title. "
                        "Play it on dstv.stream so the extension can capture irdeto_session_jwt "
                        "with content_id.",
                        status_code=last_error.status_code,
                        code="ENTITLEMENT_DENIED",
                    ) from last_error
                if last_error:
                    raise EntitlementError(
                        "Failed to obtain entitlement session from DStv API.",
                        status_code=502,
                        code="ENTITLEMENT_API_ERROR",
                    ) from last_error
        elif user_access_token:
            logger.info(
                "Connect JWT expired for %s — skipping entitlement API, using Irdeto session if available.",
                content_id,
            )

        if content_session:
            logger.info("Using content-scoped Irdeto session for %s.", content_id)
            return self._manual_session_payload(
                content_id=content_id,
                manifest_url=manifest_url,
                ls_session=content_session,
                source="content_irdeto",
            )

        if global_session:
            logger.info("Using saved Irdeto session for %s (no content-specific session).", content_id)
            return self._manual_session_payload(
                content_id=content_id,
                manifest_url=manifest_url,
                ls_session=global_session,
                source="global_irdeto",
            )

        raise EntitlementError(
            "DStv user authorization required. Save Connect JWT or play the title on dstv.stream "
            "so the extension can capture an Irdeto session.",
            status_code=403,
            code="DSTV_AUTH_REQUIRED",
        )

    def _irdeto_session_fallback(
        self,
        *,
        content_id: str,
        manifest_url: str,
        content_session: Optional[str],
        global_session: Optional[str],
    ) -> Optional[dict]:
        if content_session:
            logger.info(
                "Using content-scoped Irdeto session for %s.",
                content_id,
            )
            return self._manual_session_payload(
                content_id=content_id,
                manifest_url=manifest_url,
                ls_session=content_session,
                source="content_irdeto",
            )
        if global_session:
            logger.info(
                "Using saved Irdeto session for %s (entitlement API unavailable).",
                content_id,
            )
            return self._manual_session_payload(
                content_id=content_id,
                manifest_url=manifest_url,
                ls_session=global_session,
                source="global_irdeto",
            )
        return None

    @staticmethod
    def _manual_session_payload(
        *,
        content_id: str,
        manifest_url: str,
        ls_session: str,
        source: str,
    ) -> dict:
        expires_at = parse_session_info(ls_session).expires_at or datetime.now(timezone.utc)
        if is_expired(expires_at):
            raise EntitlementError(
                "Irdeto session already expired. Play the title on dstv.stream and capture a fresh session.",
                status_code=403,
                code="SESSION_EXPIRED",
            )
        return {
            "manifest_url": manifest_url,
            "ls_session": ls_session,
            "expires_at": expires_at,
            "drm_content_id": content_id,
            "streaming_filter": None,
            "source": source,
        }

    async def _generate_keys_with_session(
        self,
        *,
        content_id: str,
        manifest_url: str,
        ls_session: str,
        expires_at: datetime,
        drm_content_id: str,
        streaming_filter: Optional[str],
        session_source: str = "entitlement",
    ) -> DecryptionKeysResponse:
        if is_expired(expires_at):
            raise EntitlementError(
                "Entitlement session already expired.",
                status_code=403,
                code="SESSION_EXPIRED",
            )

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

        entitlement_drm_id = drm_content_id if session_source == "entitlement" else None
        manifest_drm_id = manifest.get("drm_content_id")
        drm_content_id = manifest_drm_id or drm_content_id
        pssh = manifest.get("pssh") or ""
        kid = manifest.get("kid") or ""

        if not pssh:
            raise EntitlementError(
                "Manifest does not contain Widevine PSSH data.",
                status_code=502,
                code="PSSH_NOT_FOUND",
            )

        license_client = DStvClient(self.settings)
        await license_client.start()

        content_id_candidates = license_content_id_candidates(
            entitlement_content_id=entitlement_drm_id,
            manifest_content_id=manifest_drm_id,
            fallback_content_id=drm_content_id,
        )

        try:
            raw_keys, license_url, license_content_id = await self._request_license_keys(
                license_client=license_client,
                ls_session=ls_session,
                pssh_b64=pssh,
                content_id_candidates=content_id_candidates,
            )
        except WidevineKeyError as exc:
            message = str(exc)
            if exc.status_code == 403:
                message = (
                    "License server rejected the challenge (403). Play this exact title on dstv.stream "
                    "and let the extension POST a fresh irdeto_session_jwt with content_id (or source_url "
                    "containing the stream id). A global Irdeto session from another title will not work."
                )
            raise EntitlementError(
                message,
                status_code=exc.status_code,
                code="KEY_GENERATION_FAILED",
            ) from exc
        finally:
            await license_client.close()

        keys = [ContentKey(kid=item["kid"], key=item["key"]) for item in raw_keys]
        joined_keys = "".join(f"{item.kid}:{item.key} " for item in keys).strip()

        logger.info(
            "Generated %d decryption key(s) for content %s (license ContentId %s, source %s)",
            len(keys),
            content_id,
            license_content_id,
            session_source,
        )

        return DecryptionKeysResponse(
            assetId=str(manifest.get("asset_id") or content_id),
            drmContentId=license_content_id,
            manifestUrl=manifest_url,
            pssh=pssh,
            kid=kid,
            licenseUrl=license_url,
            sessionExpiresAt=expires_at,
            streamingFilter=streaming_filter,
            keys=keys,
            joinedKeys=joined_keys,
        )

    async def _request_license_keys(
        self,
        *,
        license_client: DStvClient,
        ls_session: str,
        pssh_b64: str,
        content_id_candidates: List[str],
    ) -> tuple[List[dict], str, str]:
        last_error: Optional[WidevineKeyError] = None
        for candidate in content_id_candidates:
            license_url = license_client.build_license_url(candidate, ls_session)
            try:
                raw_keys = await asyncio.to_thread(
                    generate_widevine_keys,
                    settings=self.settings,
                    pssh_b64=pssh_b64,
                    license_url=license_url,
                )
                return raw_keys, license_url, candidate
            except WidevineKeyError as exc:
                last_error = exc
                if exc.status_code == 403:
                    logger.info(
                        "License rejected for ContentId %s — trying next candidate.",
                        candidate,
                    )
                    continue
                raise

        if last_error:
            raise last_error
        raise WidevineKeyError("No license ContentId candidates were available.", status_code=502)
