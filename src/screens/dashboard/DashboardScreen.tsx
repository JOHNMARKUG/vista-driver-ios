import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as KeepAwake from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors, radius, shadows, spacing } from '../../lib/theme';
import VISTAButton from '../../components/VISTAButton';
import ChatModal from '../../components/ChatModal';
import RideRequestModal from '../../components/RideRequestModal';
import type { Booking, PilgrimPackage, VistaRide } from '../../types/driver';

const SOS_WHATSAPP = '256785585703';
const ONLINE_KEEP_AWAKE_TAG = 'driver-online';

const SERVICE_LABELS: Record<string, string> = {
  airport_pickup: 'Airport Pickup',
  airport_departure: 'Airport Departure',
  ministry_transport: 'Ministry Transport',
  group_convoy: 'Group Convoy',
  city_transfer: 'City Transfer',
  vip: 'VIP Service',
  crusade: 'Crusade Transport',
  conference: 'Conference Transport',
};
const formatService = (type: string) => SERVICE_LABELS[type] ?? type;

export const SERVICE_COLORS: Record<string, { bg: string; color: string }> = {
  airport_pickup: { bg: 'rgba(27,46,107,0.08)', color: colors.navy },
  airport_departure: { bg: 'rgba(27,46,107,0.08)', color: colors.navy },
  vip: { bg: 'rgba(200,146,42,0.12)', color: colors.gold },
  group_convoy: { bg: 'rgba(139,92,246,0.1)', color: '#7C3AED' },
  crusade: { bg: 'rgba(26,107,60,0.08)', color: '#1A6B3C' },
  conference: { bg: 'rgba(26,107,60,0.08)', color: '#1A6B3C' },
};

function getDriverLevel(trips: number) {
  if (trips >= 500) return { label: 'Platinum', color: '#06B6D4', icon: '💎', next: null as string | null, nextAt: null as number | null };
  if (trips >= 200) return { label: 'Gold', color: colors.gold, icon: '🥇', next: 'Platinum', nextAt: 500 };
  if (trips >= 50) return { label: 'Silver', color: '#94A3B8', icon: '🥈', next: 'Gold', nextAt: 200 };
  return { label: 'Bronze', color: '#CD7F32', icon: '🥉', next: 'Silver', nextAt: 50 };
}

function openNav(address: string | null | undefined) {
  if (!address) return;
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`);
}
function openCall(phone: string | null | undefined) {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`);
}
function openWhatsApp(phone: string | null | undefined, message?: string) {
  if (!phone) return;
  const digits = phone.replace(/\D/g, '');
  const q = message ? `?text=${encodeURIComponent(message)}` : '';
  Linking.openURL(`https://wa.me/${digits}${q}`);
}

export default function DashboardScreen() {
  const { driver, session, refreshDriver } = useAuth();

  const [isOnline, setIsOnline] = useState(driver?.is_online ?? false);
  const [assignedJobs, setAssignedJobs] = useState<Booking[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Booking[]>([]);
  const [todayJobs, setTodayJobs] = useState<Booking[]>([]);
  const [pilgrimPackages, setPilgrimPackages] = useState<PilgrimPackage[]>([]);
  const [vistaRides, setVistaRides] = useState<VistaRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [sosVisible, setSosVisible] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [chatTarget, setChatTarget] = useState<{ id: string; type: 'booking' | 'vista_ride'; name: string | null } | null>(null);
  const [jobUnread, setJobUnread] = useState<Record<string, number>>({});
  const [onlineDuration, setOnlineDuration] = useState('0m');

  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const silentRefresh = useRef(false);
  const onlineStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (driver?.is_online !== undefined) setIsOnline(!!driver.is_online);
  }, [driver?.is_online]);

  // Online session timer, shown next to the toggle — purely a UI clock,
  // resets whenever the driver goes offline.
  useEffect(() => {
    if (!isOnline) {
      onlineStartRef.current = null;
      setOnlineDuration('0m');
      return;
    }
    if (!onlineStartRef.current) onlineStartRef.current = Date.now();
    const update = () => {
      const elapsed = Date.now() - (onlineStartRef.current ?? Date.now());
      const h = Math.floor(elapsed / 3600000);
      const m = Math.floor((elapsed % 3600000) / 60000);
      setOnlineDuration(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [isOnline]);

  // Keep the screen awake while online, same as the web app's wake lock —
  // a driver waiting for a job shouldn't have the screen lock mid-shift.
  useEffect(() => {
    if (isOnline) {
      KeepAwake.activateKeepAwakeAsync(ONLINE_KEEP_AWAKE_TAG);
    } else {
      KeepAwake.deactivateKeepAwake(ONLINE_KEEP_AWAKE_TAG);
    }
    return () => {
      KeepAwake.deactivateKeepAwake(ONLINE_KEEP_AWAKE_TAG);
    };
  }, [isOnline]);

  const firstName = driver?.full_name?.split(' ')[0] ?? 'Driver';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const totalTrips = driver?.total_trips ?? 0;
  const level = getDriverLevel(totalTrips);
  const levelProgress = level.nextAt ? Math.min(100, Math.round((totalTrips / level.nextAt) * 100)) : 100;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayEarnings = todayJobs.reduce((sum, j) => sum + (j.driver_earnings ?? 0), 0);

  const fetchJobs = useCallback(async () => {
    if (!driver?.id) {
      setLoading(false);
      return;
    }
    if (!silentRefresh.current) setLoading(true);
    silentRefresh.current = false;

    try {
      const [{ data: assigned, error }, { data: completed }, { data: today }, { data: packages }, { data: rides }] = await Promise.all([
        supabase.from('bookings').select('*').eq('driver_id', driver.id).in('status', ['driver_assigned', 'confirmed', 'en_route', 'driver_arrived']).order('pickup_date', { ascending: true }),
        supabase.from('bookings').select('*').eq('driver_id', driver.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(5),
        supabase.from('bookings').select('id, driver_earnings, created_at').eq('driver_id', driver.id).eq('status', 'completed').gte('created_at', `${todayStr}T00:00:00`),
        supabase.from('pilgrim_packages').select('*').eq('driver_id', driver.id).in('status', ['assigned', 'active', 'pending_rating']).order('arrival_date', { ascending: true }),
        supabase.from('vista_rides').select('*').eq('driver_id', driver.id).in('status', ['driver_assigned', 'arrived', 'in_progress']).order('created_at', { ascending: true }),
      ]);

      if (error) {
        Alert.alert('Could not load jobs', 'Check your connection and try again.');
        return;
      }

      setAssignedJobs((assigned as Booking[]) ?? []);
      setCompletedJobs((completed as Booking[]) ?? []);
      setTodayJobs((today as Booking[]) ?? []);
      setPilgrimPackages((packages as PilgrimPackage[]) ?? []);

      if (rides?.length) {
        const customerIds = [...new Set(rides.map((r: any) => r.customer_id).filter(Boolean))];
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', customerIds);
        const nameById = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name]));
        setVistaRides((rides as VistaRide[]).map((r) => ({ ...r, customer_name: nameById[r.customer_id ?? ''] })));
      } else {
        setVistaRides([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driver?.id, todayStr]);

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs])
  );

  // Realtime: any booking/ride change assigned to this driver silently refetches.
  useEffect(() => {
    if (!driver?.id) return;
    const channel = supabase
      .channel(`driver-jobs-${driver.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `driver_id=eq.${driver.id}` }, () => {
        silentRefresh.current = true;
        fetchJobs();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vista_rides', filter: `driver_id=eq.${driver.id}` }, () => {
        silentRefresh.current = true;
        fetchJobs();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [driver?.id, fetchJobs]);

  // Live GPS while online — expo-location's watchPositionAsync mirrors the
  // web app's navigator.geolocation.watchPosition, updating the same
  // drivers.current_latitude/longitude columns customers' live tracking reads.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!isOnline || !driver?.id) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      watchSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 25 },
        (loc) => {
          supabase
            .from('drivers')
            .update({ current_latitude: loc.coords.latitude, current_longitude: loc.coords.longitude })
            .eq('id', driver.id)
            .then(() => {});
        }
      );
    }
    start();
    return () => {
      cancelled = true;
      watchSubRef.current?.remove();
      watchSubRef.current = null;
    };
  }, [isOnline, driver?.id]);

  // Unread chat badges — combined ids from active bookings + active rides,
  // since both job types share the same ride_messages table.
  const fetchJobUnread = useCallback(async () => {
    const ids = [...assignedJobs.map((j) => j.id), ...vistaRides.map((r) => r.id)];
    if (!ids.length) return;
    const { data } = await supabase.from('ride_messages').select('booking_id').in('booking_id', ids).eq('sender_type', 'customer').is('read_at', null);
    if (!data) return;
    const counts: Record<string, number> = {};
    data.forEach((m: any) => { counts[m.booking_id] = (counts[m.booking_id] ?? 0) + 1; });
    setJobUnread(counts);
  }, [assignedJobs, vistaRides]);

  useEffect(() => {
    fetchJobUnread();
  }, [fetchJobUnread]);

  useEffect(() => {
    if (!driver?.id) return;
    const channel = supabase
      .channel(`driver-job-unread-${driver.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_messages' }, () => fetchJobUnread())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_messages' }, () => fetchJobUnread())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [driver?.id, fetchJobUnread]);

  const openChat = (id: string, type: 'booking' | 'vista_ride', name: string | null) => {
    setChatTarget({ id, type, name });
    setJobUnread((prev) => ({ ...prev, [id]: 0 }));
  };

  const toggleOnline = useCallback(async () => {
    if (!driver?.id) return;
    const next = !isOnline;
    setIsOnline(next);
    const { error } = await supabase.from('drivers').update({ is_online: next }).eq('id', driver.id);
    if (error) {
      setIsOnline(!next);
      Alert.alert('Could not update status', 'Please try again.');
    }
  }, [driver?.id, isOnline]);

  const notifyCustomer = async (customerId: string | null, title: string, message: string) => {
    if (!customerId) return;
    await supabase.from('notifications').insert({ user_id: customerId, title, message, type: 'driver_assigned', is_read: false });
    const { data: profile } = await supabase.from('profiles').select('fcm_token').eq('id', customerId).maybeSingle();
    const fcmToken = (profile as any)?.fcm_token;
    if (fcmToken) {
      supabase.functions.invoke('send-notification', { body: { token: fcmToken, title, body: message } }).catch(() => {});
    }
  };

  // ── Booking (VISTA Transport job) actions ─────────────────────────────────
  const handleAcceptJob = async (job: Booking) => {
    setActingId(job.id);
    const { error } = await supabase.from('bookings').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', job.id);
    if (error) {
      Alert.alert('Could not accept job', 'Please try again.');
    } else {
      await notifyCustomer(job.customer_id, 'Driver Confirmed', `${driver?.full_name} confirmed ${job.booking_ref}. Plate: ${driver?.plate_number ?? 'N/A'}. Phone: ${driver?.phone ?? 'N/A'}.`);
      fetchJobs();
    }
    setActingId(null);
  };

  const handlePassJob = async (job: Booking) => {
    setActingId(job.id);
    const { error } = await supabase.from('bookings').update({ driver_id: null, status: 'pending' }).eq('id', job.id);
    if (error) Alert.alert('Could not pass this job', 'Please try again.');
    fetchJobs();
    setActingId(null);
  };

  const handleStartTrip = async (job: Booking) => {
    setActingId(job.id);
    const { error } = await supabase.from('bookings').update({ status: 'en_route', updated_at: new Date().toISOString() }).eq('id', job.id);
    if (error) {
      Alert.alert('Could not update trip status', 'Please try again.');
    } else {
      await notifyCustomer(job.customer_id, 'Driver On The Way', `${driver?.full_name} is heading to your pickup.`);
      fetchJobs();
    }
    setActingId(null);
  };

  const handleArrived = async (job: Booking) => {
    setActingId(job.id);
    const { error } = await supabase.from('bookings').update({ status: 'driver_arrived', updated_at: new Date().toISOString() }).eq('id', job.id);
    if (error) {
      Alert.alert('Could not update arrival status', 'Please try again.');
    } else {
      await notifyCustomer(job.customer_id, 'Driver Has Arrived!', `${driver?.full_name} has arrived. Plate: ${driver?.plate_number ?? 'N/A'}.`);
      fetchJobs();
    }
    setActingId(null);
  };

  const handleCompleteJob = async (job: Booking) => {
    setActingId(job.id);
    const { error } = await supabase.from('bookings').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', job.id);
    if (error) {
      Alert.alert('Could not complete trip', 'Please try again.');
      setActingId(null);
      return;
    }
    await notifyCustomer(job.customer_id, 'Trip Completed', `Your trip ${job.booking_ref} has been completed. Thank you for choosing VISTA Transport.`);
    if (driver?.id) {
      const { data: fresh } = await supabase.from('drivers').select('total_trips, total_earnings').eq('id', driver.id).maybeSingle();
      await supabase
        .from('drivers')
        .update({
          total_trips: ((fresh as any)?.total_trips ?? 0) + 1,
          total_earnings: ((fresh as any)?.total_earnings ?? 0) + (job.driver_earnings ?? 0),
        })
        .eq('id', driver.id);
      refreshDriver();
    }
    supabase.functions.invoke('send-receipt', { body: { booking_id: job.id } }).catch(() => {});
    fetchJobs();
    setActingId(null);
  };

  // ── VISTA Ride actions ─────────────────────────────────────────────────────
  const advanceRide = async (
    ride: VistaRide,
    nextStatus: VistaRide['status'],
    timestampField: string,
    notifyTitle: string,
    notifyMsg: string
  ) => {
    setActingId(ride.id);
    const { error } = await supabase
      .from('vista_rides')
      .update({ status: nextStatus, [timestampField]: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', ride.id);
    if (error) {
      Alert.alert('Could not update ride', 'Please try again.');
    } else {
      await notifyCustomer(ride.customer_id, notifyTitle, notifyMsg);
      fetchJobs();
    }
    setActingId(null);
  };
  const handleRideArrived = (ride: VistaRide) => advanceRide(ride, 'arrived', 'driver_arrived_at', 'Your Driver Has Arrived', 'Your VISTA Ride driver is waiting at the pickup point.');
  const handleRideStart = (ride: VistaRide) => advanceRide(ride, 'in_progress', 'trip_started_at', 'Trip Started', 'Your VISTA Ride is now in progress.');
  const handleRideComplete = (ride: VistaRide) => advanceRide(ride, 'completed', 'trip_completed_at', 'Trip Completed', 'Your VISTA Ride has been completed. Thank you for riding with VISTA!');

  // ── Pilgrim package actions ────────────────────────────────────────────────
  const handleCompletePackage = async (pkg: PilgrimPackage) => {
    setActingId(pkg.id);
    const { error } = await supabase.from('pilgrim_packages').update({ status: 'pending_rating', updated_at: new Date().toISOString() }).eq('id', pkg.id);
    if (error) {
      Alert.alert('Could not complete package', 'Please try again.');
    } else {
      await notifyCustomer(
        pkg.customer_id,
        'Pilgrimage Transport Complete',
        `Your VISTA pilgrimage transport is complete! Please rate your experience to release your driver's final payment of USD ${pkg.driver_holdback ?? 0}.`
      );
      fetchJobs();
    }
    setActingId(null);
  };

  // ── Driver SOS ──────────────────────────────────────────────────────────────
  const sendSos = async () => {
    setSosSending(true);
    try {
      let locText = 'Location unavailable';
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        locText = `https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`;
      }
      const time = new Date().toLocaleString('en-UG', { hour12: true });
      const msg = `🚨 DRIVER SOS ALERT!\nDriver: ${driver?.full_name}\nPlate: ${driver?.plate_number ?? 'N/A'}\nPhone: ${driver?.phone ?? 'N/A'}\nLocation: ${locText}\nTime: ${time}\nPLEASE RESPOND IMMEDIATELY`;
      await Linking.openURL(`https://wa.me/${SOS_WHATSAPP}?text=${encodeURIComponent(msg)}`);
      setSosVisible(false);
    } finally {
      setSosSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F6F9' }} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchJobs(); }} />}
      >
        {/* Header */}
        <View style={{ backgroundColor: colors.navy, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF' }}>{firstName.charAt(0)}</Text>
              </View>
              <View>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>{driver?.group_affiliation ?? 'VISTA'} Driver</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFFFFF' }}>{greeting}, {firstName}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${level.color}30`, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: level.color }}>
                    {level.icon} {level.label}{level.nextAt ? ` · ${level.nextAt - totalTrips} to ${level.next}` : ''}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable onPress={() => setSosVisible(true)} style={{ backgroundColor: 'rgba(220,38,38,0.2)', borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: '#DC2626' }}>SOS</Text>
              </Pressable>
              <Pressable onPress={fetchJobs} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="refresh" size={18} color="#FFFFFF" />
              </Pressable>
              <Pressable
                onPress={toggleOnline}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: isOnline ? 'rgba(26,107,60,0.25)' : 'rgba(255,255,255,0.1)',
                  borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8,
                }}
              >
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isOnline ? '#22C55E' : '#9AA5BE' }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: isOnline ? '#22C55E' : '#9AA5BE' }}>
                  {isOnline ? `Online · ${onlineDuration}` : 'Offline'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Stats strip */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[
              { label: 'Today Earned', value: `$${todayEarnings}` },
              { label: 'Today Trips', value: String(todayJobs.length) },
              { label: 'Rating', value: `${driver?.rating ?? 5.0}★` } as any,
              { label: 'Active Jobs', value: String(assignedJobs.length) },
            ].map((s, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.gold }}>{s.value}</Text>
                <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ padding: spacing.md }}>
          {/* Level progress */}
          {level.nextAt && (
            <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.md }, shadows.card]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: level.color }}>{level.icon} {level.label} Driver</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>{totalTrips}/{level.nextAt} trips to {level.next}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: '#F4F6F9', overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${levelProgress}%`, borderRadius: 3, backgroundColor: level.color }} />
              </View>
            </View>
          )}

          {/* VISTA Rides */}
          {vistaRides.length > 0 && (
            <View style={{ marginBottom: spacing.lg }}>
              <SectionLabel color="#2563EB">Active VISTA Rides</SectionLabel>
              {vistaRides.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  busy={actingId === ride.id}
                  unread={jobUnread[ride.id] ?? 0}
                  onArrived={handleRideArrived}
                  onStart={handleRideStart}
                  onComplete={handleRideComplete}
                  onChat={() => openChat(ride.id, 'vista_ride', ride.customer_name ?? null)}
                />
              ))}
            </View>
          )}

          {/* Pilgrim packages */}
          {pilgrimPackages.length > 0 && (
            <View style={{ marginBottom: spacing.lg }}>
              <SectionLabel color={colors.gold}>Pilgrimage Packages</SectionLabel>
              {pilgrimPackages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} busy={actingId === pkg.id} onComplete={handleCompletePackage} />
              ))}
            </View>
          )}

          {/* Active bookings */}
          <View style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <SectionLabel color={colors.navy}>Active Jobs</SectionLabel>
              {assignedJobs.length > 0 && (
                <View style={{ backgroundColor: colors.gold, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>{assignedJobs.length}</Text>
                </View>
              )}
            </View>

            {loading ? (
              <EmptyCard text="Loading jobs…" />
            ) : assignedJobs.length === 0 ? (
              <EmptyCard
                icon="car-outline"
                title="No active jobs"
                text={isOnline ? 'You are online. New jobs assigned by dispatch will appear here.' : 'You are offline. Go online to receive job assignments.'}
              />
            ) : (
              assignedJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  busy={actingId === job.id}
                  unread={jobUnread[job.id] ?? 0}
                  onAccept={handleAcceptJob}
                  onPass={handlePassJob}
                  onStart={handleStartTrip}
                  onArrived={handleArrived}
                  onComplete={handleCompleteJob}
                  onChat={() => openChat(job.id, 'booking', job.passenger_name)}
                />
              ))
            )}
          </View>

          {/* Recently completed */}
          {completedJobs.length > 0 && (
            <View>
              <SectionLabel color={colors.navy}>Recent Completed Trips</SectionLabel>
              {completedJobs.map((trip) => (
                <View key={trip.id} style={[{ backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }, shadows.card]}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(26,107,60,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark-circle" size={20} color="#1A6B3C" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.navy }}>{formatService(trip.service_type)}</Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{trip.booking_ref} · {trip.pickup_date}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A6B3C' }}>+${trip.driver_earnings ?? 0}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {sosVisible && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(27,46,107,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 } as any}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>🚨</Text>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.navy, textAlign: 'center', marginBottom: 8 }}>Send Driver SOS Alert?</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
              This sends your location and vehicle details to VISTA support via WhatsApp immediately.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setSosVisible(false)} style={{ flex: 1, backgroundColor: '#F4F6F9', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={sendSos} disabled={sosSending} style={{ flex: 1, backgroundColor: '#DC2626', borderRadius: 12, padding: 14, alignItems: 'center', opacity: sosSending ? 0.7 : 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{sosSending ? 'Sending…' : 'Send SOS'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <ChatModal
        visible={!!chatTarget}
        bookingId={chatTarget?.id ?? null}
        bookingType={chatTarget?.type ?? 'booking'}
        otherPartyName={chatTarget?.name}
        onClose={() => { setChatTarget(null); fetchJobUnread(); }}
      />

      <RideRequestModal isOnline={isOnline} />
    </SafeAreaView>
  );
}

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return <Text style={{ fontSize: 12, fontWeight: '700', color, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>{children}</Text>;
}

function EmptyCard({ icon, title, text }: { icon?: keyof typeof Ionicons.glyphMap; title?: string; text: string }) {
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: 28, alignItems: 'center' }, shadows.card]}>
      {icon && (
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(27,46,107,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Ionicons name={icon} size={24} color="#9AA5BE" />
        </View>
      )}
      {title && <Text style={{ fontSize: 14, fontWeight: '600', color: colors.navy, marginBottom: 6 }}>{title}</Text>}
      <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

function NavRow({ pickup, dropoff }: { pickup?: string | null; dropoff?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      {pickup && (
        <Pressable onPress={() => openNav(pickup)} style={{ flex: 1, backgroundColor: 'rgba(27,46,107,0.06)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy }}>📍 Pickup</Text>
        </Pressable>
      )}
      {dropoff && (
        <Pressable onPress={() => openNav(dropoff)} style={{ flex: 1, backgroundColor: 'rgba(27,46,107,0.06)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy }}>🧭 Drop-off</Text>
        </Pressable>
      )}
    </View>
  );
}

function ChatButton({ unread, onPress }: { unread: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: 8,
        backgroundColor: unread > 0 ? colors.gold : '#F4F6F9',
        borderWidth: 1.5,
        borderColor: unread > 0 ? colors.gold : '#E8EDF5',
        borderRadius: 12,
        paddingVertical: 11,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <Ionicons name="chatbubble-ellipses" size={16} color={unread > 0 ? '#FFFFFF' : '#6B7A99'} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: unread > 0 ? '#FFFFFF' : '#6B7A99' }}>Chat with Passenger</Text>
      {unread > 0 && (
        <View style={{ backgroundColor: '#DC2626', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFFFFF' }}>{unread} new</Text>
        </View>
      )}
    </Pressable>
  );
}

function ContactRow({ phone }: { phone?: string | null }) {
  if (!phone) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <Pressable onPress={() => openCall(phone)} style={{ flex: 1, backgroundColor: 'rgba(27,46,107,0.06)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy }}>📞 Call</Text>
      </Pressable>
      <Pressable onPress={() => openWhatsApp(phone)} style={{ flex: 1, backgroundColor: 'rgba(26,107,60,0.08)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A6B3C' }}>💬 WhatsApp</Text>
      </Pressable>
    </View>
  );
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  driver_assigned: { bg: 'rgba(200,146,42,0.1)', color: colors.gold, label: 'New Job' },
  confirmed: { bg: 'rgba(27,46,107,0.1)', color: colors.navy, label: 'Accepted' },
  en_route: { bg: 'rgba(139,92,246,0.1)', color: '#7C3AED', label: 'En Route' },
  driver_arrived: { bg: 'rgba(26,107,60,0.1)', color: '#1A6B3C', label: 'Arrived' },
};

function JobCard({
  job, busy, unread, onAccept, onPass, onStart, onArrived, onComplete, onChat,
}: {
  job: Booking; busy: boolean; unread: number;
  onAccept: (j: Booking) => void; onPass: (j: Booking) => void; onStart: (j: Booking) => void; onArrived: (j: Booking) => void; onComplete: (j: Booking) => void; onChat: () => void;
}) {
  const badge = STATUS_BADGE[job.status] ?? { bg: 'rgba(200,146,42,0.1)', color: colors.gold, label: job.status };
  const borderColor = job.status === 'driver_assigned' ? colors.gold : job.status === 'en_route' ? '#7C3AED' : job.status === 'driver_arrived' ? '#1A6B3C' : '#E8EDF5';

  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 2, borderColor }, shadows.card]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gold, marginBottom: 2 }}>{job.booking_ref}</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.navy }}>{formatService(job.service_type)}</Text>
        </View>
        <View style={{ backgroundColor: badge.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: badge.color }}>{badge.label}</Text>
        </View>
      </View>

      <View style={{ backgroundColor: '#F4F6F9', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <Text style={{ fontSize: 10, color: '#9AA5BE', fontWeight: '600', textTransform: 'uppercase' }}>Pickup</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy, marginBottom: 8 }}>{job.pickup_location}</Text>
        <Text style={{ fontSize: 10, color: '#9AA5BE', fontWeight: '600', textTransform: 'uppercase' }}>Drop-off</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>{job.dropoff_location}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: '#6B7A99' }}>🕐 {job.pickup_date} at {job.pickup_time}</Text>
        <Text style={{ fontSize: 12, color: '#6B7A99' }}>👥 {job.passengers ?? 1} passenger{job.passengers !== 1 ? 's' : ''}</Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F4F6F9', marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: '#9AA5BE' }}>Your earnings</Text>
        <Text style={{ fontSize: 20, fontWeight: '900', color: colors.navy }}>USD {job.driver_earnings ?? Math.round((job.amount_usd ?? 0) * 0.85)}</Text>
      </View>

      {job.special_requests && (
        <View style={{ marginTop: 8, backgroundColor: 'rgba(200,146,42,0.08)', borderRadius: 8, padding: '8px 12px' as any }}>
          <Text style={{ fontSize: 12, color: colors.gold }}>Note: {job.special_requests}</Text>
        </View>
      )}

      {job.status === 'driver_assigned' && (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <VISTAButton title={busy ? 'Accepting…' : 'Accept Job'} variant="accent" fullWidth loading={busy} disabled={busy} onPress={() => onAccept(job)} />
          </View>
          <Pressable onPress={() => onPass(job)} disabled={busy} style={{ marginTop: 8, alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#9AA5BE' }}>Pass</Text>
          </Pressable>
          <NavRow pickup={job.pickup_location} dropoff={job.dropoff_location} />
          <ContactRow phone={job.passenger_phone} />
        </>
      )}
      {job.status === 'confirmed' && (
        <>
          <View style={{ marginTop: 14 }}>
            <VISTAButton title={busy ? 'Starting…' : 'Start Trip — heading to pickup'} variant="primary" fullWidth loading={busy} disabled={busy} onPress={() => onStart(job)} />
          </View>
          <NavRow pickup={job.pickup_location} dropoff={job.dropoff_location} />
          <ContactRow phone={job.passenger_phone} />
          <ChatButton unread={unread} onPress={onChat} />
        </>
      )}
      {job.status === 'en_route' && (
        <>
          <View style={{ marginTop: 14 }}>
            <VISTAButton title={busy ? 'Updating…' : 'I Have Arrived at Pickup'} variant="accent" fullWidth loading={busy} disabled={busy} onPress={() => onArrived(job)} />
          </View>
          <NavRow pickup={job.pickup_location} dropoff={job.dropoff_location} />
          <ContactRow phone={job.passenger_phone} />
          <ChatButton unread={unread} onPress={onChat} />
        </>
      )}
      {job.status === 'driver_arrived' && (
        <>
          <View style={{ marginTop: 14 }}>
            <VISTAButton title={busy ? 'Completing…' : 'Complete Trip — Passenger Delivered'} variant="primary" fullWidth loading={busy} disabled={busy} onPress={() => onComplete(job)} />
          </View>
          <NavRow dropoff={job.dropoff_location} />
          <ContactRow phone={job.passenger_phone} />
          <ChatButton unread={unread} onPress={onChat} />
        </>
      )}
    </View>
  );
}

function RideCard({
  ride, busy, unread, onArrived, onStart, onComplete, onChat,
}: {
  ride: VistaRide; busy: boolean; unread: number;
  onArrived: (r: VistaRide) => void; onStart: (r: VistaRide) => void; onComplete: (r: VistaRide) => void; onChat: () => void;
}) {
  const driverEarnings = ride.total_ugx ? Math.round(ride.total_ugx * 0.9) : 0;
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#2563EB', borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563EB', textTransform: 'uppercase' }}>🚗 VISTA Ride — {ride.booking_ref}</Text>
      <Text style={{ fontSize: 12, color: '#9AA5BE', marginBottom: 12 }}>👤 {ride.customer_name ?? 'Passenger'}</Text>
      <Text style={{ fontSize: 13, color: colors.navy, marginBottom: 4 }}>📍 Pickup: {ride.pickup_address}</Text>
      <Text style={{ fontSize: 13, color: colors.navy, marginBottom: 12 }}>🧭 Dropoff: {ride.dropoff_address}</Text>
      <View style={{ backgroundColor: '#F4F6F9', borderRadius: 10, padding: 10, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: '#6B7A99' }}>Fare: UGX {ride.total_ugx?.toLocaleString()}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>You earn UGX {driverEarnings.toLocaleString()}</Text>
      </View>
      <ChatButton unread={unread} onPress={onChat} />
      <View style={{ marginTop: 10 }}>
        {ride.status === 'driver_assigned' && <VISTAButton title={busy ? 'Updating…' : 'I Have Arrived'} variant="primary" fullWidth loading={busy} disabled={busy} onPress={() => onArrived(ride)} />}
        {ride.status === 'arrived' && <VISTAButton title={busy ? 'Updating…' : 'Start Trip'} variant="accent" fullWidth loading={busy} disabled={busy} onPress={() => onStart(ride)} />}
        {ride.status === 'in_progress' && <VISTAButton title={busy ? 'Updating…' : 'Complete Trip'} variant="primary" fullWidth loading={busy} disabled={busy} onPress={() => onComplete(ride)} />}
      </View>
    </View>
  );
}

function PackageCard({ pkg, busy, onComplete }: { pkg: PilgrimPackage; busy: boolean; onComplete: (p: PilgrimPackage) => void }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const schedule = pkg.schedule ?? [];
  const todayEntry = schedule.find((d) => d.date === todayStr);
  const lastDay = schedule[schedule.length - 1];
  const isLastDay = lastDay?.date === todayStr;
  const released = ((pkg.driver_base_earnings ?? 0) - (pkg.driver_holdback ?? 0)).toFixed(2);

  return (
    <View style={{ backgroundColor: colors.navy, borderWidth: 2, borderColor: colors.gold, borderRadius: 18, padding: 18, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.gold, textTransform: 'uppercase' }}>🕊️ Pilgrimage Package</Text>
      </View>
      <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>{pkg.booking_ref}</Text>

      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>{pkg.passenger_name} — {pkg.group_size} {pkg.group_size === 1 ? 'person' : 'people'}</Text>
      {pkg.hotel_name && <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>{pkg.hotel_name}</Text>}

      {todayEntry && (
        <View style={{ backgroundColor: 'rgba(200,146,42,0.15)', borderRadius: 12, padding: 12, marginTop: 8, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.gold, marginBottom: 6 }}>TODAY — {todayEntry.label}</Text>
          {todayEntry.items.map((it, i) => (
            <Text key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
              {it.icon} {it.time ? `${it.time} — ` : ''}{it.text}
            </Text>
          ))}
        </View>
      )}

      <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Released</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#4ADE80' }}>USD {released}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Holdback</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gold }}>USD {pkg.driver_holdback ?? 0} {pkg.holdback_released ? '✓' : '⏳'}</Text>
        </View>
      </View>

      <ContactRow phone={pkg.passenger_phone} />

      {isLastDay && pkg.status !== 'pending_rating' && (
        <View style={{ marginTop: 10 }}>
          <VISTAButton title={busy ? 'Completing…' : 'Complete Package'} variant="accent" fullWidth loading={busy} disabled={busy} onPress={() => onComplete(pkg)} />
        </View>
      )}
      {pkg.status === 'pending_rating' && (
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 10 }}>
          ⏳ Waiting on pilgrim to confirm and release holdback
        </Text>
      )}
    </View>
  );
}
