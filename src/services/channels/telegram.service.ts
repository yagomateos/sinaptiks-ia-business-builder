/**
 * Conectar/desconectar Telegram, a través de nuestro propio backend.
 *
 * El token del bot pasa por el navegador una sola vez, al escribirlo en el
 * formulario — igual que al iniciar sesión con una contraseña. Desde ahí lo
 * recibe la Edge Function `channels`, que lo guarda en una tabla de solo
 * escritura y nunca lo devuelve: ni este servicio ni ningún componente vuelven
 * a verlo después de la conexión.
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

export const telegramService = {
  async connect(businessId: UUID, botToken: string): Promise<{ botUsername: string }> {
    try {
      return await call('/connect-telegram', { businessId, botToken })
    } catch (error) {
      throw toAppError(error, 'No hemos podido conectar Telegram.')
    }
  },

  async disconnect(businessId: UUID): Promise<void> {
    try {
      await call('/disconnect-telegram', { businessId })
    } catch (error) {
      throw toAppError(error, 'No hemos podido desconectar Telegram.')
    }
  },
}
