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

    # Akamai live cache hostname for hdntl manifests (i-live-cache vs r-live-cache).

    live_cdn_host: Optional[str] = None

    title: Optional[str] = None

    description: Optional[str] = None

    category: str = "Sport"

    # Public HLS URL that can be played directly in the browser without the
    # decryption backend (e.g. a free/unencrypted live stream).
    direct_hls_url: Optional[str] = None





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





def _akamai_live(

    *,

    channel_tag: str,

    manifest_hint: str,

    live_cdn_host: str,

    title: str,

    direct_hls_url: Optional[str] = None,

) -> TestItemSpec:

    return TestItemSpec(

        id=channel_tag,

        content_type="streaming",

        channel_tag=channel_tag,

        manifest_hint=manifest_hint,

        live_manifest_cdn="akamai",

        live_cdn_host=live_cdn_host,

        title=title,

        description=f"Live linear — {title} ({live_cdn_host}, hdntl).",

        category="Live",

        direct_hls_url=direct_hls_url,

    )





TEST_ITEMS: tuple[TestItemSpec, ...] = (

    _akamai_live(

        channel_tag="SH4",

        manifest_hint="USL07/SH4/SH4.isml/.mpd",

        live_cdn_host="r-live-cache.akamaized.net",

        title="201 Live",

    ),

    _akamai_live(

        channel_tag="SH2",

        manifest_hint="USL04/SH2/SH2.isml/.mpd",

        live_cdn_host="i-live-cache.akamaized.net",

        title="202 Live",

    ),

    _akamai_live(

        channel_tag="TS2",

        manifest_hint="USL02/TS2/TS2.isml/.mpd",

        live_cdn_host="i-live-cache.akamaized.net",

        title="203 Live",

        direct_hls_url="https://live2.mzolotv.com/TS2/TS2.m3u8",

    ),

    _akamai_live(

        channel_tag="A11",

        manifest_hint="USL08/A11/A11.isml/.mpd",

        live_cdn_host="i-live-cache.akamaized.net",

        title="211 Live",

    ),

    _akamai_live(

        channel_tag="9HD",

        manifest_hint="USL03/9HD/9HD.isml/.mpd",

        live_cdn_host="r-live-cache.akamaized.net",

        title="209 Live",

    ),

    _akamai_live(

        channel_tag="12H",

        manifest_hint="USL03/12H/12H.isml/.mpd",

        live_cdn_host="r-live-cache.akamaized.net",

        title="212 Live",

    ),

    _akamai_live(

        channel_tag="E1W",

        manifest_hint="USL06/E1W/E1W.isml/.mpd",

        live_cdn_host="r-live-cache.akamaized.net",

        title="218 Live",

    ),

    _akamai_live(

        channel_tag="SDN",

        manifest_hint="USL05/SDN/SDN.isml/.mpd",

        live_cdn_host="r-live-cache.akamaized.net",

        title="219 Live",

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


