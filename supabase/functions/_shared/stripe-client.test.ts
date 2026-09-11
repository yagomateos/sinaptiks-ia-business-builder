/**
 * `verifyStripeSignature` es la única barrera entre `stripe-webhook` y
 * cualquiera que sepa la URL del webhook — protege el estado real de
 * facturación de cada negocio (plan, `subscription_status`).
 *
 * `STRIPE_WEBHOOK_SECRET` se lee de `Deno.env` al cargar el módulo (no por
 * parámetro, a diferencia de `verifyWhatsAppSignature`), así que hay que
 * fijarlo ANTES del import — de ahí el orden de este archivo.
 *
 * Ejecutar: deno test --allow-env supabase/functions/_shared/stripe-client.test.ts
 */
const TEST_SECRET = 'whsec_test_secret'
Deno.env.set('STRIPE_WEBHOOK_SECRET', TEST_SECRET)

const { verifyStripeSignature, mapStripeStatus } = await import('./stripe-client.ts')

import { assertEquals } from 'jsr:@std/assert@1'

async function signatureHeader(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  const hex = Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestamp},v1=${hex}`
}

Deno.test('verifyStripeSignature: acepta una firma válida', async () => {
  const body = '{"type":"checkout.session.completed"}'
  const header = await signatureHeader(TEST_SECRET, '1700000000', body)

  assertEquals(await verifyStripeSignature(body, header), true)
})

Deno.test('verifyStripeSignature: rechaza una firma calculada con otro secreto', async () => {
  const body = '{"type":"checkout.session.completed"}'
  const header = await signatureHeader('whsec_otro_secreto', '1700000000', body)

  assertEquals(await verifyStripeSignature(body, header), false)
})

Deno.test('verifyStripeSignature: rechaza si el cuerpo cambió después de firmarlo', async () => {
  const header = await signatureHeader(TEST_SECRET, '1700000000', '{"type":"a"}')

  assertEquals(await verifyStripeSignature('{"type":"b"}', header), false)
})

Deno.test('verifyStripeSignature: rechaza sin cabecera de firma', async () => {
  assertEquals(await verifyStripeSignature('{}', null), false)
})

Deno.test('verifyStripeSignature: rechaza una cabecera sin t= o v1=', async () => {
  assertEquals(await verifyStripeSignature('{}', 'v1=solocontienelafirma'), false)
})

Deno.test('mapStripeStatus: traduce los estados reales de Stripe al dominio en español', () => {
  assertEquals(mapStripeStatus('trialing'), 'trial')
  assertEquals(mapStripeStatus('active'), 'activa')
  assertEquals(mapStripeStatus('past_due'), 'morosa')
  assertEquals(mapStripeStatus('unpaid'), 'morosa')
  assertEquals(mapStripeStatus('incomplete'), 'morosa')
  assertEquals(mapStripeStatus('canceled'), 'cancelada')
  assertEquals(mapStripeStatus('incomplete_expired'), 'cancelada')
})

Deno.test('mapStripeStatus: un estado desconocido de Stripe cae a "morosa", no a un estado activo', () => {
  assertEquals(mapStripeStatus('paused'), 'morosa')
})
