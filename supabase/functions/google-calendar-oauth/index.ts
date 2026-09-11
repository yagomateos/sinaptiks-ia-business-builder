/**
 * Flujo OAuth2 de Google Calendar. No hay sesión de usuario posible en el
 * callback (Google redirige él mismo, sin cabeceras nuestras) — el `state`
 * lleva el businessId y `/start` ya comprobó que quien lo pidió pertenece a
 * ese negocio antes de mandarlo a Google.
 *
 * Sin GOOGLE_CLIENT_ID/SECRET configurados, cualquier ruta aquí devuelve un
 * error claro — nunca se finge una conexión (ver isGoogleCalendarConfigured).
 *
 * `/start` es una navegación de navegador (`window.location.href`), no un
 * fetch — no puede llevar la cabecera `Authorization`, así que no puede
 * autenticarse como el resto de Edge Functions. Antes recibía el JWT de
 * sesión entero como `?token=`, expuesto en el historial del navegador y en
 * cualquier log de acceso. Ahora el frontend pide primero un código de un
 * solo uso y corta vida (`mint-start-code`, autenticado normalmente) y solo
 * ese código viaja en la URL — `/start` lo consume una vez y lo borra.
 *
 * POST /mint-start-code (sesión real)         → { code } de un solo uso, expira en 2 min
 * GET  /start?businessId=...&code=<uuid>      → redirige al consentimiento de Google
 * GET  /callback?code=...&state=<businessId>  → intercambia el código, guarda el token
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isGoogleCalendarConfigured } from '../_shared/calendar/index.ts'
import { assertBusinessAccess, authenticate, CORS_HEADERS, errorResponse, HttpError, json as jsonResponse } from '../_shared/auth.ts'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-oauth/callback`
// `Response.redirect` exige una URL absoluta (lanza en vez de resolverla
// contra el origen actual, a diferencia del navegador) — sin `APP_URL`
// configurado, un `redirectTarget` relativo ("/") tira la función entera con
// un 500 en vez de completar la conexión. El frontend de producción es un
// respaldo razonable, no un secreto: ver la cabecera del README/CLAUDE.md.
const APP_URL = Deno.env.get('APP_URL') || 'https://sinaptiks-ia-business-builder.vercel.app'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const step = segments[segments.length - 1]

  if (!isGoogleCalendarConfigured) {
    return json({ error: 'Google Calendar no está configurado todavía (faltan credenciales OAuth).' }, 503)
  }

  if (step === 'mint-start-code') {
    return await handleMintStartCode(request)
  }

  if (step === 'start') {
    return await handleStart(url)
  }

  if (step === 'callback') {
    return await handleCallback(url)
  }

  return json({ error: 'Ruta desconocida' }, 404)
})

const START_CODE_TTL_MS = 2 * 60 * 1000

/**
 * Único paso de este flujo con sesión real disponible (fetch autenticado,
 * no la navegación de `/start`) — aquí se comprueba la pertenencia al
 * negocio, igual que en cualquier otra Edge Function, antes de emitir un
 * código de un solo uso que `/start` consumirá segundos después.
 */
async function handleMintStartCode(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

    const ctx = await authenticate(request)
    const { businessId } = (await request.json().catch(() => ({}))) as { businessId?: string }
    await assertBusinessAccess(ctx, businessId ?? '')

    // Solo se acumulan si alguien empieza el flujo y nunca vuelve de Google —
    // una limpieza perezosa en cada emisión basta para una tabla tan pequeña.
    await admin.from('oauth_start_codes').delete().lt('expires_at', new Date().toISOString())

    const { data, error } = await admin
      .from('oauth_start_codes')
      .insert({
        user_id: ctx.userId,
        business_id: businessId,
        provider: 'google_calendar',
        expires_at: new Date(Date.now() + START_CODE_TTL_MS).toISOString(),
      })
      .select('code')
      .single()

    if (error) throw new HttpError(500, 'No se pudo iniciar la conexión')

    return jsonResponse({ code: data.code })
  } catch (error) {
    return errorResponse(error)
  }
}

async function handleStart(url: URL): Promise<Response> {
  const businessId = url.searchParams.get('businessId')
  const code = url.searchParams.get('code')
  if (!businessId || !code) return json({ error: 'Faltan businessId o code' }, 400)

  // El código es de un solo uso: se borra al leerlo, coincida o no, para que
  // nadie pueda reintentarlo aunque lo haya visto (historial del navegador,
  // un log) después de que expire su ventana de 2 minutos.
  const { data: startCode } = await admin
    .from('oauth_start_codes')
    .delete()
    .eq('code', code)
    .eq('business_id', businessId)
    .select('user_id, expires_at')
    .maybeSingle()

  if (!startCode || new Date(startCode.expires_at).getTime() < Date.now()) {
    return json({ error: 'El enlace de conexión ha caducado. Vuelve a intentarlo desde Canales.' }, 401)
  }

  const { data: membership } = await admin
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', startCode.user_id)
    .maybeSingle()
  if (!membership) return json({ error: 'No tienes acceso a este negocio' }, 403)

  await admin.from('integrations').upsert(
    { business_id: businessId, provider: 'google_calendar', status: 'conectando' },
    { onConflict: 'business_id,provider' },
  )

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar')
  authUrl.searchParams.set('state', businessId)

  return Response.redirect(authUrl.toString(), 302)
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const businessId = url.searchParams.get('state')
  const redirectTarget = `${APP_URL}/app/canales`

  if (!code || !businessId) return json({ error: 'Faltan parámetros de Google' }, 400)

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  })

  if (!tokenResponse.ok) {
    console.error('Google token exchange falló', await tokenResponse.text())
    await markError(businessId, 'No se pudo completar la conexión con Google')
    return Response.redirect(redirectTarget, 302)
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  if (!tokens.refresh_token) {
    // Google solo manda refresh_token la primera vez que se da consentimiento
    // (o forzando prompt=consent, que ya se hace en /start) — sin él no se
    // puede refrescar el acceso más adelante.
    await markError(businessId, 'Google no devolvió un token de larga duración. Vuelve a intentar la conexión.')
    return Response.redirect(redirectTarget, 302)
  }

  await admin.from('channel_credentials').upsert(
    {
      business_id: businessId,
      provider: 'google_calendar',
      credential: {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      },
    },
    { onConflict: 'business_id,provider' },
  )

  await admin.from('integrations').upsert(
    {
      business_id: businessId,
      provider: 'google_calendar',
      status: 'conectado',
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'business_id,provider' },
  )

  return Response.redirect(redirectTarget, 302)
}

async function markError(businessId: string, message: string): Promise<void> {
  await admin.from('integrations').upsert(
    { business_id: businessId, provider: 'google_calendar', status: 'error', last_error: message },
    { onConflict: 'business_id,provider' },
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
