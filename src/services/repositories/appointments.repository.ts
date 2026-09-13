import { supabase } from '../supabase/client'
import { AppError, toAppError } from '../supabase/errors'
import type { Appointment, UUID } from '@/domain/types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

export const appointmentsRepository = {
  async listForLead(leadId: UUID): Promise<Appointment[]> {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('lead_id', leadId)
      .order('starts_at', { ascending: false })

    if (error) throw toAppError(error, 'No hemos podido cargar las citas de este contacto.')
    return (data ?? []) as Appointment[]
  },

  /**
   * Borra el evento real del calendario conectado (si lo hay) y marca la
   * cita como cancelada. Pasa por el backend porque el token de Google vive
   * en `channel_credentials`, sin política de lectura para el navegador.
   */
  async cancel(appointmentId: UUID): Promise<void> {
    if (!apiBaseUrl) {
      throw new AppError('Todavía no hay un backend conectado para gestionar citas.')
    }

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      const response = await fetch(`${apiBaseUrl}/appointments/${appointmentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}) as { error?: string })
        throw new AppError(payload.error ?? 'No se pudo cancelar la cita.', payload)
      }
    } catch (error) {
      throw toAppError(error, 'No hemos podido cancelar la cita.')
    }
  },
}
