import { supabase } from "./supabase";

export type MyProfile = {
  id: string;
  email: string | null;
  role: "client" | "artist";
  username: string | null;
  bio: string | null;
  city: string | null;
  avatar_url: string | null; // ✅ add this
};

export async function setMyRole(role: "client" | "artist") {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { error } = await supabase.from("profiles").update({ role }).eq("id", user.id);
  if (error) throw error;
}

export type UpdateMyProfileInput = {
  username?: string | null;
  city?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
};

export async function updateMyProfile(input: UpdateMyProfileInput) {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;

  const user = auth.user;
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase
    .from("profiles")
    .update({
      username: input.username ?? null,
      city: input.city ?? null,
      bio: input.bio ?? null,
      avatar_url: input.avatar_url ?? null,
    })
    .eq("id", user.id);

  if (error) throw error;
}

export async function getMyProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,username,bio,city,avatar_url")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data as MyProfile;
}

export async function getArtistPublicProfile(artistId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, bio, city, role, avatar_url") // ✅ include avatar_url
    .eq("id", artistId)
    .single();

  if (error) throw error;

  return data as {
    id: string;
    username: string | null;
    bio: string | null;
    city: string | null;
    role: string;
    avatar_url: string | null;
  };
}

export function avatarPublicUrl(avatarPath: string | null | undefined) {
  const val = (avatarPath ?? "").trim();
  if (!val) return "";

  // legacy full url
  if (val.startsWith("http://") || val.startsWith("https://")) return val;

  // public bucket path → public url
  return supabase.storage.from("avatars").getPublicUrl(val).data.publicUrl;
}

export async function refreshMyProfile(): Promise<MyProfile> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;

  const uid = authData.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,username,bio,city,avatar_url") // ✅ match MyProfile
    .eq("id", uid)
    .single();

  if (error) throw error;

  return data as MyProfile;
}

