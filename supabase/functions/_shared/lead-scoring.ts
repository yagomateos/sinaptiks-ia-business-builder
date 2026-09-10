/**
 * Puntuación de potencial de un contacto a partir de su conversación.
 *
 * Copia deliberada de `src/domain/engine/lead-scoring.ts` — mismo motor, misma
 * puntuación — para que las conversaciones reales (Telegram, n8n) se valoren
 * igual que el simulador. Se duplica en vez de importar desde `src/domain`
 * siguiendo la misma convención que `business-context.ts`: las funciones de
 * Supabase se despliegan solas y no comparten árbol de módulos con el
 * frontend, así que lo pequeño y puro se copia a propósito.
 */

export type ContactChannel =
  | 'telegram'
  | 'whatsapp'
  | 'web'
  | 'instagram'
  | 'facebook'
  | 'email'
  | 'telefono'
  | 'google_business'

export type LeadTemperature = 'frio' | 'templado' | 'caliente'
export type MessageRole = 'contacto' | 'agente_ia' | 'humano' | 'sistema'
export type PotentialLabel = 'descartado' | 'frio' | 'templado' | 'caliente' | 'muy_caliente'

export interface ScoredMessage {
  role: MessageRole
  content: string
  created_at: string
}

export interface ScoringInput {
  messages: ScoredMessage[]
  channel: string
  callDurationSeconds?: number
  sharedContactDetails?: boolean
}

export interface ScoreReason {
  label: string
  points: number
}

export interface ScoringSignals {
  contactMessages: number
  totalMessages: number
  averageMessageLength: number
  conversationMinutes: number
  detectedIntents: BuyingIntent[]
  channel: string
  sharedContactDetails: boolean
}

export interface LeadScore {
  score: number
  label: PotentialLabel
  temperature: LeadTemperature
  isPotential: boolean
  reasons: ScoreReason[]
  signals: ScoringSignals
}

export const BUYING_INTENTS = [
  'precio',
  'reserva',
  'disponibilidad',
  'urgencia',
  'comparacion',
  'objecion_precio',
  'solo_mirando',
  'descarte',
] as const
export type BuyingIntent = (typeof BUYING_INTENTS)[number]

interface IntentRule {
  intent: BuyingIntent
  patterns: string[]
  points: number
  label: string
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'reserva',
    patterns: [
      'quiero reservar', 'pedir cita', 'coger cita', 'reservar mesa', 'agendar',
      'cuando podeis', 'cuándo podéis', 'hay hueco', 'teneis hueco', 'tenéis hueco',
      'me lo quedo', 'quiero contratar', 'como lo contrato', 'cómo lo contrato',
    ],
    points: 30,
    label: 'Pidió cita o quiso contratar',
  },
  {
    intent: 'precio',
    patterns: [
      'cuanto cuesta', 'cuánto cuesta', 'que precio', 'qué precio', 'precio',
      'cuanto vale', 'cuánto vale', 'tarifa', 'presupuesto', 'cuanto seria',
      'cuánto sería', 'financiacion', 'financiación', 'a plazos',
    ],
    points: 20,
    label: 'Preguntó por el precio',
  },
  {
    intent: 'disponibilidad',
    patterns: [
      'esta semana', 'mañana', 'manana', 'hoy', 'el lunes', 'el martes',
      'el miercoles', 'el miércoles', 'el jueves', 'el viernes', 'el sabado',
      'el sábado', 'que horario', 'qué horario', 'a que hora', 'a qué hora',
      'abris', 'abrís', 'disponible',
    ],
    points: 12,
    label: 'Preguntó por fechas u horarios',
  },
  {
    intent: 'urgencia',
    patterns: [
      'urgente', 'cuanto antes', 'cuánto antes', 'lo antes posible', 'ya mismo',
      'me corre prisa', 'necesito ya', 'de urgencia', 'me duele',
    ],
    points: 18,
    label: 'Mostró urgencia',
  },
  {
    intent: 'comparacion',
    patterns: [
      'diferencia entre', 'cual me recomiendas', 'cuál me recomiendas',
      'que incluye', 'qué incluye', 'garantia', 'garantía', 'cuanto dura',
      'cuánto dura', 'como funciona', 'cómo funciona',
    ],
    points: 10,
    label: 'Comparó opciones o pidió detalles',
  },
  {
    intent: 'objecion_precio',
    patterns: ['es caro', 'muy caro', 'demasiado caro', 'no me lo puedo permitir', 'mas barato', 'más barato'],
    points: -5,
    label: 'Le pareció caro',
  },
  {
    intent: 'solo_mirando',
    patterns: [
      'solo queria saber', 'sólo quería saber', 'solo información', 'solo informacion',
      'por curiosidad', 'estoy mirando', 'me lo pienso', 'mas adelante',
      'más adelante', 'ya te dire', 'ya te diré', 'de momento no',
    ],
    points: -18,
    label: 'Dijo que solo estaba mirando',
  },
  {
    intent: 'descarte',
    patterns: [
      'no me interesa', 'no gracias', 'no quiero', 'dejad de escribir',
      'no volvais', 'no volváis', 'darme de baja', 'me equivoque', 'me equivoqué',
    ],
    points: -45,
    label: 'Dijo que no le interesa',
  },
]

const CHANNEL_EFFORT: Record<string, { points: number; label: string }> = {
  telefono: { points: 15, label: 'Se molestó en llamar' },
  whatsapp: { points: 8, label: 'Escribió por WhatsApp' },
  telegram: { points: 8, label: 'Escribió por Telegram' },
  email: { points: 6, label: 'Escribió un email' },
  web: { points: 4, label: 'Contactó desde la web' },
  google_business: { points: 4, label: 'Llegó desde Google' },
  instagram: { points: 2, label: 'Escribió por Instagram' },
  facebook: { points: 2, label: 'Escribió por Facebook' },
}

const BASE_SCORE = 20

export function scoreLead(input: ScoringInput): LeadScore {
  const signals = extractSignals(input)
  const reasons: ScoreReason[] = []
  let score = BASE_SCORE

  for (const rule of INTENT_RULES) {
    if (signals.detectedIntents.includes(rule.intent)) {
      score += rule.points
      reasons.push({ label: rule.label, points: rule.points })
    }
  }

  const engagement = scoreEngagement(signals)
  score += engagement.points
  if (engagement.points !== 0) reasons.push(engagement)

  const effort = CHANNEL_EFFORT[input.channel]
  if (effort) {
    score += effort.points
    reasons.push({ label: effort.label, points: effort.points })
  }

  if (signals.sharedContactDetails) {
    score += 12
    reasons.push({ label: 'Dejó sus datos de contacto', points: 12 })
  }

  if (signals.contactMessages <= 1 && !signals.sharedContactDetails) {
    score -= 10
    reasons.push({ label: 'Apenas hubo conversación', points: -10 })
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)))
  const label = toLabel(bounded, signals)

  return {
    score: bounded,
    label,
    temperature: toTemperature(label),
    isPotential: label !== 'descartado' && label !== 'frio',
    reasons: reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    signals,
  }
}

function extractSignals(input: ScoringInput): ScoringSignals {
  const contactMessages = input.messages.filter((m) => m.role === 'contacto')
  const text = contactMessages.map((m) => normalize(m.content)).join(' ')

  const detectedIntents = INTENT_RULES.filter((rule) =>
    rule.patterns.some((p) => text.includes(normalize(p))),
  ).map((rule) => rule.intent)

  const averageMessageLength =
    contactMessages.length > 0
      ? Math.round(
          contactMessages.reduce((total, m) => total + m.content.trim().length, 0) /
            contactMessages.length,
        )
      : 0

  return {
    contactMessages: contactMessages.length,
    totalMessages: input.messages.length,
    averageMessageLength,
    conversationMinutes: computeMinutes(input),
    detectedIntents,
    channel: input.channel,
    sharedContactDetails: input.sharedContactDetails ?? detectContactDetails(text),
  }
}

function computeMinutes(input: ScoringInput): number {
  if (input.callDurationSeconds !== undefined) {
    return Math.round((input.callDurationSeconds / 60) * 10) / 10
  }

  if (input.messages.length < 2) return 0

  const times = input.messages
    .map((m) => new Date(m.created_at).getTime())
    .filter((t) => !Number.isNaN(t))

  if (times.length < 2) return 0

  const span = (Math.max(...times) - Math.min(...times)) / 60000
  return Math.round(Math.min(span, 60) * 10) / 10
}

function scoreEngagement(signals: ScoringSignals): ScoreReason {
  if (signals.contactMessages >= 6) {
    return { label: 'Conversación larga y sostenida', points: 20 }
  }
  if (signals.contactMessages >= 4) {
    return { label: 'Mantuvo la conversación', points: 14 }
  }
  if (signals.contactMessages >= 2) {
    return signals.averageMessageLength >= 60
      ? { label: 'Explicó su caso con detalle', points: 10 }
      : { label: 'Respondió un par de veces', points: 5 }
  }

  return { label: '', points: 0 }
}

function detectContactDetails(text: string): boolean {
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)
  const hasPhone = /(\+?\d[\d\s.-]{7,}\d)/.test(text)
  return hasEmail || hasPhone
}

function toLabel(score: number, signals: ScoringSignals): PotentialLabel {
  if (signals.detectedIntents.includes('descarte')) return 'descartado'

  if (score >= 75) return 'muy_caliente'
  if (score >= 55) return 'caliente'
  if (score >= 35) return 'templado'
  return 'frio'
}

function toTemperature(label: PotentialLabel): LeadTemperature {
  if (label === 'muy_caliente' || label === 'caliente') return 'caliente'
  if (label === 'templado') return 'templado'
  return 'frio'
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
