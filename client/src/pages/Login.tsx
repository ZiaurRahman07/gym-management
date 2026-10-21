import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';

const DEMOS = [
  { label: 'Administrator', email: 'admin@gym.local', password: 'Admin@12345' },
  { label: 'Front desk', email: 'frontdesk@gym.local', password: 'Frontdesk@123' },
  { label: 'Trainer', email: 'trainer@gym.local', password: 'Trainer@123' },
];

export function Login() {
  const { user, login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-brand">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="dumbbell" size={21} />
          </span>
          <div>
            <div className="brand-name">{settings.gymName}</div>
            <div className="brand-sub">Gym management</div>
          </div>
        </div>

        <div>
          <h1 className="auth-headline">
            Run the floor.
            <br />
            <em>Grow the club.</em>
          </h1>
          <p className="auth-copy">
            One place for registrations, memberships, payments and attendance — so your front desk spends less
            time on spreadsheets and more time with members.
          </p>
          <div className="auth-points">
            {['Instant member check-in', 'Automatic expiry alerts', 'Revenue and attendance reports'].map((item) => (
              <div className="auth-point" key={item}>
                <span>
                  <Icon name="check" size={13} />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="auth-quote">Built for gyms that want to know their numbers.</div>
      </section>

      <section className="auth-form-side">
        <div className="auth-card">
          <h1>Welcome back</h1>
          <p className="auth-intro">Sign in to manage members, memberships and payments.</p>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@gym.com"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={busy}>
              {busy ? <Spinner size={16} /> : <Icon name="arrowUpRight" size={16} />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="demo-creds">
            <span>Demo accounts</span>
            <div className="demo-row">
              {DEMOS.map((demo) => (
                <button
                  type="button"
                  key={demo.email}
                  className="demo-btn"
                  onClick={() => {
                    setEmail(demo.email);
                    setPassword(demo.password);
                    setError(null);
                  }}
                >
                  <strong>{demo.label}</strong>
                  <span>{demo.email}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="auth-foot">Access is managed by your gym administrator.</p>
        </div>
      </section>
    </div>
  );
}
