/**
 * Edge Function `ai` — el puente hacia Claude.
 *
 * El frontend nunca habla con Anthropic directamente: la clave vive aquí. Esta
 * función implementa el mismo contrato que `AiService` en
 * `src/services/ai/types.ts`, así que el cliente no distingue si respondió un
 * modelo real o el motor de reglas — ambos caen en la misma forma.
 *
 * `generate-agent` no está implementado a propósito: producir el JSON con
 * exactamente los campos que requiere un agente completo es una tarea que el
 * motor de reglas ya resuelve bien y de forma determinista; forzarlo por un
 * modelo solo añade una superficie de fallo sin una ganancia clara. Pedir esa
 * ruta cae automáticamente al motor de reglas en el cliente.
 */
import {
  assertBusinessAccess,
  authenticate,
  CORS_HEADERS,
  errorResponse,
  HttpError,
  json,
  type AuthContext,
} from '../_shared/auth.ts'
import { complete, completeJson, userPrompt, type ClaudeMessage } from '../_shared/anthropic-client.ts'
import { AGENT_TYPE_INFO, describeBusiness } from '../_shared/business-context.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

    const ctx = await authenticate(request)
    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const start = segments.indexOf('ai')
    const operation = start >= 0 ? segments[start + 1] : undefined

    const body = await request.json()

    switch (operation) {
      case 'analyze-business':
        return json(await analyzeBusiness(ctx, body))
      case 'business-strategy':
        return json(await businessStrategy(ctx, body))
      case 'generate-prompt':
        return json(await generatePrompt(ctx, body))
      case 'classify-lead':
        return json(await classifyLead(ctx, body))
      case 'summarize-conversation':
        return json(await summarizeConversation(ctx, body))
      case 'generate-reply':
        return json(await generateReply(ctx, body))
      default:
        throw new HttpError(404, 'Esa operación no está disponible todavía')
    }
  } catch (error) {
    return errorResponse(error)
  }
})

/* ------------------------------------------------------------------ */
/* Autorización compartida                                             */
/* ------------------------------------------------------------------ */

interface ProfilePayload {
  business_id: string
  business_name: string
  industry: string
  description: string | null
  location: string | null
  ideal_customer: string | null
  value_proposition: string | null
  brand_voice: string
  goals: string[]
  policies: string | null
}

interface ServicePayload {
  name: string
  description: string | null
  price: number | null
  currency: string
  duration_minutes: number | null
}

/**
 * El perfil llega completo desde el cliente, no se relee de la base de datos.
 * Sin esta comprobación, cualquier persona con sesión —sin ser miembro de ese
 * negocio— podría fabricar un `business_id` ajeno y usar la cuota de IA a
 * cuenta de otro. `assertBusinessAccess` consulta con el cliente sujeto a
 * RLS: si no pertenece, no ve la fila y la comprobación falla sola.
 */
async function requireProfile(
  ctx: AuthContext,
  body: unknown,
): Promise<{ profile: ProfilePayload; services: ServicePayload[] }> {
  const { profile, services } = (body ?? {}) as {
    profile?: ProfilePayload
    services?: ServicePayload[]
  }

  if (!profile?.business_id) throw new HttpError(400, 'Falta el perfil del negocio')
  await assertBusinessAccess(ctx, profile.business_id)

  return { profile, services: services ?? [] }
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

async function analyzeBusiness(ctx: AuthContext, body: unknown) {
  const { profile, services } = await requireProfile(ctx, body)

  return completeJson(
    `Eres un consultor de negocio digital que habla en español, claro y sin tecnicismos.
Analizas negocios reales para decirles qué están haciendo bien y dónde tienen margen de mejora.

Responde ÚNICAMENTE con un JSON válido, sin explicaciones antes ni después, con esta forma exacta:
{"summary": string, "strengths": string[], "opportunities": string[], "priorities": string[]}

- summary: un párrafo natural sobre el negocio y su situación.
- strengths: de 1 a 4 puntos fuertes concretos, basados en los datos que te doy.
- opportunities: de 1 a 4 mejoras concretas y accionables, no genéricas.
- priorities: de 2 a 4 acciones muy breves, ordenadas por impacto (nombres de automatizaciones o pasos, no frases largas).`,
    describeBusiness(profile, services),
    { effort: 'medium', maxTokens: 1200 },
  )
}

async function businessStrategy(ctx: AuthContext, body: unknown) {
  const { profile, services } = await requireProfile(ctx, body)

  return completeJson(
    `Eres un estratega de negocio digital que habla en español, claro y sin tecnicismos.
Diseñas un plan de 90 días para que un negocio automatice la captación y atención de clientes.

Responde ÚNICAMENTE con un JSON válido, sin explicaciones antes ni después, con esta forma exacta:
{
  "headline": string,
  "focus": string,
  "quickWins": string[],
  "ninetyDayPlan": [{"phase": string, "goal": string, "actions": string[]}]
}

- headline: una frase que resuma la oportunidad del negocio.
- focus: en qué debería concentrarse primero, una frase.
- quickWins: de 2 a 4 victorias rápidas y concretas.
- ninetyDayPlan: exactamente 3 fases (semanas 1-4, 5-8, 9-12 o similar), cada una con 2-3 acciones concretas.`,
    describeBusiness(profile, services),
    { effort: 'medium', maxTokens: 1400 },
  )
}

async function generatePrompt(ctx: AuthContext, body: unknown) {
  const { profile, services } = await requireProfile(ctx, body)
  const agentType = String((body as { agentType?: string })?.agentType ?? '')
  const info = AGENT_TYPE_INFO[agentType]

  if (!info) throw new HttpError(400, 'Tipo de agente desconocido')

  const text = await userPrompt(
    `Eres un experto escribiendo instrucciones (system prompts) para agentes de IA que atienden
clientes en nombre de negocios reales, por WhatsApp, web u otros canales de mensajería.

Te doy la información de un negocio y el papel que debe cumplir el agente. Escribe las
instrucciones completas que seguirá, en español, organizadas en secciones con encabezados en
mayúsculas: IDENTIDAD, OBJETIVO, PERSONALIDAD, REGLAS, INFORMACIÓN DEL NEGOCIO, SERVICIOS Y
PRECIOS (si hay), ACCIONES PERMITIDAS, CUÁNDO PASAR A UNA PERSONA, LÍMITES.

No inventes precios, horarios, garantías ni ningún dato que no te haya dado. Si falta un dato,
la instrucción debe decir explícitamente que el agente no debe inventarlo. No uses jerga técnica
ni menciones que eres un modelo de lenguaje. Responde solo con el texto de las instrucciones,
sin comentarios tuyos antes o después, sin encerrarlo en comillas ni en un bloque de código.`,
    `Tipo de agente: ${info.label}\nObjetivo del papel: ${info.objective}\n\n${describeBusiness(profile, services)}`,
    { effort: 'medium', maxTokens: 1800 },
  )

  return text
}

async function classifyLead(ctx: AuthContext, body: unknown) {
  const { profile, services } = await requireProfile(ctx, body)
  const text = String((body as { text?: string })?.text ?? '')
  if (!text.trim()) throw new HttpError(400, 'Falta el texto a clasificar')

  return completeJson(
    `Clasificas mensajes de clientes potenciales para un negocio, en español.

Responde ÚNICAMENTE con un JSON válido, sin explicaciones antes ni después, con esta forma exacta:
{"temperature": "frio"|"templado"|"caliente", "intent": string, "confidence": number, "reasoning": string}

- temperature: qué tan cerca está de comprar o reservar.
- intent: una frase corta describiendo lo que quiere.
- confidence: número entre 0 y 1.
- reasoning: una frase explicando por qué, en términos que entendería el dueño del negocio.`,
    `${describeBusiness(profile, services)}\n\nMensaje del cliente: "${text}"`,
    { effort: 'low', maxTokens: 400 },
  )
}

async function summarizeConversation(ctx: AuthContext, body: unknown) {
  const { profile, services } = await requireProfile(ctx, body)
  const messages = ((body as { messages?: { role: string; content: string }[] })?.messages ?? [])

  if (messages.length === 0) {
    return { summary: 'Todavía no hay mensajes.', nextAction: null, sentiment: 'neutro' as const }
  }

  const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n')

  return completeJson(
    `Resumes conversaciones entre un cliente y un negocio, en español, para que el dueño la
entienda de un vistazo sin leerla entera.

Responde ÚNICAMENTE con un JSON válido, sin explicaciones antes ni después, con esta forma exacta:
{"summary": string, "nextAction": string|null, "sentiment": "positivo"|"neutro"|"negativo"}

- summary: 1-2 frases con lo esencial de la conversación.
- nextAction: qué debería hacer el negocio ahora, o null si no hace falta nada.
- sentiment: cómo suena el cliente.`,
    `${describeBusiness(profile, services)}\n\nConversación:\n${transcript}`,
    { effort: 'low', maxTokens: 400 },
  )
}

async function generateReply(ctx: AuthContext, body: unknown) {
  const { agentId, systemPrompt, history, incomingMessage } = body as {
    agentId?: string
    systemPrompt?: string
    history?: { role: string; content: string }[]
    incomingMessage?: string
  }

  if (!agentId || !systemPrompt) throw new HttpError(400, 'Faltan datos del agente')

  // El agente vive tras RLS: si el usuario no es miembro de ese negocio, esta
  // consulta no devuelve ninguna fila y el acceso queda cerrado sin más lógica.
  const { data: agent, error } = await ctx.db
    .from('ai_agents')
    .select('id')
    .eq('id', agentId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'No se pudo comprobar el acceso')
  if (!agent) throw new HttpError(404, 'Ese agente no existe')

  const messages = toClaudeMessages(history ?? [])

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: String(incomingMessage ?? '') })
  }

  return complete({ system: systemPrompt, messages, effort: 'low', maxTokens: 700 })
}

function toClaudeMessages(history: { role: string; content: string }[]): ClaudeMessage[] {
  return history
    .filter((m) => m.role !== 'sistema')
    .map((m) => ({
      role: m.role === 'contacto' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }))
}
