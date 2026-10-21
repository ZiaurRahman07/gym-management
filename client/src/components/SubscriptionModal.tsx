import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Member, Plan } from '../api/types';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { Modal } from './Modal';
import { MemberPicker } from './MemberPicker';
import { Field, Spinner } from './ui';

export function SubscriptionModal({
  open,
  onClose,
  member: presetMember,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  member?: Member | null;
  onSaved: (message: string) => void;
}) {
  const { toast } = useToast();
  const { money } = useSettings();
  const [member, setMember] = useState<Member | null>(presetMember ?? null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [discount, setDiscount] = useState('0');
  const [method, setMethod] = useState<'cash' | 'card' | 'bank' | 'online'>('cash');
  const [comp, setComp] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMember(presetMember ?? null);
    setStartDate('');
    setDiscount('0');
    setMethod('cash');
    setComp(false);
    setNotes('');
    setError(null);
    api.plans
      .list()
      .then((response) => {
        setPlans(response.data);
        setPlanId((current) => current || String(response.data[0]?.id ?? ''));
      })
      .catch(() => setPlans([]));
  }, [open, presetMember]);

  const selectedPlan = plans.find((plan) => String(plan.id) === planId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!member) {
      setError('Choose a member first.');
      return;
    }
    if (!planId) {
      setError('Choose a membership plan.');
      return;
    }
    setBusy(true);
    setError(null);

    try {
      await api.subscriptions.create({
        memberId: member.id,
        planId: Number(planId),
        startDate: startDate || undefined,
        discount: Number(discount) || 0,
        notes: notes.trim() || null,
        comp,
        payment: comp ? null : { method },
      });
      onSaved(`Membership started for ${member.firstName} ${member.lastName}.`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Unable to start this membership.');
      toast('Could not start the membership.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a membership"
      subtitle="Sell a plan, record the payment and extend the member's access."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="subscription-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={15} />}
            Start membership
          </button>
        </>
      }
    >
      <form id="subscription-form" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div className="stack">
          {!presetMember && (
            <Field label="Member">
              <MemberPicker value={member} onChange={setMember} autoFocus />
            </Field>
          )}
          {presetMember && (
            <div className="notice">
              <strong>
                {presetMember.firstName} {presetMember.lastName}
              </strong>
              <span>
                {presetMember.memberCode} · {presetMember.planName ?? 'No current plan'}
              </span>
            </div>
          )}

          <div className="form-grid">
            <Field label="Plan">
              <select className="select" value={planId} onChange={(event) => setPlanId(event.target.value)}>
                {plans.length === 0 && <option value="">No plans available</option>}
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.durationDays} {plan.durationDays === 1 ? 'day' : 'days'} · {money(plan.price)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date" hint="Leave blank to start today, or after the current membership ends.">
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
            <Field label="Discount" hint={selectedPlan ? `Plan price ${money(selectedPlan.price)}` : undefined}>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={discount}
                disabled={comp}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </Field>
            <Field label="Payment method">
              <select
                className="select"
                value={method}
                disabled={comp}
                onChange={(event) => setMethod(event.target.value as typeof method)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank transfer</option>
                <option value="online">Online</option>
              </select>
            </Field>
            <div className="span-2">
              <label className="checkbox-row">
                <input type="checkbox" checked={comp} onChange={(event) => setComp(event.target.checked)} />
                <span>
                  <strong>Complimentary membership</strong>
                  <span>No payment will be recorded for this membership.</span>
                </span>
              </label>
            </div>
            <Field label="Notes" className="span-2">
              <input
                className="input"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional — e.g. student discount"
              />
            </Field>
          </div>

          {selectedPlan && !comp && (
            <div className="summary-row" style={{ border: 0 }}>
              <span>Total due today</span>
              <strong>
                {money(selectedPlan.price)} − {money(Number(discount) || 0)} ={' '}
                {money(Math.max(0, Number(selectedPlan.price) - (Number(discount) || 0)))}
              </strong>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
