export type Role = 'admin' | 'receptionist' | 'trainer';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
};

export type MembershipStatus = 'active' | 'expired' | 'frozen' | 'cancelled' | 'none' | 'inactive' | 'blocked';
