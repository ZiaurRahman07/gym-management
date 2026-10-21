import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Member, MemberSubscription, Payment } from '../api/types';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime, formatMoney, nowInput } from '../lib/format';
import { PAYMENT_METHOD, PAYMENT_STATUS, statusMeta } from '../lib/status';
import { Modal } from './Modal';
import { MemberPicker } from './MemberPicker';
import { Badge, Field, Spinner } from './ui';

export function PaymentModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { toast } = useToast();
  const [member, setMember] = useState<Member | null>(null);
  const [subscriptions, setSubscriptions] = useState<MemberSubscription[]>([]);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'bank' | 'online'>('cash');
  const [paidAt, setPaidAt] = useState(nowInput());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMember(null);
    setSubscriptions([]);
    setSubscriptionId('');
    setAmount('');
    setMethod('cash');
    setPaidAt(nowInput());
    setNotes('');
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!member) {
      setSubscriptions([]);
      return;
    }
    api.members
      .get(member.id)
      .then((response) => {
        const list = response.data.subscriptions.filter((subscription) => subscription.status !== 'cancelled');
        setSubscriptions(list);
        const active = list.find((subscription) => subscription.status === 'active');
        if (active) {
          setSubscriptionId(String(active.id));
          setAmount(String(active.finalAmount));
        }
      })
      .catch(() => setSubscriptions([]));
  }, [member]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!member) {
      setError('Choose the member making this payment.');
      return;
    }
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.payments.create({
        memberId: member.id,
        subscriptionId: subscriptionId ? Number(subscriptionId) : null,
        amount: value,
        method,
        paidAt: paidAt ? paidAt.replace('T', ' ') : null,
        notes: notes.trim() || null,
      });
      onSaved(`Payment of ${value} recorded for ${member.firstName} ${member.lastName}.`);
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to record this payment.';
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
      title="Record a payment"
      subtitle="Log cash, card or transfer payments against a member."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="payment-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={15} />}
            Record payment
          </button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div className="stack">
          <Field label="Member">
            <MemberPicker value={member} onChange={setMember} autoFocus />
          </Field>

          <div className="form-grid">
            <Field label="Amount">
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="45.00"
                required
              />
            </Field>
            <Field label="Method">
              <select
                className="select"
                value={method}
                onChange={(event) => setMethod(event.target.value as typeof method)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank transfer</option>
                <option value="online">Online</option>
              </select>
            </Field>
            <Field label="Paid at">
              <input
                type="datetime-local"
                className="input"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </Field>
            <Field label="Membership (optional)">
              <select
                className="select"
                value={subscriptionId}
                onChange={(event) => {
                  setSubscriptionId(event.target.value);
                  const selected = subscriptions.find((item) => String(item.id) === event.target.value);
                  if (selected) setAmount(String(selected.finalAmount));
                }}
              >
                <option value="">Not linked to a membership</option>
                {subscriptions.map((subscription) => (
                  <option key={subscription.id} value={subscription.id}>
                    {subscription.planName} · ends {subscription.endDate}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" className="span-2">
              <input
                className="input"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional note for the receipt"
              />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function ReceiptModal({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const { settings, money } = useSettings();
  if (!payment) return null;
  const status = statusMeta(PAYMENT_STATUS, payment.status);

  return (
    <Modal
      open={Boolean(payment)}
      onClose={onClose}
      size="sm"
      title="Payment receipt"
      subtitle={payment.invoiceNo}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print receipt
          </button>
        </>
      }
    >
      <div className="receipt">
        <div className="receipt-head">
          <div className="receipt-brand">
            <span className="brand-mark" style={{ width: 34, height: 34, borderRadius: 9 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                {settings.gymName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join('')
                  .toUpperCase()}
              </span>
            </span>
            <div>
              <div className="receipt-title">{settings.gymName}</div>
              <div className="small muted">Membership receipt</div>
            </div>
          </div>
          <div className="receipt-meta">
            <strong>{payment.invoiceNo}</strong>
            <br />
            {formatDateTime(payment.paidAt)}
            <br />
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </div>

        <div className="receipt-rows">
          <div className="receipt-row">
            <span>Member</span>
            <strong>
              {payment.firstName} {payment.lastName}
            </strong>
          </div>
          <div className="receipt-row">
            <span>Member code</span>
            <strong>{payment.memberCode}</strong>
          </div>
          <div className="receipt-row">
            <span>Description</span>
            <strong>{payment.planName ? `${payment.planName} membership` : 'Gym payment'}</strong>
          </div>
          <div className="receipt-row">
            <span>Method</span>
            <strong>{PAYMENT_METHOD[payment.method] ?? payment.method}</strong>
          </div>
          <div className="receipt-row">
            <span>Recorded by</span>
            <strong>{payment.recordedByName ?? 'Front desk'}</strong>
          </div>
          {payment.notes && (
            <div className="receipt-row">
              <span>Notes</span>
              <strong>{payment.notes}</strong>
            </div>
          )}
        </div>

        <div className="receipt-total">
          <span>Total paid</span>
          <span>{formatMoney(payment.amount, settings.currencySymbol)}</span>
        </div>

        <div className="receipt-foot">
          Thank you for training with {settings.gymName}.
          <br />
          This receipt was generated by the gym management system.
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 10, textAlign: 'center' }}>
        {money(payment.amount)} received · keep this receipt for your records
      </p>
    </Modal>
  );
}
