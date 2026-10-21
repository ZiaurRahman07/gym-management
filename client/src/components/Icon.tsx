import type { SVGProps } from 'react';

export type IconName =
  | 'dashboard'
  | 'members'
  | 'plans'
  | 'memberships'
  | 'payments'
  | 'attendance'
  | 'trainers'
  | 'reports'
  | 'settings'
  | 'bell'
  | 'plus'
  | 'search'
  | 'logout'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'edit'
  | 'trash'
  | 'download'
  | 'close'
  | 'check'
  | 'clock'
  | 'money'
  | 'alert'
  | 'phone'
  | 'mail'
  | 'menu'
  | 'user'
  | 'lock'
  | 'refresh'
  | 'printer'
  | 'tag'
  | 'activity'
  | 'arrowLeft'
  | 'arrowUpRight'
  | 'filter'
  | 'calendar'
  | 'play'
  | 'snow'
  | 'power'
  | 'dumbbell'
  | 'shield';

const paths: Record<IconName, JSX.Element> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </>
  ),
  members: (
    <>
      <path d="M16 21v-1.8a4 4 0 0 0-4-4H6.5a4 4 0 0 0-4 4V21" />
      <circle cx="9.3" cy="7.4" r="3.8" />
      <path d="M21.5 21v-1.8a4 4 0 0 0-3-3.85" />
      <path d="M16.2 3.3a3.8 3.8 0 0 1 0 7.4" />
    </>
  ),
  plans: (
    <>
      <path d="M20.6 13.3 12.4 21.5a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8L10.7 3.4a2 2 0 0 1 1.4-.6h5.3a2 2 0 0 1 2 2v5.3a2 2 0 0 1-.6 1.4Z" />
      <circle cx="16" cy="8" r="1.4" />
    </>
  ),
  memberships: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h4" />
    </>
  ),
  payments: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  attendance: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  trainers: (
    <>
      <path d="M6.5 6.5v11M3 8.5v7M17.5 6.5v11M21 8.5v7M6.5 12h11" />
    </>
  ),
  reports: (
    <>
      <path d="M3.5 3.5v17h17" />
      <path d="M7.5 15.5 11.5 10l3 2.8 4.5-6" />
      <circle cx="19" cy="6.8" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5" />
      <path d="m15.5 16.5 4.5-4.5-4.5-4.5" />
      <path d="M20 12H9" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v3.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V15" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M12 3v12" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m4.5 12.5 5 5L20 6.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5M12 17.2v.1" />
    </>
  ),
  phone: <path d="M6.3 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.3 5.2 2 2 0 0 1 6.3 3Z" />,
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="m3.5 6 8.5 6 8.5-6" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21v-1.5a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5V21" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3.5V9h-5.5" />
    </>
  ),
  printer: (
    <>
      <path d="M6.5 9V3.5h11V9" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6.5 14.5h11v6h-11z" />
    </>
  ),
  tag: (
    <>
      <path d="M12 2.5H5a2.5 2.5 0 0 0-2.5 2.5v7L12 21.5 21.5 12 12 2.5Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  activity: <path d="M2 12h4l2.5-7 5 14 2.5-7h6" />,
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>
  ),
  arrowUpRight: (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  play: <path d="M7 4.5 19 12 7 19.5v-15Z" />,
  snow: (
    <>
      <path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5l-15.6 11" />
      <path d="m9 4.5 3 3 3-3M9 19.5l3-3 3 3" />
    </>
  ),
  power: (
    <>
      <path d="M12 3v9" />
      <path d="M6.4 6.4a8 8 0 1 0 11.2 0" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M6.5 6.5v11M3 8.5v7M17.5 6.5v11M21 8.5v7M6.5 12h11" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 4.5 5.5v6c0 4.5 3 8 7.5 10 4.5-2 7.5-5.5 7.5-10v-6L12 2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
};

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 18, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
