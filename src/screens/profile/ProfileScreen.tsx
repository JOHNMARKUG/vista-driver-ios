import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import VISTAButton from '../../components/VISTAButton';
import VISTAInput from '../../components/VISTAInput';
import { colors, radius, shadows, spacing } from '../../lib/theme';

function getDriverLevel(trips: number) {
  if (trips >= 500) return { label: 'Platinum', color: '#06B6D4', icon: '💎', next: null as string | null, nextAt: null as number | null, perks: ['Priority dispatching', 'Dedicated support line', 'Bonus multiplier 1.5×'] };
  if (trips >= 200) return { label: 'Gold', color: colors.gold, icon: '🥇', next: 'Platinum', nextAt: 500, perks: ['Priority dispatching', 'Bonus multiplier 1.2×', 'Gold badge on profile'] };
  if (trips >= 50) return { label: 'Silver', color: '#94A3B8', icon: '🥈', next: 'Gold', nextAt: 200, perks: ['Silver badge on profile', 'Weekly earnings bonus'] };
  return { label: 'Bronze', color: '#CD7F32', icon: '🥉', next: 'Silver', nextAt: 50, perks: ['Keep earning to level up!'] };
}

export default function ProfileScreen() {
  const { driver, signOut, refreshDriver, updatePassword } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showLevel, setShowLevel] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const totalTrips = driver?.total_trips ?? 0;
  const level = getDriverLevel(totalTrips);
  const levelPct = level.nextAt ? Math.min(100, Math.round((totalTrips / level.nextAt) * 100)) : 100;
  const initial = driver?.full_name?.charAt(0)?.toUpperCase() ?? 'D';
  const displayName = driver?.full_name ?? 'Driver';
  const memberSince = driver?.created_at ? new Date(driver.created_at).toLocaleDateString('en-UG', { month: 'long', year: 'numeric' }) : null;
  const vehicle = [driver?.vehicle_color, driver?.vehicle_make, driver?.vehicle_model].filter(Boolean).join(' ') || 'Not set';
  const plate = driver?.plate_number ?? '';

  const handlePickPhoto = async () => {
    if (uploading || !driver?.id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access in Settings to update your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const base64 = asset.base64;
      if (!base64) return;
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `profile-photos/${driver.id}.${ext}`;
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

      const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, decode(base64), { upsert: true, contentType });
      if (upErr) throw new Error(upErr.message);

      const { data } = supabase.storage.from('driver-documents').getPublicUrl(path);
      const { error: dbErr } = await supabase.from('drivers').update({ profile_photo_url: data.publicUrl }).eq('id', driver.id);
      if (dbErr) throw new Error(dbErr.message);

      await refreshDriver();
    } catch (err) {
      Alert.alert('Upload failed', (err as Error)?.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
        },
      },
    ]);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert("Passwords don't match", 'Please re-enter your new password.');
      return;
    }
    setChangingPassword(true);
    const { error } = await updatePassword(newPassword);
    setChangingPassword(false);
    if (error) {
      Alert.alert('Could not change password', error);
      return;
    }
    setNewPassword('');
    setConfirmNewPassword('');
    setShowChangePassword(false);
    Alert.alert('Password updated', 'You can now sign in with your new password, or keep using an email code — either works.');
  };

  const contactSupport = () => {
    const msg = `Hello VISTA Support, I need help. My name is ${driver?.full_name ?? 'Driver'} and my plate is ${driver?.plate_number ?? 'N/A'}.`;
    Linking.openURL(`https://wa.me/256785585703?text=${encodeURIComponent(msg)}`);
  };

  const stats = [
    { label: 'Total Trips', value: String(totalTrips) },
    { label: 'Rating', value: driver?.rating ? `${driver.rating} ★` : '5.0 ★' },
    { label: 'Earnings', value: driver?.total_earnings ? `USD ${driver.total_earnings}` : 'USD 0' },
  ];

  const menuItems = [
    { icon: 'call-outline' as const, label: 'Phone Number', sub: driver?.phone ?? 'Not set' },
    { icon: 'mail-outline' as const, label: 'Email Address', sub: driver?.email ?? 'Not set' },
    { icon: 'car-outline' as const, label: 'Vehicle', sub: plate ? `${vehicle} · ${plate}` : vehicle },
    { icon: 'card-outline' as const, label: 'Group', sub: driver?.group_affiliation ?? 'VISTA' },
    ...(memberSince ? [{ icon: 'calendar-outline' as const, label: 'Member Since', sub: memberSince }] : []),
  ];

  const approved = driver?.status === 'approved';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F6F9' }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={{ backgroundColor: colors.navy, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: spacing.md }}>Profile</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 }}>
            <Pressable onPress={handlePickPhoto} disabled={uploading} style={{ position: 'relative' }}>
              {driver?.profile_photo_url ? (
                <Image source={{ uri: driver.profile_photo_url }} style={{ width: 60, height: 60, borderRadius: 30 }} />
              ) : (
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFFFFF' }}>{initial}</Text>
                </View>
              )}
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: uploading ? '#9AA5BE' : colors.gold, borderWidth: 2, borderColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="camera" size={12} color="#FFFFFF" />
              </View>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 3 }}>{uploading ? 'Uploading…' : displayName}</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>{driver?.email ?? ''}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Pressable onPress={() => setShowLevel(true)} style={{ backgroundColor: `${level.color}30`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: level.color }}>{level.icon} {level.label.toUpperCase()}</Text>
                </Pressable>
                <View style={{ backgroundColor: approved ? 'rgba(26,107,60,0.25)' : 'rgba(220,38,38,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: approved ? '#22C55E' : '#DC2626' }}>{(driver?.status ?? 'pending').toUpperCase()}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={{ padding: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: spacing.md }}>
            {stats.map((s, i) => (
              <View key={i} style={[{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, alignItems: 'center' }, shadows.card]}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: colors.gold, marginBottom: 4 }}>{s.value}</Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '600' }}>{s.label}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={() => setShowLevel(true)} style={[{ backgroundColor: colors.card, borderRadius: radius.card, padding: 16, marginBottom: spacing.md }, shadows.card]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${level.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{level.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>Driver Level</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: level.color }}>{level.label}</Text>
              </View>
              {level.nextAt && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>{totalTrips}/{level.nextAt}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.navy }}>to {level.next}</Text>
                </View>
              )}
            </View>
            {level.nextAt ? (
              <View style={{ height: 7, borderRadius: 4, backgroundColor: '#F4F6F9', overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${levelPct}%`, borderRadius: 4, backgroundColor: level.color }} />
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: level.color, fontWeight: '600', textAlign: 'center' }}>🎉 Maximum level reached!</Text>
            )}
          </Pressable>

          <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, overflow: 'hidden', marginBottom: spacing.md }, shadows.card]}>
            {menuItems.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: i < menuItems.length - 1 ? 1 : 0, borderBottomColor: '#F4F6F9' }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(200,146,42,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={item.icon} size={20} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>{item.label}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{item.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable onPress={() => setShowChangePassword(true)} style={[{ minHeight: 52, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 10 }, shadows.card]}>
            <Ionicons name="key-outline" size={18} color={colors.navy} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.navy }}>Change Password</Text>
          </Pressable>

          <Pressable onPress={contactSupport} style={[{ minHeight: 52, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'rgba(26,107,60,0.25)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 10 }, shadows.card]}>
            <Ionicons name="headset" size={18} color="#1A6B3C" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A6B3C' }}>Contact VISTA Support</Text>
          </Pressable>

          <Pressable
            onPress={handleSignOut}
            disabled={signingOut}
            style={[{ minHeight: 52, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'rgba(220,38,38,0.2)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: signingOut ? 0.7 : 1 }, shadows.card]}
          >
            <Ionicons name="log-out-outline" size={18} color="#DC2626" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#DC2626' }}>{signingOut ? 'Signing out…' : 'Sign Out'}</Text>
          </Pressable>

          <Text style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: colors.textSecondary }}>VISTA Driver — Version 1.0.0</Text>
        </View>
      </ScrollView>

      {showLevel && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(27,46,107,0.55)', alignItems: 'center', justifyContent: 'flex-end' } as any}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, width: '100%' }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 48, marginBottom: 8 }}>{level.icon}</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: level.color, marginBottom: 4 }}>{level.label} Driver</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{totalTrips} trips completed</Text>
            </View>

            <View style={{ backgroundColor: '#F4F6F9', borderRadius: 14, padding: 14, marginBottom: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, marginBottom: 10 }}>Your {level.label} Perks</Text>
              {level.perks.map((perk, i) => (
                <Text key={i} style={{ fontSize: 13, color: '#4B5563', marginBottom: i < level.perks.length - 1 ? 8 : 0 }}>✓ {perk}</Text>
              ))}
            </View>

            <Pressable onPress={() => setShowLevel(false)} style={{ backgroundColor: colors.navy, borderRadius: 14, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {showChangePassword && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(27,46,107,0.55)', alignItems: 'center', justifyContent: 'flex-end' } as any}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, width: '100%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.navy, marginBottom: 6 }}>Change Password</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 18, lineHeight: 18 }}>
              Set a password if you'd like the option to sign in without an email code. This never replaces code sign-in — it's always available too.
            </Text>
            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <VISTAInput placeholder="New password (min 8 characters)" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" />
              <VISTAInput placeholder="Confirm new password" value={confirmNewPassword} onChangeText={setConfirmNewPassword} secureTextEntry autoCapitalize="none" />
            </View>
            <VISTAButton title={changingPassword ? 'Saving…' : 'Save New Password'} variant="accent" fullWidth loading={changingPassword} disabled={changingPassword} onPress={handleChangePassword} />
            <Pressable onPress={() => { setShowChangePassword(false); setNewPassword(''); setConfirmNewPassword(''); }} style={{ marginTop: 10, alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
