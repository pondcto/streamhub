"use client";

import { useEffect, useState } from "react";

export type Density = "comfortable" | "compact";

export interface AdminPrefs {
  /** Channel-list background poll interval, in seconds. */
  pollIntervalSec: number;
  /** Rows per page in the Channel Management table. */
  pageSize: number;
  /** Table row density. */
  density: Density;
}

export const DEFAULT_PREFS: AdminPrefs = {
  pollIntervalSec: 5,
  pageSize: 10,
  density: "comfortable",
};

const KEY = "streamhub_admin_prefs";
const EVENT = "streamhub:admin-prefs";

export function getAdminPrefs(): AdminPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<AdminPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setAdminPrefs(patch: Partial<AdminPrefs>): void {
  if (typeof window === "undefined") return;
  const next = { ...getAdminPrefs(), ...patch };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  // Notify same-tab subscribers (the native 'storage' event only fires cross-tab).
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Reactive admin preferences — updates live when changed anywhere in the tab. */
export function useAdminPrefs(): AdminPrefs {
  // Start from defaults so server and first client render match, then hydrate.
  const [prefs, setPrefs] = useState<AdminPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    const sync = () => setPrefs(getAdminPrefs());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return prefs;
}
