/**
 * Edge Function `whatsapp-webhook` — recibe mensajes reales de WhatsApp
 * Cloud API (Meta).
 *
 * A diferencia de Telegram, aquí hay una única URL compartida por todos los
 * negocios (así funciona la Cloud API: el webhook se registra una vez a nivel
 * de la app de Meta, no por negocio). Quien identifica de qué negocio es un
 * mensaje entrante es el `phone_number_id` que trae el propio payload,
 * resuelto contra `channel_credentials` mediante una función de base de
 * datos bloqueada a la service role (ver la migración
 * `whatsapp_webhook_lookup`), nunca leyendo el token directamente desde aquí
 * con una consulta normal.
 *
 * Dos verificaciones distintas, una por dirección:
 * - GET: el "handshake" que hace Meta una sola vez al configurar el webhook,
 *   comprobando `WHATSAPP_VERIFY_TOKEN`.
 * - POST: cada mensaje real, firmado con `X-Hub-Signature-256` usando el
 *   secreto de la app (`WHATSAPP_APP_SECRET`). Sin ese secreto configurado,
 *   no hay forma honesta de comprobar que la petición viene de verdad de
 *   Meta — se rechaza en vez de confiar a ciegas en el payload.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { respondWithAgent } from '../_shared/conversation-pipeline.ts'
import { sendWhatsAppMessage, verifyWhatsAppSignature } from '../_shared/whatsapp-client.ts'

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? ''

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface WhatsAppWebhookBody {
  entry?: {
    changes?: {
      field?: string
      value?: {
        metadata?: { phone_number_id?: string }
        contacts?: { profile?: { name?: string }; wa_id?: string }[]
        messages?: { from?: string; type?: string; text?: { body?: string } }[]
      }
    }[]
  }[]
}

Deno.serve(async (request) => {
  const url = new URL(request.url)

  if (request.method === 'GET') {
    if (!VERIFY_TOKEN) {
      return new Response('WhatsApp no está configurado', { status: 503 })
    }

    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Verificación fallida', { status: 403 })
  }

  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  const rawBody = await request.text()

  if (!APP_SECRET) {
    console.warn('Webhook de WhatsApp rechazado: WHATSAPP_APP_SECRET no configurado')
    return new Response('WhatsApp no está configurado', { status: 503 })
  }

  const signatureValid = await verifyWhatsAppSignature(
    rawBody,
    request.headers.get('x-hub-signature-256'),
    APP_SECRET,
  )
  if (!signatureValid) {
    console.warn('Webhook de WhatsApp con firma incorrecta')
    return new Response('No autorizado', { status: 401 })
  }

  let body: WhatsAppWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response('Cuerpo no válido', { status: 400 })
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      // Meta manda otros tipos de "change" por el mismo webhook (recibos de
      // entrega, plantillas...) que no nos interesan aquí.
      if (change.field !== 'messages') continue

      const phoneNumberId = change.value?.metadata?.phone_number_id
      const messages = change.value?.messages ?? []
      if (!phoneNumberId || messages.length === 0) continue

      const { data: resolved, error: resolveError } = await admin.rpc(
        'find_business_by_whatsapp_phone_number_id',
        { phone_number_id: phoneNumberId },
      )

      if (resolveError || !resolved || resolved.length === 0) {
        console.warn(`Webhook de WhatsApp para un phone_number_id desconocido: ${phoneNumberId}`)
        continue
      }

      const { business_id: businessId, access_token: accessToken } = resolved[0]
      if (!accessToken) continue

      const contactName = change.value?.contacts?.[0]?.profile?.name ?? 'Contacto de WhatsApp'

      for (const message of messages) {
        // Solo texto por ahora — igual que Telegram, otros tipos (imágenes,
        // audio, ubicación...) se ignoran en vez de fallar.
        if (message.type !== 'text' || !message.text?.body || !message.from) continue

        try {
          const result = await respondWithAgent(admin, businessId, {
            payload: {
              name: contactName,
              // El número del remitente es el identificador real del
              // contacto en este canal — hace de "teléfono" a efectos de
              // deduplicar quién es quién entre mensajes, igual que `tg:` en
              // Telegram.
              phone: `wa:${message.from}`,
              channel: 'whatsapp',
            },
            incomingText: message.text.body,
            channel: 'whatsapp',
          })

          if (result.reply) {
            await sendWhatsAppMessage(accessToken, phoneNumberId, message.from, result.reply)
          }
        } catch (error) {
          console.error('Error procesando mensaje de WhatsApp', error)
          // Se sigue con el resto de mensajes: un fallo en uno no debe tirar
          // los demás, y se responde 200 igualmente para que Meta no
          // reintente la entrega completa.
        }
      }
    }
  }

  return new Response('ok')
})
