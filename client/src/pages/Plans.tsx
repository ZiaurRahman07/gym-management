import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Plan } from '../api/types';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Badge, EmptyState, Field, PageHead, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';

function PlanFormModal({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan: Plan | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [price, setPrice] = useState('45');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(plan?.name ?? '');
    setDurationDays(String(plan?.durationDays ?? 30));
    setPrice(String(plan?.price ?? 45));
    setDescription(plan?.description ?? '');
    setIsActive(plan ? Boolean(plan.isActive) : true);
    setError(null);
  }, [open, plan]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        durationDays: Number(durationDays),
        price: Number(price),
        description: description.trim() || null,
        isActive,
      };
      if (plan) {
        await api.plans.update(plan.id, payload);
        onSaved(`${payload.name} updated.`);
      } else {
        await api.plans.create(payload);
        onSaved(`${payload.name} created.`);
      }
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to save this plan.';
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
      title={plan ? 'Edit plan' : 'New membership plan'}
      subtitle="Plans define the price and duration of a membership."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="plan-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={15} />}
            {plan ? 'Save changes' : 'Create plan'}
          </button>
        </>
      }
    >
      <form id="plan-form" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div className="form-grid">
          <Field label="Plan name" className="span-2">
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Monthly"
              required
            />
          </Field>
          <Field label="Duration (days)">
            <input
              type="number"
              min="1"
              className="input"
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
              required
            />
          </Field>
          <Field label="Price">
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </Field>
          <Field label="Description" className="span-2">
            <textarea
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is included in this plan?"
            />
          </Field>
          <div className="span-2">
            <label className="checkbox-row">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              <span>
                <strong>Available for sale</strong>
                <span>Inactive plans stay on existing memberships but cannot be purchased.</span>
              </span>
            </label>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function Plans() {
  const { user } = useAuth();
  const { money } = useSettings();
  const { toast } = useToast();
  const { data, loading, reload } = useFetch(() => api.plans.list(true), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const plans = data?.data ?? [];
  const canManage = user?.role === 'admin';

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const result = await api.plans.remove(deleting.id);
      toast(result.message ?? 'Plan removed.');
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to remove plan.', 'error');
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <>
      <PageHead
        title="Membership plans"
        subtitle="Set the products your front desk can sell."
        actions={
          canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              New plan
            </button>
          ) : undefined
        }
      />

      {loading && plans.length === 0 ? (
        <div className="plans-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="skeleton" key={index} style={{ height: 210 }} />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No plans yet"
            message="Create your first membership plan to start selling."
            action={
              canManage ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
                  Create plan
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="plans-grid">
          {plans.map((plan) => {
            const active = Boolean(plan.isActive);
            return (
              <div className={`card plan-card ${active ? '' : 'plan-inactive'}`} key={plan.id}>
                <div className="row-between">
                  <Badge tone={active ? 'success' : 'muted'}>{active ? 'On sale' : 'Archived'}</Badge>
                  <span className="muted small">{plan.subscriptionCount ?? 0} sold</span>
                </div>
                <div>
                  <div className="plan-name">{plan.name}</div>
                  <div className="plan-price">
                    {money(plan.price)}
                    <span>
                      /{plan.durationDays} {plan.durationDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                </div>
                <p className="plan-desc">{plan.description ?? 'No description.'}</p>
                <div className="row-between plan-foot">
                  <span className="chip">
                    {plan.durationDays} {plan.durationDays === 1 ? 'day' : 'days'} access
                  </span>
                  {canManage && (
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setEditing(plan);
                          setOpen(true);
                        }}
                        aria-label={`Edit ${plan.name}`}
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setDeleting(plan)}
                        aria-label={`Delete ${plan.name}`}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PlanFormModal
        open={open}
        plan={editing}
        onClose={() => setOpen(false)}
        onSaved={(message) => {
          toast(message);
          reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Remove this plan?"
        confirmLabel={deleting?.subscriptionCount ? 'Archive plan' : 'Delete plan'}
        message={
          deleting?.subscriptionCount ? (
            <>
              <strong>{deleting.name}</strong> has been used on {deleting.subscriptionCount} membership(s). It will be
              archived instead of deleted, so past memberships stay intact.
            </>
          ) : (
            <>
              <strong>{deleting?.name}</strong> will be permanently removed.
            </>
          )
        }
      />
    </>
  );
}
