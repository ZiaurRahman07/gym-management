import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Modal';
import { MemberFormModal } from '../components/MemberFormModal';
import { SubscriptionModal } from '../components/SubscriptionModal';
import { Avatar, Badge, EmptyState, Tabs } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { useFetch } from '../hooks/useFetch';
import {
  daysLabel,
  formatDate,
  formatDateTime,
  formatTime,
} from '../lib/format';
import { MEMBERSHIP_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, SUBSCRIPTION_STATUS, statusMeta } from '../lib/status';

type TabKey = 'overview' | 'memberships' | 'payments' | 'attendance';

export function MemberDetail() {
  const { id } = useParams();
  const memberId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings, money } = useSettings();
  const { data, loading, error, reload } = useFetch(() => api.members.get(memberId), [memberId]);
  const member = data?.data;

  const [tab, setTab] = useState<TabKey>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const canManage = user?.role === 'admin' || user?.role === 'receptionist';

  if (loading && !member) {
    return (
      <>
        <div className="skeleton" style={{ height: 22, width: 120, marginBottom: 18 }} />
        <div className="skeleton" style={{ height: 130, marginBottom: 18 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </>
    );
  }

  if (error || !member) {
    return (
      <EmptyState
        icon="alert"
        title="Member not found"
        message={error ?? 'This member may have been archived.'}
        action={
          <Link to="/members" className="btn btn-outline btn-sm">
            Back to members
          </Link>
        }
      />
    );
  }

  const baseMeta = statusMeta(MEMBERSHIP_STATUS, member.membershipStatus);
  const meta =
    member.membershipStatus === 'active' && member.daysLeft !== null && member.daysLeft <= settings.alertLeadDays
      ? MEMBERSHIP_STATUS.expiring
      : baseMeta;
  const name = `${member.firstName} ${member.lastName}`;

  const progress = (() => {
    if (!member.subscriptionStart || !member.subscriptionEnd) return 0;
    const start = new Date(`${member.subscriptionStart}T00:00:00`).getTime();
    const end = new Date(`${member.subscriptionEnd}T23:59:59`).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    if (now <= start) return 0;
    return Math.round(((now - start) / (end - start)) * 100);
  })();

  const checkIn = async () => {
    setCheckingIn(true);
    try {
      await api.attendance.checkIn(member.id);
      toast(`${name} checked in.`);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Check-in failed.', 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  const archive = async () => {
    setArchiving(true);
    try {
      await api.members.remove(member.id);
      toast(`${name} archived.`, 'info');
      navigate('/members');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to archive member.', 'error');
    } finally {
      setArchiving(false);
      setArchiveOpen(false);
    }
  };

  return (
    <>
      <Link to="/members" className="back-link">
        <Icon name="arrowLeft" size={15} />
        All members
      </Link>

      <section className="card card-pad profile-head">
        <div className="profile-main">
          <Avatar first={member.firstName} last={member.lastName} src={member.photoUrl} size={64} />
          <div className="profile-text">
            <div className="row wrap" style={{ gap: 9 }}>
              <h1 className="profile-name">{name}</h1>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {member.status !== 'active' && <Badge tone={member.status === 'blocked' ? 'danger' : 'muted'}>{member.status}</Badge>}
            </div>
            <div className="row wrap muted small" style={{ gap: 14, marginTop: 5 }}>
              <span className="mono">{member.memberCode}</span>
              <span className="row" style={{ gap: 5 }}>
                <Icon name="phone" size={13} /> {member.phone}
              </span>
              {member.email && (
                <span className="row" style={{ gap: 5 }}>
                  <Icon name="mail" size={13} /> {member.email}
                </span>
              )}
              <span className="row" style={{ gap: 5 }}>
                <Icon name="calendar" size={13} /> Joined {formatDate(member.joinDate)}
              </span>
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <button type="button" className="btn btn-primary" onClick={checkIn} disabled={checkingIn}>
            {checkingIn ? <span className="spinner" /> : <Icon name="check" size={16} />}
            Check in
          </button>
          {canManage && (
            <>
              <button type="button" className="btn btn-outline" onClick={() => setRenewOpen(true)}>
                <Icon name="refresh" size={15} />
                Renew
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setEditOpen(true)}>
                <Icon name="edit" size={15} />
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setArchiveOpen(true)}
                aria-label="Archive member"
                title="Archive member"
              >
                <Icon name="trash" size={16} />
              </button>
            </>
          )}
        </div>
      </section>

      <div className="split" style={{ marginTop: 18 }}>
        <div className="card">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'memberships', label: 'Memberships', count: member.subscriptions.length },
              { key: 'payments', label: 'Payments', count: member.payments.length },
              { key: 'attendance', label: 'Attendance', count: member.stats.visits },
            ]}
          />
          <div className="card-body" style={{ paddingTop: 20 }}>
            {tab === 'overview' && (
              <div className="stack" style={{ gap: 22 }}>
                <div>
                  <div className="form-section-head">
                    <h3>Contact & details</h3>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <div className="detail-label">Phone</div>
                      <div className="detail-value">{member.phone}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Email</div>
                      <div className="detail-value">{member.email ?? '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Date of birth</div>
                      <div className="detail-value">{member.dob ? formatDate(member.dob) : '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Gender</div>
                      <div className="detail-value" style={{ textTransform: 'capitalize' }}>
                        {member.gender ?? '—'}
                      </div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Address</div>
                      <div className="detail-value">{member.address ?? '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Emergency contact</div>
                      <div className="detail-value">{member.emergencyContact ?? '—'}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Member since</div>
                      <div className="detail-value">{formatDate(member.joinDate)}</div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Last visit</div>
                      <div className="detail-value">
                        {member.stats.lastVisit ? formatDateTime(member.stats.lastVisit) : 'No visits yet'}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="form-section-head">
                    <h3>Notes</h3>
                  </div>
                  {member.notes ? (
                    <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{member.notes}</p>
                  ) : (
                    <p className="muted small">No notes on this member.</p>
                  )}
                </div>

                <div>
                  <div className="form-section-head">
                    <h3>Assigned trainers</h3>
                  </div>
                  {member.trainers.length === 0 ? (
                    <p className="muted small">No trainer assigned yet.</p>
                  ) : (
                    <div className="chip-row">
                      {member.trainers.map((trainer) => (
                        <span className="chip" key={trainer.id}>
                          <Icon name="trainers" size={13} />
                          {trainer.name}
                          {trainer.specialization ? ` · ${trainer.specialization}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'memberships' && (
              <div className="table-wrap" style={{ margin: '0 -20px -20px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Period</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.subscriptions.map((subscription) => {
                      const subscriptionMeta = statusMeta(SUBSCRIPTION_STATUS, subscription.status);
                      return (
                        <tr key={subscription.id}>
                          <td>
                            <strong>{subscription.planName}</strong>
                            <span className="cell-sub">{subscription.durationDays} days</span>
                          </td>
                          <td>
                            {formatDate(subscription.startDate)} → {formatDate(subscription.endDate)}
                          </td>
                          <td className="num">{money(subscription.finalAmount)}</td>
                          <td>
                            <Badge tone={subscriptionMeta.tone}>{subscriptionMeta.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {member.subscriptions.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <EmptyState
                            icon="memberships"
                            title="No memberships yet"
                            message="Start a plan to give this member gym access."
                            action={
                              canManage ? (
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => setRenewOpen(true)}>
                                  Start membership
                                </button>
                              ) : undefined
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'payments' && (
              <div className="table-wrap" style={{ margin: '0 -20px -20px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.payments.map((payment) => {
                      const paymentMeta = statusMeta(PAYMENT_STATUS, payment.status);
                      return (
                        <tr key={payment.id}>
                          <td className="mono">{payment.invoiceNo}</td>
                          <td>{formatDateTime(payment.paidAt)}</td>
                          <td>{PAYMENT_METHOD[payment.method] ?? payment.method}</td>
                          <td className="num">{money(payment.amount)}</td>
                          <td>
                            <Badge tone={paymentMeta.tone}>{paymentMeta.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {member.payments.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <EmptyState icon="payments" title="No payments" message="Payments recorded for this member appear here." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'attendance' && (
              <div className="table-wrap" style={{ margin: '0 -20px -20px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Check in</th>
                      <th>Check out</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.attendance.map((record) => (
                      <tr key={record.id}>
                        <td>{formatDate(record.checkInAt)}</td>
                        <td>{formatTime(record.checkInAt)}</td>
                        <td>{record.checkOutAt ? formatTime(record.checkOutAt) : <Badge tone="success">In gym</Badge>}</td>
                        <td style={{ textTransform: 'capitalize' }}>{record.method}</td>
                      </tr>
                    ))}
                    {member.attendance.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <EmptyState icon="attendance" title="No visits yet" message="Check this member in from the Attendance page." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="split-side">
          <section className="card card-pad">
            <div className="row-between" style={{ marginBottom: 12 }}>
              <span className="card-title">Current membership</span>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
            {member.subscriptionId ? (
              <>
                <div className="metric-large" style={{ fontSize: 19 }}>
                  {member.planName}
                </div>
                <div className="muted small" style={{ marginTop: 3 }}>
                  {member.subscriptionStart ? formatDate(member.subscriptionStart) : '—'} →{' '}
                  {member.subscriptionEnd ? formatDate(member.subscriptionEnd) : '—'}
                </div>
                <div className="progress" style={{ margin: '14px 0 8px' }}>
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="row-between small">
                  <span className="muted">
                    {member.daysLeft !== null && member.daysLeft >= 0
                      ? `${member.daysLeft} day${member.daysLeft === 1 ? '' : 's'} remaining`
                      : `${Math.abs(member.daysLeft ?? 0)} day${Math.abs(member.daysLeft ?? 0) === 1 ? '' : 's'} overdue`}
                  </span>
                  <span className="muted">{progress}%</span>
                </div>
                {canManage && (
                  <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => setRenewOpen(true)}>
                    <Icon name="refresh" size={15} />
                    Renew membership
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="muted small">This member does not have an active plan.</p>
                {canManage && (
                  <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => setRenewOpen(true)}>
                    Start membership
                  </button>
                )}
              </>
            )}
          </section>

          <section className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>
              Activity
            </div>
            <div className="summary-list">
              <div className="summary-row">
                <span>Total paid</span>
                <strong>{money(member.stats.totalPaid)}</strong>
              </div>
              <div className="summary-row">
                <span>Payments</span>
                <strong>{member.stats.paymentCount}</strong>
              </div>
              <div className="summary-row">
                <span>Total visits</span>
                <strong>{member.stats.visits}</strong>
              </div>
              <div className="summary-row">
                <span>Last visit</span>
                <strong>{member.stats.lastVisit ? formatDate(member.stats.lastVisit) : '—'}</strong>
              </div>
              <div className="summary-row">
                <span>Days left</span>
                <strong>{member.daysLeft !== null ? daysLabel(member.daysLeft) : '—'}</strong>
              </div>
            </div>
          </section>

          <section className="card card-pad">
            <div className="card-title" style={{ marginBottom: 8 }}>
              Trainers
            </div>
            {member.trainers.length === 0 ? (
              <p className="muted small">Not assigned to a trainer.</p>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {member.trainers.map((trainer) => (
                  <div className="row" key={trainer.id}>
                    <Avatar first={trainer.name.split(' ')[0]} last={trainer.name.split(' ')[1] ?? ''} size={30} />
                    <div>
                      <div className="list-title">{trainer.name}</div>
                      <div className="list-sub">{trainer.specialization ?? 'Trainer'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      <MemberFormModal
        open={editOpen}
        member={member}
        onClose={() => setEditOpen(false)}
        onSaved={(message) => {
          toast(message);
          reload();
        }}
      />
      <SubscriptionModal
        open={renewOpen}
        member={member}
        onClose={() => setRenewOpen(false)}
        onSaved={(message) => {
          toast(message);
          reload();
        }}
      />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={archive}
        busy={archiving}
        title="Archive this member?"
        confirmLabel="Archive member"
        message={
          <>
            <strong>{name}</strong> will be removed from the active roster and any active membership will be cancelled.
            Payment and attendance history is kept.
          </>
        }
      />
    </>
  );
}
