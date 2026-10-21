import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api, type MemberInput } from '../api/endpoints';
import type { Member, Plan } from '../api/types';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { Modal } from './Modal';
import { Field, Spinner } from './ui';
import { todayInput } from '../lib/format';

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: string;
  dob: string;
  address: string;
  emergencyContact: string;
  notes: string;
  joinDate: string;
  status: 'active' | 'inactive' | 'blocked';
  planId: string;
  discount: string;
  paymentMethod: 'cash' | 'card' | 'bank' | 'online';
  comp: boolean;
};

function emptyForm(): FormState {
  return {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    gender: '',
    dob: '',
    address: '',
    emergencyContact: '',
    notes: '',
    joinDate: todayInput(),
    status: 'active',
    planId: '',
    discount: '0',
    paymentMethod: 'cash',
    comp: false,
  };
}

function fromMember(member: Member): FormState {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone,
    email: member.email ?? '',
    gender: member.gender ?? '',
    dob: member.dob ?? '',
    address: member.address ?? '',
    emergencyContact: member.emergencyContact ?? '',
    notes: member.notes ?? '',
    joinDate: member.joinDate,
    status: member.status,
    planId: '',
    discount: '0',
    paymentMethod: 'cash',
    comp: false,
  };
}

export function MemberFormModal({
  open,
  onClose,
  member,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  member?: Member | null;
  onSaved: (message: string) => void;
}) {
  const { toast } = useToast();
  const { money } = useSettings();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = Boolean(member);

  useEffect(() => {
    if (!open) return;
    setForm(member ? fromMember(member) : emptyForm());
    setError(null);
    setFieldErrors({});
    api.plans
      .list()
      .then((response) => {
        setPlans(response.data);
        if (!member) {
          setForm((current) => (current.planId ? current : { ...current, planId: String(response.data[0]?.id ?? '') }));
        }
      })
      .catch(() => setPlans([]));
  }, [open, member]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const selectedPlan = plans.find((plan) => String(plan.id) === form.planId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const payload: MemberInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      gender: (form.gender as MemberInput['gender']) || null,
      dob: form.dob || null,
      address: form.address.trim() || null,
      emergencyContact: form.emergencyContact.trim() || null,
      notes: form.notes.trim() || null,
      joinDate: form.joinDate,
      status: form.status,
    };

    if (!isEdit) {
      if (form.planId) {
        payload.planId = Number(form.planId);
        payload.discount = Number(form.discount) || 0;
        payload.comp = form.comp;
        if (!form.comp) payload.paymentMethod = form.paymentMethod;
      }
    }

    try {
      if (isEdit && member) {
        await api.members.update(member.id, payload);
        onSaved(`${form.firstName} ${form.lastName} updated.`);
      } else {
        await api.members.create(payload);
        onSaved(`${form.firstName} ${form.lastName} registered.`);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details) {
          const map: Record<string, string> = {};
          for (const detail of err.details) map[detail.field] = detail.message;
          setFieldErrors(map);
        }
      } else {
        setError('Unable to save this member.');
      }
      toast('Could not save member.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit member' : 'Register a member'}
      subtitle={isEdit ? 'Update contact details and member status.' : 'Add someone to the gym and optionally start a membership.'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="member-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={15} />}
            {isEdit ? 'Save changes' : 'Register member'}
          </button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div className="form-section">
          <div className="form-section-head">
            <h3>Personal details</h3>
          </div>
          <div className="form-grid">
            <Field label="First name" error={fieldErrors.firstName}>
              <input
                className="input"
                value={form.firstName}
                onChange={(event) => set('firstName', event.target.value)}
                placeholder="Aisha"
                required
              />
            </Field>
            <Field label="Last name" error={fieldErrors.lastName}>
              <input
                className="input"
                value={form.lastName}
                onChange={(event) => set('lastName', event.target.value)}
                placeholder="Rahman"
                required
              />
            </Field>
            <Field label="Phone" error={fieldErrors.phone}>
              <input
                className="input"
                value={form.phone}
                onChange={(event) => set('phone', event.target.value)}
                placeholder="+1 555 010 2030"
                required
              />
            </Field>
            <Field label="Email" error={fieldErrors.email}>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(event) => set('email', event.target.value)}
                placeholder="member@example.com"
              />
            </Field>
            <Field label="Gender">
              <select className="select" value={form.gender} onChange={(event) => set('gender', event.target.value)}>
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                className="input"
                value={form.dob}
                onChange={(event) => set('dob', event.target.value)}
              />
            </Field>
            <Field label="Joined on">
              <input
                type="date"
                className="input"
                value={form.joinDate}
                onChange={(event) => set('joinDate', event.target.value)}
              />
            </Field>
            <Field label="Status">
              <select
                className="select"
                value={form.status}
                onChange={(event) => set('status', event.target.value as FormState['status'])}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blocked">Blocked</option>
              </select>
            </Field>
            <Field label="Address" className="span-2">
              <input
                className="input"
                value={form.address}
                onChange={(event) => set('address', event.target.value)}
                placeholder="Street, city"
              />
            </Field>
            <Field label="Emergency contact" className="span-2">
              <input
                className="input"
                value={form.emergencyContact}
                onChange={(event) => set('emergencyContact', event.target.value)}
                placeholder="Name and phone number"
              />
            </Field>
            <Field label="Notes" className="span-2">
              <textarea
                className="textarea"
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder="Injuries, preferences, anything the team should know"
              />
            </Field>
          </div>
        </div>

        {!isEdit && (
          <div className="form-section" style={{ marginBottom: 0 }}>
            <div className="form-section-head">
              <h3>Membership</h3>
            </div>
            {plans.length === 0 ? (
              <div className="notice">
                No active plans yet. You can register the member now and add a membership later from their profile.
              </div>
            ) : (
              <div className="form-grid">
                <Field label="Plan">
                  <select className="select" value={form.planId} onChange={(event) => set('planId', event.target.value)}>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} · {plan.durationDays} {plan.durationDays === 1 ? 'day' : 'days'} · {money(plan.price)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Discount" hint={selectedPlan ? `Plan price ${money(selectedPlan.price)}` : undefined}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={form.discount}
                    onChange={(event) => set('discount', event.target.value)}
                    disabled={form.comp}
                  />
                </Field>
                <Field label="Payment method">
                  <select
                    className="select"
                    value={form.paymentMethod}
                    onChange={(event) => set('paymentMethod', event.target.value as FormState['paymentMethod'])}
                    disabled={form.comp}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank">Bank transfer</option>
                    <option value="online">Online</option>
                  </select>
                </Field>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={form.comp} onChange={(event) => set('comp', event.target.checked)} />
                    <span>
                      <strong>Complimentary membership</strong>
                      <span>Start the membership without recording a payment.</span>
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
