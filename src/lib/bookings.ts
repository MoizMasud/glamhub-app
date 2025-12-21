import { supabase } from "./supabase";

export type BookingStatus = "pending" | "accepted" | "cancelled" | "completed";

export type ConsultationMeta =
  | {
      wants_consultation: true;
      availability: string[];
      note: string | null;

      // ✅ artist-side workflow
      consult_status?: "requested" | "proposed" | "scheduled" | "declined";
      proposed_time_iso?: string | null;
      proposed_note?: string | null;
    }
  | null;

export type ProfileLite = {
  full_name: string | null;
  username: string | null;
  phone?: string | null;

  // ✅ NEW: consultation rule setting
  allow_same_day_consultation?: boolean | null;
};

export type BookingRow = {
  id: string;
  service_id: string;
  artist_id: string;
  client_id: string;
  status: BookingStatus;
  start_time: string;
  notes: string | null;
  created_at: string;

  client_profile?: ProfileLite | null;
  artist_profile?: ProfileLite | null;

  consultation_meta?: ConsultationMeta;

  client_hidden_at?: string | null;
  artist_hidden_at?: string | null;
};

const BOOKING_SELECT = `
  id,service_id,artist_id,client_id,status,start_time,notes,created_at,
  consultation_meta,client_hidden_at,artist_hidden_at,
  client_profile:profiles!bookings_client_id_fkey ( full_name, username, phone ),
  artist_profile:profiles!bookings_artist_id_fkey ( full_name, username, phone, allow_same_day_consultation )
`;

function normalizeProfile(val: any): ProfileLite | null {
  if (!val) return null;
  if (Array.isArray(val)) return (val[0] as any) ?? null;
  return val as any;
}

function normalizeBookingRow(raw: any): BookingRow {
  const r: any = raw ?? {};
  return {
    id: String(r.id),
    service_id: String(r.service_id),
    artist_id: String(r.artist_id),
    client_id: String(r.client_id),
    status: (r.status ?? "pending") as BookingStatus,
    start_time: String(r.start_time),
    notes: r.notes ?? null,
    created_at: String(r.created_at),

    consultation_meta: (r.consultation_meta ?? null) as ConsultationMeta,

    client_hidden_at: r.client_hidden_at ?? null,
    artist_hidden_at: r.artist_hidden_at ?? null,

    client_profile: normalizeProfile(r.client_profile),
    artist_profile: normalizeProfile(r.artist_profile),
  };
}

function normalizeMany(rows: any[]): BookingRow[] {
  return (rows ?? []).map(normalizeBookingRow);
}

export async function createBooking(input: {
  serviceId: string;
  artistId: string;
  startTimeISO: string;
  endTimeISO: string; // ✅ NEW (explicit end time)
  notes?: string;
  consultation_meta?: ConsultationMeta;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data, error } = await supabase
    .from("bookings")
    .insert([
      {
        service_id: input.serviceId,
        artist_id: input.artistId,
        client_id: user.id,
        start_time: input.startTimeISO,
        end_time: input.endTimeISO, // ✅ NEW
        notes: input.notes ?? null,
        status: "pending",
        consultation_meta: input.consultation_meta ?? null,
      },
    ])
    .select(BOOKING_SELECT)
    .single();

  if (error) throw error;
  return normalizeBookingRow(data);
}


export async function listMyBookings() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("client_id", user.id)
    .is("client_hidden_at", null)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return normalizeMany((data as any[]) ?? []);
}

export async function listArtistBookings() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("artist_id", user.id)
    .is("artist_hidden_at", null)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return normalizeMany((data as any[]) ?? []);
}

export async function updateBookingStatus(bookingId: string, status: BookingStatus) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .select(BOOKING_SELECT);

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Update blocked by RLS (no rows updated).");
  return normalizeBookingRow(data[0]);
}

export async function updateBookingConsultationMeta(
  bookingId: string,
  patch: Partial<NonNullable<ConsultationMeta>>
) {
  const { data: row, error: readErr } = await supabase
    .from("bookings")
    .select("id,consultation_meta")
    .eq("id", bookingId)
    .single();

  if (readErr) throw readErr;

  const current = (row as any)?.consultation_meta ?? null;
  if (!current) throw new Error("No consultation data on this booking.");

  const next = { ...(current as any), ...(patch as any) };

  const { data, error } = await supabase
    .from("bookings")
    .update({ consultation_meta: next })
    .eq("id", bookingId)
    .select(BOOKING_SELECT);

  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Update blocked by RLS (no rows updated).");
  return normalizeBookingRow(data[0]);
}

export async function hideBookingForMe(bookingId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data: row, error: readErr } = await supabase
    .from("bookings")
    .select("id,client_id,artist_id")
    .eq("id", bookingId)
    .single();

  if (readErr) throw readErr;
  if (!row) throw new Error("Booking not found");

  const now = new Date().toISOString();

  if ((row as any).client_id === user.id) {
    const { error } = await supabase.from("bookings").update({ client_hidden_at: now }).eq("id", bookingId);
    if (error) throw error;
    return true;
  }

  if ((row as any).artist_id === user.id) {
    const { error } = await supabase.from("bookings").update({ artist_hidden_at: now }).eq("id", bookingId);
    if (error) throw error;
    return true;
  }

  throw new Error("Not allowed to hide this booking.");
}
