/**
 * Cliente mínimo de Chat Completions de OpenAI. Mismo contrato que
 * `complete()` de anthropic-client.ts para que `ai/index.ts` pueda elegir uno
 * u otro según el `provider` guardado en el propio agente, sin que el resto
 * del código note la diferencia.
 *
 * Si falta la clave, lanza un 503 — igual que Anthropic. El proveedor remoto
 * del frontend ya captura cualquier fallo y cae al motor de reglas.
 */
import { HttpError } from './auth.ts'

const apiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
const DEFAULT_MODEL = 'gpt-4.1'

export const isOpenAiConfigured = Boolean(apiKey)

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface CompleteInput {
  system: string
  messages: ChatMessage[]
  model?: string
  maxTokens?: number
}

export async function complete(input: CompleteInput): Promise<string> {
  if (!apiKey) throw new HttpError(503, 'La IA todavía no está configurada')
  if (input.messages.length === 0) throw new HttpError(400, 'Nada que responder')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model || DEFAULT_MODEL,
      // `max_tokens` está obsoleto en Chat Completions para los modelos
      // recientes (gpt-4.1 en adelante) y da error en vez de aplicarse —
      // hay que mandar `max_completion_tokens`.
      max_completion_tokens: input.maxTokens ?? 1200,
      messages: [{ role: 'system', content: input.system }, ...input.messages],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`OpenAI respondió ${response.status}`, body)
    throw new HttpError(502, 'El modelo de IA no ha podido responder')
  }

  const data = (await response.json()) as {
    choices: { message: { content: string | null } }[]
  }
  const text = data.choices[0]?.message.content?.trim()

  if (!text) throw new HttpError(502, 'El modelo de IA ha devuelto una respuesta vacía')
  return text
}

/**
 * Whisper (voz a texto). Mismo OPENAI_API_KEY que Chat Completions —
 * es la misma cuenta de OpenAI, otro endpoint. Se usa para transcribir
 * notas de voz que el cliente manda por Telegram, antes de pasarlas al
 * agente como si fueran texto escrito.
 */
export async function transcribeAudio(audio: Uint8Array, filename = 'audio.ogg'): Promise<string> {
  if (!apiKey) throw new HttpError(503, 'La transcripción todavía no está configurada')

  const form = new FormData()
  form.append('file', new Blob([audio.slice()]), filename)
  form.append('model', 'whisper-1')
  form.append('language', 'es')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`OpenAI transcriptions respondió ${response.status}`, body)
    throw new HttpError(502, 'No se pudo transcribir el audio')
  }

  const data = (await response.json()) as { text?: string }
  const text = data.text?.trim()

  if (!text) throw new HttpError(502, 'La transcripción ha devuelto una respuesta vacía')
  return text
}
