import type { ContentItem, TestVideoCard } from "./types";

export const TEST_VIDEO_IDS = {
  SH4_LIVE: "SH4",
  SH2_LIVE: "SH2",
  TS2_LIVE: "TS2",
  A11_LIVE: "A11",
  HD9_LIVE: "9HD",
  H12_LIVE: "12H",
  E1W_LIVE: "E1W",
  SDN_LIVE: "SDN",
  BELGIUM_TUNISIA: "SS127028_SOC060626WCFBELVTUNHD10_SUN",
} as const;

type LiveChannelDef = {
  id: string;
  title: string;
  channelTag: string;
  channelNumber: string;
  manifestHint: string;
  cdnHost: string;
  image: string;
  logo: string;
};

const LIVE_CHANNELS: LiveChannelDef[] = [
  {
    id: TEST_VIDEO_IDS.SH4_LIVE,
    title: "SuperSport 4",
    channelTag: "SH4",
    channelNumber: "201",
    manifestHint: "USL07/SH4/SH4.isml/.mpd",
    cdnHost: "i-live-cache.akamaized.net",
    image: "/images/programthumbnail_3.png",
    logo: "/images/channellogos_1.png",
  },
  {
    id: TEST_VIDEO_IDS.SH2_LIVE,
    title: "SuperSport 2",
    channelTag: "SH2",
    channelNumber: "202",
    manifestHint: "USL04/SH2/SH2.isml/.mpd",
    cdnHost: "i-live-cache.akamaized.net",
    image: "/images/programthumbnail_2.png",
    logo: "/images/channellogos_2.png",
  },
  {
    id: TEST_VIDEO_IDS.TS2_LIVE,
    title: "SuperSport 3",
    channelTag: "TS2",
    channelNumber: "203",
    manifestHint: "USL02/TS2/TS2.isml/.mpd",
    cdnHost: "i-live-cache.akamaized.net",
    image: "/images/programthumbnail_5.png",
    logo: "/images/channellogos_3.png",
  },
  {
    id: TEST_VIDEO_IDS.A11_LIVE,
    title: "SuperSport 11",
    channelTag: "A11",
    channelNumber: "211",
    manifestHint: "USL08/A11/A11.isml/.mpd",
    cdnHost: "i-live-cache.akamaized.net",
    image: "/images/programthumbnail_4.png",
    logo: "/images/channellogos_4.png",
  },
  {
    id: TEST_VIDEO_IDS.HD9_LIVE,
    title: "SuperSport 9",
    channelTag: "9HD",
    channelNumber: "209",
    manifestHint: "USL03/9HD/9HD.isml/.mpd",
    cdnHost: "r-live-cache.akamaized.net",
    image: "/images/programthumbnail_1.png",
    logo: "/images/channellogos_5.png",
  },
  {
    id: TEST_VIDEO_IDS.H12_LIVE,
    title: "SuperSport 12",
    channelTag: "12H",
    channelNumber: "212",
    manifestHint: "USL03/12H/12H.isml/.mpd",
    cdnHost: "r-live-cache.akamaized.net",
    image: "/images/programthumbnail_6.png",
    logo: "/images/channellogos_6.png",
  },
  {
    id: TEST_VIDEO_IDS.E1W_LIVE,
    title: "ESPN",
    channelTag: "E1W",
    channelNumber: "218",
    manifestHint: "USL06/E1W/E1W.isml/.mpd",
    cdnHost: "r-live-cache.akamaized.net",
    image: "/images/programthumbnail_7.png",
    logo: "/images/channellogos_7.png",
  },
  {
    id: TEST_VIDEO_IDS.SDN_LIVE,
    title: "NFL Network",
    channelTag: "SDN",
    channelNumber: "219",
    manifestHint: "USL05/SDN/SDN.isml/.mpd",
    cdnHost: "r-live-cache.akamaized.net",
    image: "/images/programthumbnail_8.png",
    logo: "/images/channellogos_8.png",
  },
];

/** Canonical test tab catalog — keep in sync with apps/backend/app/services/test_items.py */
export const TEST_VIDEOS: ContentItem[] = [
  ...LIVE_CHANNELS.map((channel) => ({
    id: channel.id,
    title: channel.title,
    image: channel.image,
    category: "Live",
    subtitle: `Akamai hdntl (${channel.cdnHost}) · ${channel.channelTag}`,
    contentType: "streaming" as const,
    channelTag: channel.channelTag,
    channelNumber: channel.channelNumber,
    channelLogo: channel.logo,
    manifestHint: channel.manifestHint,
  })),
  {
    id: TEST_VIDEO_IDS.BELGIUM_TUNISIA,
    title: "Belgium v Tunisia",
    category: "Sport",
    subtitle:
      "FIFA World Cup friendly highlight — Matchday 3, King Baudouin Stadium Brussels.",
    contentType: "streaming",
    manifestHint:
      "https://v1.dstv.com/Sport/STREAMING_WEB/06/" +
      "SS127028_SOC060626WCFBELVTUNHD10_SUN/" +
      "SS127028_SOC060626WCFBELVTUNHD10_SUN.ism/.mpd",
  },
];

const ALLOWED_IDS = new Set(TEST_VIDEOS.map((item) => item.id));

export function resolveTestVideos(apiItems: TestVideoCard[]): ContentItem[] {
  const fromApi = apiItems
    .filter((card) => ALLOWED_IDS.has(card.id))
    .map((card) => ({
      id: card.id,
      title: card.title,
      image: card.image,
      category: card.category,
      duration: card.duration,
      subtitle: card.description,
      contentType: card.type.toLowerCase().includes("live")
        ? ("live" as const)
        : card.type.toLowerCase().includes("stream")
          ? ("streaming" as const)
          : ("vod" as const),
      channelTag: card.channel_tag,
      channelNumber: card.channel_number,
      manifestHint: card.manifest_hint,
    }));

  if (fromApi.length === 0) {
    return TEST_VIDEOS;
  }

  return TEST_VIDEOS.map((staticItem) => {
    const apiItem = fromApi.find((item) => item.id === staticItem.id);
    if (!apiItem) return staticItem;
    // Drop null/undefined/empty API fields so static thumbnails/logos/numbers
    // survive the merge (the backend test catalog returns image: null for these
    // channels, which would otherwise overwrite the static thumbnail path).
    const clean = Object.fromEntries(
      Object.entries(apiItem).filter(([, v]) => v != null && v !== ""),
    );
    return { ...staticItem, ...clean };
  });
}
