import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type { BusinessProfile, Service, UUID } from '@/domain/types'

export type BusinessProfileDraft = Omit<
  BusinessProfile,
  'id' | 'created_at' | 'updated_at'
>

export type ServiceDraft = Omit<Service, 'id' | 'created_at' | 'updated_at'>

export const businessProfileRepository = {
  async get(businessId: UUID): Promise<BusinessProfile | null> {
    const { data, error } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error) throw toAppError(error, 'No hemos podido cargar el perfil del negocio.')
    return data as BusinessProfile | null
  },

  async upsert(draft: BusinessProfileDraft): Promise<BusinessProfile> {
    const result = await supabase
      .from('business_profiles')
      .upsert(draft, { onConflict: 'business_id' })
      .select()
      .single()

    return unwrap(result, 'No hemos podido guardar el perfil del negocio.')
  },

  async listServices(businessId: UUID): Promise<Service[]> {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })

    if (error) throw toAppError(error, 'No hemos podido cargar tus servicios.')
    return (data ?? []) as Service[]
  },

  async createService(draft: ServiceDraft): Promise<Service> {
    const result = await supabase.from('services').insert(draft).select().single()
    return unwrap(result, 'No hemos podido guardar el servicio.')
  },

  async replaceServices(businessId: UUID, drafts: ServiceDraft[]): Promise<Service[]> {
    const { error: deleteError } = await supabase
      .from('services')
      .delete()
      .eq('business_id', businessId)

    if (deleteError) throw toAppError(deleteError, 'No hemos podido actualizar tus servicios.')
    if (drafts.length === 0) return []

    const result = await supabase.from('services').insert(drafts).select()
    return unwrap(result, 'No hemos podido guardar tus servicios.')
  },

  async updateService(serviceId: UUID, patch: Partial<Service>): Promise<Service> {
    const result = await supabase
      .from('services')
      .update(patch)
      .eq('id', serviceId)
      .select()
      .single()

    return unwrap(result, 'No hemos podido guardar el servicio.')
  },

  async removeService(serviceId: UUID): Promise<void> {
    const { error } = await supabase.from('services').delete().eq('id', serviceId)
    if (error) throw toAppError(error, 'No hemos podido eliminar el servicio.')
  },
}
