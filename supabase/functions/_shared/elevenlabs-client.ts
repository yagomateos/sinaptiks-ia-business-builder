/**
 * Cliente mínimo de ElevenLabs (texto a voz). Solo se usa desde Edge
 * Functions: la clave vive en los secretos de Supabase y nunca sale de aquí.
 *
 * Sin ELEVENLABS_API_KEY, `textToSpeech()` lanza — quien lo llama decide si
 * eso bloquea la respuesta o solo se queda sin nota de voz (ver
 * telegram-webhook/index.ts: el texto ya se mandó, la voz es un extra que
 * nunca debe tirar abajo la respuesta real al cliente).
 */
const apiKey = Deno.env.get('ELEVENLABS_API_KEY') ?? ''
// Voz premade en español ("Rachel" — multilingüe) por defecto; un negocio
// que quiera otra voz puede fijar ELEVENLABS_VOICE_ID sin tocar código.
const DEFAULT_VOICE_ID = Deno.env.get('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM'

export const isElevenLabsConfigured = Boolean(apiKey)

export async function textToSpeech(text: string, voiceId: string = DEFAULT_VOICE_ID): Promise<Uint8Array> {
  if (!apiKey) throw new Error('ElevenLabs no está configurado (falta ELEVENLABS_API_KEY)')

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`ElevenLabs text-to-speech falló (${response.status}): ${body}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}
