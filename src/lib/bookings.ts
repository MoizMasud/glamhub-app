import { supabase } from "./supabase";

export type BookingStatus = "pending" | "accepted" | "cancelled" | "completed";

export type BookingRow = {
  id: string;
  service_id: string;
  artist_id: string;
  client_id: string;
  status: BookingStatus;
  start_time: string;
  notes: string | null;
  created_at: string;

  // soft-delete per user (optional in TS to avoid crashes if column missing in older env)
  client_hidden_at?: string | null;
  artist_hidden_at?: string | null;
};

export async function createBooking(input: {
  serviceId: string;
  artistId: string;
  startTimeISO: string;
  notes?: string;
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
        notes: input.notes ?? null,
        status: "pending",
      },
    ])
    .select(
      "id,service_id,artist_id,client_id,status,start_time,notes,created_at,client_hidden_at,artist_hidden_at"
    )
    .single();

  if (error) throw error;
  return data as BookingRow;
}

/**
 * Client view: only show bookings NOT hidden by the client.
 */
export async function listMyBookings() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,service_id,artist_id,client_id,status,start_time,notes,created_at,client_hidden_at,artist_hidden_at"
    )
    .eq("client_id", user.id)
    .is("client_hidden_at", null)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingRow[];
}

/**
 * Artist view: only show bookings NOT hidden by the artist.
 */
export async function listArtistBookings() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,service_id,artist_id,client_id,status,start_time,notes,created_at,client_hidden_at,artist_hidden_at"
    )
    .eq("artist_id", user.id)
    .is("artist_hidden_at", null)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingRow[];
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .select(
      "id,service_id,artist_id,client_id,status,start_time,notes,created_at,client_hidden_at,artist_hidden_at"
    );

  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Update blocked by RLS (no rows updated).");
  return data[0] as BookingRow;
}

/**
 * Soft-delete for the *current user only*.
 * - Client sets client_hidden_at
 * - Artist sets artist_hidden_at
 */
export async function hideBookingForMe(bookingId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  // figure out which side you are (client or artist)
  const { data: row, error: readErr } = await supabase
    .from("bookings")
    .select("id,client_id,artist_id")
    .eq("id", bookingId)
    .single();

  if (readErr) throw readErr;
  if (!row) throw new Error("Booking not found");

  const now = new Date().toISOString();

  if (row.client_id === user.id) {
    const { error } = await supabase
      .from("bookings")
      .update({ client_hidden_at: now })
      .eq("id", bookingId);
    if (error) throw error;
    return true;
  }

  if (row.artist_id === user.id) {
    const { error } = await supabase
      .from("bookings")
      .update({ artist_hidden_at: now })
      .eq("id", bookingId);
    if (error) throw error;
    return true;
  }

  throw new Error("Not allowed to hide this booking.");
}
