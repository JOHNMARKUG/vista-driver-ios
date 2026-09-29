import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import OTPInput from '../../components/OTPInput';
import VISTAButton from '../../components/VISTAButton';
import { colors, spacing } from '../../lib/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'OTP'>;

export default function OTPScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const { verifyOtp, sendOtp } = useAuth();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleVerify = async (submittedCode: string) => {
    if (submittedCode.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    const { error: verifyError } = await verifyOtp(email, submittedCode);
    setLoading(false);
    if (verifyError) {
      setError('That code is incorrect or has expired.');
      setCode('');
      return;
    }
    // AppNavigator reacts to the new session/driver state automatically.
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setCountdown(60);
    setCode('');
    setError(null);
    await sendOtp(email);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy }} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm, alignSelf: 'flex-start' }}
        >
          <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.6)" />
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' }}>Back</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
        <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginBottom: spacing.sm }}>Check your email</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 22 }}>We sent a 6-digit code to</Text>
        <Text style={{ color: colors.gold, fontSize: 15, fontWeight: '700', marginBottom: spacing.xl }}>{email}</Text>

        <OTPInput value={code} onChange={(v) => { setCode(v); setError(null); if (v.length === 6) handleVerify(v); }} />
        {error ? (
          <Text style={{ color: '#FF6B60', fontSize: 13, textAlign: 'center', marginTop: spacing.sm }}>{error}</Text>
        ) : (
          <Text style={{ color: 'rgba(200,146,42,0.9)', fontSize: 12, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 }}>
            The code expires after a few minutes.
          </Text>
        )}

        <View style={{ alignItems: 'center', marginTop: spacing.lg, gap: 6 }}>
          {countdown > 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Resend code in 0:{String(countdown).padStart(2, '0')}</Text>
          ) : (
            <Pressable onPress={handleResend}>
              <Text style={{ color: colors.gold, fontSize: 13, fontWeight: '700' }}>Resend code</Text>
            </Pressable>
          )}
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Check your spam folder if it doesn't arrive.</Text>
        </View>

        <View style={{ flex: 1 }} />

        <VISTAButton
          title={loading ? 'Verifying...' : 'Verify and continue'}
          variant="accent"
          loading={loading}
          disabled={code.length !== 6}
          onPress={() => handleVerify(code)}
        />
      </View>
    </SafeAreaView>
  );
}
