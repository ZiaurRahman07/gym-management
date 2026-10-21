import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/endpoints';
import type { DashboardStats } from '../api/types';
import { AreaChart, Donut } from '../components/Charts';
import { Avatar, Badge, EmptyState, PageHead, StatCard } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useFetch } from '../hooks/useFetch';
import { formatCompact, formatMoney, formatShortDate, greeting, todayInput } from '../lib/format';
import { PAYMENT_METHOD, TONE_COLORS, statusMeta, MEMBERSHIP_STATUS } from '../lib/status';

export function Dashboard() {
  const { user } = useAuth();
  const { settings, money } = useSettings();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(() => api.dashboard.stats(), []);
  const stats: DashboardStats | undefined = data?.data;

  const breakdown = stats?.membershipBreakdown ?? {};
  const segments = [
    { label: 'Active', value: breakdown.active ?? 0, color: TONE_COLORS.success },
    { label: 'Expiring', value: breakdown.expiring ?? 0, color: TONE_COLORS.warning },
    { label: 'Expired', value: breakdown.expired ?? 0, color: TONE_COLORS.danger },
    { label: 'No plan', value: (breakdown.none ?? 0) + (breakdown.cancelled ?? 0), color: TONE_COLORS.muted },
  ];

  const formatDay = (timeZone?: string) =>
    new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      ...(timeZone ? { timeZone } : {}),
    });
  let dateLabel = formatDay();
  try {
    dateLabel = formatDay(settings.timezone);
  } catch {
    /* fall back to the browser timezone if the stored value is invalid */
  }

  return (
    <>
      <PageHead
        title={`${greeting(settings.timezone)}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={`Here's how ${settings.gymName} is doing · ${dateLabel}`}
        actions={
          <>
            <Link className="btn btn-outline" to="/reports">
              Reports
            </Link>
            <Link className="btn btn-primary" to="/attendance">
              Check in member
            </Link>
          </>
        }
      />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      <div className="stat-grid">
        <StatCard
          label="Active members"
          value={loading && !stats ? '-' : (stats?.activeMembers ?? 0).toLocaleString()}
          onClick={() => navigate('/members?status=active')}
          foot={
            <>
              <span className="delta up">
                {stats?.newMembersThisMonth ?? 0}
              </span>
              joined this month
            </>
          }
        />
        <StatCard
          label="Revenue this month"
          value={loading && !stats ? '-' : money(stats?.monthRevenue ?? 0)}
          onClick={() => navigate('/payments')}
          foot={
            <>
              <span className={`delta ${(stats?.revenueChangePct ?? 0) >= 0 ? 'up' : 'down'}`}>
                {(stats?.revenueChangePct ?? 0) >= 0 ? '+' : ''}
                {stats?.revenueChangePct ?? 0}%
              </span>
              vs last month
            </>
          }
        />
        <StatCard
          label="Check-ins today"
          value={loading && !stats ? '-' : (stats?.todayCheckins ?? 0).toLocaleString()}
          onClick={() => navigate('/attendance')}
          foot={<>{stats?.insideNow ?? 0} currently in the gym</>}
        />
        <StatCard
          label={`Expiring in ${settings.alertLeadDays} days`}
          value={loading && !stats ? '-' : (stats?.expiringSoon ?? 0).toLocaleString()}
          onClick={() => navigate('/subscriptions')}
          foot={<>Memberships needing a renewal</>}
        />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Revenue trend</div>
              <div className="card-sub">Collected payments over the last 12 months</div>
            </div>
            <Badge tone="success" dot={false}>
              {money(stats?.monthRevenue ?? 0)} this month
            </Badge>
          </div>
          <div className="card-body">
            {loading && !stats ? (
              <div className="skeleton" style={{ height: 240 }} />
            ) : (
              <AreaChart
                data={(stats?.revenueSeries ?? []).map((point) => ({ label: point.label, value: point.value }))}
                height={248}
                formatValue={(value) => formatCompact(value, settings.currencySymbol)}
              />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Membership mix</div>
              <div className="card-sub">All registered members</div>
            </div>
          </div>
          <div className="card-body">
            <Donut
              segments={segments}
              centerValue={(stats?.totalMembers ?? 0).toLocaleString()}
              centerLabel="members"
            />
            <div className="divider" style={{ margin: '14px 0 8px' }} />
            <div className="summary-row">
              <span>Total members</span>
              <strong>{stats?.totalMembers ?? 0}</strong>
            </div>
            <div className="summary-row">
              <span>Expired memberships</span>
              <strong>{stats?.expiredMembers ?? 0}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="dash-grid dash-grid-equal">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Expiring soon</div>
              <div className="card-sub">Next {settings.alertLeadDays} days</div>
            </div>
            <Link to="/subscriptions" className="link-btn">
              View all
            </Link>
          </div>
          {stats?.expiringList.length ? (
            <div className="list">
              {stats.expiringList.map((member) => {
                const meta = statusMeta(MEMBERSHIP_STATUS, 'expiring');
                return (
                  <Link className="list-row" key={member.id} to={`/members/${member.id}`}>
                    <Avatar first={member.firstName} last={member.lastName} src={member.photoUrl} size={36} />
                    <div className="list-main">
                      <div className="list-title">
                        {member.firstName} {member.lastName}
                      </div>
                      <div className="list-sub">
                        {member.planName} · {member.memberCode}
                      </div>
                    </div>
                    <div className="list-meta">
                      <Badge tone={meta.tone}>{member.daysLeft === 1 ? 'Tomorrow' : `${member.daysLeft} days`}</Badge>
                      <span>{formatShortDate(member.endDate)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No renewals due"
              message={`No memberships expire in the next ${settings.alertLeadDays} days.`}
            />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Recent payments</div>
              <div className="card-sub">Latest transactions</div>
            </div>
            <Link to="/payments" className="link-btn">
              View all
            </Link>
          </div>
          {stats?.recentPayments.length ? (
            <div className="list">
              {stats.recentPayments.map((payment) => (
                <Link className="list-row" key={payment.id} to="/payments">
                  <div className="list-main">
                    <div className="list-title">
                      {payment.firstName} {payment.lastName}
                    </div>
                    <div className="list-sub">
                      {PAYMENT_METHOD[payment.method] ?? payment.method} · {payment.invoiceNo}
                    </div>
                  </div>
                  <div className="list-meta">
                    <strong>{formatMoney(payment.amount, settings.currencySymbol)}</strong>
                    <span>{formatShortDate(payment.paidAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No payments yet" message="Payments will appear here as they are recorded." />
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Newest members</div>
            <div className="card-sub">Registrations from the last few days</div>
          </div>
          <Link to="/members?new=1" className="btn btn-soft btn-sm">
            Add member
          </Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Joined</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(stats?.recentMembers ?? []).map((member) => (
                <tr key={member.id} className="clickable" onClick={() => navigate(`/members/${member.id}`)}>
                  <td>
                    <div className="member-cell">
                      <Avatar first={member.firstName} last={member.lastName} src={member.photoUrl} size={34} />
                      <div className="member-cell-text">
                        <strong>
                          {member.firstName} {member.lastName}
                        </strong>
                        <span>{member.memberCode}</span>
                      </div>
                    </div>
                  </td>
                  <td>{member.planName ?? <span className="muted">No plan yet</span>}</td>
                  <td>{formatShortDate(member.joinDate)}</td>
                  <td>
                    <Badge tone={member.planName ? 'success' : 'muted'}>{member.planName ? 'Registered' : 'Lead'}</Badge>
                  </td>
                  <td className="text-right">
                    
                  </td>
                </tr>
              ))}
              {!stats?.recentMembers.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="picker-empty">No members registered yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="small muted" style={{ marginTop: 14 }}>
        Data as of {formatShortDate(todayInput())}. Expiry alerts refresh automatically every night at 00:05.
      </p>
    </>
  );
}
