import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/endpoints';
import type { GymSettings } from '../api/types';
import { useAuth } from './AuthContext';
import { formatMoney } from '../lib/format';

const DEFAULTS: GymSettings = {
  gymName: 'Iron Pulse Fitness',
  currencyCode: 'USD',
  currencySymbol: '$',
  timezone: 'UTC',
  alertLeadDays: 7,
  allowExpiredCheckin: false,
};

type SettingsContextValue = {
  settings: GymSettings;
  money: (value: number | string | null | undefined) => string;
  reload: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GymSettings>(DEFAULTS);

  const reload = useCallback(async () => {
    try {
      if (user) {
        const response = await api.settings.get();
        setSettings(response.data);
      } else {
        const response = await api.publicConfig();
        setSettings((current) => ({
          ...current,
          gymName: response.data.gymName,
          currencyCode: response.data.currencyCode,
          currencySymbol: response.data.currencySymbol,
          timezone: response.data.timezone,
        }));
      }
    } catch {
      /* keep defaults */
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const money = useCallback(
    (value: number | string | null | undefined) => formatMoney(value, settings.currencySymbol),
    [settings.currencySymbol],
  );

  const value = useMemo(() => ({ settings, money, reload }), [settings, money, reload]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
