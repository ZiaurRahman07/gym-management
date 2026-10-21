export function formatMoney(value: number | string | null | undefined, symbol = '$'): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return `${symbol}0`;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
  return `${symbol}${formatted}`;
}

export function formatCompact(value: number | string | null | undefined, symbol = '$'): string {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 1000) {
    return `${symbol}${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k`;
  }
  return formatMoney(amount, symbol);
}

function parse(value: string): Date {
  if (value.includes('T')) return new Date(value);
  if (value.length === 10) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value.replace(' ', 'T'));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return parse(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '-';
  return parse(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '-';
  return parse(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function formatMonthLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [y, m] = value.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function todayInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function monthStartInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export function nowInput(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function daysLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return '-';
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}

export function initials(first: string, last: string): string {
  return `${(first[0] ?? '').toUpperCase()}${(last[0] ?? '').toUpperCase()}`;
}

const TONES = ['blue', 'teal', 'amber', 'rose', 'info'];

export function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return TONES[hash % TONES.length];
}

export function greeting(timeZone?: string): string {
  let hour = new Date().getHours();
  if (timeZone) {
    try {
      hour = Number(
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date()),
      );
    } catch {
      /* keep the browser hour if the timezone is not recognised */
    }
  }
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
