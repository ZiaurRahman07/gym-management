import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/endpoints';
import type { Notification } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Icon, type IconName } from './Icon';
import { Avatar } from './ui';
import { roleLabel } from '../lib/format';

type NavItem = { to: string; label: string; icon: IconName; roles: string[]; end?: boolean };

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'receptionist', 'trainer'], end: true },
      { to: '/members', label: 'Members', icon: 'members', roles: ['admin', 'receptionist', 'trainer'] },
      { to: '/subscriptions', label: 'Memberships', icon: 'memberships', roles: ['admin', 'receptionist'] },
      { to: '/payments', label: 'Payments', icon: 'payments', roles: ['admin', 'receptionist'] },
      { to: '/attendance', label: 'Attendance', icon: 'attendance', roles: ['admin', 'receptionist', 'trainer'] },
      { to: '/trainers', label: 'Trainers', icon: 'trainers', roles: ['admin', 'receptionist', 'trainer'] },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/plans', label: 'Plans', icon: 'plans', roles: ['admin', 'receptionist'] },
      { to: '/reports', label: 'Reports', icon: 'reports', roles: ['admin', 'receptionist'] },
      { to: '/settings', label: 'Settings', icon: 'settings', roles: ['admin'] },
    ],
  },
];

const TITLES: { match: (path: string) => boolean; title: string; sub: string }[] = [
  { match: (path) => path === '/', title: 'Dashboard', sub: 'Today at a glance' },
  { match: (path) => path === '/members', title: 'Members', sub: 'Registration, plans and profiles' },
  { match: (path) => path.startsWith('/members/'), title: 'Member profile', sub: 'Membership, payments and visits' },
  { match: (path) => path === '/subscriptions', title: 'Memberships', sub: 'Active plans, renewals and freezes' },
  { match: (path) => path === '/payments', title: 'Payments', sub: 'Invoices, receipts and refunds' },
  { match: (path) => path === '/attendance', title: 'Attendance', sub: 'Check-ins and gym activity' },
  { match: (path) => path === '/trainers', title: 'Trainers', sub: 'Roster and member assignments' },
  { match: (path) => path === '/plans', title: 'Plans', sub: 'Membership products and pricing' },
  { match: (path) => path === '/reports', title: 'Reports', sub: 'Revenue, memberships and attendance' },
  { match: (path) => path === '/settings', title: 'Settings', sub: 'Gym profile and team access' },
];

function timeAgo(value: string): string {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Layout() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<'bell' | 'user' | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const actionsRef = useRef<HTMLDivElement>(null);

  const current = TITLES.find((entry) => entry.match(location.pathname));

  useEffect(() => {
    setMobileOpen(false);
    setMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () => {
      api.notifications
        .list()
        .then((response) => {
          if (!active) return;
          setNotifications(response.data);
          setUnread(response.unread);
        })
        .catch(() => undefined);
    };
    load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user, location.pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const openNotification = async (notification: Notification) => {
    setMenu(null);
    if (!notification.readAt) {
      await api.notifications.markRead(notification.id).catch(() => undefined);
      setUnread((value) => Math.max(0, value - 1));
      setNotifications((items) =>
        items.map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)),
      );
    }
    if (notification.memberId) navigate(`/members/${notification.memberId}`);
  };

  const markAllRead = async () => {
    await api.notifications.markAllRead().catch(() => undefined);
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">
            <Icon name="dumbbell" size={21} />
          </span>
          <div>
            <div className="brand-name">{settings.gymName}</div>
            <div className="brand-sub">Gym management</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((group) => {
            const items = group.items.filter((item) => user && item.roles.includes(user.role));
            if (!items.length) return null;
            return (
              <div key={group.label}>
                <div className="nav-label">{group.label}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="nav-icon">
                      <Icon name={item.icon} size={18} />
                    </span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <strong>{settings.gymName}</strong>
          <span>
            {settings.timezone} · {settings.currencyCode}
          </span>
        </div>
      </aside>

      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-btn menu-toggle"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Icon name="menu" size={20} />
            </button>
            <div>
              <div className="topbar-title">{current?.title ?? 'Gym management'}</div>
              <div className="topbar-sub">{current?.sub ?? ''}</div>
            </div>
          </div>

          <div className="topbar-actions" ref={actionsRef}>
            <div className="popover-wrap">
              <button
                type="button"
                className="icon-btn bell"
                onClick={() => setMenu(menu === 'bell' ? null : 'bell')}
                aria-label="Notifications"
              >
                <Icon name="bell" size={19} />
                {unread > 0 && <span className="icon-badge">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {menu === 'bell' && (
                <div className="popover notif-pop">
                  <div className="menu-header">
                    <strong>Notifications</strong>
                    {unread > 0 && (
                      <button type="button" className="link-btn" onClick={markAllRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="picker-empty">You're all caught up.</div>
                  ) : (
                    notifications.slice(0, 10).map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        className={`notif-item ${notification.readAt ? 'read' : 'unread'}`}
                        onClick={() => void openNotification(notification)}
                      >
                        <span className="notif-dot" />
                        <span>
                          <span className="notif-title">{notification.title}</span>
                          <span className="notif-body">{notification.body}</span>
                          <span className="notif-time">{timeAgo(notification.createdAt)}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="popover-wrap">
              <button type="button" className="user-chip" onClick={() => setMenu(menu === 'user' ? null : 'user')}>
                <Avatar first={user?.name?.split(' ')[0] ?? 'A'} last={user?.name?.split(' ')[1] ?? ''} size={32} />
                <span className="user-meta">
                  <strong>{user?.name}</strong>
                  <span>{roleLabel(user?.role ?? '')}</span>
                </span>
                <Icon name="chevronDown" size={14} />
              </button>
              {menu === 'user' && (
                <div className="popover">
                  <div className="menu-header">
                    <div>
                      <strong>{user?.name}</strong>
                      <div className="notif-time">{user?.email}</div>
                    </div>
                  </div>
                  {user?.role === 'admin' && (
                    <button type="button" className="menu-item" onClick={() => navigate('/settings')}>
                      <Icon name="settings" size={16} />
                      Settings
                    </button>
                  )}
                  <button type="button" className="menu-item" onClick={() => navigate('/settings')}>
                    <Icon name="lock" size={16} />
                    Change password
                  </button>
                  <div className="menu-sep" />
                  <button type="button" className="menu-item danger" onClick={handleLogout}>
                    <Icon name="logout" size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
