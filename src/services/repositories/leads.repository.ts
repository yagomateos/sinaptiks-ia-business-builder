import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type { Lead, LeadStage, LeadTemperature, UUID } from '@/domain/types'

export interface LeadFilters {
  stage?: LeadStage | 'todos'
  temperature?: LeadTemperature | 'todas'
  search?: string
}

export type LeadDraft = Omit<Lead, 'id' | 'created_at' | 'updated_at'>

export const leadsRepository = {
  async list(businessId: UUID, filters: LeadFilters = {}): Promise<Lead[]> {
    let query = supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (filters.stage && filters.stage !== 'todos') {
      query = query.eq('stage', filters.stage)
    }

    if (filters.temperature && filters.temperature !== 'todas') {
      query = query.eq('temperature', filters.temperature)
    }

    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`
      query = query.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
    }

    const { data, error } = await query
    if (error) throw toAppError(error, 'No hemos podido cargar tus clientes.')
    return (data ?? []) as Lead[]
  },

  async getById(leadId: UUID): Promise<Lead> {
    const result = await supabase.from('leads').select('*').eq('id', leadId).single()
    return unwrap(result, 'No hemos encontrado este contacto.')
  },

  async create(draft: LeadDraft): Promise<Lead> {
    const result = await supabase.from('leads').insert(draft).select().single()
    return unwrap(result, 'No hemos podido crear el contacto.')
  },

  async update(leadId: UUID, patch: Partial<Lead>): Promise<Lead> {
    const result = await supabase.from('leads').update(patch).eq('id', leadId).select().single()
    return unwrap(result, 'No hemos podido guardar los cambios.')
  },

  async moveToStage(leadId: UUID, stage: LeadStage): Promise<Lead> {
    return this.update(leadId, {
      stage,
      last_contacted_at: stage === 'nuevo' ? null : new Date().toISOString(),
    })
  },

  async remove(leadId: UUID): Promise<void> {
    const { error } = await supabase.from('leads').delete().eq('id', leadId)
    if (error) throw toAppError(error, 'No hemos podido eliminar el contacto.')
  },

  async countByStage(businessId: UUID): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('leads')
      .select('stage')
      .eq('business_id', businessId)

    if (error) throw toAppError(error, 'No hemos podido calcular tus métricas.')

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      counts[row.stage] = (counts[row.stage] ?? 0) + 1
    }
    return counts
  },
}
