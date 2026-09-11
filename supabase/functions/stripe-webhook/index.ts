/**
 * Edge Function `stripe-webhook` — la fuente real de verdad del estado de la
 * suscripción. No hay sesión de usuario posible (lo llama Stripe, no una
 * persona): la única defensa es verificar la firma HMAC de la cabecera
 * `Stripe-Signature` contra STRIPE_WEBHOOK_SECRET antes de tocar nada.
 *
 * `stripe/index.ts` (checkout/portal) nunca escribe plan/estado — solo abre
 * pantallas de Stripe. Esto es lo único que actualiza `subscriptions` tras
 * el pago real, así el negocio no puede quedar con un plan que Stripe no
 * confirmó.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isStripeWebhookConfigured, mapStripeStatus, planForPriceId, verifyStripeSignature } from '../_shared/stripe-client.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface StripeEvent {
  type: string
  data: { object: Record<string, unknown> }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  if (!isStripeWebhookConfigured) {
    return new Response('Stripe no está configurado todavía', { status: 503 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  const valid = await verifyStripeSignature(rawBody, signature)

  if (!valid) {
    console.warn('stripe-webhook rechazado: firma inválida')
    return new Response('Firma inválida', { status: 400 })
  }

  let event: StripeEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Cuerpo no válido', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(event.data.object)
        break
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(event.data.object)
        break
      default:
        // El resto de eventos (invoices, pagos sueltos...) no cambian el
        // estado de la suscripción en sí — se ignoran a propósito.
        break
    }
  } catch (error) {
    console.error(`stripe-webhook: error procesando ${event.type}`, error)
    // 500 le dice a Stripe que reintente este evento más tarde.
    return new Response('Error procesando el evento', { status: 500 })
  }

  return new Response('ok')
})

async function onCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
  const businessId = (session.metadata as { business_id?: string } | undefined)?.business_id
  if (!businessId) return

  await admin
    .from('subscriptions')
    .update({
      stripe_customer_id: String(session.customer ?? ''),
      stripe_subscription_id: session.subscription ? String(session.subscription) : null,
    })
    .eq('business_id', businessId)
}

async function onSubscriptionUpdated(subscription: Record<string, unknown>): Promise<void> {
  const businessId = (subscription.metadata as { business_id?: string } | undefined)?.business_id
  if (!businessId) return

  const items = (subscription.items as { data?: { price?: { id?: string } }[] } | undefined)?.data
  const priceId = items?.[0]?.price?.id
  const plan = planForPriceId(priceId)
  const periodEnd = subscription.current_period_end
    ? new Date(Number(subscription.current_period_end) * 1000).toISOString()
    : null

  await admin
    .from('subscriptions')
    .update({
      status: mapStripeStatus(String(subscription.status ?? '')),
      current_period_end: periodEnd,
      stripe_subscription_id: String(subscription.id ?? ''),
      ...(plan ? { plan } : {}),
    })
    .eq('business_id', businessId)
}

async function onSubscriptionDeleted(subscription: Record<string, unknown>): Promise<void> {
  const businessId = (subscription.metadata as { business_id?: string } | undefined)?.business_id
  if (!businessId) return

  await admin.from('subscriptions').update({ status: 'cancelada' }).eq('business_id', businessId)
}
