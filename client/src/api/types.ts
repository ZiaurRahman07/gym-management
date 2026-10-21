export type Role = 'admin' | 'receptionist' | 'trainer';

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive?: number | boolean;
  createdAt?: string;
};

export type MembershipStatus =
  | 'active'
  | 'expiring'
  | 'expired'
  | 'frozen'
  | 'cancelled'
  | 'none'
  | 'inactive'
  | 'blocked';

export type Member = {
  id: number;
  memberCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  gender: 'male' | 'female' | 'other' | null;
  dob: string | null;
  address: string | null;
  photoUrl: string | null;
  emergencyContact: string | null;
  joinDate: string;
  status: 'active' | 'inactive' | 'blocked';
  notes: string | null;
  createdAt: string;
  subscriptionId: number | null;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  subscriptionStatus: string | null;
  subscriptionAmount: number | null;
  planId: number | null;
  planName: string | null;
  membershipStatus: MembershipStatus;
  daysLeft: number | null;
};

export type Subscription = {
  id: number;
  memberId: number;
  planId: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'frozen' | 'cancelled';
  price: number;
  discount: number;
  finalAmount: number;
  frozenAt: string | null;
  notes: string | null;
  createdAt: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  planName: string;
  durationDays: number;
  daysLeft: number;
  amountPaid: number;
};

export type Payment = {
  id: number;
  invoiceNo: string;
  memberId: number;
  subscriptionId: number | null;
  amount: number;
  method: 'cash' | 'card' | 'bank' | 'online';
  status: 'paid' | 'pending' | 'refunded' | 'failed';
  paidAt: string;
  notes: string | null;
  createdAt: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  planName: string | null;
  recordedByName: string | null;
};

export type AttendanceRecord = {
  id: number;
  memberId: number;
  checkInAt: string;
  checkOutAt: string | null;
  method: 'manual' | 'qr';
  memberCode: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  planName: string | null;
};

export type Plan = {
  id: number;
  name: string;
  durationDays: number;
  price: number;
  description: string | null;
  isActive: number | boolean;
  createdAt?: string;
  subscriptionCount?: number;
};

export type Trainer = {
  id: number;
  userId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  hireDate: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  assignedMembers: number;
  totalAssignments?: number;
};

export type TrainerRosterMember = {
  assignmentId: number;
  assignedAt: string;
  notes: string | null;
  id: number;
  memberCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  photoUrl: string | null;
  status: string;
  membershipEnds: string | null;
  membershipStatus: string;
};

export type MemberSubscription = {
  id: number;
  startDate: string;
  endDate: string;
  status: string;
  price: number;
  discount: number;
  finalAmount: number;
  createdAt: string;
  planName: string;
  durationDays: number;
};

export type MemberDetail = Member & {
  stats: { totalPaid: number; paymentCount: number; visits: number; lastVisit: string | null };
  subscriptions: MemberSubscription[];
  payments: Payment[];
  attendance: AttendanceRecord[];
  trainers: { id: number; name: string; specialization: string | null; assignedAt: string }[];
};

export type Notification = {
  id: number;
  memberId: number | null;
  subscriptionId: number | null;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  memberCode: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
};

export type DashboardStats = {
  activeMembers: number;
  expiringSoon: number;
  expiredMembers: number;
  totalMembers: number;
  newMembersThisMonth: number;
  todayCheckins: number;
  insideNow: number;
  monthRevenue: number;
  revenueChangePct: number;
  revenueSeries: { label: string; period: string; value: number }[];
  membershipBreakdown: Record<string, number>;
  expiringList: {
    id: number;
    memberCode: string;
    firstName: string;
    lastName: string;
    phone: string;
    photoUrl: string | null;
    endDate: string;
    daysLeft: number;
    planName: string;
  }[];
  recentPayments: (Pick<Payment, 'id' | 'invoiceNo' | 'amount' | 'method' | 'status' | 'paidAt'> & {
    memberId: number;
    memberCode: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
  })[];
  recentMembers: {
    id: number;
    memberCode: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    joinDate: string;
    planName: string | null;
  }[];
};

export type GymSettings = {
  gymName: string;
  currencyCode: string;
  currencySymbol: string;
  timezone: string;
  alertLeadDays: number;
  allowExpiredCheckin: boolean;
};

export type ReportRevenue = {
  from: string;
  to: string;
  groupBy: 'day' | 'month' | 'plan' | 'method';
  total: number;
  count: number;
  series: { label: string; value: number; count: number }[];
  byMethod: { label: string; value: number; count: number }[];
  byPlan: { label: string; value: number; count: number }[];
};

export type ReportMembers = {
  from: string;
  to: string;
  newMembers: number;
  totalMembers: number;
  activeNow: number;
  expiring: number;
  expiredInPeriod: number;
  churned: number;
  series: { label: string; value: number }[];
};

export type ReportAttendance = {
  from: string;
  to: string;
  totalVisits: number;
  uniqueMembers: number;
  avgDurationMinutes: number;
  series: { label: string; value: number; uniqueMembers: number }[];
  peakHours: { hour: number; value: number }[];
};

export type ReportTrainers = {
  from: string;
  to: string;
  trainers: { id: number; name: string; specialization: string | null; status: string; assignedMembers: number; visits: number }[];
  totalAssigned: number;
  totalVisits: number;
};

export type Paginated<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
