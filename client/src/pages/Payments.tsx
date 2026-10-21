import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Payment } from '../api/types';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/Modal';
import { PaymentModal, ReceiptModal } from '../components/PaymentModal';
import { Avatar, Badge, EmptyState, PageHead, Pagination, SearchInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { formatDateTime, formatMoney, formatShortDate, monthStartInput, todayInput } from '../lib/format';
import { PAYMENT_METHOD, PAYMENT_STATUS, statusMeta } from '../lib/status';

export function Payments() {
  const { user } = useAuth();
  const { settings, money } = useSettings();
  const { toast } = useToast();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState(monthStartInput());
  const [to, setTo] = useState(todayInput());
  const [page, setPage] = useState(1);
  const [recordOpen, setRecordOpen] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useFetch(
    () => api.payments.list({ q: debouncedQ, method, from, to, page, limit: 12 }),
    [debouncedQ, method, from, to, page],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, method, from, to]);

  const payments = data?.data ?? [];
  const summary = data?.summary;

  const refund = async () => {
    if (!refunding) return;
    setBusy(true);
    try {
      await api.payments.refund(refunding.id, 'Refunded from the payments screen.');
      toast(`Payment ${refunding.invoiceNo} refunded.`, 'info');
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Refund failed.', 'error');
    } finally {
      setBusy(false);
      setRefunding(null);
    }
  };

  return (
    <>
      <PageHead
        title="Payments"
        subtitle="Track every invoice, print receipts and issue refunds."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setRecordOpen(true)}>
            Record payment
          </button>
        }
      />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      <div className="stat-grid stat-grid-3">
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-label">Collected in range</div>
            <div className="stat-value">{money(summary?.paid ?? 0)}</div>
            <div className="stat-foot">{data?.total ?? 0} transactions</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-label">Refunded</div>
            <div className="stat-value">{money(summary?.refunded ?? 0)}</div>
            <div className="stat-foot">Reversed payments in range</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-label">Period</div>
            <div className="stat-value" style={{ fontSize: 18 }}>
              {formatShortDate(from)} to {formatShortDate(to)}
            </div>
            <div className="stat-foot">Change the dates to filter the ledger</div>
          </div>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search invoice or member…" />
          <div className="toolbar-right">
            <input type="date" className="filter-select" value={from} onChange={(event) => setFrom(event.target.value)} />
            <span className="muted small">to</span>
            <input type="date" className="filter-select" value={to} onChange={(event) => setTo(event.target.value)} />
            <select className="filter-select" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="">All methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank">Bank transfer</option>
              <option value="online">Online</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Member</th>
                <th>Method</th>
                <th>Date</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && payments.length === 0
                ? Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={7}>
                        <div className="skeleton" style={{ height: 22 }} />
                      </td>
                    </tr>
                  ))
                : payments.map((payment) => {
                    const status = statusMeta(PAYMENT_STATUS, payment.status);
                    return (
                      <tr key={payment.id}>
                        <td className="mono nowrap">{payment.invoiceNo}</td>
                        <td>
                          <Link to={`/members/${payment.memberId}`} className="member-cell">
                            <Avatar first={payment.firstName} last={payment.lastName} size={32} />
                            <div className="member-cell-text">
                              <strong>
                                {payment.firstName} {payment.lastName}
                              </strong>
                              <span>{payment.memberCode}</span>
                            </div>
                          </Link>
                        </td>
                        <td>{PAYMENT_METHOD[payment.method] ?? payment.method}</td>
                        <td className="nowrap">{formatDateTime(payment.paidAt)}</td>
                        <td className="num">{formatMoney(payment.amount, settings.currencySymbol)}</td>
                        <td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title="View receipt"
                              onClick={() => setReceipt(payment)}
                            >
                              <Icon name="printer" size={15} />
                            </button>
                            {user?.role === 'admin' && payment.status === 'paid' && (
                              <button
                                type="button"
                                className="icon-btn"
                                title="Refund payment"
                                onClick={() => setRefunding(payment)}
                              >
                                <Icon name="refresh" size={15} />
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

        {!loading && payments.length === 0 && (
          <EmptyState
            title="No payments in this range"
            message="Try widening the dates, or record a new payment."
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setRecordOpen(true)}>
                Record payment
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

      <PaymentModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSaved={(message) => {
          toast(message);
          reload();
        }}
      />
      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />

      <ConfirmDialog
        open={Boolean(refunding)}
        onClose={() => setRefunding(null)}
        onConfirm={refund}
        busy={busy}
        title="Refund this payment?"
        confirmLabel="Refund payment"
        message={
          <>
            <strong>{refunding?.invoiceNo}</strong> for {refunding ? formatMoney(refunding.amount, settings.currencySymbol) : ''}{' '}
            will be marked as refunded. The membership itself is not changed.
          </>
        }
      />
    </>
  );
}
