export interface AdminFormDraft {
  token: string;
  profileId: string;
  wafToken: string;
  catalogCookie: string;
  irdetoSession: string;
}

const DRAFT_KEY = "streamhub:admin-form-draft";

export function loadAdminFormDraft(): AdminFormDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminFormDraft>;
    return {
      token: parsed.token ?? "",
      profileId: parsed.profileId ?? "",
      wafToken: parsed.wafToken ?? "",
      catalogCookie: parsed.catalogCookie ?? "",
      irdetoSession: parsed.irdetoSession ?? "",
    };
  } catch {
    return null;
  }
}

export function saveAdminFormDraft(draft: AdminFormDraft): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function mergeAdminFormDraft(
  saved: Partial<AdminFormDraft>,
  draft: AdminFormDraft | null
): AdminFormDraft {
  const pick = (key: keyof AdminFormDraft) => {
    const draftValue = draft?.[key]?.trim();
    if (draftValue) return draftValue;
    return saved[key]?.trim() ?? "";
  };

  return {
    token: pick("token"),
    profileId: pick("profileId"),
    wafToken: pick("wafToken"),
    catalogCookie: pick("catalogCookie"),
    irdetoSession: pick("irdetoSession"),
  };
}
