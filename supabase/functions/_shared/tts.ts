/**
 * Punto único de entrada para texto a voz — quien llama (telegram-webhook
 * hoy, lo que sea mañana) no sabe ni le importa si detrás hay Piper
 * (autoalojado, gratis) o ElevenLabs (de pago, mejor calidad). Piper tiene
 * prioridad porque es el que está activo ahora mismo; si el negocio paga
 * ElevenLabs más adelante, basta con configurar su clave — no hace falta
 * tocar ningún componente.
 */
import { isPiperConfigured, textToSpeech as piperTextToSpeech } from './piper-client.ts'
import { isElevenLabsConfigured, textToSpeech as elevenLabsTextToSpeech } from './elevenlabs-client.ts'

export const isTtsConfigured = isPiperConfigured || isElevenLabsConfigured

export async function textToSpeech(text: string): Promise<Uint8Array> {
  if (isPiperConfigured) return piperTextToSpeech(text)
  if (isElevenLabsConfigured) return elevenLabsTextToSpeech(text)
  throw new Error('Ningún proveedor de voz está configurado')
}
