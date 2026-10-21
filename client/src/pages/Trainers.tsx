import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Trainer, TrainerRosterMember } from '../api/types';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Modal } from '../components/Modal';
import { MemberPicker } from '../components/MemberPicker';
import { Avatar, Badge, EmptyState, Field, PageHead, Spinner } from '../components/ui';
import type { Member } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { formatDate } from '../lib/format';
import { TRAINER_STATUS, statusMeta } from '../lib/status';

function TrainerFormModal({
  open,
  trainer,
  onClose,
  onSaved,
}: {
  open: boolean;
  trainer: Trainer | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(trainer?.name ?? '');
    setSpecialization(trainer?.specialization ?? '');
    setPhone(trainer?.phone ?? '');
    setEmail(trainer?.email ?? '');
    setHireDate(trainer?.hireDate ?? '');
    setStatus(trainer?.status ?? 'active');
    setError(null);
  }, [open, trainer]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        specialization: specialization.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        hireDate: hireDate || null,
        status,
      };
      if (trainer) {
        await api.trainers.update(trainer.id, payload);
        onSaved(`${name} updated.`);
      } else {
        await api.trainers.create(payload);
        onSaved(`${name} added to the team.`);
      }
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to save this trainer.';
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
      title={trainer ? 'Edit trainer' : 'Add a trainer'}
      subtitle="Trainers can be assigned to members and see their roster."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="trainer-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={15} />}
            {trainer ? 'Save changes' : 'Add trainer'}
          </button>
        </>
      }
    >
      <form id="trainer-form" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}
        <div className="form-grid">
          <Field label="Full name" className="span-2">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Specialization" className="span-2">
            <input
              className="input"
              value={specialization}
              onChange={(event) => setSpecialization(event.target.value)}
              placeholder="Strength & conditioning"
            />
          </Field>
          <Field label="Phone">
            <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Email">
            <input type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Hire date">
            <input type="date" className="input" value={hireDate} onChange={(event) => setHireDate(event.target.value)} />
          </Field>
          <Field label="Status">
            <select
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'active' | 'inactive')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function Trainers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, loading, reload } = useFetch(() => api.trainers.list(true), []);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trainer | null>(null);
  const [rosterTrainer, setRosterTrainer] = useState<Trainer | null>(null);
  const [roster, setRoster] = useState<TrainerRosterMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [assignMember, setAssignMember] = useState<Member | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [deactivating, setDeactivating] = useState<Trainer | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = user?.role === 'admin' || user?.role === 'receptionist';
  const isAdmin = user?.role === 'admin';
  const trainers = data?.data ?? [];

  useEffect(() => {
    if (!rosterTrainer) return;
    setRosterLoading(true);
    api.trainers
      .roster(rosterTrainer.id)
      .then((response) => setRoster(response.data))
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false));
  }, [rosterTrainer]);

  const refreshRoster = async () => {
    if (!rosterTrainer) return;
    const response = await api.trainers.roster(rosterTrainer.id);
    setRoster(response.data);
    reload();
  };

  const assign = async () => {
    if (!rosterTrainer || !assignMember) return;
    setAssignBusy(true);
    try {
      await api.trainers.assign(rosterTrainer.id, assignMember.id);
      toast(`${assignMember.firstName} assigned to ${rosterTrainer.name}.`);
      setAssignMember(null);
      await refreshRoster();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to assign member.', 'error');
    } finally {
      setAssignBusy(false);
    }
  };

  const unassign = async (memberId: number) => {
    if (!rosterTrainer) return;
    try {
      await api.trainers.unassign(rosterTrainer.id, memberId);
      toast('Member unassigned.', 'info');
      await refreshRoster();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to unassign member.', 'error');
    }
  };

  const deactivate = async () => {
    if (!deactivating) return;
    setBusy(true);
    try {
      await api.trainers.remove(deactivating.id);
      toast(`${deactivating.name} deactivated.`, 'info');
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to deactivate trainer.', 'error');
    } finally {
      setBusy(false);
      setDeactivating(null);
    }
  };

  return (
    <>
      <PageHead
        title="Trainers"
        subtitle="Your coaching team and the members they look after."
        actions={
          canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Icon name="plus" size={16} />
              Add trainer
            </button>
          ) : undefined
        }
      />

      {loading && trainers.length === 0 ? (
        <div className="plans-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="skeleton" key={index} style={{ height: 200 }} />
          ))}
        </div>
      ) : trainers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="trainers"
            title="No trainers yet"
            message="Add your coaching team to start assigning members."
            action={
              canManage ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>
                  Add trainer
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="trainer-grid">
          {trainers.map((trainer) => {
            const meta = statusMeta(TRAINER_STATUS, trainer.status);
            return (
              <div className={`card trainer-card ${trainer.status === 'inactive' ? 'plan-inactive' : ''}`} key={trainer.id}>
                <div className="row-between">
                  <Avatar
                    first={trainer.name.split(' ')[0]}
                    last={trainer.name.split(' ')[1] ?? ''}
                    size={46}
                  />
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <div>
                  <div className="plan-name" style={{ fontSize: 16 }}>
                    {trainer.name}
                  </div>
                  <div className="muted small">{trainer.specialization ?? 'Trainer'}</div>
                </div>
                <div className="summary-list" style={{ marginTop: 2 }}>
                  <div className="summary-row">
                    <span>Assigned members</span>
                    <strong>{trainer.assignedMembers}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Hired</span>
                    <strong>{trainer.hireDate ? formatDate(trainer.hireDate) : '—'}</strong>
                  </div>
                </div>
                <div className="row-between plan-foot">
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setRosterTrainer(trainer)}>
                    <Icon name="members" size={14} />
                    View roster
                  </button>
                  {canManage && (
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setEditing(trainer);
                          setFormOpen(true);
                        }}
                        aria-label="Edit trainer"
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setDeactivating(trainer)}
                          aria-label="Deactivate trainer"
                        >
                          <Icon name="power" size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TrainerFormModal
        open={formOpen}
        trainer={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(message) => {
          toast(message);
          reload();
        }}
      />

      <Modal
        open={Boolean(rosterTrainer)}
        onClose={() => setRosterTrainer(null)}
        title={rosterTrainer ? `${rosterTrainer.name}'s roster` : 'Roster'}
        subtitle={`${roster.length} assigned member${roster.length === 1 ? '' : 's'}`}
        size="lg"
      >
        <div className="stack">
          {canManage && (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="grow">
                <Field label="Assign a member">
                  <MemberPicker value={assignMember} onChange={setAssignMember} />
                </Field>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!assignMember || assignBusy}
                onClick={assign}
              >
                {assignBusy && <Spinner size={15} />}
                Assign
              </button>
            </div>
          )}

          {rosterLoading ? (
            <div className="loading-block">
              <div className="skeleton" style={{ height: 48 }} />
              <div className="skeleton" style={{ height: 48 }} />
            </div>
          ) : roster.length === 0 ? (
            <EmptyState icon="members" title="No members assigned" message="Assign members to build this trainer's roster." />
          ) : (
            <div className="table-wrap" style={{ margin: '0 -20px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Membership</th>
                    <th>Assigned</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {roster.map((member) => (
                    <tr key={member.assignmentId}>
                      <td>
                        <div className="member-cell">
                          <Avatar first={member.firstName} last={member.lastName} src={member.photoUrl} size={32} />
                          <div className="member-cell-text">
                            <strong>
                              {member.firstName} {member.lastName}
                            </strong>
                            <span>{member.memberCode}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={member.membershipStatus === 'active' ? 'success' : member.membershipStatus === 'expired' ? 'danger' : 'muted'}>
                          {member.membershipStatus}
                        </Badge>
                      </td>
                      <td>{formatDate(member.assignedAt)}</td>
                      <td className="text-right">
                        {canManage && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => unassign(member.id)}>
                            Unassign
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        onConfirm={deactivate}
        busy={busy}
        title="Deactivate this trainer?"
        confirmLabel="Deactivate"
        message={
          <>
            <strong>{deactivating?.name}</strong> will be marked inactive and all active member assignments will end.
            Historical data is kept.
          </>
        }
      />
    </>
  );
}
