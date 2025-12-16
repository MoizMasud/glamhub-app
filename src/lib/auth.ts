import { supabase } from './supabase'

export type UserRole = "client" | "artist";

export async function signUp(email: string, password: string, role: UserRole) {
  // Save role in user_metadata so you can route users on first login
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role },
    },
  });

  if (error) throw error;

  // Optional: also upsert into a profiles table if you have it.
  // Safe: if the table doesn’t exist, we just ignore that error.
  const userId = data.user?.id;
  if (userId) {
    try {
      await supabase.from("profiles").upsert({
        id: userId,
        email,
        role,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // ignore (table might not exist yet)
    }
  }

  return data;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function fetchMyProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No user session')

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) throw error
  return data
}
