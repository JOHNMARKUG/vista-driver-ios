import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../lib/theme';
import type { PlatformMapProps } from './PlatformMap';

/**
 * Web fallback — react-native-maps has no web target (it wraps native
 * Apple/Google Maps SDKs), so this renders a simple placeholder with the
 * same marker data instead of a live map. See PlatformMap.tsx for the
 * native implementation Metro resolves on iOS/Android.
 */
export default function PlatformMap({ style, markers }: PlatformMapProps) {
  return (
    <View
      style={[
        {
          backgroundColor: '#E7ECFB',
          borderRadius: radius.card,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          gap: 6,
        },
        style,
      ]}
    >
      <Ionicons name="map-outline" size={28} color={colors.navy} />
      <Text style={{ fontSize: 12, color: colors.navy, fontWeight: '600', textAlign: 'center' }}>
        Live map (native app only)
      </Text>
      {markers?.map((m) => (
        <Text key={m.id} style={{ fontSize: 11, color: colors.textSecondary }}>
          {m.title ?? 'Pin'}: {m.latitude.toFixed(3)}, {m.longitude.toFixed(3)}
        </Text>
      ))}
    </View>
  );
}
