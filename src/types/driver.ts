// Mirrors the live Supabase schema (verified against information_schema on
// 2026-09-29) rather than the web driver app's looser JS shapes — every
// field used by DashboardScreen/EarningsScreen/ProfileScreen exists as a
// real column, so a typo here fails a `tsc` check instead of silently
// no-op'ing a driver action against the wrong column name.

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'driver_assigned'
  | 'en_route'
  | 'driver_arrived'
  | 'completed'
  | 'cancelled'
  | 'payment_failed'
  | 'paid';

export type Booking = {
  id: string;
  booking_ref: string | null;
  customer_id: string | null;
  driver_id: string | null;
  service_type: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_date: string;
  pickup_time: string;
  passengers: number | null;
  special_requests: string | null;
  amount_usd: number | null;
  driver_earnings: number | null;
  status: BookingStatus;
  passenger_name: string | null;
  passenger_phone: string | null;
  created_at: string;
  updated_at: string | null;
};

export type VistaRideStatus = 'searching' | 'driver_assigned' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export type VistaRide = {
  id: string;
  booking_ref: string | null;
  customer_id: string | null;
  driver_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  total_ugx: number | null;
  total_usd: number | null;
  vehicle_type: string | null;
  status: VistaRideStatus;
  created_at: string;
  customer_name?: string | null;
};

export type PilgrimScheduleItem = { time?: string; icon?: string; text: string; location?: string };
export type PilgrimScheduleDay = { date: string; dateLabel?: string; label: string; items: PilgrimScheduleItem[] };

export type PilgrimPackage = {
  id: string;
  booking_ref: string | null;
  customer_id: string | null;
  driver_id: string | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  group_size: number | null;
  arrival_date: string | null;
  flight_number: string | null;
  arrival_time: string | null;
  hotel_name: string | null;
  status: string;
  driver_base_earnings: number | null;
  driver_holdback: number | null;
  holdback_released: boolean | null;
  schedule: PilgrimScheduleDay[] | null;
};
