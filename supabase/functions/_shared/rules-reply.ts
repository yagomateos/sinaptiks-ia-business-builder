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

export function generateRuleBasedReply(input: {
  incomingText: string
  businessName: string
  faq: RulesReplyFaq[]
  services: RulesReplyService[]
  escalationMessage: string
}): string {
  const normalized = input.incomingText.toLowerCase()

  const matchedFaq = input.faq.find(
    (f) => f.answer.trim() && overlaps(normalized, f.question.toLowerCase()),
  )
  if (matchedFaq) return matchedFaq.answer

  const matchedService = input.services.find(
    (s) => s.is_active && normalized.includes(s.name.toLowerCase()),
  )
  if (matchedService) {
    const parts = [matchedService.description ?? `Te cuento sobre ${matchedService.name}.`]
    if (matchedService.price !== null) {
      parts.push(`El precio es ${matchedService.price} ${matchedService.currency}.`)
    }
    if (matchedService.duration_minutes) {
      parts.push(`Dura unos ${matchedService.duration_minutes} minutos.`)
    }
    parts.push('¿Quieres que te reserve un hueco?')
    return parts.join(' ')
  }

  if (NEGATIVE_SIGNALS.some((s) => normalized.includes(s))) {
    return input.escalationMessage
  }

  return `Gracias por escribir a ${input.businessName}. Cuéntame un poco más sobre lo que necesitas y te ayudo enseguida.`
}

function overlaps(text: string, question: string): boolean {
  const words = question.split(/\s+/).filter((w) => w.length > 4)
  if (words.length === 0) return false
  const hits = words.filter((w) => text.includes(w)).length
  return hits / words.length >= 0.5
}
