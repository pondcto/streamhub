import type { CatalogCard } from "./types";

const SEASON_LINK_RE = /stacks\/([^/]+)\/programs\/([^/]+)\/seasons\/([^/?#]+)/i;

export interface SeasonRoute {
  stackId: string;
  programId: string;
  seasonId: string;
}

export function parseSeasonRoute(card: CatalogCard): SeasonRoute | null {
  if (card.stack_id && card.program_id && card.season_id) {
    return {
      stackId: card.stack_id,
      programId: card.program_id,
      seasonId: card.season_id,
    };
  }

  for (const link of card.links) {
    const match = link.href.match(SEASON_LINK_RE);
    if (match) {
      return { stackId: match[1], programId: match[2], seasonId: match[3] };
    }
  }

  return null;
}

export function seasonDetailPath(route: SeasonRoute): string {
  return `/sport/${encodeURIComponent(route.stackId)}/${encodeURIComponent(route.programId)}/${encodeURIComponent(route.seasonId)}`;
}

export function isLiveCard(card: CatalogCard): boolean {
  if (card.is_live) return true;
  if (card.type.toLowerCase() === "category") return false;
  return card.type.toLowerCase().includes("live") || Boolean(card.channel_tag && !parseSeasonRoute(card));
}

export function buildLiveWatchHref(item: Pick<CatalogCard, "id" | "channel_tag" | "manifest_hint">): string {
  const params = new URLSearchParams({ type: "live" });
  if (item.channel_tag) params.set("channelTag", item.channel_tag);
  if (item.manifest_hint) params.set("manifestHint", item.manifest_hint);
  return `/watch/${encodeURIComponent(item.id)}?${params.toString()}`;
}
