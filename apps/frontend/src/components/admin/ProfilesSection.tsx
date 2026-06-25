"use client";

import { useCallback, useEffect, useState } from "react";

import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import {
  createProxy,
  deleteProxy,
  listProxies,
  updateProxy,
  type ProxyProfileInput,
} from "@/lib/admin-api";
import type { ProxyProfile } from "@/lib/types";

const PROXY_TYPES = ["socks5", "socks5h", "socks4", "http", "https"];

const EMPTY: ProxyProfileInput = {
  name: "",
  userAgent: "",
  proxyType: "socks5",
  host: "",
  port: 0,
  username: "",
  password: "",
};

/**
 * Parse a pasted profile into form fields. Handles three shapes per line:
 *   - "KEY: value" / "KEY： value"  (labelled, ASCII or full-width colon)
 *   - "host:port:username:password" (colon-delimited, no labels)
 *   - "host:port"
 */
function parseSample(text: string): Partial<ProxyProfileInput> {
  const out: Partial<ProxyProfileInput> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Labelled "KEY: value" — key must start with a letter so a host like
    // "85.122…" doesn't get mistaken for a label.
    const kv = line.match(/^([A-Za-z][\w-]*)\s*[:：]\s*(.+?)\s*$/);
    if (kv) {
      const key = kv[1].toLowerCase();
      const value = kv[2].trim();
      if (key === "agent" || key === "user-agent" || key === "useragent") out.userAgent = value;
      else if (key === "type" || key === "proxytype") out.proxyType = value.toLowerCase();
      else if (key === "host" || key === "ip") out.host = value;
      else if (key === "port") {
        const n = parseInt(value, 10);
        if (!Number.isNaN(n)) out.port = n;
      } else if (key === "username" || key === "user") out.username = value;
      else if (key === "password" || key === "pass") out.password = value;
      else if (key === "name") out.name = value;
      continue;
    }

    // Colon-delimited "host:port[:username[:password]]".
    const parts = line.split(":");
    if (parts.length >= 2 && /^\d+$/.test(parts[1].trim())) {
      out.host = parts[0].trim();
      out.port = parseInt(parts[1], 10);
      if (parts.length >= 3) out.username = parts[2].trim();
      // Keep any colons that belong to the password.
      if (parts.length >= 4) out.password = parts.slice(3).join(":").trim();
    }
  }
  return out;
}

function toInput(p: ProxyProfile): ProxyProfileInput {
  return {
    name: p.name,
    userAgent: p.userAgent,
    proxyType: p.proxyType,
    host: p.host,
    port: p.port,
    username: p.username,
    password: p.password,
  };
}

const inputBase =
  "rounded-lg border border-white/10 bg-surface-overlay px-3 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none";
const inputClass = "w-full " + inputBase;

function ProfileForm({
  initial,
  onCancel,
  onSaved,
  editingId,
}: {
  initial: ProxyProfileInput;
  onCancel: () => void;
  onSaved: () => void;
  editingId: number | null;
}) {
  const { notify } = useToast();
  const [form, setForm] = useState<ProxyProfileInput>(initial);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ProxyProfileInput>(key: K, value: ProxyProfileInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // If the user pastes a full profile block (e.g. "HOST：…\nPORT：…\n…") into any
  // field, parse it and fill every matching field automatically.
  function handlePaste(event: React.ClipboardEvent) {
    const parsed = parseSample(event.clipboardData.getData("text"));
    if (Object.keys(parsed).length === 0) return; // plain value — let it paste normally
    event.preventDefault();
    setForm((prev) => ({ ...prev, ...parsed }));
    notify(`Filled ${Object.keys(parsed).length} field(s) from the pasted profile.`, "success");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.host.trim()) {
      notify("Host is required.", "error");
      return;
    }
    if (!(form.port > 0 && form.port < 65536)) {
      notify("Port must be between 1 and 65535.", "error");
      return;
    }
    setBusy(true);
    try {
      if (editingId == null) await createProxy(form);
      else await updateProxy(editingId, form);
      notify(editingId == null ? "Proxy profile created." : "Proxy profile updated.", "success");
      onSaved();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to save proxy profile.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5">
      <Field
        label="Name"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        onPaste={handlePaste}
        placeholder="e.g. US Residential 1 (defaults to host:port)"
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">
          User-Agent (AGENT)
        </label>
        <textarea
          value={form.userAgent}
          onChange={(e) => set("userAgent", e.target.value)}
          onPaste={handlePaste}
          rows={2}
          placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) …"
          className={inputClass + " font-mono text-xs"}
        />
      </div>

      <label className="block sm:w-48">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">Type</span>
        <select value={form.proxyType} onChange={(e) => set("proxyType", e.target.value)} className={inputClass}>
          {PROXY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      {/* Host : Port — combined inline group */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">
          Host : Port
        </label>
        <div className="flex items-center gap-2">
          <input
            value={form.host}
            onChange={(e) => set("host", e.target.value)}
            onPaste={handlePaste}
            placeholder="95.135.113.108"
            className={inputBase + " min-w-0 flex-1"}
          />
          <span className="text-content-faint">:</span>
          <input
            type="number"
            value={form.port || ""}
            onChange={(e) => set("port", parseInt(e.target.value, 10) || 0)}
            onPaste={handlePaste}
            placeholder="44418"
            className={inputBase + " w-24 shrink-0"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Username"
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          onPaste={handlePaste}
          placeholder="ayp6a30c3a11aead"
        />
        <Field
          label="Password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          onPaste={handlePaste}
          placeholder="YeoUHXbwLnCNzIfkvk"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {editingId == null ? "Create profile" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export default function ProfilesSection() {
  const { notify } = useToast();
  const [profiles, setProfiles] = useState<ProxyProfile[]>([]);
  const [editing, setEditing] = useState<ProxyProfile | "new" | null>(null);
  const [confirming, setConfirming] = useState<ProxyProfile | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProfiles(await listProxies());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load proxy profiles.", "error");
    }
  }, [notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete() {
    if (!confirming) return;
    setDeleting(confirming.id);
    try {
      await deleteProxy(confirming.id);
      await refresh();
      notify("Proxy profile deleted.", "success");
      setConfirming(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete proxy profile.", "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-content-muted">
          Outbound proxy profiles (user-agent + SOCKS/HTTP proxy). Assign one to a channel from
          Channel Management.
        </p>
        <Button onClick={() => setEditing("new")}>New profile</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface-raised shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-content-faint">
              <th className="px-4 py-3 font-medium">No.</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Host : Port</th>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">User-Agent</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p, i) => (
              <tr key={p.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3 tabular-nums text-content-faint">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] uppercase text-content-muted">
                    {p.proxyType}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-content-muted">
                  {p.host}:{p.port}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-content-faint">{p.username || "—"}</td>
                <td className="px-4 py-3 max-w-[260px] truncate text-xs text-content-faint" title={p.userAgent}>
                  {p.userAgent || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={deleting === p.id}
                      onClick={() => setConfirming(p)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-content-faint">
                  No proxy profiles yet. Click “New profile” to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing === "new" ? "New proxy profile" : `Edit · ${editing.name}`}
          onClose={() => setEditing(null)}
          size="lg"
        >
          <ProfileForm
            initial={editing === "new" ? EMPTY : toInput(editing)}
            editingId={editing === "new" ? null : editing.id}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        </Modal>
      )}

      {confirming && (
        <Modal title="Delete proxy profile" onClose={() => setConfirming(null)} size="md">
          <div className="space-y-4 p-5">
            <p className="text-sm text-content-muted">
              Delete <span className="font-semibold text-white">{confirming.name}</span> (
              {confirming.proxyType}://{confirming.host}:{confirming.port})? This can&rsquo;t be
              undone, and any channel using it will be unassigned.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deleting === confirming.id} onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
