import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type { ContactChannel, Lead, LeadStage, LeadTemperature, UUID } from '@/domain/types'
import type { LeadScore } from '@/domain/engine/lead-scoring'

export interface LeadFilters {
  stage?: LeadStage | 'todos'
  temperature?: LeadTemperature | 'todas'
  search?: string
}

/** Un contacto creado a mano no lleva puntuación: solo la da una conversación. */
export type LeadDraft = Omit<
  Lead,
  'id' | 'created_at' | 'updated_at' | 'potential_score' | 'potential_label' | 'scored_at' | 'score_signals'
> &
  Partial<Pick<Lead, 'potential_score' | 'potential_label' | 'scored_at' | 'score_signals'>>

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

  /**
   * Guarda el potencial calculado de una conversación.
   *
   * Busca por email o teléfono antes de crear: una misma persona que escribe
   * por WhatsApp y luego llama no debería aparecer dos veces en el CRM.
   */
  async saveScored(input: {
    businessId: UUID
    fullName: string
    email: string | null
    phone: string | null
    channel: ContactChannel
    score: LeadScore
  }): Promise<Lead> {
    const patch = {
      potential_score: input.score.score,
      potential_label: input.score.label,
      temperature: input.score.temperature,
      scored_at: new Date().toISOString(),
      score_signals: {
        reasons: input.score.reasons,
        ...input.score.signals,
      },
      last_contacted_at: new Date().toISOString(),
    }

    const existing = await this.findByContactDetails(
      input.businessId,
      input.email,
      input.phone,
    )

    if (existing) {
      return this.update(existing.id, {
        ...patch,
        // Un nombre real gana al genérico que pusiera una automatización.
        full_name: input.fullName.trim() || existing.full_name,
        email: input.email ?? existing.email,
        phone: input.phone ?? existing.phone,
      })
    }

    const result = await supabase
      .from('leads')
      .insert({
        business_id: input.businessId,
        full_name: input.fullName.trim() || 'Contacto sin nombre',
        email: input.email,
        phone: input.phone,
        source: input.channel,
        stage: 'contactado',
        notes: null,
        value_estimate: null,
        next_action: null,
        next_action_at: null,
        assigned_agent_id: null,
        ...patch,
      })
      .select()
      .single()

    return unwrap(result, 'No hemos podido guardar el contacto.')
  },

  async findByContactDetails(
    businessId: UUID,
    email: string | null,
    phone: string | null,
  ): Promise<Lead | null> {
    if (!email && !phone) return null

    const filters = [email ? `email.eq.${email}` : '', phone ? `phone.eq.${phone}` : '']
      .filter(Boolean)
      .join(',')

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .or(filters)
      .limit(1)
      .maybeSingle()

    if (error) return null
    return data as Lead | null
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
