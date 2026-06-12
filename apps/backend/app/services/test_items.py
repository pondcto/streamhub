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
    category: str = "Sport"


def find_test_item(item_id: str) -> Optional[TestItemSpec]:
    needle = item_id.strip()
    for spec in TEST_ITEMS:
        if spec.id == needle:
            return spec
    return None


TEST_ITEMS: tuple[TestItemSpec, ...] = (
    TestItemSpec(
        id="TS2",
        content_type="live",
        channel_tag="TS2",
        manifest_hint="USL02/TS2/TS2.isml/.mpd",
        title="TS2 Live",
        description="Live linear channel (576p mobile filter).",
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
    ),
)
