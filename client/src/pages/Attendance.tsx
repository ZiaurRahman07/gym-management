import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Member } from '../api/types';
import { MemberPicker } from '../components/MemberPicker';
import { Avatar, Badge, EmptyState, PageHead, Pagination, SearchInput, StatCard } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { formatDate, formatTime, todayInput } from '../lib/format';
import { MEMBERSHIP_STATUS, statusMeta } from '../lib/status';

function durationLabel(checkIn: string, checkOut: string | null): string {
  if (!checkOut) return 'In gym';
  const start = new Date(checkIn.replace(' ', 'T')).getTime();
  const end = new Date(checkOut.replace(' ', 'T')).getTime();
  const minutes = Math.max(1, Math.round((end - start) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function Attendance() {
  const { toast } = useToast();
  const today = useFetch(() => api.attendance.today(), []);
  const [member, setMember] = useState<Member | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const [historyDate, setHistoryDate] = useState(todayInput());
  const [historyQ, setHistoryQ] = useState('');
  const debouncedQ = useDebounced(historyQ, 300);
  const [page, setPage] = useState(1);
  const history = useFetch(
    () => api.attendance.list({ date: historyDate, q: debouncedQ, page, limit: 10 }),
    [historyDate, debouncedQ, page],
  );

  useEffect(() => {
    setPage(1);
  }, [historyDate, debouncedQ]);

  const todayData = today.data?.data;
  const inside = todayData?.inside ?? [];
  const recent = todayData?.recent ?? [];

  const peakHour = (() => {
    if (!recent.length) return 'No visits';
    const counts = new Map<number, number>();
    for (const record of recent) {
      const hour = new Date(record.checkInAt.replace(' ', 'T')).getHours();
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    }
    const [hour] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0];
    return new Date(2024, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' });
  })();

  const checkIn = async () => {
    if (!member) return;
    setCheckingIn(true);
    try {
      await api.attendance.checkIn(member.id);
      toast(`${member.firstName} ${member.lastName} checked in.`);
      setMember(null);
      today.reload();
      history.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Check-in failed.', 'error');
    } finally {
      setCheckingIn(false);
    }
  };

  const checkOut = async (id: number) => {
    try {
      await api.attendance.checkOut(id);
      toast('Visit closed.');
      today.reload();
      history.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to check out.', 'error');
    }
  };

  const memberMeta = member ? statusMeta(MEMBERSHIP_STATUS, member.membershipStatus) : null;

  return (
    <>
      <PageHead
        title="Attendance"
        subtitle="Check members in, watch the floor and review visit history."
        actions={
          <button type="button" className="btn btn-outline" onClick={() => today.reload()}>
            Refresh
          </button>
        }
      />

      <div className="stat-grid stat-grid-3">
        <StatCard label="Check-ins today" value={today.loading ? '...' : (todayData?.todayCount ?? 0)} />
        <StatCard label="Currently in the gym" value={today.loading ? '...' : (todayData?.insideCount ?? 0)} />
        <StatCard label="Busiest hour" value={peakHour} foot="Based on today's check-ins" />
      </div>

      <div className="two-col">
        <section className="card card-pad">
          <div className="card-title">Quick check-in</div>
          <div className="card-sub" style={{ marginBottom: 16 }}>
            Search for a member and confirm their membership.
          </div>

          <MemberPicker value={member} onChange={setMember} />

          {member && (
            <div className="checkin-preview">
              <Avatar first={member.firstName} last={member.lastName} src={member.photoUrl} size={42} />
              <div className="grow">
                <div className="list-title">
                  {member.firstName} {member.lastName}
                </div>
                <div className="list-sub">
                  {member.planName ?? 'No plan'} {member.subscriptionEnd ? `· expires ${formatDate(member.subscriptionEnd)}` : ''}
                </div>
              </div>
              {memberMeta && <Badge tone={memberMeta.tone}>{memberMeta.label}</Badge>}
            </div>
          )}

          {member && member.membershipStatus !== 'active' && (
            <div className="alert alert-warning" style={{ marginTop: 12 }}>
              <span>
                This member's membership is {memberMeta?.label.toLowerCase()}. Renew it before checking in. Expired
                entries are rejected unless your gym allows them in Settings.
              </span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 14, height: 42 }}
            disabled={!member || checkingIn}
            onClick={checkIn}
          >
            {checkingIn ? <span className="spinner" /> : null}
            Check in member
          </button>

          <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
            Need to register someone first?{' '}
            <Link to="/members?new=1" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Add a member
            </Link>
          </p>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Currently in the gym</div>
              <div className="card-sub">{inside.length} open visits</div>
            </div>
            <Badge tone={inside.length ? 'success' : 'muted'}>{inside.length ? 'Live' : 'Empty'}</Badge>
          </div>
          {inside.length === 0 ? (
            <EmptyState title="Nobody is in yet" message="Check-ins will appear here in real time." />
          ) : (
            <div className="list" style={{ maxHeight: 330, overflowY: 'auto' }}>
              {inside.map((record) => (
                <div className="list-row" key={record.id}>
                  <Avatar first={record.firstName} last={record.lastName} src={record.photoUrl} size={36} />
                  <div className="list-main">
                    <div className="list-title">
                      {record.firstName} {record.lastName}
                    </div>
                    <div className="list-sub">
                      In since {formatTime(record.checkInAt)} · {durationLabel(record.checkInAt, null)}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => checkOut(record.id)}>
                    Check out
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Today's activity</div>
            <div className="card-sub">{recent.length} visits recorded today</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Check in</th>
                <th>Check out</th>
                <th>Duration</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((record) => (
                <tr key={record.id}>
                  <td>
                    <Link to={`/members/${record.memberId}`} className="member-cell">
                      <Avatar first={record.firstName} last={record.lastName} src={record.photoUrl} size={32} />
                      <div className="member-cell-text">
                        <strong>
                          {record.firstName} {record.lastName}
                        </strong>
                        <span>{record.memberCode}</span>
                      </div>
                    </Link>
                  </td>
                  <td className="nowrap">{formatTime(record.checkInAt)}</td>
                  <td className="nowrap">
                    {record.checkOutAt ? formatTime(record.checkOutAt) : <Badge tone="success">In gym</Badge>}
                  </td>
                  <td>{durationLabel(record.checkInAt, record.checkOutAt)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{record.method}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="No check-ins today" message="Start with the quick check-in above." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="toolbar">
          <div>
            <div className="card-title">Attendance history</div>
            <div className="card-sub">Search past visits by member</div>
          </div>
          <div className="toolbar-right">
            <SearchInput value={historyQ} onChange={setHistoryQ} placeholder="Member name or code…" />
            <input
              type="date"
              className="filter-select"
              value={historyDate}
              onChange={(event) => setHistoryDate(event.target.value)}
            />
            {historyDate && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHistoryDate('')}>
                All time
              </button>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Member</th>
                <th>Check in</th>
                <th>Check out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {(history.data?.data ?? []).map((record) => (
                <tr key={record.id}>
                  <td className="nowrap">{formatDate(record.checkInAt)}</td>
                  <td>
                    <Link to={`/members/${record.memberId}`} className="member-cell">
                      <Avatar first={record.firstName} last={record.lastName} src={record.photoUrl} size={30} />
                      <div className="member-cell-text">
                        <strong>
                          {record.firstName} {record.lastName}
                        </strong>
                        <span>{record.memberCode}</span>
                      </div>
                    </Link>
                  </td>
                  <td>{formatTime(record.checkInAt)}</td>
                  <td>{record.checkOutAt ? formatTime(record.checkOutAt) : <Badge tone="success">Open</Badge>}</td>
                  <td>{durationLabel(record.checkInAt, record.checkOutAt)}</td>
                </tr>
              ))}
              {!history.loading && (history.data?.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="No visits found" message="Try a different date or search term." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {history.data && history.data.total > 0 && (
          <div className="table-foot">
            <Pagination
              page={history.data.page}
              totalPages={history.data.totalPages}
              total={history.data.total}
              onPage={setPage}
            />
          </div>
        )}
      </section>
    </>
  );
}
