/**
 * Copy text to the clipboard, with a fallback for insecure (plain HTTP) contexts.
 *
 * `navigator.clipboard` is only available in secure contexts (HTTPS or
 * localhost). When the app is served over HTTP from an IP (e.g.
 * http://34.35.143.27:3000) it is `undefined`, so we fall back to a hidden
 * <textarea> + document.execCommand("copy").
 *
 * @returns true if the copy succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof window !== "undefined" &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    // Keep it out of view and prevent the page from scrolling/zooming.
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
