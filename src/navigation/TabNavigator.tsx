import React from 'react';
import { BlurView } from 'expo-blur';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { DashboardStackParamList, EarningsStackParamList, ProfileStackParamList, RootTabParamList } from './types';
import { colors } from '../lib/theme';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import JobDetailScreen from '../screens/dashboard/JobDetailScreen';
import EarningsScreen from '../screens/earnings/EarningsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const EarningsStack = createNativeStackNavigator<EarningsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

const pushedHeaderOptions = {
  headerTintColor: colors.navy,
  headerTitleStyle: { color: '#000000', fontSize: 17, fontWeight: '600' as const },
  headerBackTitle: 'Back',
  headerShadowVisible: true,
};

export const VISIBLE_TAB_BAR_STYLE = { position: 'absolute' as const, borderTopWidth: 0.5, borderTopColor: '#E3E3E8' };

function DashboardStackNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerTintColor: colors.navy }}>
      {/* headerShown: false — DashboardScreen renders its own full navy
          header (greeting, level badge, online toggle, stats). A native
          large-title header on top of that duplicated and overlapped it. */}
      <DashboardStack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
      <DashboardStack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Trip', ...pushedHeaderOptions }} />
    </DashboardStack.Navigator>
  );
}

function EarningsStackNavigator() {
  return (
    <EarningsStack.Navigator screenOptions={{ headerTintColor: colors.navy }}>
      <EarningsStack.Screen name="Earnings" component={EarningsScreen} options={{ headerShown: false }} />
    </EarningsStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerTintColor: colors.navy }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
    </ProfileStack.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: VISIBLE_TAB_BAR_STYLE,
        tabBarBackground: () => <BlurView intensity={90} tint="light" style={{ ...StyleSheetAbsoluteFill }} />,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardStackNavigator}
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="speedometer" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="EarningsTab"
        component={EarningsStackNavigator}
        options={{ title: 'Earnings', tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}

const StyleSheetAbsoluteFill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };
