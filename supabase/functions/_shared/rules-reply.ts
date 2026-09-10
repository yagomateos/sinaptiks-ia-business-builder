/**
 * Respuesta determinista sin modelo de lenguaje — copia deliberada de
 * `src/services/ai/providers/rules.provider.ts`.generateReply, igual que
 * `lead-scoring.ts` (ver esa cabecera para la razón de duplicar en vez de
 * importar desde `src/`).
 *
 * Antes de esto, un negocio sin ANTHROPIC_API_KEY configurada se quedaba sin
 * respuesta por los canales reales — el simulador sí caía al motor de
 * reglas, pero Telegram y n8n solo dejaban un mensaje de "sistema" que nadie
 * en el otro extremo llegaba a ver. No hace falta pagar por Claude para que
 * un bot conteste algo razonable basado en lo que el negocio ya contó.
 */

export interface RulesReplyFaq {
  question: string
  answer: string
}

export interface RulesReplyService {
  name: string
  description: string | null
  price: number | null
  currency: string
  duration_minutes: number | null
  is_active: boolean
}

const NEGATIVE_SIGNALS = ['mal', 'fatal', 'queja', 'reclamación', 'enfadado', 'no funciona', 'error']

// Sin modelo de lenguaje, reconocer una intención es lo único que separa
// "pareces un contestador" de una respuesta que al menos apunta a lo que se
// preguntó. Mismo espíritu que las reglas de lead-scoring.ts, aplicado a qué
// contestar en vez de a cómo puntuar.
const PRICE_SIGNALS = [
  'cuanto cuesta', 'cuánto cuesta', 'que precio', 'qué precio', 'precio',
  'cuanto vale', 'cuánto vale', 'tarifa', 'presupuesto', 'cuanto seria',
  'cuánto sería',
]
const BOOKING_SIGNALS = [
  'quiero reservar', 'pedir cita', 'coger cita', 'necesito una cita', 'quiero una cita',
  'dar cita', 'pedir hora', 'quiero cita', 'agendar', 'quiero hueco', 'hay hueco',
  'teneis hueco', 'tenéis hueco',
]

export function generateRuleBasedReply(input: {
  incomingText: string
  businessName: string
  faq: RulesReplyFaq[]
  services: RulesReplyService[]
  escalationMessage: string
}): string {
  const normalized = input.incomingText.toLowerCase()
  const activeServices = input.services.filter((s) => s.is_active)

  const matchedFaq = input.faq.find(
    (f) => f.answer.trim() && overlaps(normalized, f.question.toLowerCase()),
  )
  if (matchedFaq) return matchedFaq.answer

  const matchedService = activeServices.find((s) => normalized.includes(s.name.toLowerCase()))
  if (matchedService) return describeService(matchedService)

  // Sin un servicio concreto mencionado, "cuánto cuesta" solo se puede
  // contestar con un listado — mejor eso que fingir que no se preguntó nada.
  if (PRICE_SIGNALS.some((s) => normalized.includes(s)) && activeServices.length > 0) {
    if (activeServices.length === 1) return describeService(activeServices[0])

    const priced = activeServices.filter((s) => s.price !== null).slice(0, 5)
    if (priced.length > 0) {
      const list = priced.map((s) => `${s.name}: ${s.price} ${s.currency}`).join(', ')
      return `Esto es lo que tenemos: ${list}. ¿Sobre cuál quieres que te cuente más?`
    }
  }

  if (BOOKING_SIGNALS.some((s) => normalized.includes(s))) {
    return 'Claro, dime qué día y a qué hora te viene bien y te lo confirmo en cuanto pueda.'
  }

  if (NEGATIVE_SIGNALS.some((s) => normalized.includes(s))) {
    return input.escalationMessage
  }

  return `Gracias por escribir a ${input.businessName}. Cuéntame un poco más sobre lo que necesitas y te ayudo enseguida.`
}

function describeService(service: RulesReplyService): string {
  const parts = [service.description ?? `Te cuento sobre ${service.name}.`]
  if (service.price !== null) {
    parts.push(`El precio es ${service.price} ${service.currency}.`)
  }
  if (service.duration_minutes) {
    parts.push(`Dura unos ${service.duration_minutes} minutos.`)
  }
  parts.push('¿Quieres que te reserve un hueco?')
  return parts.join(' ')
}

function overlaps(text: string, question: string): boolean {
  const words = question.split(/\s+/).filter((w) => w.length > 4)
  if (words.length === 0) return false
  const hits = words.filter((w) => text.includes(w)).length
  return hits / words.length >= 0.5
}
