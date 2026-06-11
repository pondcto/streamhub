"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractWafTokenFromCookie, getSession, setSession } from "@/lib/api";
import {
  loadAdminFormDraft,
  mergeAdminFormDraft,
  saveAdminFormDraft,
  type AdminFormDraft,
} from "@/lib/admin-form-storage";
import { notifySessionUpdated } from "@/lib/session-events";
import type { ApiError, SessionInfo } from "@/lib/types";

const SESSION_POLL_MS = 10_000;

function formatMinutesSeconds(seconds: number): string {
  if (seconds <= 0) return "0m 00s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatTrackedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function sessionToDraft(info: SessionInfo): Partial<AdminFormDraft> {
  return {
    token: info.connect_token ?? "",
    profileId: info.profile_id ?? "",
    wafToken: info.waf_token ?? "",
    catalogCookie: info.catalog_cookie ?? "",
    irdetoSession: info.irdeto_session ?? "",
  };
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [profileId, setProfileId] = useState("");
  const [wafToken, setWafToken] = useState("");
  const [catalogCookie, setCatalogCookie] = useState("");
  const [irdetoSession, setIrdetoSession] = useState("");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [irdetoRemainingSeconds, setIrdetoRemainingSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const skipPersistRef = useRef(false);
  const lastTrackedAtRef = useRef<string | null>(null);

  const currentDraft = useCallback(
    (): AdminFormDraft => ({
      token,
      profileId,
      wafToken,
      catalogCookie,
      irdetoSession,
    }),
    [token, profileId, wafToken, catalogCookie, irdetoSession]
  );

  const applyDraft = useCallback((draft: AdminFormDraft) => {
    skipPersistRef.current = true;
    setToken(draft.token);
    setProfileId(draft.profileId);
    setWafToken(draft.wafToken);
    setCatalogCookie(draft.catalogCookie);
    setIrdetoSession(draft.irdetoSession);
    requestAnimationFrame(() => {
      skipPersistRef.current = false;
    });
  }, []);

  const syncCountdowns = useCallback((info: SessionInfo) => {
    setRemainingSeconds(info.remaining_seconds > 0 ? info.remaining_seconds : 0);
    const irdetoSeconds = info.irdeto_session_remaining_seconds ?? 0;
    setIrdetoRemainingSeconds(info.irdeto_session_configured ? irdetoSeconds : null);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const info = await getSession();
      setSessionInfo(info);
      if (info) {
        syncCountdowns(info);
        const trackedAt = info.tracked_captured_at ?? null;
        const trackedUpdated = Boolean(trackedAt && trackedAt !== lastTrackedAtRef.current);
        if (trackedUpdated) {
          lastTrackedAtRef.current = trackedAt;
          const imported = {
            token: info.connect_token ?? "",
            profileId: info.profile_id ?? "",
            wafToken: info.waf_token ?? "",
            catalogCookie: info.catalog_cookie ?? "",
            irdetoSession: info.irdeto_session ?? "",
          };
          applyDraft(imported);
          saveAdminFormDraft(imported);
          notifySessionUpdated();
        } else {
          const merged = mergeAdminFormDraft(sessionToDraft(info), loadAdminFormDraft());
          applyDraft(merged);
        }
      } else {
        setRemainingSeconds(null);
        setIrdetoRemainingSeconds(null);
        const draft = loadAdminFormDraft();
        if (draft) applyDraft(draft);
      }
    } catch {
      setSessionInfo(null);
      setRemainingSeconds(null);
      setIrdetoRemainingSeconds(null);
      const draft = loadAdminFormDraft();
      if (draft) applyDraft(draft);
    } finally {
      setHydrated(true);
    }
  }, [applyDraft, syncCountdowns]);

  useEffect(() => {
    refreshStatus();
    const pollTimer = window.setInterval(() => {
      refreshStatus();
    }, SESSION_POLL_MS);
    return () => window.clearInterval(pollTimer);
  }, [refreshStatus]);

  useEffect(() => {
    if (!hydrated || skipPersistRef.current) return;
    saveAdminFormDraft(currentDraft());
  }, [currentDraft, hydrated]);

  useEffect(() => {
    if (remainingSeconds === null) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sessionInfo?.expires_at, remainingSeconds !== null]);

  useEffect(() => {
    if (irdetoRemainingSeconds === null) return;

    const timer = window.setInterval(() => {
      setIrdetoRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sessionInfo?.irdeto_session_expires_at, irdetoRemainingSeconds !== null]);

  const handleCookieChange = (value: string) => {
    setCatalogCookie(value);
    if (!wafToken.trim()) {
      const extracted = extractWafTokenFromCookie(value);
      if (extracted) setWafToken(extracted);
    }
  };

  const handleSave = async () => {
    const trimmedToken = token.trim();
    const hasActiveSession = Boolean(sessionInfo && sessionInfo.remaining_seconds > 0);

    if (!trimmedToken && !hasActiveSession) {
      setError("Connect Authorization JWT is required.");
      setSuccess(null);
      return;
    }

    if (!profileId.trim()) {
      setError("Profile ID (x-profile-id) is required for Movies/Shows catalog.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const info = await setSession(trimmedToken || undefined, {
        profileId: profileId.trim(),
        wafToken: wafToken.trim() || undefined,
        catalogToken: trimmedToken || undefined,
        catalogCookie: catalogCookie.trim() || undefined,
        irdetoSession: irdetoSession.trim() || undefined,
      });
      setSessionInfo(info);
      syncCountdowns(info);
      saveAdminFormDraft(currentDraft());
      setSuccess(
        trimmedToken
          ? "Session saved. Catalog and key generation are enabled."
          : "Settings saved using your existing Connect session."
      );
      notifySessionUpdated();
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message ?? "Failed to save session settings.");
    } finally {
      setSaving(false);
    }
  };

  const hasConnectSession = Boolean(sessionInfo && (remainingSeconds ?? 0) > 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin</h1>
          <p className="mt-1 text-sm text-gray-400">
            Configure DStv auth for entitlement and decryption key generation.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-400 transition-colors hover:text-white"
        >
          ← Dashboard
        </Link>
      </div>

      {sessionInfo?.tracked_captured_at && (
        <div className="mb-6 rounded-lg border border-sky-500/30 bg-sky-950/20 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Last tracked session import
          </p>
          <p className="mt-1 text-sm text-sky-200">
            {formatTrackedTime(sessionInfo.tracked_captured_at)}
          </p>
          {sessionInfo.tracked_source_url && (
            <p className="mt-2 break-all text-xs text-gray-400">
              <span className="text-gray-500">Source:</span> {sessionInfo.tracked_source_url}
            </p>
          )}
          {sessionInfo.tracked_request_url && (
            <p className="mt-1 break-all text-xs text-gray-400">
              <span className="text-gray-500">Request:</span> {sessionInfo.tracked_request_url}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            POST <span className="font-mono">/api/get-dstv-trackedsession/</span> updates these
            fields automatically — no manual save required.
          </p>
        </div>
      )}

      {sessionInfo && remainingSeconds !== null && (
        <div
          className={`mb-6 rounded-lg border px-4 py-4 ${
            remainingSeconds > 0
              ? "border-emerald-500/30 bg-emerald-950/20"
              : "border-red-500/30 bg-red-950/20"
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Connect session time remaining
          </p>
          <p
            className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${
              remainingSeconds > 0 ? "text-emerald-300" : "text-red-400"
            }`}
          >
            {formatMinutesSeconds(remainingSeconds)}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            {remainingSeconds > 0 ? (
              <>
                Active session
                {sessionInfo.profile_id_configured ? " · profile" : ""}
                {sessionInfo.waf_token_configured ? " · WAF" : ""}
                {sessionInfo.catalog_auth_configured ? " · catalog" : ""}
                {sessionInfo.irdeto_session_configured ? " · Irdeto session" : ""}
              </>
            ) : (
              "Connect session expired — paste a fresh JWT and save again."
            )}
          </p>
        </div>
      )}

      {irdetoRemainingSeconds !== null && (
        <div
          className={`mb-6 rounded-lg border px-4 py-4 ${
            irdetoRemainingSeconds > 0
              ? "border-cyan-500/30 bg-cyan-950/20"
              : "border-red-500/30 bg-red-950/20"
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Irdeto session time remaining
          </p>
          <p
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              irdetoRemainingSeconds > 0 ? "text-cyan-300" : "text-red-400"
            }`}
          >
            {formatMinutesSeconds(irdetoRemainingSeconds)}
          </p>
        </div>
      )}

      <div className="space-y-5 rounded-xl border border-white/10 bg-surface-raised p-6">
        <div>
          <label htmlFor="token" className="mb-1.5 block text-sm font-medium text-gray-300">
            Connect Authorization JWT
          </label>
          <textarea
            id="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste Authorization header value from dstv.stream (Connect AuthToken Issuer)"
            rows={4}
            className="w-full rounded-lg border border-white/15 bg-surface-overlay px-3 py-2 font-mono text-xs text-white placeholder:text-gray-500 focus:border-accent/50 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            DevTools → Network → filter <span className="font-mono">dstv.stream</span> → open a{" "}
            <strong className="text-gray-400">successful (200)</strong> request such as{" "}
            <span className="font-mono">navigation_menu</span> or{" "}
            <span className="font-mono">vod_sections/home</span> — not a red failed call like{" "}
            <span className="font-mono">getBookmark</span>. Copy Authorization (Bearer prefix optional).
          </p>
        </div>

        <div>
          <label htmlFor="profileId" className="mb-1.5 block text-sm font-medium text-gray-300">
            Profile ID <span className="text-red-400">*</span>
          </label>
          <input
            id="profileId"
            type="text"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            placeholder="x-profile-id UUID"
            className="w-full rounded-lg border border-white/15 bg-surface-overlay px-3 py-2 font-mono text-xs text-white placeholder:text-gray-500 focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="wafToken" className="mb-1.5 block text-sm font-medium text-gray-300">
            WAF Token
          </label>
          <textarea
            id="wafToken"
            value={wafToken}
            onChange={(e) => setWafToken(e.target.value)}
            placeholder="x-aws-waf-token from browser or aws-waf-token cookie"
            rows={3}
            className="w-full rounded-lg border border-white/15 bg-surface-overlay px-3 py-2 font-mono text-xs text-white placeholder:text-gray-500 focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="irdetoSession" className="mb-1.5 block text-sm font-medium text-gray-300">
            Irdeto session JWT (for key generation)
          </label>
          <textarea
            id="irdetoSession"
            value={irdetoSession}
            onChange={(e) => setIrdetoSession(e.target.value)}
            placeholder="Paste the session field from POST /api/vod-auth/entitlement/session response"
            rows={3}
            className="w-full rounded-lg border border-white/15 bg-surface-overlay px-3 py-2 font-mono text-xs text-white placeholder:text-gray-500 focus:border-accent/50 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            DevTools → play content in browser → find{" "}
            <span className="font-mono">entitlement/session</span> → Response → copy{" "}
            <span className="font-mono">session</span> (issuer: Authorization Irdeto Session Issuer).
            Required when Connect JWT entitlement fails from the backend.
          </p>
        </div>

        <div>
          <label htmlFor="catalogCookie" className="mb-1.5 block text-sm font-medium text-gray-300">
            Catalog cookie (optional)
          </label>
          <textarea
            id="catalogCookie"
            value={catalogCookie}
            onChange={(e) => handleCookieChange(e.target.value)}
            placeholder="Browser cookie string for Home/Movies catalog tabs"
            rows={2}
            className="w-full rounded-lg border border-white/15 bg-surface-overlay px-3 py-2 font-mono text-xs text-white placeholder:text-gray-500 focus:border-accent/50 focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {success && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
            {success}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (!token.trim() && !hasConnectSession)}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-white/10 bg-surface-raised/50 px-4 py-3 text-xs text-gray-500">
        <p className="font-medium text-gray-400">After saving</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            External trackers can POST to{" "}
            <span className="font-mono">/api/get-dstv-trackedsession/</span> to auto-fill session
            fields.
          </li>
          <li>Form values are kept after Save and when you switch tabs or pages.</li>
          <li>Connect and Irdeto timers refresh every 10s and count down every second.</li>
          <li>All three are required for catalog: Connect JWT, Profile ID, and WAF token.</li>
          <li>Copy JWT, Profile ID, and WAF from the same successful 200 request.</li>
          <li>Pasting the catalog cookie auto-fills WAF if that field is empty.</li>
          <li>Sessions survive backend restarts — re-save when the JWT expires (~15 min).</li>
          <li>Use <strong className="text-gray-400">Watch</strong> on the Test tab to generate and display decryption keys.</li>
        </ul>
      </div>
    </div>
  );
}
