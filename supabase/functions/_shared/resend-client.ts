/**
 * Cliente mínimo de Resend. Solo se usa desde Edge Functions: la API key vive
 * en los secretos de Supabase y nunca sale de aquí.
 *
 * Sin dominio propio verificado en Resend, solo se puede enviar desde
 * `onboarding@resend.dev` y solo al email con el que se creó la cuenta — eso
 * es una restricción de Resend en modo de prueba, no de este código. Cuando
 * el negocio verifique su propio dominio, `from` puede pasar a ser el suyo.
 */
const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''

export const isResendConfigured = Boolean(apiKey)

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!apiKey) throw new Error('Resend no está configurado')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Sinaptiks <onboarding@resend.dev>',
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`Resend respondió ${response.status}`, body)
    throw new Error(`No se pudo enviar el email (${response.status})`)
  }
}
