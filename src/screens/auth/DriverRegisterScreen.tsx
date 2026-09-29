import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../../lib/supabase';
import VISTAButton from '../../components/VISTAButton';
import VISTAInput from '../../components/VISTAInput';
import { colors, radius, spacing } from '../../lib/theme';

const BUCKET = 'driver-documents';

// Mirrors the web driver app's DriverRegisterScreen.jsx: same 7 mandatory
// documents, same 2-step shape, same drivers-row insert with status:
// 'pending' (an admin approves it later — this app never self-approves).
const DOC_CONFIG = [
  { key: 'profile_photo', label: 'Your Photo', hint: 'A clear photo of your face, good lighting, no sunglasses or hats.', dbCol: 'profile_photo_url' },
  { key: 'license_front', label: 'Driving Permit — Front', hint: 'Front of your driving permit, name and number visible.', dbCol: 'license_front_url' },
  { key: 'license_back', label: 'Driving Permit — Back', hint: 'Back of your driving permit.', dbCol: 'license_back_url' },
  { key: 'national_id_front', label: 'National ID — Front', hint: 'Front of your National ID or Passport.', dbCol: 'national_id_front_url' },
  { key: 'national_id_back', label: 'National ID — Back', hint: 'Back of your National ID.', dbCol: 'national_id_back_url' },
  { key: 'police_clearance', label: 'Police / Interpol Clearance', hint: 'Your clearance certificate from Uganda Police Force.', dbCol: 'police_clearance_url' },
  { key: 'vehicle_photo', label: 'Vehicle Photo', hint: 'Your vehicle with the plate number visible.', dbCol: 'vehicle_photo_url' },
] as const;

const VEHICLE_TYPES = [
  { key: 'motorcycle', label: 'Boda Boda', icon: 'bicycle' as const },
  { key: 'car', label: 'Car', icon: 'car-sport' as const },
  { key: 'suv', label: 'SUV', icon: 'car' as const },
  { key: 'van', label: 'Van', icon: 'bus' as const },
];

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
  const [vehicleType, setVehicleType] = useState('car');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [docs, setDocs] = useState<Record<string, { uri: string; base64: string; ext: string } | undefined>>({});

  const uploadedCount = DOC_CONFIG.filter((d) => docs[d.key]).length;
  const allDocsUploaded = uploadedCount === DOC_CONFIG.length;

  const step1Valid = fullName.trim().length > 0 && phone.trim().length >= 9 && email.includes('@') && (hasSession || password.length >= 8);

  const pickDoc = async (key: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access in Settings to upload documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    setDocs((prev) => ({ ...prev, [key]: { uri: asset.uri, base64: asset.base64!, ext } }));
  };

  const handleSubmit = async () => {
    if (!allDocsUploaded) return;
    setSubmitting(true);
    try {
      const normalizedPhone = phone.replace(/\D/g, '');
      const basePath = `${normalizedPhone}-${Date.now()}`;
      const urls: Record<string, string> = {};

      for (let i = 0; i < DOC_CONFIG.length; i++) {
        const cfg = DOC_CONFIG[i];
        const doc = docs[cfg.key]!;
        setProgressLabel(`Uploading ${cfg.label}… (${i + 1}/${DOC_CONFIG.length})`);
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
        phone: normalizedPhone.startsWith('256') ? `+${normalizedPhone}` : `+256${normalizedPhone}`,
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
        const { error: authErr } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: fullName.trim(), role: 'driver' } },
        });
        // Non-fatal: the drivers row is already saved either way; admin
        // approval will still work, and the applicant can sign in with an
        // email code once approved even if this particular signUp call hit
        // a transient error.
        if (authErr) console.warn('[Register] auth signUp note:', authErr.message);
      }

      supabase.functions.invoke('notify-admin-driver', {
        body: { full_name: fullName.trim(), phone: normalizedPhone, email: normalizedEmail, vehicle_type: vehicleType, vehicle_make: vehicleMake.trim() || null, vehicle_model: vehicleModel.trim() || null, plate_number: plateNumber.trim() || null },
      }).catch(() => {});

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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(26,107,60,0.1)', borderWidth: 2, borderColor: '#1A6B3C', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Ionicons name="checkmark" size={36} color="#1A6B3C" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.navy, marginBottom: 12, textAlign: 'center' }}>Application Submitted!</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 32 }}>
            Thanks, {fullName.split(' ')[0]}. Our team will review your documents and contact you within 24 hours at {email}.
          </Text>
          <VISTAButton title="Back to Sign In" variant="accent" fullWidth onPress={onSubmitted} />
        </View>
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
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Step {step} of 2 — {step === 1 ? 'Your Details' : 'Vehicle & Documents'}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}>
        {progressLabel && (
          <View style={{ backgroundColor: 'rgba(27,46,107,0.08)', borderRadius: 12, padding: 12, marginBottom: spacing.md }}>
            <Text style={{ color: colors.navy, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>⏳ {progressLabel}</Text>
          </View>
        )}

        {step === 1 ? (
          <View style={{ gap: spacing.sm }}>
            <VISTAInput placeholder="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            <VISTAInput placeholder="Phone (e.g. 700 000 000)" value={phone} onChangeText={(t) => setPhone(t.replace(/[^\d]/g, ''))} keyboardType="phone-pad" />
            <VISTAInput
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!initialEmail}
            />
            {!hasSession && (
              <VISTAInput placeholder="Password (min 8 characters)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            )}
            <View style={{ marginTop: spacing.sm }}>
              <VISTAButton title="Continue" variant="accent" fullWidth disabled={!step1Valid} onPress={() => setStep(2)} />
            </View>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Vehicle Type</Text>
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
                  </Pressable>
                );
              })}
            </View>

            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <VISTAInput placeholder="Vehicle make (e.g. Toyota)" value={vehicleMake} onChangeText={setVehicleMake} />
              <VISTAInput placeholder="Model (e.g. Noah)" value={vehicleModel} onChangeText={setVehicleModel} />
              <VISTAInput placeholder="Plate number" value={plateNumber} onChangeText={(t) => setPlateNumber(t.toUpperCase())} autoCapitalize="characters" />
            </View>

            <View style={{ backgroundColor: colors.navy, borderRadius: 16, padding: 16, marginBottom: spacing.md }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.gold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                Required Documents ({uploadedCount}/{DOC_CONFIG.length})
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 14 }}>All 7 are mandatory before you can submit.</Text>

              {DOC_CONFIG.map((cfg) => {
                const done = !!docs[cfg.key];
                return (
                  <Pressable
                    key={cfg.key}
                    onPress={() => pickDoc(cfg.key)}
                    style={{
                      backgroundColor: done ? 'rgba(26,107,60,0.18)' : 'rgba(255,255,255,0.05)',
                      borderWidth: 1.5, borderColor: done ? '#1A6B3C' : 'rgba(200,146,42,0.5)', borderStyle: 'dashed',
                      borderRadius: 12, padding: 14, marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name={done ? 'checkmark-circle' : 'cloud-upload-outline'} size={20} color={done ? '#4ADE80' : colors.gold} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{cfg.label}</Text>
                        {!done && <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{cfg.hint}</Text>}
                      </View>
                      {done && <Text style={{ fontSize: 11, fontWeight: '700', color: '#4ADE80' }}>Change</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <VISTAButton
              title={submitting ? (progressLabel ?? 'Submitting…') : allDocsUploaded ? 'Submit Application' : `Upload all ${DOC_CONFIG.length} documents to submit`}
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
    </SafeAreaView>
  );
}
