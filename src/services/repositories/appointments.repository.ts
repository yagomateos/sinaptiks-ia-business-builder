import { supabase } from '../supabase/client'
import { toAppError } from '../supabase/errors'
import type { Appointment, UUID } from '@/domain/types'

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
}
