import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Role, User } from '../api/types';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Avatar, Badge, Field, PageHead, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { formatDate } from '../lib/format';

function PasswordCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      toast('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to change password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad">
      <div className="card-title">Change password</div>
      <div className="card-sub" style={{ marginBottom: 14 }}>
        Use at least 8 characters. You stay signed in after changing it.
      </div>
      <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Current password">
          <input
            type="password"
            className="input"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password">
          <input
            type="password"
            className="input"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <button type="submit" className="btn btn-outline btn-block" disabled={busy}>
          {busy ? <Spinner size={15} /> : null}
          Update password
        </button>
      </form>
    </section>
  );
}

const ROLE_TONE: Record<string, 'info' | 'muted'> = {
  admin: 'info',
  receptionist: 'info',
  trainer: 'muted',
};

function UserFormModal({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('receptionist');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setRole(user?.role ?? 'receptionist');
    setPassword('');
    setIsActive(user ? Boolean(user.isActive) : true);
    setError(null);
  }, [open, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await api.users.update(user.id, {
          name: name.trim(),
          email: email.trim(),
          role,
          isActive,
          ...(password ? { password } : {}),
        });
        onSaved(`${name} updated.`);
      } else {
        await api.users.create({ name: name.trim(), email: email.trim(), role, password });
        onSaved(`${name} added to the team.`);
      }
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to save this user.';
      setError(message);
      toast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? 'Edit team member' : 'Add a team member'}
      subtitle="Staff accounts control who can use the system and what they can see."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={15} />}
            {user ? 'Save changes' : 'Add member'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div className="form-grid">
          <Field label="Full name" className="span-2">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Email address" className="span-2">
            <input
              type="email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Role">
            <select className="select" value={role} onChange={(event) => setRole(event.target.value as Role)}>
              <option value="admin">Administrator</option>
              <option value="receptionist">Receptionist</option>
              <option value="trainer">Trainer</option>
            </select>
          </Field>
          <Field
            label={user ? 'New password (optional)' : 'Password'}
            hint={user ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
          >
            <input
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!user}
              minLength={user ? undefined : 8}
              autoComplete="new-password"
            />
          </Field>
          {user && (
            <div className="span-2">
              <label className="checkbox-row">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                <span>
                  <strong>Account active</strong>
                  <span>Inactive accounts cannot sign in.</span>
                </span>
              </label>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

export function Settings() {
  const { user } = useAuth();
  const { settings, reload: reloadSettings } = useSettings();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [gymName, setGymName] = useState(settings.gymName);
  const [currencyCode, setCurrencyCode] = useState(settings.currencyCode);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [alertLeadDays, setAlertLeadDays] = useState(String(settings.alertLeadDays));
  const [allowExpiredCheckin, setAllowExpiredCheckin] = useState(settings.allowExpiredCheckin);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setGymName(settings.gymName);
    setCurrencyCode(settings.currencyCode);
    setCurrencySymbol(settings.currencySymbol);
    setTimezone(settings.timezone);
    setAlertLeadDays(String(settings.alertLeadDays));
    setAllowExpiredCheckin(settings.allowExpiredCheckin);
  }, [settings]);

  const team = useFetch(
    () => (isAdmin ? api.users.list() : Promise.resolve({ data: [] as User[] })),
    [isAdmin],
  );

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [deactivatingBusy, setDeactivatingBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await api.settings.update({
        gymName: gymName.trim(),
        currencyCode: currencyCode.trim().toUpperCase(),
        currencySymbol: currencySymbol.trim(),
        timezone: timezone.trim(),
        alertLeadDays: Number(alertLeadDays),
        allowExpiredCheckin,
      });
      await reloadSettings();
      toast('Gym settings saved.');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!deactivating) return;
    setDeactivatingBusy(true);
    try {
      await api.users.remove(deactivating.id);
      toast(`${deactivating.name} deactivated.`, 'info');
      team.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to deactivate user.', 'error');
    } finally {
      setDeactivatingBusy(false);
      setDeactivating(null);
    }
  };

  return (
    <>
      <PageHead
        title="Settings"
        subtitle="Gym profile, expiry rules and team access."
        actions={isAdmin ? <Badge tone="info">Administrator</Badge> : undefined}
      />

      <div className="split">
        <div className="stack">
          {isAdmin && (
            <section className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Gym profile</div>
                  <div className="card-sub">Shown across the app and on receipts</div>
                </div>
              </div>
              <div className="card-body">
                <form onSubmit={save} className="stack">
                  {saveError && <div className="alert alert-error">{saveError}</div>}
                  <div className="form-grid">
                    <Field label="Gym name" className="span-2">
                      <input className="input" value={gymName} onChange={(event) => setGymName(event.target.value)} required />
                    </Field>
                    <Field label="Currency code" hint="ISO code, e.g. USD or BDT">
                      <input
                        className="input"
                        value={currencyCode}
                        onChange={(event) => setCurrencyCode(event.target.value)}
                        maxLength={8}
                        required
                      />
                    </Field>
                    <Field label="Currency symbol">
                      <input
                        className="input"
                        value={currencySymbol}
                        onChange={(event) => setCurrencySymbol(event.target.value)}
                        maxLength={8}
                        required
                      />
                    </Field>
                    <Field label="Timezone" hint="IANA name, e.g. UTC or Asia/Dhaka">
                      <input className="input" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
                    </Field>
                    <Field label="Expiry alert lead time" hint="Days before expiry to raise alerts">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        className="input"
                        value={alertLeadDays}
                        onChange={(event) => setAlertLeadDays(event.target.value)}
                      />
                    </Field>
                    <div className="span-2">
                      <div className="row-between" style={{ padding: '10px 0' }}>
                        <div>
                          <div className="list-title">Allow check-in with expired membership</div>
                          <div className="list-sub">Off by default. The front desk must renew before check-in.</div>
                        </div>
                        <button
                          type="button"
                          className={`switch ${allowExpiredCheckin ? 'on' : ''}`}
                          onClick={() => setAllowExpiredCheckin((value) => !value)}
                          aria-pressed={allowExpiredCheckin}
                          aria-label="Allow expired check-in"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving && <Spinner size={15} />}
                      Save settings
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Team access</div>
                  <div className="card-sub">Staff accounts and their permissions</div>
                </div>
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => {
                    setEditingUser(null);
                    setUserModalOpen(true);
                  }}
                >
                  Add user
                </button>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(team.data?.data ?? []).map((account) => (
                      <tr key={account.id}>
                        <td>
                          <div className="member-cell">
                            <Avatar
                              first={account.name.split(' ')[0]}
                              last={account.name.split(' ')[1] ?? ''}
                              size={32}
                            />
                            <div className="member-cell-text">
                              <strong>{account.name}</strong>
                              <span>{account.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge tone={ROLE_TONE[account.role] ?? 'muted'}>
                            {account.role.charAt(0).toUpperCase() + account.role.slice(1)}
                          </Badge>
                        </td>
                        <td>{account.createdAt ? formatDate(account.createdAt) : '-'}</td>
                        <td>
                          <Badge tone={account.isActive ? 'success' : 'muted'}>
                            {account.isActive ? 'Active' : 'Disabled'}
                          </Badge>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Edit ${account.name}`}
                              onClick={() => {
                                setEditingUser(account);
                                setUserModalOpen(true);
                              }}
                            >
                              <Icon name="edit" size={15} />
                            </button>
                            {account.id !== user?.id && account.isActive && (
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Deactivate ${account.name}`}
                                onClick={() => setDeactivating(account)}
                              >
                                <Icon name="power" size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {team.data?.data.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          No team members.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!isAdmin && (
            <section className="card card-pad">
              <div className="card-title">Gym profile</div>
              <div className="card-sub" style={{ marginBottom: 14 }}>
                Only administrators can change these settings.
              </div>
              <div className="summary-list">
                <div className="summary-row">
                  <span>Gym</span>
                  <strong>{settings.gymName}</strong>
                </div>
                <div className="summary-row">
                  <span>Currency</span>
                  <strong>
                    {settings.currencyCode} ({settings.currencySymbol})
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Timezone</span>
                  <strong>{settings.timezone}</strong>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="split-side">
          <PasswordCard />
          <section className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>
              Signed in as
            </div>
            <div className="row">
              <Avatar first={user?.name.split(' ')[0] ?? ''} last={user?.name.split(' ')[1] ?? ''} size={38} />
              <div>
                <div className="list-title">{user?.name}</div>
                <div className="list-sub">{user?.email}</div>
              </div>
            </div>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="summary-row" style={{ border: 0, padding: 0 }}>
              <span>Role</span>
              <Badge tone={ROLE_TONE[user?.role ?? ''] ?? 'muted'}>{user?.role}</Badge>
            </div>
          </section>
        </aside>
      </div>

      <UserFormModal
        open={userModalOpen}
        user={editingUser}
        onClose={() => setUserModalOpen(false)}
        onSaved={(message) => {
          toast(message);
          team.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        onConfirm={deactivate}
        busy={deactivatingBusy}
        title="Deactivate this user?"
        confirmLabel="Deactivate user"
        message={
          <>
            <strong>{deactivating?.name}</strong> will no longer be able to sign in. Their audit history is kept, and you
            can reactivate the account later.
          </>
        }
      />
    </>
  );
}
