import { useEffect, useRef, useState } from 'react';
import { api } from '../api/endpoints';
import type { Member } from '../api/types';
import { useDebounced } from '../hooks/useFetch';
import { Avatar } from './ui';
import { Icon } from './Icon';
import { statusMeta, MEMBERSHIP_STATUS } from '../lib/status';

export function MemberPicker({
  value,
  onChange,
  placeholder = 'Search by name, code or phone…',
  autoFocus = false,
}: {
  value: Member | null;
  onChange: (member: Member | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 250);
  const [results, setResults] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    api.members
      .list({ q: debounced, limit: 8 })
      .then((response) => {
        if (active) setResults(response.data);
      })
      .catch(() => {
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debounced, open]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (value) {
    return (
      <div className="picker-selected">
        <Avatar first={value.firstName} last={value.lastName} src={value.photoUrl} size={38} />
        <div className="picker-selected-info">
          <span className="picker-name">
            {value.firstName} {value.lastName}
          </span>
          <span className="picker-meta">
            {value.memberCode} · {value.phone}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={() => onChange(null)} aria-label="Change member">
          <Icon name="close" size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="picker" ref={containerRef}>
      <div className="picker-input">
        <Icon name="search" size={15} />
        <input
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {loading && <span className="spinner" />}
      </div>
      {open && (
        <div className="picker-menu">
          {results.length === 0 && !loading ? (
            <div className="picker-empty">No members found.</div>
          ) : (
            results.map((member) => {
              const meta = statusMeta(MEMBERSHIP_STATUS, member.membershipStatus);
              return (
                <button
                  type="button"
                  key={member.id}
                  className="picker-option"
                  onClick={() => {
                    onChange(member);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  <Avatar first={member.firstName} last={member.lastName} src={member.photoUrl} size={34} />
                  <span className="picker-option-main">
                    <span className="picker-name">
                      {member.firstName} {member.lastName}
                    </span>
                    <span className="picker-meta">
                      {member.memberCode} · {member.planName ?? 'No plan'}
                    </span>
                  </span>
                  <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
