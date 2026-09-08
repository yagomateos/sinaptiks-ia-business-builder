import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type { Automation, AutomationExecution, AutomationStatus, UUID } from '@/domain/types'

export type AutomationDraft = Omit<
  Automation,
  'id' | 'created_at' | 'updated_at' | 'execution_count' | 'error_count' | 'last_execution_at'
>

export const automationsRepository = {
  async list(businessId: UUID, status?: AutomationStatus | 'todas'): Promise<Automation[]> {
    let query = supabase
      .from('automations')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })

    if (status && status !== 'todas') query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw toAppError(error, 'No hemos podido cargar tus automatizaciones.')
    return (data ?? []) as Automation[]
  },

  async getById(automationId: UUID): Promise<Automation> {
    const result = await supabase.from('automations').select('*').eq('id', automationId).single()
    return unwrap(result, 'No hemos encontrado esta automatización.')
  },

  async createMany(drafts: AutomationDraft[]): Promise<Automation[]> {
    if (drafts.length === 0) return []
    const result = await supabase
      .from('automations')
      .upsert(drafts, { onConflict: 'business_id,template_key', ignoreDuplicates: true })
      .select()

    return unwrap(result, 'No hemos podido crear las automatizaciones.')
  },

  async update(automationId: UUID, patch: Partial<Automation>): Promise<Automation> {
    const result = await supabase
      .from('automations')
      .update(patch)
      .eq('id', automationId)
      .select()
      .single()

    return unwrap(result, 'No hemos podido guardar la automatización.')
  },

  async remove(automationId: UUID): Promise<void> {
    const { error } = await supabase.from('automations').delete().eq('id', automationId)
    if (error) throw toAppError(error, 'No hemos podido eliminar la automatización.')
  },

  async listExecutions(businessId: UUID, automationId?: UUID, limit = 50): Promise<AutomationExecution[]> {
    let query = supabase
      .from('automation_executions')
      .select('*')
      .eq('business_id', businessId)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (automationId) query = query.eq('automation_id', automationId)

    const { data, error } = await query
    if (error) throw toAppError(error, 'No hemos podido cargar el historial.')
    return (data ?? []) as AutomationExecution[]
  },

  async recordExecution(input: {
    automationId: UUID
    businessId: UUID
    status: AutomationExecution['status']
    n8nExecutionId?: string | null
    durationMs?: number | null
    errorMessage?: string | null
    payload?: Record<string, unknown>
  }): Promise<AutomationExecution> {
    const now = new Date().toISOString()
    const result = await supabase
      .from('automation_executions')
      .insert({
        automation_id: input.automationId,
        business_id: input.businessId,
        status: input.status,
        n8n_execution_id: input.n8nExecutionId ?? null,
        started_at: now,
        finished_at: input.status === 'en_curso' ? null : now,
        duration_ms: input.durationMs ?? null,
        error_message: input.errorMessage ?? null,
        payload: input.payload ?? {},
      })
      .select()
      .single()

    return unwrap(result, 'No hemos podido registrar la ejecución.')
  },
}
