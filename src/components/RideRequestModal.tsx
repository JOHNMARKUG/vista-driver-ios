import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as KeepAwake from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { colors } from '../lib/theme';
import type { VistaRide } from '../types/driver';

const COUNTDOWN_SECONDS = 20;
const KEEP_AWAKE_TAG = 'ride-request-popup';

// Native port of the web driver app's VistaRideRequestPopup.jsx: a
// full-screen alert for newly-searching vista_rides that this driver hasn't
// been assigned yet — separate from the Dashboard's "already assigned"
// ride cards. Queues multiple requests, auto-passes on a 20s countdown,
// and uses .eq('status', 'searching') on the accept write as an optimistic
// lock so two drivers can't both win the same ride.
export default function RideRequestModal({ isOnline }: { isOnline: boolean }) {
  const { driver } = useAuth();
  const [requests, setRequests] = useState<VistaRide[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const prevCountRef = useRef(0);
  const buzzIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBoda = driver?.vehicle_type === 'boda' || driver?.vehicle_type === 'motorcycle';

  const fetchRequests = useCallback(async () => {
    if (!driver?.id) return;
    let query = supabase.from('vista_rides').select('*').eq('status', 'searching').order('created_at', { ascending: false }).limit(5);
    query = isBoda ? query.eq('vehicle_type', 'boda') : query.neq('vehicle_type', 'boda');
    const { data, error } = await query;
    if (error) return;
    const fresh = (data as VistaRide[]) ?? [];
    const newCount = fresh.filter((r) => !dismissed.has(r.id)).length;
    if (newCount > prevCountRef.current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    prevCountRef.current = newCount;
    setRequests(fresh);
  }, [driver?.id, isBoda, dismissed]);

  useEffect(() => {
    if (!driver?.id || !isOnline) return;
    fetchRequests();
    const channel = supabase
      .channel(`vista-ride-requests-${driver.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vista_rides' }, fetchRequests)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vista_rides' }, fetchRequests)
      .subscribe();
    const poll = setInterval(fetchRequests, 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.id, isOnline]);

  const visible = requests.filter((r) => !dismissed.has(r.id));
  const current = visible[0] ?? null;

  const handlePass = useCallback((rideId: string) => {
    if (buzzIntervalRef.current) clearInterval(buzzIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    setDismissed((prev) => new Set(prev).add(rideId));
  }, []);

  // Alert loop for the currently-shown request: haptic buzz every 2s, a
  // 20s countdown that auto-passes on expiry, screen stays awake meanwhile.
  useEffect(() => {
    if (buzzIntervalRef.current) clearInterval(buzzIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    if (!current) return;

    setCountdown(COUNTDOWN_SECONDS);
    KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    buzzIntervalRef.current = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }, 2000);

    let remaining = COUNTDOWN_SECONDS;
    const rideId = current.id;
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0 && countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        handlePass(rideId);
      }
    }, 1000);

    return () => {
      if (buzzIntervalRef.current) clearInterval(buzzIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const handleAccept = async (ride: VistaRide) => {
    if (buzzIntervalRef.current) clearInterval(buzzIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    setAccepting(ride.id);
    const { data, error } = await supabase
      .from('vista_rides')
      .update({ driver_id: driver!.id, status: 'driver_assigned', driver_accepted_at: new Date().toISOString() })
      .eq('id', ride.id)
      .eq('status', 'searching')
      .select()
      .maybeSingle();
    if (!error && data) {
      const { data: profile } = await supabase.from('profiles').select('fcm_token').eq('id', ride.customer_id ?? '').maybeSingle();
      const fcmToken = (profile as any)?.fcm_token;
      if (fcmToken) {
        supabase.functions.invoke('send-notification', { body: { token: fcmToken, title: 'Driver Found! 🚗', body: 'Your driver is on the way. Track them in the VISTA app.' } }).catch(() => {});
      }
    }
    // If error or no row (another driver already took it), just drop it silently — fetchRequests will refresh the list either way.
    setAccepting(null);
    fetchRequests();
  };

  if (!isOnline || !current) return null;

  const pct = Math.max(0, (countdown / COUNTDOWN_SECONDS) * 100);

  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {visible.length > 1 && (
          <View style={{ position: 'absolute', top: 60, right: 20, backgroundColor: colors.gold, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{visible.length} new requests</Text>
          </View>
        )}

        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(200,146,42,0.15)', borderWidth: 3, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Ionicons name="car" size={42} color={colors.gold} />
        </View>

        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>New Ride Request</Text>
        <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginBottom: 20 }}>UGX {current.total_ugx?.toLocaleString()}</Text>

        <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 18, width: '100%', maxWidth: 360, marginBottom: 20 }}>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 }}>Pickup</Text>
          <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '600', marginBottom: 10 }}>{current.pickup_address}</Text>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 }}>Dropoff</Text>
          <Text style={{ fontSize: 13, color: '#FFFFFF', fontWeight: '600' }}>{current.dropoff_address}</Text>
        </View>

        <View style={{ width: '100%', maxWidth: 360, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Auto-passing in</Text>
            <Text style={{ fontSize: 13, fontWeight: '800', color: countdown <= 5 ? '#DC2626' : colors.gold }}>{countdown}s</Text>
          </View>
          <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${pct}%`, borderRadius: 3, backgroundColor: countdown <= 5 ? '#DC2626' : colors.gold }} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, width: '100%', maxWidth: 360 }}>
          <Pressable onPress={() => handlePass(current.id)} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.6)' }}>✕ Pass</Text>
          </Pressable>
          <Pressable
            onPress={() => handleAccept(current)}
            disabled={accepting === current.id}
            style={{ flex: 2, backgroundColor: accepting === current.id ? 'rgba(200,146,42,0.5)' : colors.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>{accepting === current.id ? 'Accepting…' : '✓ Accept Ride'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
