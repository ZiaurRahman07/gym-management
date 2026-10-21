import { downloadFile, http } from './client';
import type {
  AttendanceRecord,
  DashboardStats,
  GymSettings,
  Member,
  MemberDetail,
  Notification,
  Paginated,
  Payment,
  Plan,
  ReportAttendance,
  ReportMembers,
  ReportRevenue,
  ReportTrainers,
  Role,
  Subscription,
  Trainer,
  TrainerRosterMember,
  User,
} from './types';

type PaymentMethod = 'cash' | 'card' | 'bank' | 'online';

export type MemberInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  dob?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  notes?: string | null;
  joinDate?: string;
  status?: 'active' | 'inactive' | 'blocked';
  planId?: number;
  discount?: number;
  paymentMethod?: PaymentMethod;
  comp?: boolean;
};

export type SubscriptionInput = {
  memberId: number;
  planId: number;
  startDate?: string;
  discount?: number;
  notes?: string | null;
  comp?: boolean;
  payment?: { amount?: number; method: PaymentMethod; paidAt?: string | null; notes?: string | null } | null;
};

export type PaymentInput = {
  memberId: number;
  subscriptionId?: number | null;
  amount: number;
  method: PaymentMethod;
  paidAt?: string | null;
  notes?: string | null;
};

export const api = {
  auth: {
    login: (email: string, password: string) =>
      http.post<{ token: string; user: User }>('/auth/login', { email, password }),
    refresh: () => http.post<{ token: string; user: User }>('/auth/refresh'),
    me: () => http.get<{ user: User }>('/auth/me'),
    logout: () => http.post<{ ok: boolean }>('/auth/logout'),
    changePassword: (currentPassword: string, newPassword: string) =>
      http.post<{ ok: boolean }>('/auth/change-password', { currentPassword, newPassword }),
  },

  publicConfig: () =>
    http.get<{ data: { gymName: string; currencyCode: string; currencySymbol: string; timezone: string } }>(
      '/public/config',
    ),

  dashboard: {
    stats: () => http.get<{ data: DashboardStats }>('/dashboard/stats'),
  },

  members: {
    list: (params: Record<string, unknown>) => http.get<Paginated<Member>>('/members', params),
    get: (id: number) => http.get<{ data: MemberDetail }>(`/members/${id}`),
    create: (body: MemberInput) => http.post<{ data: Member }>('/members', body),
    update: (id: number, body: Partial<MemberInput>) => http.patch<{ data: Member }>(`/members/${id}`, body),
    remove: (id: number) => http.delete<{ ok: boolean }>(`/members/${id}`),
  },

  plans: {
    list: (includeInactive = false) =>
      http.get<{ data: Plan[] }>('/plans', includeInactive ? { includeInactive: 'true' } : undefined),
    create: (body: Partial<Plan>) => http.post<{ data: Plan }>('/plans', body),
    update: (id: number, body: Partial<Plan>) => http.patch<{ data: Plan }>(`/plans/${id}`, body),
    remove: (id: number) => http.delete<{ ok: boolean; deactivated?: boolean; message?: string }>(`/plans/${id}`),
  },

  subscriptions: {
    list: (params: Record<string, unknown>) => http.get<Paginated<Subscription>>('/subscriptions', params),
    expiring: (days = 7) => http.get<{ data: Subscription[] }>('/subscriptions/expiring', { days }),
    create: (body: SubscriptionInput) => http.post<{ data: Subscription }>('/subscriptions', body),
    action: (id: number, action: 'freeze' | 'unfreeze' | 'cancel') =>
      http.patch<{ data: Subscription }>(`/subscriptions/${id}`, { action }),
  },

  payments: {
    list: (params: Record<string, unknown>) =>
      http.get<Paginated<Payment> & { summary: { paid: number; refunded: number } }>('/payments', params),
    get: (id: number) => http.get<{ data: Payment }>(`/payments/${id}`),
    create: (body: PaymentInput) => http.post<{ data: Payment }>('/payments', body),
    refund: (id: number, reason?: string) => http.post<{ data: Payment }>(`/payments/${id}/refund`, { reason }),
  },

  attendance: {
    today: () =>
      http.get<{ data: { inside: AttendanceRecord[]; recent: AttendanceRecord[]; todayCount: number; insideCount: number } }>(
        '/attendance/today',
      ),
    list: (params: Record<string, unknown>) => http.get<Paginated<AttendanceRecord>>('/attendance', params),
    checkIn: (memberId: number) => http.post<{ data: AttendanceRecord }>('/attendance/check-in', { memberId }),
    checkOut: (id: number) => http.patch<{ data: AttendanceRecord }>(`/attendance/${id}/check-out`),
  },

  trainers: {
    list: (includeInactive = false) =>
      http.get<{ data: Trainer[] }>('/trainers', includeInactive ? { includeInactive: 'true' } : undefined),
    roster: (id: number) => http.get<{ data: TrainerRosterMember[] }>(`/trainers/${id}/members`),
    create: (body: Record<string, unknown>) => http.post<{ data: Trainer }>('/trainers', body),
    update: (id: number, body: Record<string, unknown>) => http.patch<{ data: Trainer }>(`/trainers/${id}`, body),
    remove: (id: number) => http.delete<{ ok: boolean }>(`/trainers/${id}`),
    assign: (id: number, memberId: number) => http.post<{ ok: boolean }>(`/trainers/${id}/assign`, { memberId }),
    unassign: (id: number, memberId: number) => http.delete<{ ok: boolean }>(`/trainers/${id}/assign/${memberId}`),
  },

  notifications: {
    list: (unreadOnly = false) => http.get<{ data: Notification[]; unread: number }>('/notifications', { unread: unreadOnly }),
    markRead: (id: number) => http.patch<{ ok: boolean }>(`/notifications/${id}/read`),
    markAllRead: () => http.post<{ ok: boolean }>('/notifications/read-all'),
  },

  reports: {
    get: <T>(report: string, params: Record<string, unknown>) => http.get<{ data: T }>(`/reports/${report}`, params),
    download: (report: string, params: Record<string, unknown>) =>
      downloadFile(`/reports/${report}/export`, params, `${report}.csv`),
  },

  settings: {
    get: () => http.get<{ data: GymSettings }>('/settings'),
    update: (body: Partial<GymSettings>) => http.put<{ data: GymSettings }>('/settings', body),
  },

  users: {
    list: () => http.get<{ data: User[] }>('/users'),
    create: (body: { name: string; email: string; role: Role; password: string }) =>
      http.post<{ data: User }>('/users', body),
    update: (id: number, body: Partial<{ name: string; email: string; role: Role; password: string; isActive: boolean }>) =>
      http.patch<{ data: User }>(`/users/${id}`, body),
    remove: (id: number) => http.delete<{ ok: boolean }>(`/users/${id}`),
  },
};

export type { ReportAttendance, ReportMembers, ReportRevenue, ReportTrainers };
