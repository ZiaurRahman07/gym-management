import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Icon } from './components/Icon';
import { useAuth } from './context/AuthContext';
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
        <span className="brand-mark">
          <Icon name="dumbbell" size={22} />
        </span>
        <span>Loading your gym…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="splash">
      <span className="empty-icon">
        <Icon name="alert" size={22} />
      </span>
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
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/trainers" element={<Trainers />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
