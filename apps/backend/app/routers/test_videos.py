import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings
from app.dependencies import require_auth
from app.models.auth import SessionData
from app.models.decryption import DecryptionKeysResponse
from app.models.live import LiveChannel
from app.models.test_videos import TestVideoCard, TestVideosResponse
from app.services.decryption import DecryptionService
from app.services.dstv_client import DStvAPIError, DStvClient
from app.services.entitlement import EntitlementError
from app.services.normalizers import (
    normalize_live_channels,
    normalize_test_season_item,
    normalize_test_video_card,
)
from app.services.test_items import TEST_ITEMS, TestItemSpec, find_test_item

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/test", tags=["test"])
decryption_service = DecryptionService()


def _find_live_channel(channels: list[LiveChannel], channel_tag: str) -> Optional[LiveChannel]:
    tag = channel_tag.strip().upper()
    for channel in channels:
        if (channel.channelTag or "").upper() == tag:
            return channel
        if (channel.channelId or "").upper() == tag:
            return channel
    return None


def _fallback_test_card(spec: TestItemSpec) -> TestVideoCard:
    return TestVideoCard(
        id=spec.id,
        title=spec.title or f"Test {spec.id}",
        type=spec.content_type,
        category=spec.category,
        image=spec.image_hint,
        duration=None,
        description=spec.description,
        channel_tag=spec.channel_tag,
        manifest_hint=spec.manifest_hint,
        playable=True,
        metadataStatus="fallback",
    )


def _live_test_card(spec: TestItemSpec, channel: Optional[LiveChannel]) -> TestVideoCard:
    if channel is None:
        return _fallback_test_card(spec)

    return TestVideoCard(
        id=spec.id,
        title=spec.title or channel.title,
        type=spec.content_type,
        category=spec.category,
        description=spec.description or channel.currentEvent,
        duration=channel.duration,
        image=channel.image or spec.image_hint,
        channel_tag=spec.channel_tag or channel.channelTag,
        manifest_hint=spec.manifest_hint,
        playable=True,
        metadataStatus="ok",
    )


@router.get("/videos", response_model=TestVideosResponse)
async def get_test_videos() -> TestVideosResponse:
    settings = get_settings()
    items: list[TestVideoCard] = []

    async with DStvClient(settings) as client:
        live_channels: list[LiveChannel] = []
        needs_live = any(spec.content_type == "live" for spec in TEST_ITEMS)
        if needs_live:
            try:
                live_raw = await client.get_live_channels()
                live_channels = normalize_live_channels(live_raw)
            except DStvAPIError as exc:
                logger.warning("Test tab live metadata failed (status %s)", exc.status_code)

        for spec in TEST_ITEMS:
            if spec.content_type == "live":
                channel = _find_live_channel(live_channels, spec.channel_tag or spec.id)
                items.append(_live_test_card(spec, channel))
                continue

            if spec.season_id and spec.stack_id and spec.program_id:
                try:
                    meta = await client.get_season_catalogue(
                        spec.stack_id,
                        spec.program_id,
                        spec.season_id,
                    )
                    normalized = normalize_test_season_item(
                        meta,
                        asset_id=spec.asset_id or spec.id,
                        content_id=spec.id,
                    )
                    normalized["type"] = spec.content_type
                    normalized["category"] = spec.category
                    if spec.title:
                        normalized["title"] = spec.title
                    if spec.description:
                        normalized["description"] = spec.description
                    if spec.manifest_hint:
                        normalized["manifest_hint"] = spec.manifest_hint
                    if not normalized.get("image") and spec.image_hint:
                        normalized["image"] = spec.image_hint
                    items.append(TestVideoCard(**normalized))
                except DStvAPIError as exc:
                    logger.warning(
                        "Test season metadata failed for %s (status %s)",
                        spec.id,
                        exc.status_code,
                    )
                    items.append(_fallback_test_card(spec))
                except Exception:
                    logger.warning("Test season metadata failed for %s", spec.id)
                    items.append(_fallback_test_card(spec))
                continue

            genref = spec.vod_genref or spec.id
            try:
                meta = await client.get_video_meta(genref)
                normalized = normalize_test_video_card(meta, fallback_id=genref)
                normalized["type"] = spec.content_type
                normalized["category"] = spec.category
                if spec.title:
                    normalized["title"] = spec.title
                if spec.description:
                    normalized["description"] = spec.description
                normalized["manifest_hint"] = spec.manifest_hint
                items.append(TestVideoCard(**normalized))
            except DStvAPIError as exc:
                logger.warning(
                    "Test video metadata failed for %s (status %s)",
                    genref,
                    exc.status_code,
                )
                items.append(_fallback_test_card(spec))
            except Exception:
                logger.warning("Test video metadata failed for %s", genref)
                items.append(_fallback_test_card(spec))

    return TestVideosResponse(section="Test", count=len(items), items=items)


@router.post("/videos/{item_id}/keys", response_model=DecryptionKeysResponse)
async def generate_test_item_keys(
    item_id: str,
    session: SessionData = Depends(require_auth),
) -> DecryptionKeysResponse:
    spec = find_test_item(item_id)
    if spec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Unknown test item: {item_id}"},
        )
    if not spec.manifest_hint:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "MANIFEST_REQUIRED",
                "message": "This test item does not have a manifest hint for key generation.",
            },
        )

    try:
        return await decryption_service.generate_keys(
            content_id=spec.id,
            content_type=spec.content_type,
            user_access_token=session.dstv_access_token,
            manifest_url=spec.manifest_hint,
            channel_tag=spec.channel_tag,
        )
    except EntitlementError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
