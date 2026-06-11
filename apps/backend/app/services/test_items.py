from dataclasses import dataclass
from typing import Literal, Optional


@dataclass(frozen=True)
class TestItemSpec:
    """Stable test references only — no DRM session tokens or signed manifest URLs."""

    id: str
    content_type: Literal["vod", "live", "streaming"]
    channel_tag: Optional[str] = None
    vod_genref: Optional[str] = None
    stack_id: Optional[str] = None
    program_id: Optional[str] = None
    season_id: Optional[str] = None
    asset_id: Optional[str] = None
    # Path fragment or unsigned manifest template for entitlement hints (no hdntl/hmac).
    manifest_hint: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    # Public DStv CDN poster when server-side metadata fetch is WAF-blocked.
    image_hint: Optional[str] = None
    category: str = "Sport"


def find_test_item(item_id: str) -> Optional[TestItemSpec]:
    needle = item_id.strip()
    for spec in TEST_ITEMS:
        if spec.id == needle:
            return spec
    return None


# SuperSport FHD live linear — matches USL04/FHD/FHD.isml from browser capture.
TEST_ITEMS: tuple[TestItemSpec, ...] = (
    TestItemSpec(
        id="FHD",
        content_type="live",
        channel_tag="FHD",
        manifest_hint="USL04/FHD/FHD.isml/.mpd",
        title="SuperSport FHD",
        description="Live sport linear channel (576p mobile filter).",
        image_hint="https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Rugby_4-3_001_xlrg.png",
    ),
    TestItemSpec(
        id="SS127028_SOC060626WCFBELVTUNHD10_SUN",
        content_type="streaming",
        stack_id="SS119483",
        program_id="S119483",
        season_id="STK06944",
        asset_id="SS127028",
        manifest_hint=(
            "https://v1.dstv.com/Sport/STREAMING_WEB/06/"
            "SS127028_SOC060626WCFBELVTUNHD10_SUN/"
            "SS127028_SOC060626WCFBELVTUNHD10_SUN.ism/.mpd"
        ),
        title="Belgium v Tunisia",
        description="FIFA World Cup friendly highlight — Matchday 3, King Baudouin Stadium Brussels.",
        image_hint=(
            "https://images.dstv.stream/images/vod/2026/06/05/"
            "E36B_STK06944_LPS.jpg?presentation=small_16x9"
        ),
    ),
    TestItemSpec(
        id="MSH",
        content_type="live",
        channel_tag="MSH",
        title="SuperSport Football",
        description="Live football and sport coverage.",
        image_hint=(
            "https://images.dstv.stream/images/content/2025/09/11/"
            "16x9_Genre_Sport_Football_pre_thumb.jpg"
        ),
    ),
)
