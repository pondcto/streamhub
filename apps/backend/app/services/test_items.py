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
    # Expected signed manifest CDN when captured from the browser session tracker.
    live_manifest_cdn: Optional[Literal["akamai", "gtm"]] = None
    title: Optional[str] = None
    description: Optional[str] = None
    category: str = "Sport"


def find_test_item(item_id: str) -> Optional[TestItemSpec]:
    needle = item_id.strip()
    for spec in TEST_ITEMS:
        if spec.id == needle:
            return spec
    return None


def find_test_item_by_channel_tag(channel_tag: str) -> Optional[TestItemSpec]:
    needle = channel_tag.strip().upper()
    for spec in TEST_ITEMS:
        if (spec.channel_tag or "").strip().upper() == needle:
            return spec
    return None


TEST_ITEMS: tuple[TestItemSpec, ...] = (
    TestItemSpec(
        id="TS2",
        content_type="streaming",
        channel_tag="TS2",
        manifest_hint="USL02/TS2/TS2.isml/.mpd",
        live_manifest_cdn="akamai",
        title="TS2 Live",
        description="Live linear channel — Akamai hdntl signed manifest (i-live-cache.akamaized.net).",
    ),
    TestItemSpec(
        id="33B",
        content_type="streaming",
        channel_tag="33B",
        manifest_hint="USL05/33B/33B.isml/.mpd",
        live_manifest_cdn="gtm",
        title="33B Live",
        description="Live linear channel — GTM __token__ signed manifest (i-live-gtm.dstv.com, USL05).",
    ),
    TestItemSpec(
        id="CHD",
        content_type="streaming",
        channel_tag="CHD",
        manifest_hint="USL06/CHD/CHD.isml/.mpd",
        live_manifest_cdn="gtm",
        title="CHD Live",
        description="Live linear channel — GTM __token__ signed manifest (i-live-gtm.dstv.com, USL06).",
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
