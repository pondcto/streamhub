"use client";

import { useCallback, useEffect, useState } from "react";

import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import PasswordField from "@/components/ui/PasswordField";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUserRole,
  type AdminUser,
  type UserRoleValue,
} from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";

// Flip to true once the backend exposes /api/admin/users*.
const BACKEND_READY = false;

export default function UserManagementSection() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!BACKEND_READY) {
      // No admin user API yet — show the signed-in admin so the layout is real.
      setUsers(
        user
          ? [
              {
                id: user.id,
                email: user.email,
                display_name: user.display_name,
                role: user.role,
                created_at: user.created_at,
                active: true,
              },
            ]
          : []
      );
      return;
    }
    try {
      const data = await listUsers();
      setUsers(data.users);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load users.", "error");
    }
  }, [user, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const changeRole = useCallback(
    async (u: AdminUser, role: UserRoleValue) => {
      setBusyId(u.id);
      try {
        await updateUserRole(u.id, role);
        await load();
        notify(`Updated ${u.email} to ${role}.`, "success");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Failed to update role.", "error");
      } finally {
        setBusyId(null);
      }
    },
    [load, notify]
  );

  const removeUser = useCallback(
    async (u: AdminUser) => {
      setBusyId(u.id);
      try {
        await deleteUser(u.id);
        await load();
        notify(`Removed ${u.email}.`, "success");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Failed to remove user.", "error");
      } finally {
        setBusyId(null);
      }
    },
    [load, notify]
  );

  return (
    <div>
      {!BACKEND_READY && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn-soft">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.36 3.6 1.99 18a1.5 1.5 0 0 0 1.3 2.25h17.42A1.5 1.5 0 0 0 22 18L13.64 3.6a1.5 1.5 0 0 0-2.6 0Z" />
          </svg>
          <span>
            Admin user API not yet available — <span className="font-mono text-[13px]">/api/admin/users*</span>. Showing
            the signed-in admin; create &amp; role actions are disabled until it&rsquo;s wired.
          </span>
        </div>
      )}

      <div className="mb-4 flex justify-end">
        <Button
          size="sm"
          disabled={!BACKEND_READY}
          onClick={() => setInviteOpen(true)}
          leftIcon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          }
        >
          Invite user
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface-raised shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-content-faint">
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === user?.id;
              return (
                <tr key={u.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gradient text-xs font-bold text-white">
                        {(u.display_name || u.email).trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-white">
                          <span className="truncate">{u.display_name || "—"}</span>
                          {isSelf && <Badge tone="accent">You</Badge>}
                        </p>
                        <p className="truncate text-xs text-content-faint">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={!BACKEND_READY || busyId === u.id || isSelf}
                      onChange={(e) => changeRole(u, e.target.value as UserRoleValue)}
                      className="rounded-lg border border-white/10 bg-surface-overlay px-2.5 py-1.5 text-xs text-white transition-colors focus:border-accent/50 focus:outline-none disabled:opacity-50"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-content-faint">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={!BACKEND_READY || isSelf || busyId === u.id}
                        loading={busyId === u.id}
                        onClick={() => removeUser(u)}
                        title={isSelf ? "You can't remove your own account" : ""}
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-content-faint">
                  No users to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {inviteOpen && <InviteUserModal onClose={() => setInviteOpen(false)} onCreated={load} />}
    </div>
  );
}

function InviteUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const { notify } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRoleValue>("user");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = BACKEND_READY && email.trim().length > 0 && password.length >= 8 && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createUser({ email: email.trim().toLowerCase(), password, display_name: displayName.trim(), role });
      notify(`Invited ${email.trim()}.`, "success");
      await onCreated();
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to create user.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Invite user" onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {!BACKEND_READY && (
          <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn-soft">
            Disabled until <span className="font-mono">POST /api/admin/users</span> is available.
          </p>
        )}
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" required />
        <Field label="Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" />
        <PasswordField
          label="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          error={password.length > 0 && password.length < 8 ? "At least 8 characters." : null}
        />
        <div className="block">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRoleValue)}
            className="w-full rounded-lg border border-white/10 bg-surface-overlay/60 px-3.5 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/25"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!canSubmit}>
            Send invite
          </Button>
        </div>
      </form>
    </Modal>
  );
}
