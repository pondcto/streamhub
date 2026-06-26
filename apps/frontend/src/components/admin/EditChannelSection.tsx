"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { updateChannel, type UpdateChannelInput } from "@/lib/admin-api";
import type { AdminChannel } from "@/lib/types";

const CATEGORIES = ["Live", "Sport", "Movies", "Series", "Other"] as const;

const LIVE_CDN_HOSTS = [
  {
    value: "i-live-cache.akamaized.net",
    label: "i-live-cache.akamaized.net",
    hint: "Most SuperSport channels (i-live-cache)",
  },
  {
    value: "r-live-cache.akamaized.net",
    label: "r-live-cache.akamaized.net",
    hint: "Alternate Akamai host (r-live-cache)",
  },
] as const;

interface EditChannelSectionProps {
  channel: AdminChannel;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
}

function SelectField({
  label,
  value,
  onChange,
  children,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="block">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-surface-overlay/60 px-3.5 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/25"
      >
        {children}
      </select>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-content-faint">{hint}</p>}
    </div>
  );
}

export default function EditChannelSection({ channel, onSaved, onCancel }: EditChannelSectionProps) {
  const { notify } = useToast();
  const [channelTag, setChannelTag] = useState(channel.channelTag ?? "");
  const [title, setTitle] = useState(channel.title ?? "");
  const [channelNumber, setChannelNumber] = useState(channel.channelNumber ?? "");
  const [category, setCategory] = useState<string>(channel.category || "Live");
  const [manifestHint, setManifestHint] = useState(channel.manifestHint ?? "");
  const [liveCdnHost, setLiveCdnHost] = useState<string>(
    channel.liveCdnHost ?? LIVE_CDN_HOSTS[0].value,
  );
  const [imageUrl, setImageUrl] = useState(channel.imageUrl ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!channelTag.trim()) next.channelTag = "Channel tag is required.";
    if (!title.trim()) next.title = "Display title is required.";
    if (!manifestHint.trim()) next.manifestHint = "Manifest path is required.";
    if (!liveCdnHost.trim()) next.liveCdnHost = "Live CDN host is required.";
    if (manifestHint.trim() && (manifestHint.includes("hdntl=") || manifestHint.startsWith("http"))) {
      next.manifestHint = "Use the unsigned path only — no URL or hdntl token.";
    }
    return next;
  }

  const canSubmit =
    channelTag.trim().length > 0 &&
    title.trim().length > 0 &&
    manifestHint.trim().length > 0 &&
    liveCdnHost.trim().length > 0 &&
    !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const body: UpdateChannelInput = {
      channelTag: channelTag.trim().toUpperCase(),
      title: title.trim(),
      manifestHint: manifestHint.trim(),
      liveCdnHost: liveCdnHost.trim(),
      category,
      channelNumber: channelNumber.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      liveManifestCdn: "akamai",
    };

    setSubmitting(true);
    try {
      await updateChannel(channel.contentId, body);
      notify(`Updated ${title.trim()}.`, "success");
      await onSaved();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update channel.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-5 text-sm leading-relaxed text-content-muted">
        Edit channel <span className="font-mono text-content">{channel.contentId}</span>. Content ID
        cannot be changed. Stop the channel before saving changes.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-surface-raised p-5 shadow-card">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-content-faint">Identity</h3>

          <Field
            label="Content ID"
            value={channel.contentId}
            readOnly
            disabled
            className="opacity-70"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Channel tag *"
              value={channelTag}
              onChange={(e) => setChannelTag(e.target.value.toUpperCase())}
              placeholder="SH4"
              autoComplete="off"
              spellCheck={false}
              error={errors.channelTag}
              required
            />
            <Field
              label="Channel number"
              value={channelNumber}
              onChange={(e) => setChannelNumber(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="201"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
            />
          </div>

          <Field
            label="Display title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="SuperSport 4"
            error={errors.title}
            required
          />

          <SelectField label="Category" value={category} onChange={setCategory}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-surface-raised p-5 shadow-card">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-content-faint">Streaming config</h3>

          <Field
            label="Manifest path *"
            value={manifestHint}
            onChange={(e) => setManifestHint(e.target.value)}
            placeholder="USL07/SH4/SH4.isml/.mpd"
            autoComplete="off"
            spellCheck={false}
            error={errors.manifestHint}
            required
          />

          <SelectField
            label="Live CDN host *"
            value={liveCdnHost}
            onChange={setLiveCdnHost}
            hint={
              LIVE_CDN_HOSTS.find((h) => h.value === liveCdnHost)?.hint ??
              "Captured manifests must come from this Akamai host."
            }
          >
            {LIVE_CDN_HOSTS.map((host) => (
              <option key={host.value} value={host.value}>
                {host.label}
              </option>
            ))}
          </SelectField>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-surface-raised p-5 shadow-card">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-content-faint">Optional</h3>

          <Field
            label="Thumbnail image URL"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="/images/programthumbnail_3.png"
            autoComplete="off"
          />
        </section>

        <div className="flex items-center justify-end gap-3">
          {onCancel && (
            <Button type="button" variant="secondary" size="lg" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={submitting} disabled={!canSubmit} size="lg">
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
