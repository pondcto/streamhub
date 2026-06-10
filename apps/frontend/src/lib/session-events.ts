export const SESSION_UPDATED_EVENT = "streamhub:session-updated";

export function notifySessionUpdated(): void {
  window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT));
}
