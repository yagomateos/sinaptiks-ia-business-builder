/**
 * Puntuación de potencial de un contacto a partir de su conversación.
 *
 * Responde a una pregunta que el dueño del negocio se hace a diario: de toda la
 * gente que me escribió esta semana, ¿a quién llamo primero?
 *
 * Mide tres cosas distintas y las combina:
 *
 *   INTENCIÓN   qué dice — preguntar precio o pedir cita pesa mucho más que
 *               "solo estaba mirando"
 *   IMPLICACIÓN cuánto se involucra — número de mensajes, longitud, si vuelve
 *   ESFUERZO    qué le costó contactar — una llamada cuesta más que un clic
 *
 * Puro y determinista: mismos mensajes, misma puntuación. Sin React, sin I/O,
 * sin modelo de lenguaje. Un modelo puede afinar esto después, pero el negocio
 * no debería quedarse sin priorizar sus contactos porque falle una API.
 */
import type {
  ContactChannel,
  LeadTemperature,
  MessageRole,
  PotentialLabel,
} from '../types'

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

export interface ScoredMessage {
  role: MessageRole
  content: string
  created_at: string
}

export interface ScoringInput {
  messages: ScoredMessage[]
  channel: ContactChannel
  /** Solo en llamadas: duración real en segundos. */
  callDurationSeconds?: number
  /** Si el contacto dejó email o teléfono durante la conversación. */
  sharedContactDetails?: boolean
}

/* ------------------------------------------------------------------ */
/* Salida                                                              */
/* ------------------------------------------------------------------ */

export interface ScoreReason {
  /** Texto que se le enseña al usuario. Sin jerga. */
  label: string
  /** Cuánto sumó o restó. Negativo resta. */
  points: number
}

export interface LeadScore {
  /** 0–100. */
  score: number
  label: PotentialLabel
  /** Se mapea al campo `temperature` que ya usa el CRM. */
  temperature: LeadTemperature
  /** Atajo para filtrar: ¿merece seguimiento? */
  isPotential: boolean
  reasons: ScoreReason[]
  signals: ScoringSignals
}

export interface ScoringSignals {
  contactMessages: number
  totalMessages: number
  averageMessageLength: number
  conversationMinutes: number
  detectedIntents: BuyingIntent[]
  channel: ContactChannel
  sharedContactDetails: boolean
}

/* ------------------------------------------------------------------ */
/* Señales de intención                                                */
/* ------------------------------------------------------------------ */

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

/**
 * Orden importa poco porque se acumulan, pero los negativos existen para que
 * una conversación larga de alguien que solo curiosea no acabe en "caliente".
 */
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

/* ------------------------------------------------------------------ */
/* Peso del canal                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cuánto esfuerzo le costó al contacto llegar hasta aquí. Llamar por teléfono
 * revela más intención que rellenar un formulario.
 */
const CHANNEL_EFFORT: Record<ContactChannel, { points: number; label: string }> = {
  telefono: { points: 15, label: 'Se molestó en llamar' },
  whatsapp: { points: 8, label: 'Escribió por WhatsApp' },
  telegram: { points: 8, label: 'Escribió por Telegram' },
  email: { points: 6, label: 'Escribió un email' },
  web: { points: 4, label: 'Contactó desde la web' },
  google_business: { points: 4, label: 'Llegó desde Google' },
  instagram: { points: 2, label: 'Escribió por Instagram' },
  facebook: { points: 2, label: 'Escribió por Facebook' },
}

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

const BASE_SCORE = 20

export function scoreLead(input: ScoringInput): LeadScore {
  const signals = extractSignals(input)
  const reasons: ScoreReason[] = []
  let score = BASE_SCORE

  // Intención: lo que dice.
  for (const rule of INTENT_RULES) {
    if (signals.detectedIntents.includes(rule.intent)) {
      score += rule.points
      reasons.push({ label: rule.label, points: rule.points })
    }
  }

  // Implicación: cuánto se involucra.
  const engagement = scoreEngagement(signals)
  score += engagement.points
  if (engagement.points !== 0) reasons.push(engagement)

  // Esfuerzo: por dónde vino.
  const effort = CHANNEL_EFFORT[input.channel]
  if (effort) {
    score += effort.points
    reasons.push({ label: effort.label, points: effort.points })
  }

  // Dejar un teléfono o un email es un compromiso real.
  if (signals.sharedContactDetails) {
    score += 12
    reasons.push({ label: 'Dejó sus datos de contacto', points: 12 })
  }

  // Una conversación de un solo mensaje no da para juzgar a nadie.
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

/* ------------------------------------------------------------------ */

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

/**
 * En una llamada el tiempo lo da la duración. En un chat, el hueco entre el
 * primer y el último mensaje — que puede ser enorme si alguien contesta al día
 * siguiente, así que se recorta a una hora para no premiar el abandono.
 */
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
  // Ida y vuelta sostenida: la señal más honesta de interés real.
  if (signals.contactMessages >= 6) {
    return { label: 'Conversación larga y sostenida', points: 20 }
  }
  if (signals.contactMessages >= 4) {
    return { label: 'Mantuvo la conversación', points: 14 }
  }
  if (signals.contactMessages >= 2) {
    // Mensajes largos indican que se molestó en explicarse.
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
  // "Descartado" significa que la persona dijo que no, no que puntuó poco.
  // Es la diferencia entre dejar de escribirle y dejarle para el final: quien
  // solo escribió "hola" merece un intento más, no la papelera.
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

/** Sin acentos y en minúsculas, para que "cuánto" y "cuanto" coincidan. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
