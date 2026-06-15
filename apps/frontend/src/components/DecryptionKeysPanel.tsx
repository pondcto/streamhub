"use client";

import { useState } from "react";
import type { DecryptionKeysResponse } from "@/lib/types";

interface DecryptionKeysPanelProps {
  data: DecryptionKeysResponse;
}

function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-surface/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {label}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-accent/40 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="max-h-24 overflow-y-auto break-all font-mono text-[11px] leading-relaxed text-emerald-200/90">
        {value}
      </p>
    </div>
  );
}

export default function DecryptionKeysPanel({ data }: DecryptionKeysPanelProps) {
  const expiresLabel = data.sessionExpiresAt
    ? new Date(data.sessionExpiresAt).toLocaleString()
    : null;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-surface-raised">
      <div className="border-b border-white/10 bg-gradient-to-r from-surface-overlay to-surface-raised px-5 py-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Decryption keys
          </span>
        </div>
        <h2 className="truncate text-lg font-semibold text-white">{data.assetId}</h2>
        <p className="mt-1 text-xs text-gray-400">
          DRM content {data.drmContentId}
          {expiresLabel ? ` · Session expires ${expiresLabel}` : ""}
        </p>
      </div>

      <div className="space-y-3 p-5">
        <CopyField label="Manifest URL" value={data.manifestUrl} />
        <CopyField label="License server URL" value={data.licenseUrl} />
        <CopyField label="KID" value={data.kid} />
        <CopyField label="PSSH" hint="Base64 PSSH box" value={data.pssh} />

        {data.keys.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-surface/80 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Content keys ({data.keys.length})
            </p>
            <div className="space-y-1.5">
              {data.keys.map((key) => (
                <p
                  key={key.kid}
                  className="break-all font-mono text-[11px] leading-relaxed text-emerald-200/90"
                >
                  <span className="text-gray-500">{key.kid}</span>
                  <span className="text-gray-600">:</span>
                  {key.key}
                </p>
              ))}
            </div>
          </div>
        )}

        <CopyField
          label="Joined keys"
          hint="kid:key pairs for player / decrypt tooling"
          value={data.joinedKeys}
        />
      </div>
    </section>
  );
}
