import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors, radius, shadows, spacing } from '../../lib/theme';
import VISTAButton from '../../components/VISTAButton';

const UGX_RATE = 3700;

const SERVICE_LABELS: Record<string, string> = {
  airport_pickup: 'Airport Pickup',
  airport_departure: 'Airport Departure',
  ministry_transport: 'Ministry Transport',
  group_convoy: 'Group Convoy',
  city_transfer: 'City Transfer',
  vip: 'VIP Service',
  crusade: 'Crusade Transport',
  conference: 'Conference Transport',
  vista_ride: 'VISTA Ride',
};

const SERVICE_COLORS: Record<string, { bg: string; color: string }> = {
  airport_pickup: { bg: 'rgba(27,46,107,0.08)', color: colors.navy },
  airport_departure: { bg: 'rgba(27,46,107,0.08)', color: colors.navy },
  vip: { bg: 'rgba(200,146,42,0.12)', color: colors.gold },
  group_convoy: { bg: 'rgba(139,92,246,0.1)', color: '#7C3AED' },
  crusade: { bg: 'rgba(26,107,60,0.08)', color: '#1A6B3C' },
  conference: { bg: 'rgba(26,107,60,0.08)', color: '#1A6B3C' },
};

type CompletedJob = {
  id: string;
  booking_ref: string | null;
  pickup_location: string;
  dropoff_location: string;
  service_type: string;
  created_at: string;
  pickup_date: string;
  driver_earnings: number;
};

type Stats = { today: number; todayTrips: number; week: number; weekTrips: number; month: number; monthTrips: number; total: number; totalTrips: number };

const EMPTY_STATS: Stats = { today: 0, todayTrips: 0, week: 0, weekTrips: 0, month: 0, monthTrips: 0, total: 0, totalTrips: 0 };

export default function EarningsScreen() {
  const { driver } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  const fetchEarnings = useCallback(async () => {
    if (!driver?.id) {
      setLoading(false);
      return;
    }
    setFetchError(false);
    try {
      const [{ data: bookingJobs, error }, { data: rides }] = await Promise.all([
        supabase.from('bookings').select('*').eq('driver_id', driver.id).eq('status', 'completed').order('created_at', { ascending: false }),
        supabase.from('vista_rides').select('id, booking_ref, pickup_address, dropoff_address, total_ugx, created_at, status').eq('driver_id', driver.id).eq('status', 'completed').order('created_at', { ascending: false }),
      ]);
      if (error) throw error;

      const rideJobs: CompletedJob[] = (rides ?? []).map((r: any) => ({
        id: r.id,
        booking_ref: r.booking_ref,
        pickup_location: r.pickup_address,
        dropoff_location: r.dropoff_address,
        service_type: 'vista_ride',
        created_at: r.created_at,
        pickup_date: r.created_at?.split('T')[0],
        driver_earnings: r.total_ugx ? Math.round(((r.total_ugx * 0.9) / UGX_RATE) * 100) / 100 : 0,
      }));

      const allJobs: CompletedJob[] = [...((bookingJobs as CompletedJob[]) ?? []), ...rideJobs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setJobs(allJobs);

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
      const earn = (arr: CompletedJob[]) => arr.reduce((s, j) => s + (j.driver_earnings ?? 0), 0);
      const todayJobs = allJobs.filter((j) => j.created_at?.startsWith(todayStr));
      const weekJobs = allJobs.filter((j) => j.created_at >= weekAgo);
      const monthJobs = allJobs.filter((j) => j.created_at >= monthAgo);

      setStats({
        today: earn(todayJobs), todayTrips: todayJobs.length,
        week: earn(weekJobs), weekTrips: weekJobs.length,
        month: earn(monthJobs), monthTrips: monthJobs.length,
        total: earn(allJobs), totalTrips: allJobs.length,
      });
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driver?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchEarnings();
    }, [fetchEarnings])
  );

  const fmtUSD = (n: number) => `USD ${Math.round(n).toLocaleString()}`;
  const fmtUGX = (n: number) => `UGX ${Math.round(n * UGX_RATE).toLocaleString()}`;
  const earningsPerHour = stats.todayTrips > 0 ? (stats.today / 8).toFixed(1) : '—';

  const statCards = [
    { label: 'Today', value: fmtUSD(stats.today), sub: `${stats.todayTrips} trip${stats.todayTrips !== 1 ? 's' : ''}` },
    { label: 'This Week', value: fmtUSD(stats.week), sub: `${stats.weekTrips} trips` },
    { label: 'This Month', value: fmtUSD(stats.month), sub: `${stats.monthTrips} trips` },
    { label: 'Total Earned', value: fmtUSD(stats.total), sub: `${stats.totalTrips} trips all time` },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F6F9' }} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.navy }}>Earnings</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchEarnings(); }} />}
      >
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Loading earnings…</Text>
          </View>
        ) : fetchError ? (
          <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: 32, alignItems: 'center' }, shadows.card]}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#DC2626', marginBottom: 8 }}>Could not load earnings</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 20 }}>Check your internet connection and try again.</Text>
            <VISTAButton title="Retry" variant="primary" fullWidth={false} onPress={fetchEarnings} />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.md }}>
              {statCards.map((s, i) => (
                <View key={i} style={[{ width: '47%', backgroundColor: colors.card, borderRadius: radius.card, padding: 16 }, shadows.card]}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: colors.gold, marginBottom: 4 }}>{s.value}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, marginBottom: 2 }}>{s.label}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>{s.sub}</Text>
                </View>
              ))}
            </View>

            <EarningsBarChart jobs={jobs} />

            {/* Driver stats card */}
            <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: 16, marginBottom: spacing.md }, shadows.card]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Driver Stats</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(200,146,42,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="wallet" size={22} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.navy }}>Total Lifetime Earnings</Text>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: colors.gold }}>{fmtUSD(stats.total)}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>≈ {fmtUGX(stats.total)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: 'Total Trips', value: String(stats.totalTrips) },
                  { label: 'Rating', value: `${driver?.rating ?? 5.0}★` },
                  { label: 'Your Share', value: '90%' },
                  { label: 'Per Hour', value: `$${earningsPerHour}` },
                ].map((s, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: '#F4F6F9', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: colors.navy }}>{s.value}</Text>
                    <Text style={{ fontSize: 9, color: colors.textSecondary, marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Recent Trips</Text>

            {jobs.length === 0 ? (
              <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: 32, alignItems: 'center' }, shadows.card]}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.navy, marginBottom: 8 }}>No completed trips yet</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Your earnings will appear here once you complete trips.</Text>
              </View>
            ) : (
              jobs.slice(0, 20).map((job) => (
                <View key={job.id} style={[{ backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, shadows.card]}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(26,107,60,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark-circle" size={20} color="#1A6B3C" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.gold }}>{job.booking_ref}</Text>
                      <View style={{ backgroundColor: (SERVICE_COLORS[job.service_type] ?? { bg: 'rgba(27,46,107,0.08)' }).bg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: (SERVICE_COLORS[job.service_type] ?? { color: colors.navy }).color }}>
                          {SERVICE_LABELS[job.service_type] ?? job.service_type}
                        </Text>
                      </View>
                    </View>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.navy, marginBottom: 4 }}>
                      {job.pickup_location} → {job.dropoff_location}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{job.pickup_date}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#1A6B3C' }}>USD {job.driver_earnings ?? 0}</Text>
                    <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>≈ UGX {Math.round((job.driver_earnings ?? 0) * UGX_RATE).toLocaleString()}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// 7-day earnings bar chart — native View-bar port of the web app's
// EarningsBarChart (div bars), since no chart library is in the dependency
// tree yet and this is simple enough not to need one.
function EarningsBarChart({ jobs }: { jobs: CompletedJob[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const dayJobs = jobs.filter((j) => j.created_at?.startsWith(dateStr));
    const earnings = dayJobs.reduce((s, j) => s + (j.driver_earnings ?? 0), 0);
    const isToday = i === 6;
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    return { earnings, label, isToday, count: dayJobs.length };
  });

  const maxEarnings = Math.max(...days.map((d) => d.earnings), 1);
  const totalWeek = days.reduce((s, d) => s + d.earnings, 0);
  const BAR_AREA = 70;

  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: 16, marginBottom: spacing.md }, shadows.card]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, letterSpacing: 1, textTransform: 'uppercase' }}>Last 7 Days</Text>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.gold, marginTop: 2 }}>USD {totalWeek.toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontWeight: '700', color: colors.navy, fontSize: 14 }}>{days.reduce((s, d) => s + d.count, 0)}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>trips</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: BAR_AREA + 18, marginBottom: 6 }}>
        {days.map((day, i) => {
          const pct = maxEarnings > 0 ? day.earnings / maxEarnings : 0;
          const barH = Math.max(pct * BAR_AREA, day.earnings > 0 ? 4 : 2);
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              {day.earnings > 0 && (
                <Text style={{ fontSize: 9, fontWeight: '700', color: day.isToday ? colors.gold : colors.navy, marginBottom: 2 }}>${day.earnings}</Text>
              )}
              <View
                style={{
                  width: '100%',
                  height: barH,
                  borderRadius: 4,
                  backgroundColor: day.isToday ? colors.gold : day.earnings > 0 ? colors.navy : '#E8EDF5',
                }}
              />
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 4 }}>
        {days.map((day, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, fontWeight: day.isToday ? '800' : '600', color: day.isToday ? colors.gold : colors.textSecondary }}>
            {day.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
