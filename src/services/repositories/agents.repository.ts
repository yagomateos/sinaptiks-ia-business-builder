import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type { AiAgent, UUID } from '@/domain/types'

export type AiAgentDraft = Omit<AiAgent, 'id' | 'created_at' | 'updated_at'>

export const agentsRepository = {
  async list(businessId: UUID): Promise<AiAgent[]> {
    const { data, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })

    if (error) throw toAppError(error, 'No hemos podido cargar tus agentes.')
    return (data ?? []) as AiAgent[]
  },

  async getById(agentId: UUID): Promise<AiAgent> {
    const result = await supabase.from('ai_agents').select('*').eq('id', agentId).single()
    return unwrap(result, 'No hemos encontrado este agente.')
  },

  async createMany(drafts: AiAgentDraft[]): Promise<AiAgent[]> {
    if (drafts.length === 0) return []
    const result = await supabase
      .from('ai_agents')
      .upsert(drafts, { onConflict: 'business_id,type', ignoreDuplicates: true })
      .select()

    return unwrap(result, 'No hemos podido crear los agentes.')
  },

  async update(agentId: UUID, patch: Partial<AiAgent>): Promise<AiAgent> {
    const result = await supabase
      .from('ai_agents')
      .update(patch)
      .eq('id', agentId)
      .select()
      .single()

    return unwrap(result, 'No hemos podido guardar el agente.')
  },

  async remove(agentId: UUID): Promise<void> {
    const { error } = await supabase.from('ai_agents').delete().eq('id', agentId)
    if (error) throw toAppError(error, 'No hemos podido eliminar el agente.')
  },
}
