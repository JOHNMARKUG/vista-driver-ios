import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootTabParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootTabParamList>();

/** Notification payload convention (matches vista-native-ios): `data.source`
 * says which job type the notification is about, `data.id` is the row id.
 * Falls back to just switching to the Dashboard tab if unrecognized. */
export function navigateFromNotificationData(data: Record<string, unknown> | undefined) {
  if (!navigationRef.isReady() || !data) return;

  const source = data.source;
  const id = data.id;

  if (typeof id === 'string' && (source === 'ride' || source === 'booking' || source === 'package')) {
    navigationRef.navigate('DashboardTab', {
      screen: 'JobDetail',
      params: { id, source },
    } as never);
    return;
  }

  navigationRef.navigate('DashboardTab' as never);
}
