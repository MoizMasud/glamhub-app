import { supabase } from "./supabase";

export type MyProfile = {
  id: string;
  email: string | null;
  role: "client" | "artist";
  username: string | null;
  bio: string | null;
  city: string | null;
};

export async function setMyRole(role: "client" | "artist") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { error } = await supabase.from("profiles").update({ role }).eq("id", user.id);
  if (error) throw error;
}

export async function updateMyProfile(input: {
  username?: string | null;
  city?: string | null;
  bio?: string | null;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { error } = await supabase
    .from("profiles")
    .update({
      username: input.username ?? null,
      city: input.city ?? null,
      bio: input.bio ?? null,
    })
    .eq("id", user.id);

  if (error) throw error;
}

export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No user session");

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,username,bio,city")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data as MyProfile;
}

export async function getArtistPublicProfile(artistId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, bio, city, role")
    .eq("id", artistId)
    .single();

  if (error) throw error;
  return data as { id: string; username: string | null; bio: string | null; city: string | null; role: string };
}
