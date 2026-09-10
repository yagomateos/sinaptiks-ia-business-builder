/**
 * Cliente mínimo de la API de Anthropic. Solo se usa desde Edge Functions: la
 * clave vive en los secretos de Supabase y nunca sale de aquí.
 *
 * Si falta la clave, `complete()` lanza un 503 — el mismo mecanismo que ya
 * usa el cliente n8n. El proveedor remoto del frontend (`remote.provider.ts`)
 * ya captura cualquier fallo y cae al motor de reglas, así que desplegar esta
 * función sin la clave configurada no cambia nada para el usuario: cuando se
 * añada la clave, la IA real se activa sola, sin volver a desplegar.
 */
import { HttpError } from './auth.ts'

const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = 'claude-opus-5'

export const isAnthropicConfigured = Boolean(apiKey)

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: unknown
}

export interface ClaudeTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ClaudeToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export type ClaudeContentBlock = { type: 'text'; text: string } | ClaudeToolUseBlock

interface CompleteInput {
  system: string
  messages: ClaudeMessage[]
  maxTokens?: number
  /** Tareas cortas y de chat rinden bien en 'low'; escribir análisis, en 'medium'. */
  effort?: 'low' | 'medium' | 'high'
  tools?: ClaudeTool[]
}

interface ClaudeRawResponse {
  content: ClaudeContentBlock[]
  stop_reason: string
}

async function sendRaw(input: CompleteInput): Promise<ClaudeRawResponse> {
  if (!apiKey) throw new HttpError(503, 'La IA todavía no está configurada')
  if (input.messages.length === 0) throw new HttpError(400, 'Nada que responder')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: input.maxTokens ?? 1200,
      system: input.system,
      messages: input.messages,
      output_config: { effort: input.effort ?? 'medium' },
      ...(input.tools ? { tools: input.tools } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`Anthropic respondió ${response.status}`, body)
    throw new HttpError(502, 'El modelo de IA no ha podido responder')
  }

  return await response.json()
}

export async function complete(input: CompleteInput): Promise<string> {
  const data = await sendRaw(input)
  const block = data.content.find((b): b is { type: 'text'; text: string } => b.type === 'text')
  const text = block?.text?.trim()

  if (!text) throw new HttpError(502, 'El modelo de IA ha devuelto una respuesta vacía')
  return text
}

/**
 * Variante con herramientas — para cuando el texto no basta y hace falta que
 * el modelo dispare una acción real (p. ej. avisar al equipo de una
 * solicitud de cita) además de contestar. Se expone aparte de `complete()`
 * para no cambiarle el tipo de retorno a quien ya lo usa esperando un string.
 */
export async function completeWithTools(
  input: CompleteInput & { tools: ClaudeTool[] },
): Promise<ClaudeRawResponse> {
  return sendRaw(input)
}

export function userPrompt(system: string, prompt: string, opts?: Omit<CompleteInput, 'system' | 'messages'>) {
  return complete({ system, messages: [{ role: 'user', content: prompt }], ...opts })
}

/**
 * Pide texto y lo interpreta como JSON.
 *
 * No se usan las salidas estructuradas nativas de la API: basta con pedirle a
 * Claude que responda solo JSON y validar el resultado. Si algún día conviene
 * garantizar el esquema en el servidor, esto es lo primero que migraría a
 * `output_config.format`.
 */
export async function completeJson<T>(
  system: string,
  prompt: string,
  opts?: Omit<CompleteInput, 'system' | 'messages'>,
): Promise<T> {
  const text = await userPrompt(system, prompt, opts)
  const cleaned = text
    .replace(/^```(json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned) as T
  } catch (error) {
    console.error('JSON de la IA no se pudo interpretar', text, error)
    throw new HttpError(502, 'El modelo de IA ha devuelto una respuesta no válida')
  }
}
