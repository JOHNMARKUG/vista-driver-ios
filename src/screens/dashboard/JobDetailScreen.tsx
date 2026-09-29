import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import VISTAButton from '../../components/VISTAButton';
import { colors, radius, shadows, spacing } from '../../lib/theme';

// Reached from a push-notification tap (navigateFromNotificationData) rather
// than from the job list itself — the Dashboard's own job cards already show
// full detail and actions inline, so this is a lightweight fallback view
// that just surfaces the row and lets the driver jump into a maps/call
// action immediately, then head back to Dashboard for the real actions.
type Props = NativeStackScreenProps<DashboardStackParamList, 'JobDetail'>;

const TABLE_BY_SOURCE = { booking: 'bookings', ride: 'vista_rides', package: 'pilgrim_packages' } as const;

export default function JobDetailScreen({ route }: Props) {
  const { id, source } = route.params;
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from(TABLE_BY_SOURCE[source])
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        setRow(data);
        setLoading(false);
      });
  }, [id, source]);

  const pickup = row?.pickup_location ?? row?.pickup_address ?? row?.hotel_name;
  const dropoff = row?.dropoff_location ?? row?.dropoff_address;
  const ref = row?.booking_ref;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F6F9' }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        {loading ? (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>Loading…</Text>
        ) : !row ? (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>This job could not be found.</Text>
        ) : (
          <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md }, shadows.card]}>
            {ref && <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gold, marginBottom: 4 }}>{ref}</Text>}
            {pickup && <Text style={{ fontSize: 14, color: colors.navy, marginBottom: 6 }}>📍 {pickup}</Text>}
            {dropoff && <Text style={{ fontSize: 14, color: colors.navy, marginBottom: 6 }}>🧭 {dropoff}</Text>}
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 8, marginBottom: 16 }}>
              Open the Dashboard tab to accept, update, or complete this job.
            </Text>
            {(pickup || dropoff) && (
              <VISTAButton
                title="Open in Maps"
                variant="primary"
                fullWidth
                onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dropoff ?? pickup)}&travelmode=driving`)}
              />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
