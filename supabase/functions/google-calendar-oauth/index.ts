/**
 * Flujo OAuth2 de Google Calendar. No hay sesión de usuario posible en el
 * callback (Google redirige él mismo, sin cabeceras nuestras) — el `state`
 * lleva el businessId y `/start` ya comprobó que quien lo pidió pertenece a
 * ese negocio antes de mandarlo a Google.
 *
 * Sin GOOGLE_CLIENT_ID/SECRET configurados, cualquier ruta aquí devuelve un
 * error claro — nunca se finge una conexión (ver isGoogleCalendarConfigured).
 *
 * GET /start?businessId=...&token=<jwt>   → redirige al consentimiento de Google
 * GET /callback?code=...&state=<businessId> → intercambia el código, guarda el token
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isGoogleCalendarConfigured } from '../_shared/calendar/index.ts'

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
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const step = segments[segments.length - 1]

  if (!isGoogleCalendarConfigured) {
    return json({ error: 'Google Calendar no está configurado todavía (faltan credenciales OAuth).' }, 503)
  }

  if (step === 'start') {
    return await handleStart(url)
  }

  if (step === 'callback') {
    return await handleCallback(url)
  }

  return json({ error: 'Ruta desconocida' }, 404)
})

async function handleStart(url: URL): Promise<Response> {
  const businessId = url.searchParams.get('businessId')
  const token = url.searchParams.get('token')
  if (!businessId || !token) return json({ error: 'Faltan businessId o token' }, 400)

  // Mismo control que assertBusinessAccess en _shared/auth.ts, adaptado a un
  // GET de navegador (el token llega por query, no por cabecera Authorization
  // — Google no reenvía cabeceras al volver del consentimiento).
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await asUser.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Sesión no válida' }, 401)

  const { data: membership } = await asUser
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', userData.user.id)
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
