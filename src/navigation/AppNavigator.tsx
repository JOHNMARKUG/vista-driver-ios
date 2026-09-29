import React, { useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/LoadingScreen';
import VISTAButton from '../components/VISTAButton';
import DriverRegisterScreen from '../screens/auth/DriverRegisterScreen';
import { colors, spacing } from '../lib/theme';

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

/**
 * Shown when a session exists but no `drivers` row matches its email — a
 * real, signed-in Supabase user (this project's Auth is shared across every
 * VISTA app, so a Transport customer's email works here too) who just isn't
 * a driver. Offers the same Register flow as the login screen instead of
 * leaving them on an unexplained infinite spinner.
 */
function NoDriverAccountScreen({ email }: { email: string | undefined }) {
  const { signOut } = useAuth();
  const [registering, setRegistering] = useState(false);

  if (registering) {
    return (
      <DriverRegisterScreen
        initialEmail={email}
        hasSession
        onCancel={() => setRegistering(false)}
        onSubmitted={() => setRegistering(false)}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <Ionicons name="car-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 20 }} />
        <Text style={{ fontSize: 19, fontWeight: '800', color: colors.navy, textAlign: 'center', marginBottom: 10 }}>No driver account found</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 28 }}>
          {email ?? 'This email'} isn't registered as a VISTA driver yet. Apply below and our team will review your documents.
        </Text>
        <VISTAButton title="Apply to become a driver" variant="accent" fullWidth onPress={() => setRegistering(true)} />
        <Pressable onPress={signOut} style={{ marginTop: 16, paddingVertical: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Sign out and try a different email</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function AppNavigator() {
  const { loading, session, driver } = useAuth();

  if (loading) return <LoadingScreen label="VISTA DRIVER" />;
  // Session exists but we haven't finished looking up its drivers row yet.
  if (session && driver === undefined) return <LoadingScreen label="VISTA DRIVER" />;
  // Session exists, lookup finished, and genuinely no driver row matches it.
  if (session && driver === null) return <NoDriverAccountScreen email={session.user.email} />;

  return (
    <NavigationContainer ref={navigationRef} theme={NAV_THEME}>
      {session && driver ? <TabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
