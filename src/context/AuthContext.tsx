import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Mirrors the live `drivers` table (verified via information_schema on
// 2026-09-29) — not every column, just what the app's screens read/write.
export type Driver = {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_year: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  group_affiliation: string | null;
  /** 'pending' | 'approved' | 'suspended' | 'rejected' (drivers_status_check). */
  status: string | null;
  total_trips: number | null;
  total_earnings: number | null;
  rating: number | null;
  profile_photo_url: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  is_online: boolean | null;
  created_at: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /**
   * `undefined` = haven't looked up this session's drivers row yet (still
   * loading). `null` = looked it up and confirmed none exists — a real,
   * signed-in Supabase user (this project's Auth is shared across all VISTA
   * apps, so any VISTA Transport customer's email can sign in here) who
   * just isn't a driver. A `Driver` = found and loaded.
   */
  driver: Driver | null | undefined;
  loading: boolean;
  /** Drivers are provisioned by dispatch, not self-registered by email — OTP only signs in an existing account. */
  sendOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null; user: User | null }>;
  /** For accounts that have a password (e.g. the App Review demo driver). */
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshDriver: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Looks up the drivers row by email rather than by auth user id, because
 * driver rows are seeded by dispatch (via the web admin) before the driver
 * ever signs in on a device. On first successful sign-in we self-heal the
 * row's user_id so RLS policies keyed on auth.uid() start working — ported
 * from the web driver app's AuthContext.jsx, which has relied on this same
 * backfill in production.
 */
async function fetchDriverByEmail(email: string, authUserId: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;

  if (!data.user_id) {
    await supabase.from('drivers').update({ user_id: authUserId }).eq('id', data.id);
    data.user_id = authUserId;
  }

  return data as unknown as Driver;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [driver, setDriver] = useState<Driver | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const wasAuthenticated = useRef(false);

  const fetchDriver = useCallback(async (authUser: User) => {
    if (!authUser.email) {
      setDriver(null);
      return;
    }
    const d = await fetchDriverByEmail(authUser.email, authUser.id);
    setDriver(d);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        wasAuthenticated.current = true;
        setDriver(undefined); // reset to "checking" for this session before the lookup resolves
        fetchDriver(s.user);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        wasAuthenticated.current = true;
        setDriver(undefined);
        fetchDriver(s.user);
      } else {
        setDriver(undefined);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchDriver]);

  const sendOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    return { error: error?.message ?? null };
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    });
    if (error) return { error: error.message, user: null };

    if (data.user) await fetchDriver(data.user);
    return { error: null, user: data.user };
  }, [fetchDriver]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { error: error.message };
    if (data.user) await fetchDriver(data.user);
    return { error: null };
  }, [fetchDriver]);

  const signOut = useCallback(async () => {
    // Go offline before signing out so the live-tracking marker doesn't get
    // stuck showing this driver as online after the app closes the session.
    if (driver?.id && driver.is_online) {
      await supabase.from('drivers').update({ is_online: false }).eq('id', driver.id);
    }
    await supabase.auth.signOut();
    setDriver(undefined);
  }, [driver]);

  const refreshDriver = useCallback(async () => {
    if (session?.user) await fetchDriver(session.user);
  }, [session, fetchDriver]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        driver,
        loading,
        sendOtp,
        verifyOtp,
        signInWithPassword,
        signOut,
        refreshDriver,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
