from dataclasses import dataclass
from typing import Literal, Optional

from app.services.channel_thumbnail_url import EXAMPLE_LIVE_THUMBNAIL


@dataclass(frozen=True)
class TestItemSpec:
    """Stable channel/content reference — no DRM session tokens or signed manifest URLs."""

    id: str
    content_type: Literal["vod", "live", "streaming"]
    channel_tag: Optional[str] = None
    channel_number: Optional[str] = None
    vod_genref: Optional[str] = None
    stack_id: Optional[str] = None
    program_id: Optional[str] = None
    season_id: Optional[str] = None
    asset_id: Optional[str] = None
    manifest_hint: Optional[str] = None
    live_manifest_cdn: Optional[Literal["akamai", "gtm"]] = None
    live_cdn_host: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    category: str = "Sport"
    direct_hls_url: Optional[str] = None
    image_url: Optional[str] = None


def _akamai_live(
    *,
    channel_tag: str,
    manifest_hint: str,
    live_cdn_host: str,
    title: str,
    channel_number: str,
    image_url: str,
    direct_hls_url: Optional[str] = None,
) -> TestItemSpec:
    return TestItemSpec(
        id=channel_tag,
        content_type="streaming",
        channel_tag=channel_tag,
        channel_number=channel_number,
        manifest_hint=manifest_hint,
        live_manifest_cdn="akamai",
        live_cdn_host=live_cdn_host,
        title=title,
        description=f"Live linear — {title} ({live_cdn_host}, hdntl).",
        category="Live",
        direct_hls_url=direct_hls_url,
        image_url=image_url,
    )


# Seeded into the `channels` table on first startup. Runtime lookups use channel_registry.
DEFAULT_SEED_ITEMS: tuple[TestItemSpec, ...] = (
    _akamai_live(
        channel_tag="SH4",
        manifest_hint="USL07/SH4/SH4.isml/.mpd",
        live_cdn_host="r-live-cache.akamaized.net",
        title="SuperSport 4",
        channel_number="201",
        image_url=EXAMPLE_LIVE_THUMBNAIL,
    ),
    _akamai_live(
        channel_tag="SH2",
        manifest_hint="USL04/SH2/SH2.isml/.mpd",
        live_cdn_host="i-live-cache.akamaized.net",
        title="SuperSport 2",
        channel_number="202",
        image_url=EXAMPLE_LIVE_THUMBNAIL,
    ),
    _akamai_live(
        channel_tag="TS2",
        manifest_hint="USL02/TS2/TS2.isml/.mpd",
        live_cdn_host="i-live-cache.akamaized.net",
        title="SuperSport 3",
        channel_number="203",
        image_url=EXAMPLE_LIVE_THUMBNAIL,
        direct_hls_url="https://live2.mzolotv.com/TS2/TS2.m3u8",
    ),
    _akamai_live(
        channel_tag="A11",
        manifest_hint="USL08/A11/A11.isml/.mpd",
        live_cdn_host="i-live-cache.akamaized.net",
        title="SuperSport 11",
        channel_number="211",
        image_url=EXAMPLE_LIVE_THUMBNAIL,
    ),
    _akamai_live(
        channel_tag="9HD",
        manifest_hint="USL03/9HD/9HD.isml/.mpd",
        live_cdn_host="r-live-cache.akamaized.net",
        title="SuperSport 9",
        channel_number="209",
        image_url=EXAMPLE_LIVE_THUMBNAIL,
    ),
    _akamai_live(
        channel_tag="12H",
        manifest_hint="USL03/12H/12H.isml/.mpd",
        live_cdn_host="r-live-cache.akamaized.net",
        title="SuperSport 12",
        channel_number="212",
        image_url=EXAMPLE_LIVE_THUMBNAIL,
    ),
    _akamai_live(
        channel_tag="E1W",
        manifest_hint="USL06/E1W/E1W.isml/.mpd",
        live_cdn_host="r-live-cache.akamaized.net",
        title="ESPN",
        channel_number="218",
        image_url=EXAMPLE_LIVE_THUMBNAIL,
    ),
    _akamai_live(
        channel_tag="SDN",
        manifest_hint="USL05/SDN/SDN.isml/.mpd",
        live_cdn_host="r-live-cache.akamaized.net",
        title="NFL Network",
        channel_number="219",
        image_url=EXAMPLE_LIVE_THUMBNAIL,
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
        category="Sport",
    ),
)

# Back-compat alias for imports that haven't migrated yet.
TEST_ITEMS = DEFAULT_SEED_ITEMS
