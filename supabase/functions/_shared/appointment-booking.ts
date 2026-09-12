/**
 * Crear una cita real en el calendario del negocio — compartido entre
 * `n8n-callback` (acción `agendar_cita` de una automatización) y
 * `conversation-pipeline.ts` (`registrar_solicitud_cita`, cuando el propio
 * agente ya reunió fecha/hora/contacto durante la conversación).
 *
 * Antes cada camino hacía algo distinto: la automatización sí creaba el
 * evento real; la herramienta de conversación solo avisaba al equipo y
 * nunca tocaba el calendario, así que el cliente se quedaba con un "el
 * equipo te contactará" aunque hubiera Google Calendar conectado. Ahora
 * ambos pasan por aquí — mismo resultado, sin duplicar la lógica de
 * comprobar disponibilidad y crear el evento.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getCalendarProvider } from './calendar/index.ts'

export interface BookAppointmentInput {
  leadId: string | null
  automationId: string | null
  service: string
  startsAt: Date
  durationMinutes: number
  timezone: string
  attendeeEmail: string
}

export type BookAppointmentResult =
  | { status: 'confirmada'; externalEventId: string; startsAt: Date; endsAt: Date }
  | { status: 'conflicto'; message: string }
  | { status: 'sin_calendario' }
  | { status: 'error'; message: string }

export async function bookCalendarAppointment(
  admin: SupabaseClient,
  businessId: string,
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const calendar = await getCalendarProvider(admin, businessId)
  if (!calendar) return { status: 'sin_calendario' }

  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60 * 1000)

  const { error: insertError, data: appointment } = await admin
    .from('appointments')
    .insert({
      business_id: businessId,
      lead_id: input.leadId,
      automation_id: input.automationId,
      service: input.service,
      starts_at: input.startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      timezone: input.timezone,
      status: 'pendiente',
    })
    .select('id')
    .single()

  if (insertError) {
    return { status: 'error', message: `No se pudo guardar la cita: ${insertError.message}` }
  }

  // Mismo motivo que en n8n-callback: sin esto, dos solicitudes para la
  // misma hora crearían dos eventos solapados en el calendario real.
  const available = await calendar.isAvailable(input.startsAt.toISOString(), endsAt.toISOString())
  if (!available) {
    await admin
      .from('appointments')
      .update({ status: 'error', notes: 'Ese hueco ya está ocupado en el calendario' })
      .eq('id', appointment.id)
    return {
      status: 'conflicto',
      message: `El horario solicitado para "${input.service}" ya está ocupado en el calendario.`,
    }
  }

  try {
    const businessName = await getBusinessName(admin, businessId)
    const event = await calendar.createEvent({
      summary: `${input.service} — ${businessName}`,
      startsAt: input.startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone: input.timezone,
      attendeeEmail: input.attendeeEmail,
    })

    await admin
      .from('appointments')
      .update({ status: 'confirmada', external_event_id: event.externalEventId })
      .eq('id', appointment.id)

    return { status: 'confirmada', externalEventId: event.externalEventId, startsAt: input.startsAt, endsAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await admin.from('appointments').update({ status: 'error', notes: message }).eq('id', appointment.id)
    return { status: 'error', message }
  }
}

async function getBusinessName(admin: SupabaseClient, businessId: string): Promise<string> {
  const { data } = await admin
    .from('business_profiles')
    .select('business_name')
    .eq('business_id', businessId)
    .maybeSingle()

  return data?.business_name ?? 'nuestro negocio'
}
