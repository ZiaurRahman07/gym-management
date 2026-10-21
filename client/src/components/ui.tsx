import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { avatarTone, initials } from '../lib/format';
import type { Tone } from '../lib/status';

export function Avatar({
  first,
  last,
  src,
  size = 40,
  className = '',
}: {
  first: string;
  last: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const name = `${first} ${last}`;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`avatar avatar-image ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`avatar tone-${avatarTone(name)} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}
      aria-hidden="true"
    >
      {initials(first, last)}
    </span>
  );
}

export function Badge({ tone = 'muted', children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'violet',
  foot,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  tone?: string;
  foot?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className={`stat-card ${onClick ? 'stat-clickable' : ''}`} onClick={onClick}>
      <div className={`stat-icon tone-${tone}`}>
        <Icon name={icon} size={19} />
      </div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {foot && <div className="stat-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function PageHead({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon = 'members',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="loading-block">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton" style={{ height: 46, opacity: 1 - index * 0.14 }} />
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`search-input ${className}`}>
      <Icon name="search" size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="pagination">
      <span className="muted small">
        {total.toLocaleString()} {total === 1 ? 'record' : 'records'}
      </span>
      <div className="pagination-controls">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevronLeft" size={15} />
          Previous
        </button>
        <span className="page-indicator">
          {page} / {Math.max(1, totalPages)}
        </span>
        <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={tab.key === value}
          className={`tab ${tab.key === value ? 'active' : ''}`}
          onClick={() => onChange(tab.key)}
          type="button"
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  className = '',
  htmlFor,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
