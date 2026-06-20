"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { createChannel } from "@/lib/admin-api";

// Flip to true once the backend exposes POST /api/admin/channels.
const BACKEND_READY = false;

const CATEGORIES = ["Live", "Sport", "Movies", "Series", "Other"];

interface AddChannelSectionProps {
  onCreated: () => void | Promise<void>;
}

export default function AddChannelSection({ onCreated }: AddChannelSectionProps) {
  const { notify } = useToast();
  const [contentId, setContentId] = useState("");
  const [title, setTitle] = useState("");
  const [channelTag, setChannelTag] = useState("");
  const [channelNumber, setChannelNumber] = useState("");
  const [category, setCategory] = useState("Live");
  const [manifestHint, setManifestHint] = useState("");
  const [image, setImage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const idValid = contentId.trim().length > 0;
  const canSubmit = BACKEND_READY && idValid && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createChannel({
        contentId: contentId.trim(),
        title: title.trim() || undefined,
        channelTag: channelTag.trim() || undefined,
        channelNumber: channelNumber.trim() || undefined,
        category,
        manifestHint: manifestHint.trim() || undefined,
        image: image.trim() || undefined,
      });
      notify(`Added ${title.trim() || contentId.trim()}.`, "success");
      setContentId("");
      setTitle("");
      setChannelTag("");
      setChannelNumber("");
      setManifestHint("");
      setImage("");
      await onCreated();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to add channel.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {!BACKEND_READY && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn-soft">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.36 3.6 1.99 18a1.5 1.5 0 0 0 1.3 2.25h17.42A1.5 1.5 0 0 0 22 18L13.64 3.6a1.5 1.5 0 0 0-2.6 0Z" />
          </svg>
          <span>
            Backend endpoint not yet available — <span className="font-mono text-[13px]">POST /api/admin/channels</span>.
            The form is ready and will submit once it&rsquo;s wired.
          </span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-white/10 bg-surface-raised p-5 shadow-card"
      >
        <Field
          label="Content ID"
          value={contentId}
          onChange={(e) => setContentId(e.target.value)}
          placeholder="e.g. SH4 or SS127028_…"
          required
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="SuperSport 4" />
          <div className="block">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-surface-overlay/60 px-3.5 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/25"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Field label="Channel tag" value={channelTag} onChange={(e) => setChannelTag(e.target.value)} placeholder="SH4" />
          <Field label="Channel number" value={channelNumber} onChange={(e) => setChannelNumber(e.target.value)} placeholder="201" inputMode="numeric" />
        </div>

        <Field
          label="Manifest hint"
          value={manifestHint}
          onChange={(e) => setManifestHint(e.target.value)}
          placeholder="USL07/SH4/SH4.isml/.mpd"
        />
        <Field
          label="Image URL"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="/images/programthumbnail_3.png"
        />

        <div className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-surface-overlay/40 px-3.5 py-3 text-xs text-content-muted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mt-0.5 h-4 w-4 shrink-0 text-content-faint" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
          </svg>
          <span>
            A new channel needs a <strong className="font-semibold text-content">captured manifest</strong> before it can
            stream — register it here, then capture its manifest via the tracker. Until then it shows a{" "}
            <span className="font-mono">no capture</span> badge under Channel Management.
          </span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button type="submit" loading={submitting} disabled={!canSubmit} size="lg">
            Add channel
          </Button>
        </div>
      </form>
    </div>
  );
}
