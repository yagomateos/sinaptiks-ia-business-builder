/**
 * Punto único para mandar un email "como el negocio" — quien llama (n8n-callback,
 * conversation-pipeline, team-invites...) no sabe ni le importa si detrás hay
 * Gmail (el negocio conectó su cuenta, entrega a cualquier destinatario real
 * desde el primer día) o Resend (siempre disponible, pero en modo de prueba
 * solo entrega a la dirección de la propia cuenta de Resend). Gmail tiene
 * prioridad porque, una vez conectado, es estrictamente más capaz.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getGmailProvider } from './gmail-client.ts'
import { isResendConfigured, sendEmail as sendViaResend } from './resend-client.ts'

export interface SendBusinessEmailInput {
  to: string
  subject: string
  html: string
}

export async function isBusinessEmailConfigured(admin: SupabaseClient, businessId: string): Promise<boolean> {
  if (await getGmailProvider(admin, businessId)) return true
  return isResendConfigured
}

export async function sendBusinessEmail(
  admin: SupabaseClient,
  businessId: string,
  input: SendBusinessEmailInput,
): Promise<void> {
  const gmail = await getGmailProvider(admin, businessId)
  if (gmail) {
    await gmail.sendEmail(input)
    return
  }

  if (!isResendConfigured) throw new Error('Ningún proveedor de email está configurado')
  await sendViaResend(input)
}
