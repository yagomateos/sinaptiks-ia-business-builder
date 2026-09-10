import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type { ActivityLog, Notification, NotificationLevel, UUID } from '@/domain/types'

export const activityRepository = {
  async list(businessId: UUID, limit = 20): Promise<ActivityLog[]> {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw toAppError(error, 'No hemos podido cargar la actividad.')
    return (data ?? []) as ActivityLog[]
  },

  async log(input: {
    businessId: UUID
    actorId?: UUID | null
    actorLabel?: string
    action: string
    entityType?: string | null
    entityId?: UUID | null
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const { error } = await supabase.from('activity_logs').insert({
      business_id: input.businessId,
      actor_id: input.actorId ?? null,
      actor_label: input.actorLabel ?? 'Sistema',
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? {},
    })

    // Activity logging must never break the user's action.
    if (error) console.warn('No se pudo registrar la actividad', error)
  },

  async listNotifications(businessId: UUID, limit = 20): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw toAppError(error, 'No hemos podido cargar los avisos.')
    return (data ?? []) as Notification[]
  },

  async notify(input: {
    businessId: UUID
    userId?: UUID | null
    level: NotificationLevel
    title: string
    body?: string | null
    entityType?: string | null
    entityId?: UUID | null
  }): Promise<Notification> {
    const result = await supabase
      .from('notifications')
      .insert({
        business_id: input.businessId,
        user_id: input.userId ?? null,
        level: input.level,
        title: input.title,
        body: input.body ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
      })
      .select()
      .single()

    return unwrap(result, 'No hemos podido crear el aviso.')
  },

  async markNotificationRead(notificationId: UUID): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)

    if (error) throw toAppError(error, 'No hemos podido marcar el aviso.')
  },
}
