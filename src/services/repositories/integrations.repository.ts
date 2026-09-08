import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type { Integration, IntegrationProvider, IntegrationStatus, UUID } from '@/domain/types'

export const integrationsRepository = {
  async list(businessId: UUID): Promise<Integration[]> {
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('business_id', businessId)

    if (error) throw toAppError(error, 'No hemos podido cargar tus conexiones.')
    return (data ?? []) as Integration[]
  },

  async ensureMany(
    businessId: UUID,
    providers: IntegrationProvider[],
  ): Promise<Integration[]> {
    if (providers.length === 0) return []

    const result = await supabase
      .from('integrations')
      .upsert(
        providers.map((provider) => ({
          business_id: businessId,
          provider,
          status: 'no_conectado' as IntegrationStatus,
        })),
        { onConflict: 'business_id,provider', ignoreDuplicates: true },
      )
      .select()

    return unwrap(result, 'No hemos podido preparar tus conexiones.')
  },

  async setStatus(
    businessId: UUID,
    provider: IntegrationProvider,
    status: IntegrationStatus,
    extra: { config?: Record<string, unknown>; lastError?: string | null } = {},
  ): Promise<Integration> {
    const result = await supabase
      .from('integrations')
      .upsert(
        {
          business_id: businessId,
          provider,
          status,
          config: extra.config ?? {},
          last_error: extra.lastError ?? null,
          connected_at: status === 'conectado' ? new Date().toISOString() : null,
        },
        { onConflict: 'business_id,provider' },
      )
      .select()
      .single()

    return unwrap(result, 'No hemos podido actualizar la conexión.')
  },
}
