import type { ContentItem, TestVideoCard } from "./types";

export const TEST_VIDEO_IDS = {
  TS2_LIVE: "TS2",
  BELGIUM_TUNISIA: "SS127028_SOC060626WCFBELVTUNHD10_SUN",
} as const;

/** Canonical test tab catalog — keep in sync with apps/backend/app/services/test_items.py */
export const TEST_VIDEOS: ContentItem[] = [
  {
    id: TEST_VIDEO_IDS.TS2_LIVE,
    title: "TS2 Live",
    category: "Sport",
    subtitle: "Live linear channel (576p mobile filter).",
    contentType: "live",
    channelTag: "TS2",
    manifestHint: "USL02/TS2/TS2.isml/.mpd",
  },
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
