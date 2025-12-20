// /src/lib/profile.ts
import { supabase } from "./supabase";

export type UserRole = "artist" | "client";
export type ConsultationType = "zoom" | "google_meet";

/**
 * Some parts of your app/wrappers may return a "string error" union.
 * Exporting this + a guard lets screens safely narrow BEFORE casting.
 */
export type GenericStringError =
  | ({ error: true; message?: string } & Record<string, any>)
  | ({ error: true } & String);

export function isGenericStringError(x: any): x is GenericStringError {
  if (!x) return false;

  // Sometimes comes back as String object with properties
  if (typeof x === "string") return false;

  if (typeof x === "object" && "error" in x && (x as any).error === true) return true;

  return false;
}

export type MyProfile = {
  id: string;

  // Some schemas keep email on profiles; keep nullable.
  email: string | null;

  role: UserRole;

  username: string | null;
  full_name: string | null;
  phone: string | null;

  // location
  city: string | null; // legacy (keep)
  city_label: string | null;
  city_lat: number | null;
  city_lng: number | null;

  bio: string | null;
  avatar_url: string | null;

  // consultation settings (artists)
  consultation_enabled: boolean;
  consultation_type: ConsultationType | null;
  consultation_link: string | null;

  // existing
  auto_cleanup_bookings: boolean | null;

  // ✅ NEW (artists)
  allow_same_day_consultation: boolean | null;
};

export type UpdateMyProfileInput = {
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;

  // business/client fields
  full_name?: string | null;
  phone?: string | null;

  // location
  city?: string | null; // keep for backwards compatibility
  city_label?: string | null;
  city_lat?: number | null;
  city_lng?: number | null;

  // consultation settings (artists)
  consultation_enabled?: boolean | null;
  consultation_type?: ConsultationType | null;
  consultation_link?: string | null;

  // existing
  auto_cleanup_bookings?: boolean | null;

  // ✅ NEW
  allow_same_day_consultation?: boolean | null;
};

// ✅ Include everything used across the app (old + new)
const PROFILE_SELECT = `
  id, email, role, username, full_name, phone,
  city, city_label, city_lat, city_lng,
  bio, avatar_url,
  consultation_enabled, consultation_type, consultation_link,
  auto_cleanup_bookings,
  allow_same_day_consultation
`;

/**
 * Ensure a profile row exists for the user.
 * (Some auth setups don't auto-create; prevents null loads.)
 */
async function ensureProfileRow(userId: string) {
  const { data: existing, error: readErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (readErr) throw readErr;
  if (existing?.id) return;

  const { error: insErr } = await supabase.from("profiles").insert([
    {
      id: userId,
      role: "client",

      // safe defaults
      consultation_enabled: false,
      consultation_type: null,
      consultation_link: null,
      auto_cleanup_bookings: null,

      allow_same_day_consultation: false,
    },
  ]);

  if (insErr) throw insErr;
}

function normalizeConsultationType(raw: any): ConsultationType | null {
  const v = raw ?? null;
  return v === "google_meet" ? "google_meet" : v === "zoom" ? "zoom" : null;
}

function normalizeMyProfile(row: any): MyProfile {
  const p: any = row ?? {};
  return {
    id: String(p.id),
    email: p.email ?? null,
    role: (p.role ?? "client") as UserRole,

    username: p.username ?? null,
    full_name: p.full_name ?? null,
    phone: p.phone ?? null,

    city: p.city ?? null,
    city_label: (p.city_label ?? p.city ?? null) as any,
    city_lat: typeof p.city_lat === "number" ? p.city_lat : null,
    city_lng: typeof p.city_lng === "number" ? p.city_lng : null,

    bio: p.bio ?? null,
    avatar_url: p.avatar_url ?? null,

    consultation_enabled: !!p.consultation_enabled,
    consultation_type: normalizeConsultationType(p.consultation_type),
    consultation_link: p.consultation_link ?? null,

    auto_cleanup_bookings: p.auto_cleanup_bookings ?? null,

    // ✅ default false if null/undefined
    allow_same_day_consultation: (p.allow_same_day_consultation ?? false) as any,
  };
}

export async function getMyProfile(): Promise<MyProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No user session");

  await ensureProfileRow(user.id);

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return normalizeMyProfile(data);
}

export async function refreshMyProfile(): Promise<MyProfile> {
  // keep this function (used in a few places)
  return getMyProfile();
}

/**
 * Switch role (client/artist)
 * (kept name/signature; returning MyProfile is safe even if callers ignore it)
 */
export async function setMyRole(role: UserRole): Promise<MyProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No user session");

  await ensureProfileRow(user.id);

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", user.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) throw error;
  return normalizeMyProfile(data);
}

/**
 * Update profile fields for the current user.
 * ✅ Supports all fields, including allow_same_day_consultation.
 * ✅ Returns the updated profile (callers can ignore it).
 *
 * NOTE: This function NEVER returns a GenericStringError; it always throws on error.
 * That prevents the "Conversion of type 'GenericStringError' ..." casting issues.
 */
export async function updateMyProfile(input: UpdateMyProfileInput): Promise<MyProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No user session");

  await ensureProfileRow(user.id);

  // If caller provides city_label, keep city in sync (so older screens still work)
  const syncedCityLabel =
    input.city_label !== undefined ? input.city_label : input.city !== undefined ? input.city : undefined;

  const patch: Record<string, any> = {};

  // basic
  if (input.username !== undefined) patch.username = input.username ?? null;
  if (input.bio !== undefined) patch.bio = input.bio ?? null;
  if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url ?? null;

  // business fields
  if (input.full_name !== undefined) patch.full_name = input.full_name ?? null;
  if (input.phone !== undefined) patch.phone = input.phone ?? null;

  // location
  if (input.city !== undefined || input.city_label !== undefined) {
    patch.city = (syncedCityLabel ?? null) as any;
    patch.city_label = (syncedCityLabel ?? null) as any;
  }
  if (input.city_lat !== undefined) patch.city_lat = input.city_lat ?? null;
  if (input.city_lng !== undefined) patch.city_lng = input.city_lng ?? null;

  // consultation settings
  if (input.consultation_enabled !== undefined) patch.consultation_enabled = !!input.consultation_enabled;
  if (input.consultation_type !== undefined) patch.consultation_type = input.consultation_type ?? null;
  if (input.consultation_link !== undefined) patch.consultation_link = input.consultation_link ?? null;

  // existing
  if (input.auto_cleanup_bookings !== undefined) patch.auto_cleanup_bookings = input.auto_cleanup_bookings ?? null;

  // ✅ NEW
  if (input.allow_same_day_consultation !== undefined) {
    patch.allow_same_day_consultation = Boolean(input.allow_same_day_consultation);
  }

  // No-op safe behavior: return current profile
  if (Object.keys(patch).length === 0) return await getMyProfile();

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) throw error;
  return normalizeMyProfile(data);
}

/**
 * Public artist profile used on marketplace/artist screens.
 * ✅ Always throws on error. Never returns GenericStringError.
 */
export type ArtistPublicProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  bio: string | null;

  city: string | null;
  city_label: string | null;
  city_lat: number | null;
  city_lng: number | null;

  role: string;
  avatar_url: string | null;

  consultation_enabled: boolean | null;
  consultation_type: ConsultationType | null;
  consultation_link: string | null;

  allow_same_day_consultation: boolean | null;
};

export async function getArtistPublicProfile(artistId: string): Promise<ArtistPublicProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      [
        "id",
        "username",
        "full_name",
        "phone",
        "bio",
        "city",
        "city_label",
        "city_lat",
        "city_lng",
        "role",
        "avatar_url",
        "consultation_enabled",
        "consultation_type",
        "consultation_link",
        "allow_same_day_consultation",
      ].join(",")
    )
    .eq("id", artistId)
    .single();

  if (error) throw error;

  const p: any = data ?? {};
  return {
    id: String(p.id),
    username: p.username ?? null,
    full_name: p.full_name ?? null,
    phone: p.phone ?? null,
    bio: p.bio ?? null,

    city: p.city ?? null,
    city_label: p.city_label ?? p.city ?? null,
    city_lat: typeof p.city_lat === "number" ? p.city_lat : null,
    city_lng: typeof p.city_lng === "number" ? p.city_lng : null,

    role: p.role ?? "artist",
    avatar_url: p.avatar_url ?? null,

    consultation_enabled: p.consultation_enabled ?? null,
    consultation_type: normalizeConsultationType(p.consultation_type),
    consultation_link: p.consultation_link ?? null,

    allow_same_day_consultation: p.allow_same_day_consultation ?? false,
  };
}

/**
 * ✅ Used everywhere: convert stored avatar path → public URL.
 * - If already a full URL, return as-is.
 * - If storage path, return public URL from "avatars" bucket.
 */
export function avatarPublicUrl(avatarPath: string | null | undefined) {
  const val = (avatarPath ?? "").trim();
  if (!val) return "";

  // legacy full url
  if (val.startsWith("http://") || val.startsWith("https://")) return val;

  // public bucket path → public url
  return supabase.storage.from("avatars").getPublicUrl(val).data.publicUrl;
}
