import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './context/AuthContext';
import type { Role } from './api/types';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Members } from './pages/Members';
import { MemberDetail } from './pages/MemberDetail';
import { Plans } from './pages/Plans';
import { Subscriptions } from './pages/Subscriptions';
import { Payments } from './pages/Payments';
import { Attendance } from './pages/Attendance';
import { Trainers } from './pages/Trainers';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="splash">
        <span className="splash-wordmark">Gym management</span>
        <span>Loading...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="splash">
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Page not found</h1>
      <p className="muted small">That page does not exist or has moved.</p>
      <Link to="/" className="btn btn-primary btn-sm">
        Back to dashboard
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="/members" element={<Members />} />
        <Route path="/members/:id" element={<MemberDetail />} />
        <Route
          path="/subscriptions"
          element={
            <RequireRole roles={['admin', 'receptionist']}>
              <Subscriptions />
            </RequireRole>
          }
        />
        <Route
          path="/payments"
          element={
            <RequireRole roles={['admin', 'receptionist']}>
              <Payments />
            </RequireRole>
          }
        />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/trainers" element={<Trainers />} />
        <Route
          path="/plans"
          element={
            <RequireRole roles={['admin', 'receptionist']}>
              <Plans />
            </RequireRole>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireRole roles={['admin', 'receptionist']}>
              <Reports />
            </RequireRole>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireRole roles={['admin']}>
              <Settings />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
