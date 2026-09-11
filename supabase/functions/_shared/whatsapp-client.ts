/**
 * Cliente mínimo de WhatsApp Cloud API (Meta). Compartido entre
 * whatsapp-webhook (responder al mensaje real), n8n-callback (mandar desde
 * una automatización) y channels (validar credenciales al conectar) —
 * mismo reparto que ya tiene telegram-client.ts.
 *
 * A diferencia de Telegram, aquí no hay "webhook por negocio": todos los
 * negocios comparten la misma app de Meta y la misma URL de webhook: quien
 * identifica de qué negocio es un mensaje entrante es el `phone_number_id`
 * que trae el propio payload (ver whatsapp-webhook), no un secreto en la ruta.
 */
const GRAPH_API_VERSION = 'v21.0'

export async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`WhatsApp sendMessage falló (${response.status}): ${body}`)
  }
}

export interface WhatsAppPhoneInfo {
  displayPhoneNumber: string
  verifiedName: string
}

/**
 * Se llama al conectar, antes de guardar nada: mejor un error claro ahora
 * ("esas credenciales no son válidas") que uno silencioso más tarde cuando
 * llegue el primer mensaje y no haya forma de enviarlo — mismo principio que
 * `getMe` en el cliente de Telegram.
 */
export async function getWhatsAppPhoneInfo(
  accessToken: string,
  phoneNumberId: string,
): Promise<WhatsAppPhoneInfo | null> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!response.ok) return null

  const data = await response.json()
  return {
    displayPhoneNumber: String(data.display_phone_number ?? ''),
    verifiedName: String(data.verified_name ?? ''),
  }
}

/**
 * Verificación de firma del webhook (algoritmo documentado por Meta):
 * `X-Hub-Signature-256: sha256=<hex>` es el HMAC-SHA256 del secreto de la app
 * sobre el cuerpo crudo de la petición. Con Web Crypto, sin dependencias —
 * mismo patrón que `verifyStripeSignature` en stripe-client.ts.
 */
export async function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false

  const expected = signatureHeader.slice('sha256='.length)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const computed = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return computed === expected
}
