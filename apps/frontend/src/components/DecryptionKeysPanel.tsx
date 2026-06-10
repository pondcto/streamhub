"use client";

import { useState } from "react";
import type { DecryptionKeysResponse } from "@/lib/types";

interface DecryptionKeysPanelProps {
  data: DecryptionKeysResponse;
}

export default function DecryptionKeysPanel({ data }: DecryptionKeysPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.joinedKeys);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Decryption keys</h2>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-white/15 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-accent/40 hover:text-white"
        >
          {copied ? "Copied" : "Copy joined keys"}
        </button>
      </div>

      <dl className="grid gap-2 text-xs text-gray-400 sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">Asset ID</dt>
          <dd className="font-mono text-gray-300">{data.assetId}</dd>
        </div>
        <div>
          <dt className="text-gray-500">DRM content ID</dt>
          <dd className="font-mono text-gray-300">{data.drmContentId}</dd>
        </div>
        <div>
          <dt className="text-gray-500">KID</dt>
          <dd className="break-all font-mono text-gray-300">{data.kid || "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Session expires</dt>
          <dd className="text-gray-300">
            {new Date(data.sessionExpiresAt).toLocaleString()}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2">
        {data.keys.map((entry) => (
          <div
            key={entry.kid}
            className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2 font-mono text-[11px] text-emerald-300 break-all"
          >
            {entry.kid}:{entry.key}
          </div>
        ))}
      </div>

      <p className="mt-3 break-all font-mono text-[10px] text-gray-600">
        joined: {data.joinedKeys}
      </p>
    </div>
  );
}
