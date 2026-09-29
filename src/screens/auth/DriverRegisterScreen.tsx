import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../../lib/supabase';
import VISTAButton from '../../components/VISTAButton';
import VISTAInput from '../../components/VISTAInput';
import { colors, radius, spacing } from '../../lib/theme';

const BUCKET = 'driver-documents';
const MAX_DOC_MB = 10;

// Field-for-field match with the Android Driver PWA's DriverRegisterScreen.jsx
// (confirmed against the peer session's source read) so both platforms are
// the same registration flow, just built natively.
const DOC_CONFIG = [
  { key: 'profile_photo', label: 'Your Photo — REQUIRED', hint: 'Take a clear photo of your face. Look directly at the camera, good lighting, no sunglasses or hats, no filters, plain background preferred.', dbCol: 'profile_photo_url', frontCamera: true },
  { key: 'license_front', label: 'Driving Permit — Front Side', hint: 'Photo of the FRONT of your driving permit showing your name and number.', dbCol: 'license_front_url', frontCamera: false },
  { key: 'license_back', label: 'Driving Permit — Back Side', hint: 'Photo of the BACK of your driving permit.', dbCol: 'license_back_url', frontCamera: false },
  { key: 'national_id_front', label: 'National ID — Front Side', hint: 'Photo of the FRONT of your National ID or Passport.', dbCol: 'national_id_front_url', frontCamera: false },
  { key: 'national_id_back', label: 'National ID — Back Side', hint: 'Photo of the BACK of your National ID.', dbCol: 'national_id_back_url', frontCamera: false },
  { key: 'police_clearance', label: 'Police / Interpol Clearance', hint: 'Photo of your clearance certificate from Uganda Police Force. Required for the safety of our passengers.', dbCol: 'police_clearance_url', frontCamera: false },
  { key: 'vehicle_photo', label: 'Your Vehicle Photo', hint: 'Clear photo of your vehicle. Make sure the plate number is visible.', dbCol: 'vehicle_photo_url', frontCamera: false },
] as const;

const VEHICLE_TYPES = [
  { key: 'motorcycle', label: 'Boda Boda', sub: 'Motorcycle', icon: 'bicycle' as const },
  { key: 'car', label: 'Car', sub: 'Saloon / Sedan', icon: 'car-sport' as const },
  { key: 'suv', label: 'SUV', sub: 'SUV / Executive', icon: 'car' as const },
  { key: 'van', label: 'Van', sub: 'Minibus or Van', icon: 'bus' as const },
];

const VEHICLE_MAKES = ['Toyota', 'Nissan', 'Mercedes', 'Honda', 'Mitsubishi', 'Isuzu', 'Land Rover', 'Ford', 'Other'];

type Props = {
  /** Pre-fill and lock the email when reached from an already-signed-in session with no drivers row. */
  initialEmail?: string;
  /** True when the applicant already has a Supabase session (skip account creation, just insert the drivers row). */
  hasSession: boolean;
  onSubmitted: () => void;
  onCancel: () => void;
};

export default function DriverRegisterScreen({ initialEmail, hasSession, onSubmitted, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [vehicleType, setVehicleType] = useState('car');
  const [vehicleMake, setVehicleMake] = useState('');
  const [makePickerOpen, setMakePickerOpen] = useState(false);
  const [vehicleModel, setVehicleModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [docs, setDocs] = useState<Record<string, { base64: string; ext: string; sizeBytes: number } | undefined>>({});

  const uploadedCount = DOC_CONFIG.filter((d) => docs[d.key]).length;
  const allDocsUploaded = uploadedCount === DOC_CONFIG.length;

  const passwordsMatch = !hasSession ? password === confirmPassword : true;
  const step1Valid =
    fullName.trim().length > 0 &&
    phone.trim().length >= 9 &&
    email.includes('@') &&
    (hasSession || (password.length >= 8 && confirmPassword.length >= 8 && passwordsMatch));

  const addDocFromAsset = (key: string, asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) return;
    const sizeBytes = (asset.base64.length * 3) / 4;
    if (sizeBytes > MAX_DOC_MB * 1024 * 1024) {
      Alert.alert('File too large', `Please choose a photo under ${MAX_DOC_MB} MB.`);
      return;
    }
    const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    setDocs((prev) => ({ ...prev, [key]: { base64: asset.base64!, ext, sizeBytes } }));
  };

  const pickFromCamera = async (key: string, frontCamera: boolean) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Enable camera access in Settings to take this photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true, cameraType: frontCamera ? ImagePicker.CameraType.front : ImagePicker.CameraType.back });
    if (!result.canceled && result.assets[0]) addDocFromAsset(key, result.assets[0]);
  };

  const pickFromGallery = async (key: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access in Settings to upload documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
    if (!result.canceled && result.assets[0]) addDocFromAsset(key, result.assets[0]);
  };

  const handleSubmit = async () => {
    if (!allDocsUploaded) return;
    setSubmitting(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const normalizedPhone = digits.startsWith('256') ? `+${digits}` : `+256${digits}`;
      const basePath = `${normalizedPhone.replace('+', '')}-${Date.now()}`;
      const urls: Record<string, string> = {};

      for (let i = 0; i < DOC_CONFIG.length; i++) {
        const cfg = DOC_CONFIG[i];
        const doc = docs[cfg.key]!;
        setProgressLabel(`Uploading ${cfg.label.replace(/ — REQUIRED$/, '')}… (${i + 1}/${DOC_CONFIG.length})`);
        const contentType = doc.ext === 'png' ? 'image/png' : 'image/jpeg';
        const path = `drivers/${basePath}/${cfg.key}.${doc.ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, decode(doc.base64), { upsert: true, contentType });
        if (upErr) throw new Error(`${cfg.label} upload failed: ${upErr.message}`);
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        urls[cfg.dbCol] = data.publicUrl;
      }

      setProgressLabel('Saving your application…');
      const normalizedEmail = email.trim().toLowerCase();
      const { error: dbErr } = await supabase.from('drivers').insert({
        full_name: fullName.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        group_affiliation: 'VISTA',
        vehicle_type: vehicleType,
        vehicle_make: vehicleMake.trim() || null,
        vehicle_model: vehicleModel.trim() || null,
        plate_number: plateNumber.trim() || null,
        status: 'pending',
        is_online: false,
        rating: 5.0,
        total_trips: 0,
        total_earnings: 0,
        ...urls,
      });
      if (dbErr) {
        throw new Error(
          dbErr.message.includes('unique') || dbErr.message.includes('duplicate')
            ? 'A driver with this phone or email is already registered.'
            : `Could not save your application: ${dbErr.message}`
        );
      }

      if (!hasSession) {
        setProgressLabel('Creating your login…');
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: fullName.trim(), role: 'driver' } },
        });
        if (authErr) {
          // Non-fatal: the drivers row is already saved either way.
          console.warn('[Register] auth signUp note:', authErr.message);
        } else if (authData.user?.id) {
          await supabase.from('drivers').update({ user_id: authData.user.id }).eq('email', normalizedEmail);
        }
      }

      supabase.functions
        .invoke('notify-admin-driver', {
          body: { full_name: fullName.trim(), phone: normalizedPhone, email: normalizedEmail, vehicle_type: vehicleType, vehicle_make: vehicleMake.trim() || null, vehicle_model: vehicleModel.trim() || null, plate_number: plateNumber.trim() || null },
        })
        .catch(() => {});

      setSubmitted(true);
    } catch (err) {
      Alert.alert('Could not submit', (err as Error)?.message ?? 'Please check your connection and try again.');
    } finally {
      setSubmitting(false);
      setProgressLabel(null);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F6F9' }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, alignItems: 'center' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(26,107,60,0.1)', borderWidth: 2, borderColor: '#1A6B3C', alignItems: 'center', justifyContent: 'center', marginTop: 32, marginBottom: 24 }}>
            <Ionicons name="checkmark" size={36} color="#1A6B3C" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.navy, marginBottom: 12, textAlign: 'center' }}>Application Submitted!</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 24 }}>
            Thank you, {fullName.split(' ')[0]}. Your application has been received. Our team will review and contact you within 24 hours on{' '}
            <Text style={{ fontWeight: '700', color: colors.navy }}>{phone.startsWith('+') ? phone : `+256${phone.replace(/\D/g, '')}`}</Text> and{' '}
            <Text style={{ fontWeight: '700', color: colors.navy }}>{email}</Text>.
          </Text>

          <View style={{ width: '100%', backgroundColor: colors.card, borderRadius: 14, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>7 Documents Submitted</Text>
            {DOC_CONFIG.map((d) => (
              <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Ionicons name="checkmark-circle" size={14} color="#1A6B3C" />
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{d.label.replace(/ — REQUIRED$/, '')}</Text>
              </View>
            ))}
          </View>

          <View style={{ width: '100%', backgroundColor: colors.card, borderRadius: 14, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>What happens next</Text>
            {['Admin reviews your application and documents', 'Your driving permit and ID are verified', 'You receive approval via phone and email', 'Log in and start accepting jobs'].map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>{s}</Text>
              </View>
            ))}
          </View>

          <VISTAButton title="Back to Home" variant="accent" fullWidth onPress={onSubmitted} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F6F9' }}>
      <View style={{ backgroundColor: colors.navy, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <Pressable onPress={onCancel} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, alignSelf: 'flex-start' }}>
          <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.7)" />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' }}>Back</Text>
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF' }}>Apply to Drive</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <StepDot active={step >= 1} current={step === 1} label="1" />
          <View style={{ flex: 1, height: 2, backgroundColor: step > 1 ? colors.gold : 'rgba(255,255,255,0.2)', marginHorizontal: 6 }} />
          <StepDot active={step >= 2} current={step === 2} label="2" />
          <Text style={{ marginLeft: 12, fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>
            Step {step} of 2 — {step === 1 ? 'Account Setup' : 'Vehicle & Documents'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}>
        {progressLabel && (
          <View style={{ backgroundColor: 'rgba(27,46,107,0.08)', borderRadius: 12, padding: 12, marginBottom: spacing.md }}>
            <Text style={{ color: colors.navy, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>⏳ {progressLabel}</Text>
          </View>
        )}

        {step === 1 ? (
          <View style={{ gap: spacing.sm }}>
            <VISTAInput placeholder="e.g. John Kalyango" label="Full Name" value={fullName} onChangeText={setFullName} autoCapitalize="words" autoComplete="name" />
            <VISTAInput placeholder="700 000 000" label="Phone Number" value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, ''))} keyboardType="phone-pad" autoComplete="tel" leftIcon={<Text style={{ fontSize: 15, color: colors.textSecondary, fontWeight: '600' }}>🇺🇬 +256</Text>} />
            <VISTAInput
              placeholder="your@email.com"
              label="Email Address * (for login)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!initialEmail}
            />
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: -4 }}>You will use this email to log in</Text>

            {!hasSession && (
              <>
                <VISTAInput
                  placeholder="At least 8 characters"
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  rightIcon={
                    <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
                    </Pressable>
                  }
                />
                <VISTAInput
                  placeholder="Re-enter your password"
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  error={confirmPassword && !passwordsMatch ? 'Passwords do not match' : undefined}
                  rightIcon={
                    <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
                      <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
                    </Pressable>
                  }
                />
              </>
            )}
            <View style={{ marginTop: spacing.sm }}>
              <VISTAButton title="Continue to Step 2 →" variant="accent" fullWidth disabled={!step1Valid} onPress={() => setStep(2)} />
            </View>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Vehicle Details</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 }}>Vehicle Type *</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md }}>
              {VEHICLE_TYPES.map((vt) => {
                const selected = vehicleType === vt.key;
                return (
                  <Pressable
                    key={vt.key}
                    onPress={() => setVehicleType(vt.key)}
                    style={{
                      width: '47%', backgroundColor: selected ? 'rgba(200,146,42,0.08)' : colors.card,
                      borderWidth: selected ? 2 : 1, borderColor: selected ? colors.gold : colors.border,
                      borderRadius: 12, padding: 14,
                    }}
                  >
                    <Ionicons name={vt.icon} size={22} color={selected ? colors.gold : colors.navy} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? colors.gold : colors.navy, marginTop: 6 }}>{vt.label}</Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{vt.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <Pressable onPress={() => setMakePickerOpen(true)}>
                <View pointerEvents="none">
                  <VISTAInput
                    placeholder="Select"
                    label="Vehicle Make"
                    value={vehicleMake}
                    editable={false}
                    rightIcon={<Ionicons name="chevron-down" size={16} color={colors.textSecondary} />}
                  />
                </View>
              </Pressable>
              <VISTAInput placeholder="e.g. Hiace" label="Model" value={vehicleModel} onChangeText={setVehicleModel} />
              <VISTAInput placeholder="UAW 492K" label="Number Plate" value={plateNumber} onChangeText={(t) => setPlateNumber(t.toUpperCase())} autoCapitalize="characters" />
            </View>

            <View style={{ backgroundColor: colors.navy, borderRadius: 16, padding: 16, marginBottom: spacing.md }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.gold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                Required Documents ({uploadedCount}/{DOC_CONFIG.length})
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 14 }}>All 7 documents are mandatory. Use your phone camera or gallery for each one.</Text>

              {DOC_CONFIG.map((cfg) => {
                const done = !!docs[cfg.key];
                return (
                  <View
                    key={cfg.key}
                    style={{
                      backgroundColor: done ? 'rgba(26,107,60,0.18)' : 'rgba(255,255,255,0.04)',
                      borderWidth: 2, borderColor: done ? '#1A6B3C' : colors.gold, borderStyle: 'dashed',
                      borderRadius: 12, padding: 14, marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 }}>{cfg.label}</Text>
                    {!done && <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 10, lineHeight: 16 }}>{cfg.hint}</Text>}
                    {done ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="checkmark-circle" size={18} color="#4ADE80" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#4ADE80', flex: 1 }}>Uploaded — {((docs[cfg.key]!.sizeBytes) / 1024).toFixed(0)} KB</Text>
                        <Pressable onPress={() => pickFromGallery(cfg.key)}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.gold }}>Change</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Pressable onPress={() => pickFromCamera(cfg.key, cfg.frontCamera)} style={{ flex: 1, backgroundColor: '#243B6E', borderWidth: 1.5, borderColor: colors.gold, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>📷 Take Photo Now</Text>
                        </Pressable>
                        <Pressable onPress={() => pickFromGallery(cfg.key)} style={{ flex: 1, backgroundColor: '#243B6E', borderWidth: 1.5, borderColor: colors.gold, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>🖼️ Choose from Gallery</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            <VISTAButton
              title={submitting ? (progressLabel ?? 'Submitting…') : allDocsUploaded ? 'Submit Application ✓' : `Complete all ${DOC_CONFIG.length} documents to submit`}
              variant="accent"
              fullWidth
              loading={submitting}
              disabled={submitting || !allDocsUploaded}
              onPress={handleSubmit}
            />
            <Pressable onPress={() => setStep(1)} style={{ marginTop: 10, alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Back to your details</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal visible={makePickerOpen} transparent animationType="fade" onRequestClose={() => setMakePickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(27,46,107,0.5)', justifyContent: 'flex-end' }} onPress={() => setMakePickerOpen(false)}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 24 }}>
            {VEHICLE_MAKES.map((m) => (
              <Pressable key={m} onPress={() => { setVehicleMake(m); setMakePickerOpen(false); }} style={{ paddingVertical: 14, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: '#F4F6F9' }}>
                <Text style={{ fontSize: 16, color: colors.navy, fontWeight: m === vehicleMake ? '700' : '400' }}>{m}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function StepDot({ active, current, label }: { active: boolean; current: boolean; label: string }) {
  return (
    <View
      style={{
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: active ? colors.navy : 'rgba(255,255,255,0.15)',
        borderWidth: current ? 2 : 0, borderColor: colors.gold,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }}>{label}</Text>
    </View>
  );
}
