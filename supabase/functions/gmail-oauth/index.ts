/**
 * Flujo OAuth2 de Gmail — calca 1:1 el de google-calendar-oauth/index.ts
 * (mismo cuidado con CSRF, mismos códigos de un solo uso), con su propio
 * scope y su propia fila en `channel_credentials` (`provider: 'gmail'`,
 * independiente de `google_calendar`: un negocio puede conectar uno, otro,
 * o ambos, cada uno con su propio refresh_token).
 *
 * Es la MISMA app de Google Cloud que Calendar (mismos
 * GOOGLE_CLIENT_ID/SECRET) — no hace falta ningún alta ni trámite nuevo con
 * Google, solo este scope adicional ya está declarado en Datos de acceso
 * cuando se pidió `calendar.events` (o hay que añadirlo ahí si Google lo
 * rechaza en el consentimiento).
 *
 * POST /mint-start-code (sesión real)         → { code } de un solo uso, expira en 2 min
 * GET  /start?businessId=...&code=<uuid>      → redirige al consentimiento de Google
 * GET  /callback?code=...&state=<oauth_start_codes.code>  → intercambia el código, guarda el token
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isGmailOAuthConfigured } from '../_shared/gmail-client.ts'
import { applyCors, assertBusinessAccess, authenticate, corsHeadersFor, errorResponse, HttpError, json as jsonResponse } from '../_shared/auth.ts'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-oauth/callback`
const APP_URL = Deno.env.get('APP_URL') || 'https://sinaptiks-ia-business-builder.vercel.app'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

// Igual que google-calendar-oauth: /start y /callback son navegación de
// navegador y redirect de Google, nunca un fetch sujeto a CORS.
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(request) })
  }

  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const step = segments[segments.length - 1]

  if (!isGmailOAuthConfigured) {
    return json({ error: 'Gmail no está configurado todavía (faltan credenciales OAuth).' }, 503)
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

  if (step === 'disconnect') {
    return applyCors(await handleDisconnect(request), request)
  }

  return json({ error: 'Ruta desconocida' }, 404)
})

const START_CODE_TTL_MS = 2 * 60 * 1000
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

async function handleMintStartCode(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

    const ctx = await authenticate(request)
    const { businessId } = (await request.json().catch(() => ({}))) as { businessId?: string }
    await assertBusinessAccess(ctx, businessId ?? '')

    await admin.from('oauth_start_codes').delete().lt('expires_at', new Date().toISOString())

    const { data, error } = await admin
      .from('oauth_start_codes')
      .insert({
        user_id: ctx.userId,
        business_id: businessId,
        provider: 'gmail',
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

/**
 * Mismo motivo que en google-calendar-oauth: "Desconectar" solo cambiaba
 * `integrations.status` — el refresh_token seguía guardado, y
 * getGmailProvider() no mira `integrations.status`, así que el negocio
 * habría seguido enviando email real desde una cuenta que creía haber
 * desconectado.
 */
async function handleDisconnect(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

    const ctx = await authenticate(request)
    const { businessId } = (await request.json().catch(() => ({}))) as { businessId?: string }
    await assertBusinessAccess(ctx, businessId ?? '')

    const { data: existing } = await admin
      .from('channel_credentials')
      .select('credential')
      .eq('business_id', businessId)
      .eq('provider', 'gmail')
      .maybeSingle()

    const refreshToken = (existing?.credential as { refresh_token?: string } | null)?.refresh_token
    if (refreshToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
          method: 'POST',
        })
      } catch {
        // No bloquea el borrado local — eso es lo que de verdad protege.
      }
    }

    await admin.from('channel_credentials').delete().eq('business_id', businessId).eq('provider', 'gmail')

    await admin
      .from('integrations')
      .update({ status: 'no_conectado', connected_at: null, last_error: null })
      .eq('business_id', businessId)
      .eq('provider', 'gmail')

    return jsonResponse({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}

async function handleStart(url: URL): Promise<Response> {
  const businessId = url.searchParams.get('businessId')
  const code = url.searchParams.get('code')
  if (!businessId || !code) return json({ error: 'Faltan businessId o code' }, 400)

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
    { business_id: businessId, provider: 'gmail', status: 'conectando' },
    { onConflict: 'business_id,provider' },
  )

  const { data: stateRow, error: stateError } = await admin
    .from('oauth_start_codes')
    .insert({
      user_id: startCode.user_id,
      business_id: businessId,
      provider: 'gmail',
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
  // Scope mínimo real: solo enviar ("gmail.send"), nunca leer la bandeja de
  // entrada ni gestionar la cuenta — Google lo trata como más sensible
  // cuanto más amplio, y esto es lo único que el código necesita de verdad.
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send')
  authUrl.searchParams.set('state', stateRow.code)

  return Response.redirect(authUrl.toString(), 302)
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const redirectTarget = `${APP_URL}/app/canales`

  if (!code || !state) return json({ error: 'Faltan parámetros de Google' }, 400)

  const { data: stateRow } = await admin
    .from('oauth_start_codes')
    .delete()
    .eq('code', state)
    .eq('provider', 'gmail')
    .select('business_id, expires_at')
    .maybeSingle()

  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    console.warn('Callback de Gmail con state desconocido o caducado')
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
    console.error('Google token exchange falló (Gmail)', await tokenResponse.text())
    await markError(businessId, 'No se pudo completar la conexión con Google')
    return Response.redirect(redirectTarget, 302)
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  if (!tokens.refresh_token) {
    await markError(businessId, 'Google no devolvió un token de larga duración. Vuelve a intentar la conexión.')
    return Response.redirect(redirectTarget, 302)
  }

  // El email real del negocio, para que el "From" de cada envío no dependa
  // de adivinarlo — userinfo es una llamada barata y ya autorizada por el
  // mismo access_token que acabamos de recibir.
  let email: string | undefined
  try {
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (profileResponse.ok) {
      const profile = (await profileResponse.json()) as { email?: string }
      email = profile.email
    }
  } catch {
    // El envío funciona igual sin esto — Gmail rellena el remitente real de
    // todas formas; solo se pierde tenerlo explícito en la cabecera From.
  }

  await admin.from('channel_credentials').upsert(
    {
      business_id: businessId,
      provider: 'gmail',
      credential: {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        email,
      },
    },
    { onConflict: 'business_id,provider' },
  )

  await admin.from('integrations').upsert(
    {
      business_id: businessId,
      provider: 'gmail',
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
    { business_id: businessId, provider: 'gmail', status: 'error', last_error: message },
    { onConflict: 'business_id,provider' },
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
