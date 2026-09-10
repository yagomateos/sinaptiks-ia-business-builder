import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type {
  Conversation,
  ConversationStatus,
  Lead,
  Message,
  MessageRole,
  UUID,
} from '@/domain/types'

export interface ConversationWithLead extends Conversation {
  lead: Lead | null
}

export const conversationsRepository = {
  async list(
    businessId: UUID,
    status?: ConversationStatus | 'todas',
  ): Promise<ConversationWithLead[]> {
    let query = supabase
      .from('conversations')
      .select('*, leads(*)')
      .eq('business_id', businessId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (status && status !== 'todas') query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw toAppError(error, 'No hemos podido cargar las conversaciones.')

    return (data ?? []).map((row) => {
      const { leads, ...conversation } = row as Conversation & { leads: Lead | null }
      return { ...conversation, lead: leads }
    })
  },

  async getById(conversationId: UUID): Promise<ConversationWithLead> {
    const { data, error } = await supabase
      .from('conversations')
      .select('*, leads(*)')
      .eq('id', conversationId)
      .single()

    if (error) throw toAppError(error, 'No hemos encontrado esta conversación.')

    const { leads, ...conversation } = data as Conversation & { leads: Lead | null }
    return { ...conversation, lead: leads }
  },

  async listMessages(conversationId: UUID): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) throw toAppError(error, 'No hemos podido cargar los mensajes.')
    return (data ?? []) as Message[]
  },

  async sendMessage(input: {
    conversationId: UUID
    businessId: UUID
    role: MessageRole
    content: string
    metadata?: Record<string, unknown>
  }): Promise<Message> {
    const result = await supabase
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        business_id: input.businessId,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? {},
      })
      .select()
      .single()

    return unwrap(result, 'No hemos podido enviar el mensaje.')
  },

  async update(conversationId: UUID, patch: Partial<Conversation>): Promise<Conversation> {
    const result = await supabase
      .from('conversations')
      .update(patch)
      .eq('id', conversationId)
      .select()
      .single()

    return unwrap(result, 'No hemos podido actualizar la conversación.')
  },

  async handOffToHuman(conversationId: UUID): Promise<Conversation> {
    return this.update(conversationId, { handled_by: 'humano', status: 'pendiente' })
  },

  async reassignToAgent(conversationId: UUID): Promise<Conversation> {
    // handled_by_since se usa para contar los turnos de cara a volver a
    // escalar — sin resetearlo aquí, una conversación que ya superó el
    // umbral una vez se derivaría de nuevo al primer mensaje, sin importar
    // cuántas veces se reasigne.
    return this.update(conversationId, {
      handled_by: 'agente_ia',
      status: 'abierta',
      handled_by_since: new Date().toISOString(),
    })
  },

  async markRead(conversationId: UUID): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)

    if (error) throw toAppError(error, 'No hemos podido marcar como leída.')
  },

  async create(input: {
    businessId: UUID
    leadId?: UUID | null
    channel: string
    subject?: string | null
  }): Promise<Conversation> {
    const result = await supabase
      .from('conversations')
      .insert({
        business_id: input.businessId,
        lead_id: input.leadId ?? null,
        channel: input.channel,
        subject: input.subject ?? null,
      })
      .select()
      .single()

    return unwrap(result, 'No hemos podido crear la conversación.')
  },
}
