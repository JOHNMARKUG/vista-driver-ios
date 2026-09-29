import React from 'react';
import type { ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  pinColor?: string;
  title?: string;
};

export type MapPolyline = {
  coordinates: { latitude: number; longitude: number }[];
  strokeColor?: string;
  strokeWidth?: number;
};

export type PlatformMapProps = {
  style?: ViewStyle;
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  region?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  markers?: MapMarker[];
  polyline?: MapPolyline;
};

/**
 * Metro resolves this file on native platforms and PlatformMap.web.tsx on
 * web (file-extension platform resolution) — react-native-maps imports a
 * real native module at the top level and throws immediately if evaluated
 * on web, so the two implementations must live in separate files rather
 * than behind a runtime Platform.OS check.
 */
export default function PlatformMap({ style, initialRegion, region, markers, polyline }: PlatformMapProps) {
  return (
    <MapView style={style} initialRegion={initialRegion} region={region}>
      {markers?.map((m) => (
        <Marker key={m.id} coordinate={{ latitude: m.latitude, longitude: m.longitude }} pinColor={m.pinColor} title={m.title} />
      ))}
      {polyline && (
        <Polyline coordinates={polyline.coordinates} strokeColor={polyline.strokeColor} strokeWidth={polyline.strokeWidth} />
      )}
    </MapView>
  );
}
