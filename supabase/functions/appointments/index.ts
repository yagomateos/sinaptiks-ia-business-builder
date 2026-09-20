/**
 * Edge Function `appointments` — acciones sobre citas ya creadas.
 *
 * Hoy solo cancelar: borra el evento real del calendario conectado (si lo
 * hay) y marca la fila como `cancelada`. `channel_credentials` no tiene
 * política de lectura para nadie sujeto a RLS (ver README), así que el
 * borrado en Google necesita la service role — la comprobación de que el
 * usuario pertenece al negocio se hace primero, con su propia sesión.
 *
 * Rutas (bajo /functions/v1/appointments):
 *   POST /:id/cancel
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { applyCors, assertBusinessAccess, authenticate, corsHeadersFor, errorResponse, HttpError, json } from '../_shared/auth.ts'
import { cancelCalendarAppointment } from '../_shared/appointment-booking.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(request) })
  }

  const response = await (async () => {
    try {
      if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

      const ctx = await authenticate(request)
      const url = new URL(request.url)
      const segments = url.pathname.split('/').filter(Boolean)
      const start = segments.indexOf('appointments')
      const [appointmentId, action] = start >= 0 ? segments.slice(start + 1) : segments

      if (!appointmentId || action !== 'cancel') throw new HttpError(404, 'Ruta desconocida')

      // La cita vive tras RLS: si el usuario no es miembro de ese negocio, esta
      // consulta no devuelve ninguna fila y el acceso queda cerrado sin más
      // lógica — igual que assertAutomationAccess con las automatizaciones.
      const { data: appointment, error } = await ctx.db
        .from('appointments')
        .select('id, business_id')
        .eq('id', appointmentId)
        .maybeSingle()

      if (error) throw new HttpError(500, 'No se pudo comprobar el acceso')
      if (!appointment) throw new HttpError(404, 'Esa cita no existe')

      await assertBusinessAccess(ctx, appointment.business_id)

      const result = await cancelCalendarAppointment(admin, appointment.business_id, appointmentId)

      if (result.status === 'no_encontrada') throw new HttpError(404, 'Esa cita no existe')
      if (result.status === 'error') throw new HttpError(502, result.message)

      return json({ status: result.status })
    } catch (error) {
      return errorResponse(error)
    }
  })()

  return applyCors(response, request)
})
