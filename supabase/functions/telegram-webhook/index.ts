/**
 * Edge Function `telegram-webhook` — recibe mensajes reales de Telegram.
 *
 * Una sola función sirve a todos los negocios. Telegram llama a la misma URL
 * para cualquier bot, así que quien identifica de qué negocio es el mensaje
 * es el SECRETO en la ruta (`/telegram-webhook/:secret`), no el propio
 * mensaje — y ese secreto se resuelve contra `channel_credentials` mediante
 * una función de base de datos bloqueada a la service role (ver la migración
 * `channel_credentials`), nunca leyendo el token directamente desde aquí con
 * una consulta normal.
 *
 * No hay sesión de usuario posible: quien llama es Telegram. La única
 * defensa es que el secreto de la URL sea impredecible (se genera al
 * conectar el bot) y que, además, Telegram firme cada petición con el
 * `secret_token` configurado en `setWebhook`, comprobado aquí como segunda
 * capa.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { respondWithAgent } from '../_shared/conversation-pipeline.ts'
import { downloadTelegramFile, sendTelegramAudio, sendTelegramMessage } from '../_shared/telegram-client.ts'
import { isTtsConfigured, textToSpeech } from '../_shared/tts.ts'
import { isOpenAiConfigured, transcribeAudio } from '../_shared/openai-client.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    from?: { first_name?: string; last_name?: string; username?: string }
    text?: string
    voice?: { file_id: string; duration: number }
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const secret = segments[segments.length - 1]

  if (!secret) return new Response('Falta el identificador', { status: 400 })

  // Segunda capa: el secreto que Telegram firma en la cabecera cuando se
  // configuró el webhook con `secret_token`. Si no coincide (o falta), ni se
  // intenta resolver el negocio.
  const headerSecret = request.headers.get('x-telegram-bot-api-secret-token')

  if (headerSecret !== secret) {
    console.warn('Webhook de Telegram con firma incorrecta o ausente')
    return new Response('No autorizado', { status: 401 })
  }

  const { data: resolved, error: resolveError } = await admin.rpc(
    'find_business_by_telegram_secret',
    { secret },
  )

  if (resolveError || !resolved || resolved.length === 0) {
    console.warn('Webhook de Telegram con secreto desconocido')
    return new Response('No encontrado', { status: 404 })
  }

  const { business_id: businessId, bot_token: botToken } = resolved[0]

  if (!botToken) {
    return new Response('Bot sin token configurado', { status: 500 })
  }

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return new Response('Cuerpo no válido', { status: 400 })
  }

  const message = update.message
  if (!message?.text && !message?.voice) {
    // Telegram envía otros tipos de update (ediciones, reacciones…) que no
    // nos interesan. Responder 200 evita que Telegram siga reintentando.
    return new Response('ok')
  }

  const contactName =
    [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') ||
    message.from?.username ||
    'Contacto de Telegram'

  try {
    // Si el cliente manda una nota de voz en vez de texto, se transcribe
    // antes de pasarla al agente — para el resto del flujo (guardar el
    // mensaje, puntuar el lead, generar la respuesta) es como si hubiera
    // escrito. Sin OPENAI_API_KEY, el mensaje se descarta con un aviso en
    // vez de fingir que se entendió.
    let incomingText = message.text
    if (!incomingText && message.voice) {
      if (!isOpenAiConfigured) {
        console.warn('Nota de voz recibida sin transcripción configurada (falta OPENAI_API_KEY)')
        return new Response('ok')
      }
      const audio = await downloadTelegramFile(botToken, message.voice.file_id)
      incomingText = await transcribeAudio(audio, 'nota-de-voz.ogg')
    }

    const result = await respondWithAgent(admin, businessId, {
      payload: {
        name: contactName,
        // Telegram no da teléfono ni email: el chat_id es el identificador
        // real del contacto en este canal, así que hace de "teléfono" a
        // efectos de deduplicar quién es quién entre mensajes.
        phone: `tg:${message.chat.id}`,
        channel: 'telegram',
      },
      incomingText: incomingText ?? '',
      channel: 'telegram',
    })

    if (result.reply) {
      // La voz llega primero (así lo quiere el negocio), pero sigue siendo
      // un extra sobre el texto, nunca lo sustituye: si falla o no está
      // configurada, el texto se manda igual justo después.
      if (isTtsConfigured) {
        try {
          const audio = await textToSpeech(result.reply)
          await sendTelegramAudio(botToken, message.chat.id, audio)
        } catch (voiceError) {
          console.error('No se pudo generar/enviar la nota de voz', voiceError)
        }
      }

      await sendTelegramMessage(botToken, message.chat.id, result.reply)
    }
  } catch (error) {
    console.error('Error procesando mensaje de Telegram', error)
    // Se responde 200 de todas formas: un 5xx haría que Telegram reintente
    // el mismo mensaje repetidamente, duplicando la conversación.
  }

  return new Response('ok')
})
