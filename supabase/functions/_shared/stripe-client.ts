/**
 * Cliente mínimo de la API de Stripe — REST directo, mismo estilo que
 * anthropic-client.ts/resend-client.ts/n8n-client.ts en este proyecto (nada
 * de SDKs, solo fetch). La clave secreta vive únicamente aquí, en Edge
 * Functions; el frontend nunca la ve.
 */
const SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

export const isStripeConfigured = Boolean(SECRET_KEY)
export const isStripeWebhookConfigured = Boolean(WEBHOOK_SECRET)

/** Los Price ID son propios de cada cuenta de Stripe — no existen hasta que se crean allí. */
const PRICE_IDS: Record<string, string> = {
  starter: Deno.env.get('STRIPE_PRICE_STARTER') ?? '',
  growth: Deno.env.get('STRIPE_PRICE_GROWTH') ?? '',
  scale: Deno.env.get('STRIPE_PRICE_SCALE') ?? '',
}

const PLAN_BY_PRICE_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PRICE_IDS)
    .filter(([, priceId]) => priceId)
    .map(([plan, priceId]) => [priceId, plan]),
)

export function priceIdForPlan(plan: string): string | null {
  return PRICE_IDS[plan] || null
}

export function planForPriceId(priceId: string | undefined): string | null {
  if (!priceId) return null
  return PLAN_BY_PRICE_ID[priceId] ?? null
}

async function stripeRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!SECRET_KEY) throw new Error('Stripe no está configurado (falta STRIPE_SECRET_KEY)')

  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })

  if (!response.ok) {
    throw new Error(`Stripe respondió ${response.status}: ${await response.text()}`)
  }

  return (await response.json()) as T
}

export async function createCustomer(email: string, businessId: string): Promise<{ id: string }> {
  return stripeRequest('customers', { email, 'metadata[business_id]': businessId })
}

export async function createCheckoutSession(params: {
  customerId: string
  priceId: string
  businessId: string
  successUrl: string
  cancelUrl: string
}): Promise<{ id: string; url: string }> {
  return stripeRequest('checkout/sessions', {
    customer: params.customerId,
    mode: 'subscription',
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': '1',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    'metadata[business_id]': params.businessId,
    'subscription_data[metadata][business_id]': params.businessId,
  })
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  return stripeRequest('billing_portal/sessions', { customer: customerId, return_url: returnUrl })
}

/**
 * Verificación de firma de webhook (algoritmo documentado por Stripe):
 * HMAC-SHA256(secreto, "{timestamp}.{cuerpo crudo}") debe coincidir con `v1`
 * de la cabecera `Stripe-Signature`. Con Web Crypto, sin dependencias.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => kv.split('=') as [string, string]),
  )
  const timestamp = parts.t
  const expected = parts.v1
  if (!timestamp || !expected) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  )
  const computed = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return computed === expected
}

/** Stripe usa sus propios nombres de estado; el dominio usa los suyos en español. */
export function mapStripeStatus(stripeStatus: string): 'trial' | 'activa' | 'morosa' | 'cancelada' {
  switch (stripeStatus) {
    case 'trialing':
      return 'trial'
    case 'active':
      return 'activa'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'morosa'
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelada'
    default:
      return 'morosa'
  }
}
