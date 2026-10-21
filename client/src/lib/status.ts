import type { MembershipStatus } from '../api/types';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

type StatusMeta = { label: string; tone: Tone };

export const MEMBERSHIP_STATUS: Record<MembershipStatus, StatusMeta> = {
  active: { label: 'Active', tone: 'success' },
  expiring: { label: 'Expiring soon', tone: 'warning' },
  expired: { label: 'Expired', tone: 'danger' },
  frozen: { label: 'Frozen', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  none: { label: 'No plan', tone: 'muted' },
  inactive: { label: 'Inactive', tone: 'muted' },
  blocked: { label: 'Blocked', tone: 'danger' },
};

export const SUBSCRIPTION_STATUS: Record<string, StatusMeta> = {
  active: { label: 'Active', tone: 'success' },
  expired: { label: 'Expired', tone: 'danger' },
  frozen: { label: 'Frozen', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const PAYMENT_STATUS: Record<string, StatusMeta> = {
  paid: { label: 'Paid', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  refunded: { label: 'Refunded', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const PAYMENT_METHOD: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  bank: 'Bank transfer',
  online: 'Online',
};

export const MEMBER_STATUS: Record<string, StatusMeta> = {
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'muted' },
  blocked: { label: 'Blocked', tone: 'danger' },
};

export const TRAINER_STATUS: Record<string, StatusMeta> = {
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'muted' },
};

export function statusMeta(map: Record<string, StatusMeta>, key: string | null | undefined): StatusMeta {
  if (!key) return { label: 'Unknown', tone: 'muted' };
  return map[key] ?? { label: key.replace(/_/g, ' '), tone: 'muted' };
}

export const TONE_COLORS: Record<Tone, string> = {
  success: '#2e7d5b',
  warning: '#a96a12',
  danger: '#a6403a',
  info: '#2f6288',
  muted: '#8c948f',
};
