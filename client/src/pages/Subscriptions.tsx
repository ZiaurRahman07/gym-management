import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Subscription } from '../api/types';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Modal';
import { SubscriptionModal } from '../components/SubscriptionModal';
import { Avatar, Badge, EmptyState, PageHead, Pagination, SearchInput } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { daysLabel, formatDate, formatShortDate } from '../lib/format';
import { SUBSCRIPTION_STATUS, statusMeta } from '../lib/status';

export function Subscriptions() {
  const { toast } = useToast();
  const { settings, money } = useSettings();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [openNew, setOpenNew] = useState(false);
  const [pending, setPending] = useState<{ subscription: Subscription; action: 'freeze' | 'unfreeze' | 'cancel' } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useFetch(
    () => api.subscriptions.list({ q: debouncedQ, status, page, limit: 12 }),
    [debouncedQ, status, page],
  );
  const expiring = useFetch(() => api.subscriptions.expiring(settings.alertLeadDays), [settings.alertLeadDays]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status]);

  const subscriptions = data?.data ?? [];
  const dueSoon = expiring.data?.data ?? [];

  const applyAction = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await api.subscriptions.action(pending.subscription.id, pending.action);
      toast(
        pending.action === 'freeze'
          ? 'Membership frozen.'
          : pending.action === 'unfreeze'
            ? 'Membership resumed.'
            : 'Membership cancelled.',
      );
      reload();
      expiring.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Action failed.', 'error');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <>
      <PageHead
        title="Memberships"
        subtitle="Every plan sold, its status and how much has been collected."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpenNew(true)}>
            Sell membership
          </button>
        }
      />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      {dueSoon.length > 0 && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <strong style={{ color: 'var(--text)' }}>
              {dueSoon.length} membership{dueSoon.length === 1 ? '' : 's'} expire in the next {settings.alertLeadDays} days
            </strong>
            <div className="chip-row" style={{ marginTop: 8 }}>
              {dueSoon.slice(0, 6).map((subscription) => (
                <Link className="chip" key={subscription.id} to={`/members/${subscription.memberId}`}>
                  {subscription.firstName} {subscription.lastName} · {formatShortDate(subscription.endDate)}
                </Link>
              ))}
              {dueSoon.length > 6 && <span className="muted small">+{dueSoon.length - 6} more</span>}
            </div>
          </div>
        </div>
      )}

      <section className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search member or code…" />
          <div className="toolbar-right">
            <select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="frozen">Frozen</option>
              <option value="cancelled">Cancelled</option>
              <option value="">All statuses</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Period</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && subscriptions.length === 0
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={6}>
                        <div className="skeleton" style={{ height: 22 }} />
                      </td>
                    </tr>
                  ))
                : subscriptions.map((subscription) => {
                    const meta = statusMeta(SUBSCRIPTION_STATUS, subscription.status);
                    const expiringSoon =
                      subscription.status === 'active' && subscription.daysLeft <= settings.alertLeadDays;
                    return (
                      <tr key={subscription.id}>
                        <td>
                          <Link to={`/members/${subscription.memberId}`} className="member-cell">
                            <Avatar first={subscription.firstName} last={subscription.lastName} size={34} />
                            <div className="member-cell-text">
                              <strong>
                                {subscription.firstName} {subscription.lastName}
                              </strong>
                              <span>{subscription.memberCode}</span>
                            </div>
                          </Link>
                        </td>
                        <td>
                          {subscription.planName}
                          <span className="cell-sub">{subscription.durationDays} days</span>
                        </td>
                        <td>
                          <span className="nowrap">
                            {formatShortDate(subscription.startDate)} to {formatDate(subscription.endDate)}
                          </span>
                          <span className="cell-sub">
                            {subscription.status === 'active' ? daysLabel(subscription.daysLeft) : subscription.status}
                          </span>
                        </td>
                        <td className="num">
                          {money(subscription.finalAmount)}
                          <span className="cell-sub">{money(subscription.amountPaid)} paid</span>
                        </td>
                        <td>
                          <Badge tone={expiringSoon ? 'warning' : meta.tone}>
                            {expiringSoon ? 'Expiring soon' : meta.label}
                          </Badge>
                        </td>
                        <td>
                          <div className="table-actions">
                            {subscription.status === 'active' && (
                              <button
                                type="button"
                                className="icon-btn"
                                title="Freeze"
                                onClick={() => setPending({ subscription, action: 'freeze' })}
                              >
                                <Icon name="snow" size={15} />
                              </button>
                            )}
                            {subscription.status === 'frozen' && (
                              <button
                                type="button"
                                className="icon-btn"
                                title="Resume"
                                onClick={() => setPending({ subscription, action: 'unfreeze' })}
                              >
                                <Icon name="play" size={15} />
                              </button>
                            )}
                            {(subscription.status === 'active' || subscription.status === 'frozen') && (
                              <button
                                type="button"
                                className="icon-btn"
                                title="Cancel"
                                onClick={() => setPending({ subscription, action: 'cancel' })}
                              >
                                <Icon name="close" size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!loading && subscriptions.length === 0 && (
          <EmptyState
            title="No memberships here"
            message="Sell a plan to a member and it will show up in this list."
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpenNew(true)}>
                Sell membership
              </button>
            }
          />
        )}

        {data && data.total > 0 && (
          <div className="table-foot">
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </div>
        )}
      </section>

      <SubscriptionModal
        open={openNew}
        onClose={() => setOpenNew(false)}
        onSaved={(message) => {
          toast(message);
          reload();
          expiring.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={applyAction}
        busy={busy}
        tone={pending?.action === 'cancel' ? 'danger' : 'primary'}
        title={
          pending?.action === 'freeze'
            ? 'Freeze this membership?'
            : pending?.action === 'unfreeze'
              ? 'Resume this membership?'
              : 'Cancel this membership?'
        }
        confirmLabel={
          pending?.action === 'freeze' ? 'Freeze' : pending?.action === 'unfreeze' ? 'Resume' : 'Cancel membership'
        }
        message={
          pending?.action === 'freeze' ? (
            <>
              The member's access will be paused. When you resume, the end date is extended by the frozen days.
            </>
          ) : pending?.action === 'unfreeze' ? (
            <>
              Access will be restored and the end date extended to cover the frozen period.
            </>
          ) : (
            <>
              <strong>
                {pending?.subscription.firstName} {pending?.subscription.lastName}
              </strong>
              's membership will be cancelled immediately. Payments already recorded are unaffected.
            </>
          )
        }
      />
    </>
  );
}
