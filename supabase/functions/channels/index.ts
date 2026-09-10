/**
 * Edge Function `channels` — conectar y desconectar canales de mensajería
 * que requieren guardar una credencial (hoy: Telegram).
 *
 * La llama una persona con sesión, desde el formulario de "Conectar" del
 * marketplace de canales. El token nunca vuelve al cliente después de
 * guardarse: `channel_credentials` es de solo escritura (ver su migración),
 * así que ni siquiera esta función puede releerlo salvo a través de la
 * función de base de datos dedicada.
 */
import {
  assertBusinessAccess,
  authenticate,
  CORS_HEADERS,
  errorResponse,
  HttpError,
  json,
} from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

    const ctx = await authenticate(request)
    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const start = segments.indexOf('channels')
    const operation = start >= 0 ? segments[start + 1] : undefined

    const body = await request.json()

    switch (operation) {
      case 'connect-telegram':
        return json(await connectTelegram(ctx, body))
      case 'disconnect-telegram':
        return json(await disconnectTelegram(ctx, body))
      default:
        throw new HttpError(404, 'Operación desconocida')
    }
  } catch (error) {
    return errorResponse(error)
  }
})

/* ------------------------------------------------------------------ */

async function connectTelegram(
  ctx: Awaited<ReturnType<typeof authenticate>>,
  body: unknown,
): Promise<{ botUsername: string }> {
  const { businessId, botToken } = (body ?? {}) as { businessId?: string; botToken?: string }

  if (!businessId) throw new HttpError(400, 'Falta el negocio')
  if (!botToken?.trim()) throw new HttpError(400, 'Falta el token del bot')

  await assertBusinessAccess(ctx, businessId)

  // Se valida el token llamando a Telegram antes de guardar nada: mejor un
  // error claro ahora ("el token no es válido") que uno silencioso más tarde
  // cuando llegue el primer mensaje y no haya forma de enviarlo.
  const me = await callTelegram(botToken, 'getMe')
  if (!me.ok) {
    throw new HttpError(400, 'Ese token no es válido. Revísalo en BotFather e inténtalo de nuevo.')
  }
  const botUsername = String(me.result?.username ?? 'bot')

  const webhookSecret = crypto.randomUUID()
  const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook/${webhookSecret}`

  const hook = await callTelegram(botToken, 'setWebhook', {
    url: webhookUrl,
    secret_token: webhookSecret,
    // Solo mensajes de texto nos interesan por ahora.
    allowed_updates: ['message'],
  })

  if (!hook.ok) {
    throw new HttpError(502, 'Telegram no ha aceptado la conexión. Inténtalo de nuevo en unos minutos.')
  }

  const { error: saveError } = await ctx.db.from('channel_credentials').upsert(
    {
      business_id: businessId,
      provider: 'telegram',
      credential: { bot_token: botToken, webhook_secret: webhookSecret },
    },
    { onConflict: 'business_id,provider' },
  )

  if (saveError) throw new HttpError(500, 'No se pudo guardar la conexión')

  const { error: statusError } = await ctx.db.from('integrations').upsert(
    {
      business_id: businessId,
      provider: 'telegram',
      status: 'conectado',
      config: { bot_username: botUsername },
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'business_id,provider' },
  )

  if (statusError) throw new HttpError(500, 'No se pudo actualizar el estado de la conexión')

  return { botUsername }
}

async function disconnectTelegram(
  ctx: Awaited<ReturnType<typeof authenticate>>,
  body: unknown,
): Promise<{ ok: true }> {
  const { businessId } = (body ?? {}) as { businessId?: string }
  if (!businessId) throw new HttpError(400, 'Falta el negocio')
  await assertBusinessAccess(ctx, businessId)

  // No hace falta el token para borrar el webhook: Telegram lo asocia al
  // secreto de la URL, que se pierde en cuanto se borra la credencial. Basta
  // con quitar la fila; el webhook simplemente dejará de tener destino válido
  // la próxima vez que alguien escriba, y Telegram lo reintentará y descartará.
  await ctx.db
    .from('channel_credentials')
    .delete()
    .eq('business_id', businessId)
    .eq('provider', 'telegram')

  const { error } = await ctx.db
    .from('integrations')
    .update({ status: 'no_conectado', config: {}, connected_at: null })
    .eq('business_id', businessId)
    .eq('provider', 'telegram')

  if (error) throw new HttpError(500, 'No se pudo desconectar')
  return { ok: true }
}

async function callTelegram(
  botToken: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<{ ok: boolean; result?: Record<string, unknown> }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params ?? {}),
  })

  return response.json()
}
