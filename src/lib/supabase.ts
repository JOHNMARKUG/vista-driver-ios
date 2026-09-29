import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — check your .env file.'
  );
}

/**
 * expo-secure-store backed storage adapter so the session token never
 * touches AsyncStorage in plaintext on iOS/Android — same pattern proven in
 * vista-native-ios. SecureStore has no web implementation; AsyncStorage is
 * the standard fallback there, and this app's web target is dev-only preview.
 */
const SecureStoreAdapter = {
  getItem: (key: string) => (Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key)),
  setItem: (key: string, value: string) =>
    Platform.OS === 'web' ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => (Platform.OS === 'web' ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key)),
};

const options: SupabaseClientOptions<'public'> = {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
};

// Same Supabase project as vista-native-ios (quovxkwaexjucjaunned) — drivers,
// bookings, vista_rides, pilgrim_packages and profiles tables are shared.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, options);
