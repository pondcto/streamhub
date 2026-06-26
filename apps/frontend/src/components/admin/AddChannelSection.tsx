"use client";

import { useState } from "react";

import { useToast } from "@/components/Toast";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { createChannel } from "@/lib/admin-api";
import {
  LIVE_THUMBNAIL_EXAMPLE,
  liveThumbnailUrlError,
  normalizeLiveThumbnailUrl,
} from "@/lib/channel-thumbnail-url";

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

interface AddChannelSectionProps {
  onCreated: () => void | Promise<void>;
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

export default function AddChannelSection({ onCreated, onCancel }: AddChannelSectionProps) {
  const { notify } = useToast();
  const [contentId, setContentId] = useState("");
  const [channelTag, setChannelTag] = useState("");
  const [title, setTitle] = useState("");
  const [channelNumber, setChannelNumber] = useState("");
  const [category, setCategory] = useState<string>("Live");
  const [manifestHint, setManifestHint] = useState("");
  const [liveCdnHost, setLiveCdnHost] = useState<string>(LIVE_CDN_HOSTS[0].value);
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!contentId.trim()) next.contentId = "Content ID is required.";
    if (!channelTag.trim()) next.channelTag = "Channel tag is required.";
    if (!title.trim()) next.title = "Display title is required.";
    if (!manifestHint.trim()) next.manifestHint = "Manifest path is required.";
    if (!liveCdnHost.trim()) next.liveCdnHost = "Live CDN host is required.";
    if (manifestHint.trim() && (manifestHint.includes("hdntl=") || manifestHint.startsWith("http"))) {
      next.manifestHint = "Use the unsigned path only — no URL or hdntl token.";
    }
    const thumbnailError = liveThumbnailUrlError(imageUrl, true);
    if (thumbnailError) next.imageUrl = thumbnailError;
    return next;
  }

  const canSubmit =
    contentId.trim().length > 0 &&
    channelTag.trim().length > 0 &&
    title.trim().length > 0 &&
    manifestHint.trim().length > 0 &&
    liveCdnHost.trim().length > 0 &&
    imageUrl.trim().length > 0 &&
    !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const normalizedImageUrl = normalizeLiveThumbnailUrl(imageUrl, true)!;
      await createChannel({
        contentId: contentId.trim(),
        channelTag: channelTag.trim().toUpperCase(),
        title: title.trim(),
        manifestHint: manifestHint.trim(),
        liveCdnHost: liveCdnHost.trim(),
        category,
        channelNumber: channelNumber.trim() || undefined,
        imageUrl: normalizedImageUrl,
        liveManifestCdn: "akamai",
      });
      notify(`Registered ${title.trim()}. Capture its manifest on dstv.stream before starting.`, "success");
      await onCreated();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to add channel.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function syncTagFromId() {
    const id = contentId.trim().toUpperCase();
    if (id && !channelTag.trim()) {
      setChannelTag(id);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-5 text-sm leading-relaxed text-content-muted">
        Register a DStv live linear channel. After saving, play it on{" "}
        <span className="font-mono text-content">dstv.stream</span> so the session tracker captures a signed
        manifest — then you can start the restream from Channel Management.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-surface-raised p-5 shadow-card">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-content-faint">Identity</h3>

          <Field
            label="Content ID *"
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            onBlur={syncTagFromId}
            placeholder="SH4"
            autoComplete="off"
            spellCheck={false}
            error={errors.contentId}
            required
          />
          <p className="-mt-2 text-[11px] leading-relaxed text-content-faint">
            Unique ID used everywhere (admin, schedules, HLS folder). Usually the same as the DStv channel tag.
          </p>

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
          <p className="-mt-2 text-[11px] leading-relaxed text-content-faint">
            Tag must match what the session tracker sends (e.g.{" "}
            <span className="font-mono">channel_tag: &quot;TS2&quot;</span>). Number is display-only in the admin table.
          </p>

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
          <p className="-mt-2 text-[11px] leading-relaxed text-content-faint">
            Unsigned DASH path fragment from the DStv player — not a full URL and not the signed{" "}
            <span className="font-mono">hdntl=…</span> link.
          </p>

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
          <h3 className="text-xs font-semibold uppercase tracking-wider text-content-faint">Thumbnail</h3>

          <Field
            label="Live thumbnail URL *"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder={LIVE_THUMBNAIL_EXAMPLE}
            type="url"
            autoComplete="off"
            spellCheck={false}
            error={errors.imageUrl}
            required
          />
          <p className="-mt-2 text-[11px] leading-relaxed text-content-faint">
            Remote DStv EPG image URL only — e.g.{" "}
            <span className="font-mono text-content">images.dstv.stream/images/epg/…</span>. Local paths
            like <span className="font-mono">/images/…</span> are not allowed.{" "}
            <span className="font-mono">https://</span> is added automatically if omitted.
          </p>
        </section>

        <div className="flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/10 px-3.5 py-3 text-xs text-warn-soft">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.36 3.6 1.99 18a1.5 1.5 0 0 0 1.3 2.25h17.42A1.5 1.5 0 0 0 22 18L13.64 3.6a1.5 1.5 0 0 0-2.6 0Z" />
          </svg>
          <span>
            New channels show a <span className="font-mono">no capture</span> badge until the session tracker
            posts a signed manifest for this tag. Assign a proxy profile before starting live restreams.
          </span>
        </div>

        <div className="flex items-center justify-end gap-3">
          {onCancel && (
            <Button type="button" variant="secondary" size="lg" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={submitting} disabled={!canSubmit} size="lg">
            Register channel
          </Button>
        </div>
      </form>
    </div>
  );
}
