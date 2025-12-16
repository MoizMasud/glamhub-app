import { supabase } from './supabase'

export type GlamItem = {
  id: string
  title: string
  notes: string | null
  created_at: string
  updated_at: string
}

export async function listMyGlamItems() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No user session')

  const { data, error } = await supabase
    .from('glam_items')
    .select('id,title,notes,created_at,updated_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as GlamItem[]
}

export async function createGlamItem(title: string, notes?: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No user session')

  const { data, error } = await supabase
    .from('glam_items')
    .insert([{ owner_id: user.id, title, notes: notes ?? null }])
    .select('id,title,notes,created_at,updated_at')
    .single()

  if (error) throw error
  return data as GlamItem
}
