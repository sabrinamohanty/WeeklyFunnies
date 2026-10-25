import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local')
}

export const supabase: SupabaseClient = createClient(url, anon, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
  },
})

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function accessToken(): Promise<string | null> {
  const session = await currentSession()
  return session?.access_token ?? null
}
