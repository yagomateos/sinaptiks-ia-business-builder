/**
 * Conectar/desconectar WhatsApp Business, a través de nuestro propio backend.
 *
 * El `phone_number_id` y el token de acceso pasan por el navegador una sola
 * vez, al escribirlos en el formulario — igual que con el token de Telegram.
 * Desde ahí los recibe la Edge Function `channels`, que los guarda en una
 * tabla de solo escritura y nunca los devuelve.
 */
import { supabase } from '../supabase/client'
import { AppError, toAppError } from '../supabase/errors'
import type { UUID } from '@/domain/types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

async function call<T>(path: string, body: unknown): Promise<T> {
  if (!apiBaseUrl) {
    throw new AppError('Todavía no hay un backend conectado para gestionar canales.')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const response = await fetch(`${apiBaseUrl}/channels${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}) as { error?: string })
    throw new AppError(payload.error ?? 'El canal ha devuelto un error.', payload)
  }

  return response.json() as Promise<T>
}

export const whatsappService = {
  async connect(
    businessId: UUID,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{ displayPhoneNumber: string; verifiedName: string }> {
    try {
      return await call('/connect-whatsapp', { businessId, phoneNumberId, accessToken })
    } catch (error) {
      throw toAppError(error, 'No hemos podido conectar WhatsApp.')
    }
  },

  async disconnect(businessId: UUID): Promise<void> {
    try {
      await call('/disconnect-whatsapp', { businessId })
    } catch (error) {
      throw toAppError(error, 'No hemos podido desconectar WhatsApp.')
    }
  },
}
