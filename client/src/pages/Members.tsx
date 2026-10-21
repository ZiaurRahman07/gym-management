import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/endpoints';
import type { Member } from '../api/types';
import { MemberFormModal } from '../components/MemberFormModal';
import { Avatar, Badge, EmptyState, PageHead, Pagination, SearchInput } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { useDebounced, useFetch } from '../hooks/useFetch';
import { daysLabel, formatDate } from '../lib/format';
import { MEMBERSHIP_STATUS, statusMeta } from '../lib/status';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All memberships' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring ≤ 7 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'none', label: 'No plan' },
  { value: 'inactive', label: 'Inactive members' },
];

export function Members() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { settings } = useSettings();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const debouncedQ = useDebounced(q, 300);
  const [filter, setFilter] = useState(searchParams.get('status') ?? 'all');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [openNew, setOpenNew] = useState(searchParams.get('new') === '1');

  const statusParam = filter === 'expiring' || filter === 'all' ? '' : filter;

  const { data, loading, error, reload } = useFetch(
    () =>
      api.members.list({
        q: debouncedQ,
        status: statusParam,
        expiringIn: filter === 'expiring' ? settings.alertLeadDays : undefined,
        sort,
        page,
        limit: 12,
      }),
    [debouncedQ, filter, sort, page, settings.alertLeadDays],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filter, sort]);

  const closeNew = () => {
    setOpenNew(false);
    if (searchParams.has('new')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  };

  const members: Member[] = data?.data ?? [];

  return (
    <>
      <PageHead
        title="Members"
        subtitle="Search the roster, start memberships and keep contact details current."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setOpenNew(true)}>
            Add member
          </button>
        }
      />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      <section className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, code, phone or email…" />
          <div className="toolbar-right">
            <select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value === 'expiring' ? `Expiring ≤ ${settings.alertLeadDays} days` : option.label}
                </option>
              ))}
            </select>
            <select className="filter-select" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="recent">Newest first</option>
              <option value="name">Name A-Z</option>
              <option value="expiry">Expiry soonest</option>
              <option value="oldest">Oldest members</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Contact</th>
                <th>Plan</th>
                <th>Expiry</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && members.length === 0
                ? Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={6}>
                        <div className="skeleton" style={{ height: 22 }} />
                      </td>
                    </tr>
                  ))
                : members.map((member) => {
                    const meta = statusMeta(MEMBERSHIP_STATUS, member.membershipStatus);
                    const expiringSoon =
                      member.membershipStatus === 'active' &&
                      member.daysLeft !== null &&
                      member.daysLeft <= settings.alertLeadDays;
                    const displayMeta = expiringSoon ? MEMBERSHIP_STATUS.expiring : meta;
                    return (
                      <tr key={member.id} className="clickable" onClick={() => navigate(`/members/${member.id}`)}>
                        <td>
                          <div className="member-cell">
                            <Avatar first={member.firstName} last={member.lastName} src={member.photoUrl} size={36} />
                            <div className="member-cell-text">
                              <strong>
                                {member.firstName} {member.lastName}
                              </strong>
                              <span>{member.memberCode}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {member.phone}
                          <span className="cell-sub">{member.email ?? 'No email'}</span>
                        </td>
                        <td>{member.planName ?? <span className="muted">No plan</span>}</td>
                        <td>
                          {member.subscriptionEnd ? (
                            <>
                              <span className="nowrap">{formatDate(member.subscriptionEnd)}</span>
                              <span className="cell-sub">
                                {member.membershipStatus === 'active' || member.membershipStatus === 'expired'
                                  ? daysLabel(member.daysLeft)
                                  : member.subscriptionStatus}
                              </span>
                            </>
                          ) : (
                            <span className="muted">No expiry</span>
                          )}
                        </td>
                        <td>
                          <Badge tone={displayMeta.tone}>{displayMeta.label}</Badge>
                        </td>
                        <td className="text-right">
                          <span className="row-arrow">View</span>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {!loading && members.length === 0 && (
          <EmptyState
            title="No members found"
            message={q ? `Nothing matches “${q}”. Try a different search.` : 'Register the first member to get started.'}
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpenNew(true)}>
                Add member
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

      <MemberFormModal
        open={openNew}
        onClose={closeNew}
        onSaved={(message) => {
          toast(message);
          reload();
        }}
      />
    </>
  );
}
