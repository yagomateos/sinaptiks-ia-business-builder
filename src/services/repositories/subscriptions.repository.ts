import { supabase } from '../supabase/client'
import { toAppError } from '../supabase/errors'
import type { Subscription, UUID } from '@/domain/types'

export const subscriptionsRepository = {
  async getByBusiness(businessId: UUID): Promise<Subscription | null> {
    const result = await supabase.from('subscriptions').select('*').eq('business_id', businessId).maybeSingle()
    if (result.error) throw toAppError(result.error, 'No hemos podido cargar tu plan.')
    return result.data
  },
}
