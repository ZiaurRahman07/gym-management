import { useState } from 'react';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { ReportAttendance, ReportMembers, ReportRevenue, ReportTrainers } from '../api/types';
import { AreaChart, BarChart } from '../components/Charts';
import { Badge, PageHead, StatCard, Tabs } from '../components/ui';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import {
  formatCompact,
  formatMonthLabel,
  formatMoney,
  formatShortDate,
  monthStartInput,
  todayInput,
} from '../lib/format';
import { PAYMENT_METHOD } from '../lib/status';

type TabKey = 'revenue' | 'members' | 'attendance' | 'trainers';
type GroupBy = 'day' | 'month' | 'plan' | 'method';

export function Reports() {
  const { settings, money } = useSettings();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>('revenue');
  const [from, setFrom] = useState(monthStartInput());
  const [to, setTo] = useState(todayInput());
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [exporting, setExporting] = useState(false);

  type Bundle = { tab: TabKey; data: ReportRevenue | ReportMembers | ReportAttendance | ReportTrainers };
  const { data, loading, error } = useFetch<Bundle>(async () => {
    const response = await api.reports.get<ReportRevenue | ReportMembers | ReportAttendance | ReportTrainers>(tab, {
      from,
      to,
      groupBy,
    });
    return { tab, data: response.data };
  }, [tab, from, to, groupBy]);

  const report = data && data.tab === tab ? data.data : null;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.reports.download(tab, { from, to, groupBy });
      toast('Report downloaded.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHead
        title="Reports"
        subtitle="Revenue, membership growth, attendance patterns and trainer performance."
        actions={
          <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={exporting}>
            {exporting ? <span className="spinner" /> : null}
            Export CSV
          </button>
        }
      />

      <section className="card" style={{ marginBottom: 18 }}>
        <Tabs
          value={tab}
          onChange={(key) => setTab(key)}
          tabs={[
            { key: 'revenue', label: 'Revenue' },
            { key: 'members', label: 'Memberships' },
            { key: 'attendance', label: 'Attendance' },
            { key: 'trainers', label: 'Trainers' },
          ]}
        />
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <div className="chip-row">
            <span className="muted small">Period</span>
            <input type="date" className="filter-select" value={from} onChange={(event) => setFrom(event.target.value)} />
            <span className="muted small">to</span>
            <input type="date" className="filter-select" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          {tab === 'revenue' && (
            <div className="toolbar-right">
              <span className="muted small">Group by</span>
              <select
                className="filter-select"
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as GroupBy)}
              >
                <option value="day">Day</option>
                <option value="month">Month</option>
                <option value="plan">Plan</option>
                <option value="method">Payment method</option>
              </select>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      {!report && loading && (
        <>
          <div className="stat-grid stat-grid-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="skeleton" key={index} style={{ height: 96 }} />
            ))}
          </div>
          <div className="skeleton" style={{ height: 320 }} />
        </>
      )}

      {report && tab === 'revenue' && (
        <RevenueView report={report as ReportRevenue} groupBy={groupBy} />
      )}
      {report && tab === 'members' && <MembersView report={report as ReportMembers} />}
      {report && tab === 'attendance' && <AttendanceView report={report as ReportAttendance} />}
      {report && tab === 'trainers' && <TrainersView report={report as ReportTrainers} />}

      <p className="small muted" style={{ marginTop: 16 }}>
        Reports cover {formatShortDate(from)} to {formatShortDate(to)} · currency {settings.currencyCode} · times shown
        in your local timezone.
      </p>
    </>
  );

  function RevenueView({ report: data, groupBy: group }: { report: ReportRevenue; groupBy: GroupBy }) {
    const formatLabel = (value: string) =>
      group === 'month' ? formatMonthLabel(value) : group === 'day' ? formatShortDate(value) : value;
    const chartData = data.series.map((row) => ({ label: row.label, value: row.value }));

    return (
      <>
        <div className="stat-grid stat-grid-3">
          <StatCard label="Total collected" value={money(data.total)} foot={`${data.count} payments`} />
          <StatCard
            label="Average payment"
            value={money(data.count ? data.total / data.count : 0)}
          />
          <StatCard
            label="Top payment method"
            value={data.byMethod[0] ? (PAYMENT_METHOD[data.byMethod[0].label] ?? data.byMethod[0].label) : '-'}
            foot={data.byMethod[0] ? money(data.byMethod[0].value) : undefined}
          />
        </div>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div>
              <div className="card-title">Revenue by {group}</div>
              <div className="card-sub">Paid transactions only</div>
            </div>
            <Badge tone="success" dot={false}>
              {money(data.total)}
            </Badge>
          </div>
          <div className="card-body">
            {group === 'plan' || group === 'method' ? (
              <BarChart
                data={chartData}
                height={260}
                formatValue={(value) => formatCompact(value, settings.currencySymbol)}
                formatLabel={formatLabel}
              />
            ) : (
              <AreaChart
                data={chartData}
                height={260}
                formatValue={(value) => formatCompact(value, settings.currencySymbol)}
                formatLabel={formatLabel}
              />
            )}
          </div>
        </section>

        <div className="two-col">
          <section className="card">
            <div className="card-head">
              <div className="card-title">By payment method</div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Share</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byMethod.map((row) => (
                    <tr key={row.label}>
                      <td>{PAYMENT_METHOD[row.label] ?? row.label}</td>
                      <td style={{ minWidth: 120 }}>
                        <div className="progress">
                          <div
                            className="progress-fill"
                            style={{ width: `${data.total ? (row.value / data.total) * 100 : 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="num">{money(row.value)}</td>
                    </tr>
                  ))}
                  {data.byMethod.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No payments in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div className="card-title">By plan</div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="num">Payments</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPlan.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className="num">{row.count}</td>
                      <td className="num">{money(row.value)}</td>
                    </tr>
                  ))}
                  {data.byPlan.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No payments in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </>
    );
  }

  function MembersView({ report: data }: { report: ReportMembers }) {
    return (
      <>
        <div className="stat-grid">
          <StatCard label="New members" value={data.newMembers} foot="Joined in this period" />
          <StatCard label="Active members" value={data.activeNow} foot="Current memberships" />
          <StatCard label="Expiring in 7 days" value={data.expiring} />
          <StatCard label="Churned members" value={data.churned} foot="No active membership" />
        </div>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div>
              <div className="card-title">New memberships</div>
              <div className="card-sub">Registrations per month</div>
            </div>
          </div>
          <div className="card-body">
            <BarChart
              data={data.series.map((row) => ({ label: row.label, value: row.value }))}
              height={250}
              formatLabel={formatMonthLabel}
            />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">Membership snapshot</div>
          </div>
          <div className="card-body">
            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">Total registered</div>
                <div className="metric-large">{data.totalMembers}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Memberships expired in period</div>
                <div className="metric-large">{data.expiredInPeriod}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">New joins in period</div>
                <div className="metric-large">{data.newMembers}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Currently expiring</div>
                <div className="metric-large">{data.expiring}</div>
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  function AttendanceView({ report: data }: { report: ReportAttendance }) {
    const peak = [...data.peakHours].sort((a, b) => b.value - a.value)[0];
    const peakLabel = peak ? new Date(2024, 0, 1, peak.hour).toLocaleTimeString('en-US', { hour: 'numeric' }) : '-';

    return (
      <>
        <div className="stat-grid stat-grid-3">
          <StatCard label="Total check-ins" value={data.totalVisits} />
          <StatCard label="Unique members" value={data.uniqueMembers} />
          <StatCard
            label="Average visit"
            value={data.avgDurationMinutes ? `${data.avgDurationMinutes} min` : '-'}
            foot={peak ? `Peak hour ${peakLabel}` : undefined}
          />
        </div>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div>
              <div className="card-title">Daily check-ins</div>
              <div className="card-sub">Visits recorded in the selected period</div>
            </div>
          </div>
          <div className="card-body">
            <BarChart
              data={data.series.map((row) => ({ label: row.label, value: row.value }))}
              height={250}
              formatLabel={formatShortDate}
              color="#3b82f6"
            />
          </div>
        </section>

        <div className="two-col">
          <section className="card">
            <div className="card-head">
              <div className="card-title">Busiest hours</div>
            </div>
            <div className="card-body">
              <BarChart
                data={data.peakHours.map((row) => ({
                  label: new Date(2024, 0, 1, row.hour).toLocaleTimeString('en-US', { hour: 'numeric' }),
                  value: row.value,
                }))}
                height={220}
                color="#145c4a"
              />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div className="card-title">Daily breakdown</div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Check-ins</th>
                    <th className="num">Unique members</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((row) => (
                    <tr key={row.label}>
                      <td>{formatShortDate(row.label)}</td>
                      <td className="num">{row.value}</td>
                      <td className="num">{row.uniqueMembers}</td>
                    </tr>
                  ))}
                  {data.series.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No attendance in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </>
    );
  }

  function TrainersView({ report: data }: { report: ReportTrainers }) {
    return (
      <>
        <div className="stat-grid stat-grid-3">
          <StatCard label="Active trainers" value={data.trainers.length} />
          <StatCard label="Assigned members" value={data.totalAssigned} />
          <StatCard label="Roster check-ins" value={data.totalVisits} />
        </div>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Trainer activity</div>
              <div className="card-sub">Assigned members and their check-ins in this period</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Trainer</th>
                  <th>Specialization</th>
                  <th className="num">Assigned</th>
                  <th className="num">Member visits</th>
                </tr>
              </thead>
              <tbody>
                {data.trainers.map((trainer) => (
                  <tr key={trainer.id}>
                    <td>
                      <strong>{trainer.name}</strong>
                    </td>
                    <td>{trainer.specialization ?? '-'}</td>
                    <td className="num">{trainer.assignedMembers}</td>
                    <td className="num">{trainer.visits}</td>
                  </tr>
                ))}
                {data.trainers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No active trainers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }
}
