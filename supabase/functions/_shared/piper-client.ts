/**
 * Cliente para el servidor Piper (texto a voz) autoalojado en el VPS —
 * https://github.com/Kamil-Krawiec/piper-tts-http-server, con una interfaz
 * compatible con la API de OpenAI (`/v1/audio/speech`). Gratis, sin límite
 * de caracteres, sin depender de ningún proveedor externo de pago.
 *
 * Sin PIPER_TTS_URL, `textToSpeech()` lanza — igual que el resto de clientes
 * opcionales del proyecto.
 */
const baseUrl = (Deno.env.get('PIPER_TTS_URL') ?? '').replace(/\/+$/, '')
// es_ES-davefx-medium: voz en español (España) confirmada real en el
// repositorio rhasspy/piper-voices — un negocio que quiera otra voz puede
// fijar PIPER_VOICE sin tocar código.
const DEFAULT_VOICE = Deno.env.get('PIPER_VOICE') || 'es_ES-davefx-medium'

export const isPiperConfigured = Boolean(baseUrl)

export async function textToSpeech(text: string, voice: string = DEFAULT_VOICE): Promise<Uint8Array> {
  if (!baseUrl) throw new Error('Piper no está configurado (falta PIPER_TTS_URL)')

  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'piper',
      voice,
      input: text,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Piper text-to-speech falló (${response.status}): ${body}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}
