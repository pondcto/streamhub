const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PROXIED_HOSTS = [
  "akamaized.net",
  "i-live-gtm.dstv.com",
  "v1.dstv.com",
  "dstv.stream",
];

export function shouldProxyCdnUrl(uri: string): boolean {
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return PROXIED_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

export function toCdnProxyUrl(uri: string): string {
  return `${API_BASE}/api/playback/cdn?url=${encodeURIComponent(uri)}`;
}

export function wrapManifestForPlayback(manifestUrl: string): string {
  return shouldProxyCdnUrl(manifestUrl) ? toCdnProxyUrl(manifestUrl) : manifestUrl;
}
