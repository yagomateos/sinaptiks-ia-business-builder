/**
 * Cliente mínimo para un servidor Ollama autoalojado, accesible desde el
 * motor (no desde el navegador). Mismo contrato que `complete()` de
 * anthropic-client.ts para que `ai/index.ts` pueda elegirlo según el
 * `provider` guardado en el agente.
 *
 * Sin OLLAMA_BASE_URL configurada, lanza 503 — nunca se finge una respuesta.
 */
import { HttpError } from './auth.ts'

const baseUrl = (Deno.env.get('OLLAMA_BASE_URL') ?? '').replace(/\/$/, '')
const DEFAULT_MODEL = 'llama3.1'

export const isOllamaConfigured = Boolean(baseUrl)

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface CompleteInput {
  system: string
  messages: ChatMessage[]
  model?: string
}

export async function complete(input: CompleteInput): Promise<string> {
  if (!baseUrl) throw new HttpError(503, 'La IA todavía no está configurada')
  if (input.messages.length === 0) throw new HttpError(400, 'Nada que responder')

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: input.model || DEFAULT_MODEL,
      stream: false,
      messages: [{ role: 'system', content: input.system }, ...input.messages],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`Ollama respondió ${response.status}`, body)
    throw new HttpError(502, 'El modelo de IA no ha podido responder')
  }

  const data = (await response.json()) as { message?: { content?: string } }
  const text = data.message?.content?.trim()

  if (!text) throw new HttpError(502, 'El modelo de IA ha devuelto una respuesta vacía')
  return text
}
