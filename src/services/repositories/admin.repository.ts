import { supabase } from '../supabase/client'
import { toAppError } from '../supabase/errors'
import type { Business, Profile, UUID } from '@/domain/types'

export interface RecentError {
  id: UUID
  automation_id: UUID
  automation_name: string
  business_id: UUID
  business_name: string
  error_message: string | null
  started_at: string
}

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

  /**
   * Últimos fallos de automatización en toda la plataforma, no solo del
   * negocio activo — para detectar un problema sistémico (una función caída,
   * n8n desconectado) antes de que cada negocio lo reporte por separado.
   */
  async listRecentErrors(limit = 8): Promise<RecentError[]> {
    const { data, error } = await supabase
      .from('automation_executions')
      .select('id, automation_id, business_id, error_message, started_at, automations(name), businesses(name)')
      .eq('status', 'error')
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) throw toAppError(error, 'No hemos podido cargar los errores recientes.')

    return (data ?? []).map((row) => {
      const r = row as unknown as {
        id: string
        automation_id: string
        business_id: string
        error_message: string | null
        started_at: string
        automations: { name: string } | null
        businesses: { name: string } | null
      }
      return {
        id: r.id,
        automation_id: r.automation_id,
        automation_name: r.automations?.name ?? 'Automatización eliminada',
        business_id: r.business_id,
        business_name: r.businesses?.name ?? 'Negocio eliminado',
        error_message: r.error_message,
        started_at: r.started_at,
      }
    })
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
