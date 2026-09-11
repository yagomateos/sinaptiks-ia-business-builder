/**
 * Único punto de entrada para conseguir un calendario. Todo lo que necesite
 * agendar (n8n-callback hoy, lo que sea mañana) importa de aquí, nunca de
 * google-calendar-provider.ts directamente — así sustituir Google es cambiar
 * esta función y añadir una clase, no tocar a quien la llama.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { CalendarProvider } from './types.ts'
import {
  GoogleCalendarProvider,
  isGoogleCalendarConfigured,
  type GoogleCalendarCredential,
} from './google-calendar-provider.ts'

export type { AvailabilityQuery, CalendarProvider, CreateEventInput, CreateEventResult, TimeSlot } from './types.ts'
export { isGoogleCalendarConfigured }

export async function getCalendarProvider(
  admin: SupabaseClient,
  businessId: string,
): Promise<CalendarProvider | null> {
  if (!isGoogleCalendarConfigured) return null

  const { data } = await admin
    .from('channel_credentials')
    .select('credential')
    .eq('business_id', businessId)
    .eq('provider', 'google_calendar')
    .maybeSingle()

  const credential = data?.credential as GoogleCalendarCredential | null
  if (!credential?.refresh_token) return null

  return new GoogleCalendarProvider(credential, async (patch) => {
    await admin
      .from('channel_credentials')
      .update({ credential: { ...credential, ...patch } })
      .eq('business_id', businessId)
      .eq('provider', 'google_calendar')
  })
}
