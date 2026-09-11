/**
 * Checkout y portal de facturación, a través de nuestro propio backend — el
 * navegador nunca ve la clave secreta de Stripe. Mismo patrón que
 * telegram.service.ts: una llamada POST autenticada, el backend hace el
 * trabajo real.
 */
import { supabase } from '../supabase/client'
import { AppError, toAppError } from '../supabase/errors'
import type { PlanKey, UUID } from '@/domain/types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

async function call<T>(path: string, body: unknown): Promise<T> {
  if (!apiBaseUrl) {
    throw new AppError('Todavía no hay un backend conectado para la facturación.')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const response = await fetch(`${apiBaseUrl}/stripe${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}) as { error?: string })
    throw new AppError(payload.error ?? 'Stripe ha devuelto un error.', payload)
  }

  return response.json() as Promise<T>
}

export const stripeService = {
  /** Redirige de verdad al navegador — Stripe Checkout no se puede abrir en un fetch. */
  async goToCheckout(businessId: UUID, plan: PlanKey): Promise<void> {
    try {
      const { url } = await call<{ url: string }>('/checkout', { businessId, plan })
      window.location.href = url
    } catch (error) {
      throw toAppError(error, 'No hemos podido abrir el checkout de Stripe.')
    }
  },

  async goToBillingPortal(businessId: UUID): Promise<void> {
    try {
      const { url } = await call<{ url: string }>('/portal', { businessId })
      window.location.href = url
    } catch (error) {
      throw toAppError(error, 'No hemos podido abrir el portal de facturación.')
    }
  },
}
