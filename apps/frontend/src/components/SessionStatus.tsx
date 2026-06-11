"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSession } from "@/lib/api";
import { SESSION_UPDATED_EVENT } from "@/lib/session-events";
import type { SessionInfo } from "@/lib/types";

const SESSION_POLL_MS = 15_000;

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export default function SessionStatus() {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [connectSeconds, setConnectSeconds] = useState(0);
  const [irdetoSeconds, setIrdetoSeconds] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const session = await getSession();
      setInfo(session);
      if (session) {
        setConnectSeconds(session.remaining_seconds > 0 ? session.remaining_seconds : 0);
        const irdetoRemaining = session.irdeto_session_remaining_seconds ?? 0;
        setIrdetoSeconds(irdetoRemaining > 0 ? irdetoRemaining : 0);
      } else {
        setConnectSeconds(0);
        setIrdetoSeconds(0);
      }
    } catch {
      setInfo(null);
      setConnectSeconds(0);
      setIrdetoSeconds(0);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    const pollTimer = window.setInterval(() => refresh(), SESSION_POLL_MS);
    window.addEventListener(SESSION_UPDATED_EVENT, onUpdate);
    return () => {
      window.clearInterval(pollTimer);
      window.removeEventListener(SESSION_UPDATED_EVENT, onUpdate);
    };
  }, [refresh]);

  useEffect(() => {
    if (connectSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setConnectSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connectSeconds > 0]);

  useEffect(() => {
    if (irdetoSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setIrdetoSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [irdetoSeconds > 0]);

  const playbackReady = connectSeconds > 0 || irdetoSeconds > 0;

  if (!info || !playbackReady) {
    return (
      <Link
        href="/admin"
        className="text-xs text-amber-300 transition-colors hover:text-amber-200"
      >
        Configure auth →
      </Link>
    );
  }

  const label =
    connectSeconds > 0
      ? `Session active · ${formatRemaining(connectSeconds)}`
      : `Irdeto session · ${formatRemaining(irdetoSeconds)}`;

  return (
    <Link
      href="/admin"
      className="text-xs text-emerald-400 transition-colors hover:text-emerald-300"
      title="Open admin settings"
    >
      {label}
      {info.profile_id_configured && info.waf_token_configured ? "" : " · incomplete"}
    </Link>
  );
}
