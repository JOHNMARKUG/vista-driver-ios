import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/LoadingScreen';
import { colors } from '../lib/theme';

import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import { navigationRef } from './navigationRef';

const NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.navy,
    card: colors.card,
  },
};

export default function AppNavigator() {
  const { loading, session, driver } = useAuth();

  if (loading) return <LoadingScreen label="VISTA DRIVER" />;
  // Session exists but the drivers row hasn't loaded yet — treat as still
  // loading rather than flashing the tab bar before we know it's there.
  if (session && driver === null) return <LoadingScreen label="VISTA DRIVER" />;

  return (
    <NavigationContainer ref={navigationRef} theme={NAV_THEME}>
      {session && driver ? <TabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
