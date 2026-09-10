/**
 * Trae el texto de una URL a través de la Edge Function `fetch-url`.
 *
 * No se hace con `fetch` directo desde aquí: la mayoría de webs bloquean por
 * CORS una petición hecha desde el navegador de otro origen, y traer
 * contenido de terceros es mejor hacerlo donde se pueda controlar qué
 * destinos se permiten (ver fetch-url/index.ts).
 */
import { supabase } from '../supabase/client'
import { AppError, toAppError } from '../supabase/errors'
import type { UUID } from '@/domain/types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

export const urlFetchService = {
  async fetchText(businessId: UUID, url: string): Promise<string> {
    if (!apiBaseUrl) {
      throw new AppError('Todavía no hay un backend conectado para leer páginas web.')
    }

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    try {
      const response = await fetch(`${apiBaseUrl}/fetch-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ businessId, url }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}) as { error?: string })
        throw new AppError(payload.error ?? 'No hemos podido leer esa página.', payload)
      }

      const payload = (await response.json()) as { content: string }
      return payload.content
    } catch (error) {
      throw toAppError(error, 'No hemos podido leer esa página.')
    }
  },
}
