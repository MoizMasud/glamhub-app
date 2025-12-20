import { supabase } from "./supabase";

export type ServiceRow = {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  price_cents: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
};

export type ArtistPublic = {
  id: string;
  username: string | null;
  bio: string | null;

  city: string | null;
  role: "artist" | "client";
  avatar_url: string | null;

  // ✅ NEW: always present (nullable)
  city_label: string | null;
  city_lat: number | null;
  city_lng: number | null;
};

export type MarketplaceService = ServiceRow & {
  artist: ArtistPublic | null;
};

export async function listActiveServices() {
  const { data, error } = await supabase
    .from("services")
    .select("id,artist_id,title,description,price_cents,duration_minutes,is_active,created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ServiceRow[];
}

export async function listArtistActiveServices(artistId: string) {
  const { data, error } = await supabase
    .from("services")
    .select("id,artist_id,title,description,price_cents,duration_minutes,is_active,created_at")
    .eq("artist_id", artistId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ServiceRow[];
}

export async function listActiveServicesWithArtist() {
  const { data, error } = await supabase
    .from("services")
    .select(
      `
      id, artist_id, title, description, price_cents, duration_minutes, is_active, created_at,
      artist:profiles!services_artist_id_profiles_fkey (
        id, username, bio, city, city_label, city_lat, city_lng, role, avatar_url
      )
    `
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as any[];
  return rows.map((r) => {
    const artist = Array.isArray(r.artist) ? (r.artist[0] ?? null) : (r.artist ?? null);
    return { ...r, artist } as MarketplaceService;
  });
}

export async function getServiceDetails(serviceId: string) {
  // 1) Try: service + embedded artist (preferred)
  const { data, error } = await supabase
    .from("services")
    .select(
      `
      id, artist_id, title, description, price_cents, duration_minutes, is_active, created_at,
      artist:profiles ( id, username, bio, city, city_label, city_lat, city_lng, role, avatar_url )
    `
    )
    .eq("id", serviceId)
    .single();

  if (!error && data) {
    const r: any = data;
    const artist = Array.isArray(r.artist) ? (r.artist[0] ?? null) : (r.artist ?? null);
    return { ...r, artist } as MarketplaceService;
  }

  // 2) Fallback: fetch service only
  const { data: s, error: sErr } = await supabase
    .from("services")
    .select("id, artist_id, title, description, price_cents, duration_minutes, is_active, created_at")
    .eq("id", serviceId)
    .single();

  if (sErr) throw sErr;

  // 3) Best-effort: fetch profile separately
  let artist: any = null;
  const { data: p, error: pErr } = await supabase
    .from("profiles")
    .select("id, username, bio, city, city_label, city_lat, city_lng, role, avatar_url")
    .eq("id", (s as any).artist_id)
    .single();

  if (!pErr) artist = p ?? null;

  return { ...(s as any), artist } as MarketplaceService;
}

export async function createService(input: {
  title: string;
  description?: string;
  price_cents: number;
  duration_minutes: number;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data, error } = await supabase
    .from("services")
    .insert([
      {
        artist_id: user.id,
        title: input.title,
        description: input.description ?? null,
        price_cents: input.price_cents,
        duration_minutes: input.duration_minutes,
        is_active: true,
      },
    ])
    .select("id,artist_id,title,description,price_cents,duration_minutes,is_active,created_at")
    .single();

  if (error) throw error;
  return data as ServiceRow;
}
