import { supabase } from '../supabase/client'
import { toAppError } from '../supabase/errors'
import type { Business, Profile } from '@/domain/types'

export interface PlatformStats {
  users: number
  businesses: number
  businesses_onboarded: number
  automations: number
  automations_active: number
  agents: number
  agents_active: number
  executions: number
  executions_failed: number
  leads: number
  conversations: number
  /** Proxy for AI consumption until real token accounting lands. */
  messages_ai: number
}

export const adminRepository = {
  async stats(): Promise<PlatformStats> {
    const { data, error } = await supabase.rpc('admin_platform_stats')
    if (error) throw toAppError(error, 'No hemos podido cargar las métricas de plataforma.')
    return data as PlatformStats
  },

  async listBusinesses(): Promise<Business[]> {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw toAppError(error, 'No hemos podido cargar los negocios.')
    return (data ?? []) as Business[]
  },

  async listUsers(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw toAppError(error, 'No hemos podido cargar los usuarios.')
    return (data ?? []) as Profile[]
  },
}
