/**
 * Edge Function `stripe` — checkout y portal de facturación. La clave
 * secreta vive en Deno.env, nunca llega al navegador. El estado real de la
 * suscripción (plan/estado/periodo) lo escribe stripe-webhook, no esto: aquí
 * solo se abren las pantallas de Stripe, la fuente de verdad es el webhook.
 *
 * Rutas (bajo /functions/v1/stripe):
 *   POST /checkout   crea (o reutiliza) el customer y devuelve la URL de Checkout
 *   POST /portal     devuelve la URL del Billing Portal del customer existente
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  assertBusinessAccess,
  authenticate,
  CORS_HEADERS,
  errorResponse,
  HttpError,
  json,
  type AuthContext,
} from '../_shared/auth.ts'
import * as stripeClient from '../_shared/stripe-client.ts'

const APP_URL = Deno.env.get('APP_URL') ?? ''

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (!stripeClient.isStripeConfigured) {
      throw new HttpError(503, 'La facturación con Stripe no está configurada todavía.')
    }

    const ctx = await authenticate(request)
    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const start = segments.indexOf('stripe')
    const path = start >= 0 ? segments.slice(start + 1) : segments

    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

    if (path[0] === 'checkout') return await handleCheckout(ctx, request)
    if (path[0] === 'portal') return await handlePortal(ctx, request)

    throw new HttpError(404, 'Ruta desconocida')
  } catch (error) {
    return errorResponse(error)
  }
})

async function handleCheckout(ctx: AuthContext, request: Request): Promise<Response> {
  const body = (await request.json()) as { businessId?: string; plan?: string }
  if (!body.businessId || !body.plan) throw new HttpError(400, 'Faltan businessId o plan')
  await assertBusinessAccess(ctx, body.businessId)

  const priceId = stripeClient.priceIdForPlan(body.plan)
  if (!priceId) throw new HttpError(400, `Ese plan no tiene un precio configurado en Stripe todavía`)

  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('business_id', body.businessId)
    .maybeSingle()

  let customerId = sub?.stripe_customer_id ?? null

  if (!customerId) {
    const { data: profile, error: profileError } = await ctx.db
      .from('profiles')
      .select('email')
      .eq('id', ctx.userId)
      .single()
    if (profileError || !profile) throw new HttpError(500, 'No se pudo leer tu perfil')

    const customer = await stripeClient.createCustomer(profile.email, body.businessId)
    customerId = customer.id

    await admin
      .from('subscriptions')
      .update({ stripe_customer_id: customerId })
      .eq('business_id', body.businessId)
  }

  const session = await stripeClient.createCheckoutSession({
    customerId,
    priceId,
    businessId: body.businessId,
    successUrl: `${APP_URL}/app/ajustes?checkout=success`,
    cancelUrl: `${APP_URL}/app/ajustes?checkout=cancel`,
  })

  return json({ url: session.url })
}

async function handlePortal(ctx: AuthContext, request: Request): Promise<Response> {
  const body = (await request.json()) as { businessId?: string }
  if (!body.businessId) throw new HttpError(400, 'Falta businessId')
  await assertBusinessAccess(ctx, body.businessId)

  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('business_id', body.businessId)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    throw new HttpError(400, 'Este negocio todavía no tiene un cliente de Stripe — completa un checkout primero.')
  }

  const portal = await stripeClient.createBillingPortalSession(sub.stripe_customer_id, `${APP_URL}/app/ajustes`)
  return json({ url: portal.url })
}
