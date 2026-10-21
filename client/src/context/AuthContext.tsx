import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/endpoints';
import { getToken, refreshAccessToken, setToken } from '../api/client';
import type { User } from '../api/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (getToken()) {
          const { user: me } = await api.auth.me();
          if (active) setUser(me);
        } else {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            const { user: me } = await api.auth.me();
            if (active) setUser(me);
          }
        }
      } catch {
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const onUnauthorized = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('gym:unauthorized', onUnauthorized);
    return () => {
      active = false;
      window.removeEventListener('gym:unauthorized', onUnauthorized);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.auth.login(email, password);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
