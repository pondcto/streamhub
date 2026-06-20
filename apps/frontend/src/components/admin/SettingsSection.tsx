"use client";

import { useState, type ReactNode } from "react";

import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { setAdminPrefs, useAdminPrefs, type Density } from "@/lib/admin-prefs";

// Flip to true once the backend exposes a settings/credentials endpoint.
const BACKEND_READY = false;

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface-raised p-5 shadow-card">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <p className="mt-0.5 text-xs text-content-faint">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {hint && <p className="text-xs text-content-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const selectClass =
  "rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none";

export default function SettingsSection() {
  const prefs = useAdminPrefs();

  return (
    <div className="max-w-2xl space-y-5">
      <Card
        title="Playback & dashboard"
        description="Stored on this device and applied immediately."
      >
        <Row label="Channel poll interval" hint="How often the channel list refreshes.">
          <select
            className={selectClass}
            value={prefs.pollIntervalSec}
            onChange={(e) => setAdminPrefs({ pollIntervalSec: Number(e.target.value) })}
          >
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>60 seconds</option>
          </select>
        </Row>
        <Row label="Rows per page" hint="Channel Management table page size.">
          <select
            className={selectClass}
            value={prefs.pageSize}
            onChange={(e) => setAdminPrefs({ pageSize: Number(e.target.value) })}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </Row>
        <Row label="Table density" hint="Row height in tables.">
          <select
            className={selectClass}
            value={prefs.density}
            onChange={(e) => setAdminPrefs({ density: e.target.value as Density })}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </Row>
      </Card>

      <Card
        title="Session & credentials"
        description="Server-side secrets used for entitlement and playback."
      >
        {!BACKEND_READY && (
          <p className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs text-warn-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.36 3.6 1.99 18a1.5 1.5 0 0 0 1.3 2.25h17.42A1.5 1.5 0 0 0 22 18L13.64 3.6a1.5 1.5 0 0 0-2.6 0Z" />
            </svg>
            <span>
              Backend settings endpoint not yet available. These are managed in the backend environment
              (<span className="font-mono">DSTV_CONNECT_TOKEN</span>, profile id) for now.
            </span>
          </p>
        )}
        <Field label="DSTV connect token" placeholder="Set in backend environment" disabled defaultValue="" />
        <Field label="Profile ID" placeholder="Set in backend environment" disabled defaultValue="" />
        <div className="flex justify-end">
          <Button disabled={!BACKEND_READY}>Save credentials</Button>
        </div>
      </Card>
    </div>
  );
}
