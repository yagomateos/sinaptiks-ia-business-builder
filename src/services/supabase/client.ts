import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * True when the app has credentials to reach Supabase.
 * The shell renders a setup screen instead of the app when this is false.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * The anon key is a public, RLS-scoped key — it is safe in the browser.
 * Service-role keys and every third-party secret (n8n, Anthropic, WhatsApp)
 * stay server-side and are never imported here.
 */
export const supabase: SupabaseClient = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
