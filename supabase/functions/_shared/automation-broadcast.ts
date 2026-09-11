/**
 * Selección de destinatarios para un disparador "programado": no trae
 * ningún contacto (el nodo de horario de n8n se dispara solo, sin saber de
 * leads — ver workflow-builder.ts), así que hay que ir a buscar a quién le
 * toca según la condición del propio disparador. Compartido entre
 * enviar_telegram y enviar_email en n8n-callback — antes solo lo tenía
 * Telegram, duplicarlo para email habría sido la tercera copia del mismo
 * cálculo de fechas.
 *
 * - `offset_hours` (p. ej. -24): leads con `stage='cita'` y cita para ese
 *   día concreto.
 * - `inactive_days`: leads sin contacto desde hace ese tiempo.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export interface BroadcastCandidate {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  last_reminder_sent_at: string | null
  reference: string
}

export async function findBroadcastCandidates(
  admin: SupabaseClient,
  businessId: string,
  trigger: { config?: Record<string, unknown> },
): Promise<BroadcastCandidate[]> {
  const offsetHours = trigger.config?.offset_hours
  const inactiveDays = trigger.config?.inactive_days

  if (typeof offsetHours === 'number') {
    const hoursAhead = Math.abs(offsetHours)
    const target = new Date(Date.now() + hoursAhead * 60 * 60 * 1000)
    const dayStart = new Date(target)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    const { data } = await admin
      .from('leads')
      .select('id, full_name, email, phone, last_reminder_sent_at, next_action_at')
      .eq('business_id', businessId)
      .eq('stage', 'cita')
      .not('next_action_at', 'is', null)
      .gte('next_action_at', dayStart.toISOString())
      .lt('next_action_at', dayEnd.toISOString())

    return (data ?? []).map((l: Record<string, unknown>) => ({
      ...(l as Omit<BroadcastCandidate, 'reference'>),
      reference: l.next_action_at as string,
    }))
  }

  if (typeof inactiveDays === 'number') {
    const threshold = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString()

    const { data } = await admin
      .from('leads')
      .select('id, full_name, email, phone, last_reminder_sent_at, last_contacted_at')
      .eq('business_id', businessId)
      .lt('last_contacted_at', threshold)

    return (data ?? []).map((l: Record<string, unknown>) => ({
      ...(l as Omit<BroadcastCandidate, 'reference'>),
      reference: l.last_contacted_at as string,
    }))
  }

  return []
}

/**
 * No se puede comparar dos columnas de la misma fila en un filtro de
 * PostgREST — se trae el candidato por la condición principal
 * (findBroadcastCandidates) y se descarta aquí, en JS, el que ya se avisó
 * desde la última referencia (la cita o el último contacto).
 */
export function isDue(candidate: BroadcastCandidate): boolean {
  return !candidate.last_reminder_sent_at || candidate.last_reminder_sent_at < candidate.reference
}
