// Supabase Edge Function: delete-driver-account
//
// Lets a signed-in DRIVER permanently delete their own personal data from
// inside the VISTA Driver app (App Store Guideline 5.1.1(v)).
//
// Why this is not the customer app's delete-account function: the Supabase
// Auth project is shared by every VISTA app. A person can be both a customer
// and a driver, so we must NOT delete the shared login unless it has no
// customer profile. This function removes the driver side only:
//   1. uploaded documents in the driver-documents bucket
//   2. personal fields on the drivers row (kept as an anonymous shell because
//      bookings/rides reference drivers.id for payout accounting)
//   3. the driver's notifications and chat-sender link
//   4. the shared auth user, ONLY if the person has no customer profile. If
//      other tables still reference the login (foreign keys) it is anonymised
//      and disabled instead, so the person can no longer sign in or be identified.
//
// Live-schema facts this relies on (verified 2026-10-15):
//   drivers.user_id -> auth.users is ON DELETE CASCADE, so user_id is set to
//   null BEFORE the login is touched, otherwise the drivers row would be deleted.
//   drivers.full_name and drivers.phone are NOT NULL (placeholders are used).
//   ride_messages.sender_id -> auth.users is NO ACTION (blocks user deletion).
//
// The caller is identified solely from their own access token, never from a
// client-supplied id, so one user cannot delete another's data.
//
// Deploy:  supabase functions deploy delete-driver-account

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKET = 'driver-documents';
const DOC_COLUMNS = [
  'profile_photo_url',
  'license_front_url',
  'license_back_url',
  'national_id_front_url',
  'national_id_back_url',
  'police_clearance_url',
  'vehicle_photo_url',
  'national_id_url',
  'license_url',
  'passport_url',
  'interpol_clearance_url',
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function storagePathFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  return path || null;
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid or expired session' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const userId = user.id;

    const { data: driver, error: driverErr } = await admin
      .from('drivers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (driverErr) throw driverErr;

    if (driver) {
      // 1. Documents. Any failure stops here so nothing is half-deleted.
      const paths = DOC_COLUMNS.map((c) => storagePathFromUrl(driver[c])).filter(
        (p): p is string => !!p,
      );
      if (paths.length > 0) {
        const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
        if (rmErr) throw rmErr;
      }

      // 2. Scrub the drivers row into an anonymous shell (user_id first, see header).
      const nullDocs = Object.fromEntries(DOC_COLUMNS.map((c) => [c, null]));
      const { error: scrubErr } = await admin
        .from('drivers')
        .update({
          ...nullDocs,
          user_id: null,
          full_name: 'Deleted Driver',
          phone: '',
          email: null,
          plate_number: null,
          vehicle_make: null,
          vehicle_model: null,
          vehicle_year: null,
          vehicle_color: null,
          is_female: null,
          admin_notes: null,
          rejection_reason: null,
          fcm_token: null,
          current_latitude: null,
          current_longitude: null,
          is_online: false,
          status: 'suspended',
        })
        .eq('id', driver.id);
      if (scrubErr) throw scrubErr;
    }

    // 3. Best-effort cleanup of other personal links to this login.
    await admin.from('notifications').delete().eq('user_id', userId);
    await admin.from('ride_messages').update({ sender_id: null }).eq('sender_id', userId);

    // 4. Shared login: keep it if the person is also a customer.
    const { data: customerProfile, error: profileErr } = await admin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    let authDeleted = false;
    if (!customerProfile) {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        // Still referenced somewhere: anonymise and disable the login instead.
        const { error: anonErr } = await admin.auth.admin.updateUserById(userId, {
          email: `deleted-${userId}@deleted.invalid`,
          phone: '',
          user_metadata: {},
          ban_duration: '876000h',
        });
        if (anonErr) throw anonErr;
      } else {
        authDeleted = true;
      }
    }

    return json({ success: true, authDeleted });
  } catch (err) {
    console.error('delete-driver-account failed', err);
    return json({ error: 'Could not delete your account. Please contact VISTA support.' }, 500);
  }
});
