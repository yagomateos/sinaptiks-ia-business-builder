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
 * GET  /callback?code=...&state=<oauth_start_codes.code>  → intercambia el código, guarda el token
 *
 * El `state` que ve Google no es el businessId: sería un CSRF de manual de
 * OAuth (cualquiera que complete su propio consentimiento de Google podría
 * llamar a /callback pegando el `state` de otro negocio y secuestrar su
 * integración de Calendar). `/start` emite un segundo código de un solo uso
 * — nueva fila en `oauth_start_codes`, ligada al negocio ya verificado — y
 * ese código, no el businessId, es el `state`. `/callback` solo confía en el
 * businessId que cuelga de esa fila, nunca en un parámetro de la URL.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isGoogleCalendarConfigured } from '../_shared/calendar/index.ts'
import { assertBusinessAccess, authenticate, corsHeadersFor, errorResponse, HttpError, json as jsonResponse } from '../_shared/auth.ts'

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

// A diferencia del resto de funciones, aquí no se envuelve la respuesta con
// `applyCors()`: `/start` y `/callback` son navegaciones de navegador y
// redirects de Google, nunca un `fetch()` sujeto a CORS — y mutar los
// headers de un `Response.redirect()` es terreno más frágil de lo que
// merece este ajuste. Solo `/mint-start-code` es un fetch real, y ya exige
// sesión válida más pertenencia al negocio.
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(request) })
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
// Más margen que el código de arranque: aquí cuenta el tiempo que el usuario
// tarda en revisar y aceptar la pantalla de consentimiento de Google.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

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

  // Segundo código de un solo uso: es este, no el businessId, el que viaja
  // como `state` — así /callback puede confiar en a qué negocio pertenece
  // sin fiarse de un parámetro que cualquiera podría manipular en la URL.
  const { data: stateRow, error: stateError } = await admin
    .from('oauth_start_codes')
    .insert({
      user_id: startCode.user_id,
      business_id: businessId,
      provider: 'google_calendar',
      expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
    })
    .select('code')
    .single()

  if (stateError) return json({ error: 'No se pudo iniciar la conexión' }, 500)

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  // Scope mínimo real: el código solo lee/crea/borra EVENTOS (freeBusy,
  // events.insert, events.delete) — nunca gestiona calendarios enteros ni
  // quién tiene acceso a ellos. El scope completo 'calendar' pedía permiso
  // de más (Google lo trata como más sensible de lo necesario para
  // verificar la app), y freebusy.query acepta 'calendar.events' igual.
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events')
  authUrl.searchParams.set('state', stateRow.code)

  return Response.redirect(authUrl.toString(), 302)
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const redirectTarget = `${APP_URL}/app/canales`

  if (!code || !state) return json({ error: 'Faltan parámetros de Google' }, 400)

  // El `state` es de un solo uso y se borra al leerlo, coincida o no — nunca
  // se confía en un businessId que viniera directamente de la URL.
  const { data: stateRow } = await admin
    .from('oauth_start_codes')
    .delete()
    .eq('code', state)
    .eq('provider', 'google_calendar')
    .select('business_id, expires_at')
    .maybeSingle()

  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    console.warn('Callback de Google Calendar con state desconocido o caducado')
    return Response.redirect(redirectTarget, 302)
  }

  const businessId = stateRow.business_id

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
