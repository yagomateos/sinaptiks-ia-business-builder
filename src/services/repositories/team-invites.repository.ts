/**
 * Invitar a alguien a un negocio — pasa por `team-invites` (Edge Function)
 * porque crear/revocar una invitación exige comprobar que quien llama es
 * owner/admin, y aceptarla exige la service role (quien acepta no es
 * todavía miembro, así que RLS le impediría insertarse a sí mismo).
 */
import { supabase } from '../supabase/client'
import { AppError, toAppError } from '../supabase/errors'
import type { MemberRole, UUID } from '@/domain/types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

export interface PendingInvite {
  id: UUID
  email: string
  role: MemberRole
  status: 'pendiente'
  expires_at: string
  created_at: string
}

export interface InvitePreview {
  businessName: string
  inviterName: string
  role: MemberRole
  email: string
  status: 'pendiente' | 'aceptada' | 'revocada' | 'caducada'
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) {
    throw new AppError('El motor de automatización no está configurado')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const response = await fetch(`${apiBaseUrl}/team-invites${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    const parsedMessage = (() => {
      try {
        return (JSON.parse(body) as { error?: string }).error
      } catch {
        return undefined
      }
    })()
    throw new AppError(parsedMessage ?? 'Ha ocurrido un error inesperado.', body)
  }

  return (await response.json()) as T
}

export const teamInvitesRepository = {
  async invite(
    businessId: UUID,
    email: string,
    role: Exclude<MemberRole, 'owner'>,
  ): Promise<{ code: string; inviteUrl: string; emailSent: boolean }> {
    try {
      return await call('/invite', { method: 'POST', body: JSON.stringify({ businessId, email, role }) })
    } catch (error) {
      throw toAppError(error, 'No hemos podido crear la invitación.')
    }
  },

  async listPending(businessId: UUID): Promise<PendingInvite[]> {
    try {
      return await call(`/list?businessId=${businessId}`)
    } catch (error) {
      throw toAppError(error, 'No hemos podido cargar las invitaciones.')
    }
  },

  async revoke(inviteId: UUID): Promise<void> {
    try {
      await call('/revoke', { method: 'POST', body: JSON.stringify({ inviteId }) })
    } catch (error) {
      throw toAppError(error, 'No hemos podido revocar la invitación.')
    }
  },

  async preview(code: string): Promise<InvitePreview> {
    try {
      return await call(`/${code}`)
    } catch (error) {
      throw toAppError(error, 'No hemos podido cargar la invitación.')
    }
  },

  async accept(code: string): Promise<{ businessId: UUID }> {
    try {
      return await call('/accept', { method: 'POST', body: JSON.stringify({ code }) })
    } catch (error) {
      throw toAppError(error, 'No hemos podido aceptar la invitación.')
    }
  },
}
