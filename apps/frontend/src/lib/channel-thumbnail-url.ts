export const LIVE_THUMBNAIL_EXAMPLE =
  "https://images.dstv.stream/images/epg/guide2/original/701356_NextLiveEvent.png?presentation=small_16x9";

export function normalizeLiveThumbnailUrl(raw: string, required = true): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) {
      throw new Error("Thumbnail image URL is required.");
    }
    return undefined;
  }

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.toLowerCase().startsWith("file:")
  ) {
    throw new Error(
      "Thumbnail must be a live remote image URL (https://…), not a local file path.",
    );
  }

  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/+/, "")}`;
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname) {
      throw new Error("Invalid URL");
    }
  } catch {
    throw new Error(
      "Thumbnail must be a valid http(s) URL, e.g. images.dstv.stream/images/epg/…",
    );
  }

  return url;
}

export function liveThumbnailUrlError(raw: string, required = true): string | null {
  try {
    normalizeLiveThumbnailUrl(raw, required);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid thumbnail URL.";
  }
}
