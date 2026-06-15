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
  manifestHint: string;
  cdnHost: string;
};

const LIVE_CHANNELS: LiveChannelDef[] = [
  {
    id: TEST_VIDEO_IDS.SH4_LIVE,
    title: "201 Live",
    channelTag: "SH4",
    manifestHint: "USL07/SH4/SH4.isml/.mpd",
    cdnHost: "i-live-cache.akamaized.net",
  },
  {
    id: TEST_VIDEO_IDS.SH2_LIVE,
    title: "202 Live",
    channelTag: "SH2",
    manifestHint: "USL04/SH2/SH2.isml/.mpd",
    cdnHost: "i-live-cache.akamaized.net",
  },
  {
    id: TEST_VIDEO_IDS.TS2_LIVE,
    title: "203 Live",
    channelTag: "TS2",
    manifestHint: "USL02/TS2/TS2.isml/.mpd",
    cdnHost: "i-live-cache.akamaized.net",
  },
  {
    id: TEST_VIDEO_IDS.A11_LIVE,
    title: "211 Live",
    channelTag: "A11",
    manifestHint: "USL08/A11/A11.isml/.mpd",
    cdnHost: "i-live-cache.akamaized.net",
  },
  {
    id: TEST_VIDEO_IDS.HD9_LIVE,
    title: "209 Live",
    channelTag: "9HD",
    manifestHint: "USL03/9HD/9HD.isml/.mpd",
    cdnHost: "r-live-cache.akamaized.net",
  },
  {
    id: TEST_VIDEO_IDS.H12_LIVE,
    title: "212 Live",
    channelTag: "12H",
    manifestHint: "USL03/12H/12H.isml/.mpd",
    cdnHost: "r-live-cache.akamaized.net",
  },
  {
    id: TEST_VIDEO_IDS.E1W_LIVE,
    title: "218 Live",
    channelTag: "E1W",
    manifestHint: "USL06/E1W/E1W.isml/.mpd",
    cdnHost: "r-live-cache.akamaized.net",
  },
  {
    id: TEST_VIDEO_IDS.SDN_LIVE,
    title: "219 Live",
    channelTag: "SDN",
    manifestHint: "USL05/SDN/SDN.isml/.mpd",
    cdnHost: "r-live-cache.akamaized.net",
  },
];

/** Canonical test tab catalog — keep in sync with apps/backend/app/services/test_items.py */
export const TEST_VIDEOS: ContentItem[] = [
  ...LIVE_CHANNELS.map((channel) => ({
    id: channel.id,
    title: channel.title,
    category: "Live",
    subtitle: `Akamai hdntl (${channel.cdnHost}) · ${channel.channelTag}`,
    contentType: "streaming" as const,
    channelTag: channel.channelTag,
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
      manifestHint: card.manifest_hint,
    }));

  if (fromApi.length === 0) {
    return TEST_VIDEOS;
  }

  return TEST_VIDEOS.map((staticItem) => {
    const apiItem = fromApi.find((item) => item.id === staticItem.id);
    return apiItem ? { ...staticItem, ...apiItem } : staticItem;
  });
}
