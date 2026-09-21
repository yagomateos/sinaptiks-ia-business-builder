/**
 * Envío real de email desde la cuenta de Gmail del propio negocio —
 * alternativa a Resend cuando el negocio conecta su Gmail. A diferencia de
 * Resend en modo de prueba (solo entrega a la dirección de la propia
 * cuenta), un Gmail conectado por OAuth puede mandar a cualquier
 * destinatario real desde el primer día.
 *
 * Mismo par de credenciales que Google Calendar (GOOGLE_CLIENT_ID/SECRET):
 * es la misma app de Google Cloud, solo cambia el scope pedido en
 * gmail-oauth/index.ts. El refresco de token es idéntico al de
 * calendar/google-calendar-provider.ts — mismo endpoint de Google para
 * cualquier API suya, solo cambia qué se llama después con el access_token.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

export const isGmailOAuthConfigured = Boolean(CLIENT_ID && CLIENT_SECRET)

export interface GmailCredential {
  refresh_token: string
  access_token?: string
  access_token_expires_at?: string
  email?: string
}

export class GmailProvider {
  constructor(
    private credential: GmailCredential,
    private readonly persistCredential: (patch: Partial<GmailCredential>) => Promise<void>,
  ) {}

  private async getAccessToken(): Promise<string> {
    const expiresAt = this.credential.access_token_expires_at
      ? new Date(this.credential.access_token_expires_at).getTime()
      : 0

    if (this.credential.access_token && expiresAt > Date.now() + 60_000) {
      return this.credential.access_token
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('Gmail no está configurado (faltan GOOGLE_CLIENT_ID/SECRET)')
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: this.credential.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      throw new Error(`No se pudo refrescar el token de Gmail (${response.status}): ${await response.text()}`)
    }

    const data = (await response.json()) as { access_token: string; expires_in: number }
    const access_token_expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString()

    this.credential = { ...this.credential, access_token: data.access_token, access_token_expires_at }
    await this.persistCredential({ access_token: data.access_token, access_token_expires_at })

    return data.access_token
  }

  async sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
    const accessToken = await this.getAccessToken()
    const from = this.credential.email

    // RFC 2822 mínimo: cabeceras + cuerpo HTML. Gmail exige el mensaje
    // entero en base64url dentro de `raw`, no como campos sueltos.
    const message = [
      `To: ${input.to}`,
      ...(from ? [`From: ${from}`] : []),
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(input.subject)))}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      '',
      input.html,
    ].join('\r\n')

    const raw = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    })

    if (!response.ok) {
      throw new Error(`Gmail messages.send falló (${response.status}): ${await response.text()}`)
    }
  }
}

/**
 * Único punto de entrada para conseguir el Gmail de un negocio — igual que
 * `getCalendarProvider` en calendar/index.ts. `null` si no está configurado
 * o el negocio no ha conectado su Gmail, nunca un error: quien llama decide
 * si eso significa "cae a Resend" o "no hay nada que enviar".
 */
export async function getGmailProvider(admin: SupabaseClient, businessId: string): Promise<GmailProvider | null> {
  if (!isGmailOAuthConfigured) return null

  const { data } = await admin
    .from('channel_credentials')
    .select('credential')
    .eq('business_id', businessId)
    .eq('provider', 'gmail')
    .maybeSingle()

  const credential = data?.credential as GmailCredential | null
  if (!credential?.refresh_token) return null

  return new GmailProvider(credential, async (patch) => {
    await admin
      .from('channel_credentials')
      .update({ credential: { ...credential, ...patch } })
      .eq('business_id', businessId)
      .eq('provider', 'gmail')
  })
}
