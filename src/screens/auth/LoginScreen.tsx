import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import VISTAButton from '../../components/VISTAButton';
import VISTAInput from '../../components/VISTAInput';
import { colors, spacing } from '../../lib/theme';

// Existing drivers sign in with an email code or (for the App Review demo
// account) a password. New applicants use the separate Register flow below,
// which is vetted by dispatch — signing in never self-activates an account.
const schema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
});
type FormData = z.infer<typeof schema>;

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { sendOtp, signInWithPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [password, setPassword] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });

  const onSubmit = async ({ email }: FormData) => {
    setLoading(true);
    setServerError(null);
    if (passwordMode) {
      const { error: pwError } = await signInWithPassword(email, password);
      setLoading(false);
      if (pwError) setServerError('Incorrect email or password. Please try again.');
      return;
    }
    const { error } = await sendOtp(email);
    setLoading(false);
    if (error) {
      setServerError("We couldn't send a code to this email. Please check the address and try again.");
      return;
    }
    navigation.navigate('OTP', { email });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.lg }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg }}>
            <Image source={require('../../../assets/vista-logo.png')} style={{ width: 48, height: 48, resizeMode: 'contain' }} />
          </View>

          <Text style={{ color: colors.navy, fontSize: 24, fontWeight: '700', marginBottom: 6 }}>
            Sign in to VISTA Driver
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.xl }}>
            {passwordMode ? 'Enter your email and password' : 'Enter your email to receive a 6-digit code'}
          </Text>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <VISTAInput
                placeholder="your@email.com"
                value={value}
                onChangeText={(text) => {
                  onChange(text);
                  setServerError(null);
                }}
                onBlur={onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={handleSubmit(onSubmit)}
                error={errors.email?.message ?? serverError ?? undefined}
                leftIcon={<Ionicons name="mail-outline" size={18} color={colors.navy} />}
              />
            )}
          />

          {passwordMode && (
            <View style={{ marginTop: spacing.sm }}>
              <VISTAInput
                placeholder="Password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setServerError(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleSubmit(onSubmit)}
                leftIcon={<Ionicons name="lock-closed-outline" size={18} color={colors.navy} />}
              />
            </View>
          )}

          <View style={{ height: spacing.md }} />

          <VISTAButton
            title={passwordMode ? (loading ? 'Signing in...' : 'Sign in') : loading ? 'Sending code...' : 'Send verification code'}
            variant="accent"
            loading={loading}
            disabled={!isValid || (passwordMode && password.length === 0)}
            onPress={handleSubmit(onSubmit)}
          />

          <Pressable
            onPress={() => {
              setPasswordMode((v) => !v);
              setPassword('');
              setServerError(null);
            }}
            style={{ paddingTop: spacing.sm, alignItems: 'center' }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
              {passwordMode ? 'Use an email code instead' : 'Sign in with a password instead'}
            </Text>
          </Pressable>
          {passwordMode && (
            <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
              Forgot it? Use an email code above, then change your password from Profile.
            </Text>
          )}

          <View style={{ flex: 1 }} />

          <Pressable onPress={() => navigation.navigate('Register')} style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
            <Text style={{ color: colors.navy, fontSize: 14, fontWeight: '700' }}>Apply to become a VISTA driver</Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingBottom: spacing.lg }}>
            New drivers are reviewed and approved by our team before their account is activated.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
