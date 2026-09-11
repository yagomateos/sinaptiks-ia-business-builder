/**
 * `verifyWhatsAppSignature` es la única barrera entre `whatsapp-webhook` y
 * cualquiera que sepa la URL del webhook: sin este test, un cambio que la
 * rompa (silenciosa o accidentalmente) no lo detectaría nada hasta que
 * llegara un mensaje real de un negocio conectado.
 *
 * Ejecutar: deno test supabase/functions/_shared/whatsapp-client.test.ts
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { verifyWhatsAppSignature } from './whatsapp-client.ts'

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const hex = Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `sha256=${hex}`
}

Deno.test('verifyWhatsAppSignature: acepta una firma válida', async () => {
  const secret = 'app-secret-de-prueba'
  const body = '{"entry":[{"id":"123"}]}'
  const header = await sign(secret, body)

  assertEquals(await verifyWhatsAppSignature(body, header, secret), true)
})

Deno.test('verifyWhatsAppSignature: rechaza una firma calculada con otro secreto', async () => {
  const body = '{"entry":[{"id":"123"}]}'
  const header = await sign('secreto-incorrecto', body)

  assertEquals(await verifyWhatsAppSignature(body, header, 'app-secret-de-prueba'), false)
})

Deno.test('verifyWhatsAppSignature: rechaza si el cuerpo cambió después de firmarlo', async () => {
  const secret = 'app-secret-de-prueba'
  const header = await sign(secret, '{"entry":[{"id":"123"}]}')

  assertEquals(await verifyWhatsAppSignature('{"entry":[{"id":"999"}]}', header, secret), false)
})

Deno.test('verifyWhatsAppSignature: rechaza sin cabecera de firma', async () => {
  assertEquals(await verifyWhatsAppSignature('{}', null, 'app-secret-de-prueba'), false)
})

Deno.test('verifyWhatsAppSignature: rechaza una cabecera sin el prefijo sha256=', async () => {
  const secret = 'app-secret-de-prueba'
  const header = (await sign(secret, '{}')).replace('sha256=', '')

  assertEquals(await verifyWhatsAppSignature('{}', header, secret), false)
})

Deno.test('verifyWhatsAppSignature: rechaza si no hay app secret configurado', async () => {
  const header = await sign('cualquier-secreto', '{}')

  assertEquals(await verifyWhatsAppSignature('{}', header, ''), false)
})
