/**
 * Rule-based provider.
 *
 * The default. Deterministic, offline, no API key — the product is fully
 * usable on day one. When a model provider is configured it takes over, and
 * this stays as the fallback whenever a call fails.
 */
import { generateBusinessSystem } from '@/domain/engine/business-system-generator'
import { generateAgent } from '@/domain/engine/agent-generator'
import { recommend } from '@/domain/engine/recommendation-engine'
import { getIndustryTemplate } from '@/domain/catalog/industry-templates'
import { GOAL_LABELS, INDUSTRY_LABELS } from '@/domain/vocabulary'
import type { AgentType, Message } from '@/domain/types'
import type {
  AiContext,
  AiService,
  BusinessAnalysis,
  BusinessStrategy,
  ConversationSummary,
  GenerateReplyInput,
  LeadClassification,
} from '../types'

const HOT_SIGNALS = ['precio', 'cuánto cuesta', 'reservar', 'cita', 'comprar', 'disponible', 'hoy', 'mañana']
const COLD_SIGNALS = ['solo información', 'curiosidad', 'más adelante', 'estoy mirando', 'quizás']
const NEGATIVE_SIGNALS = ['mal', 'fatal', 'queja', 'reclamación', 'enfadado', 'no funciona', 'error']

// Sin modelo de lenguaje, reconocer una intención es lo único que separa
// "pareces un contestador" de una respuesta que al menos apunta a lo que se
// preguntó. Copiado en supabase/functions/_shared/rules-reply.ts para que
// Telegram y n8n respondan igual cuando no hay IA de pago activa.
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
const GREETING_SIGNALS = ['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'ey']
const AFFIRMATIVE_WORDS = new Set([
  'si', 'sí', 'vale', 'ok', 'okay', 'claro', 'de acuerdo', 'perfecto', 'genial', 'va bien',
])

export const rulesProvider: AiService = {
  providerKey: 'rules',
  isLive: false,

  async analyzeBusiness(context: AiContext): Promise<BusinessAnalysis> {
    const { profile, services } = context
    const template = getIndustryTemplate(profile.industry)
    const industryLabel = INDUSTRY_LABELS[profile.industry]

    const strengths: string[] = []
    const opportunities: string[] = []

    if (services.length > 0) {
      strengths.push(`Tienes ${services.length} ${services.length === 1 ? 'servicio definido' : 'servicios definidos'}, así que tus agentes pueden responder con precios reales.`)
    } else {
      opportunities.push('Añade tus servicios y precios para que los agentes puedan responder sin derivar cada consulta.')
    }

    if (profile.contact_channels.includes('telegram') || profile.contact_channels.includes('whatsapp')) {
      strengths.push('Usas mensajería instantánea, el canal donde la respuesta inmediata más convierte.')
    } else {
      opportunities.push('Activar Telegram suele ser la vía más rápida para captar y responder.')
    }

    if (profile.ideal_customer) {
      strengths.push('Tienes claro a quién te diriges, lo que hace que la cualificación sea mucho más precisa.')
    } else {
      opportunities.push('Definir tu cliente ideal permite filtrar mejor y perder menos tiempo.')
    }

    if (profile.faq.filter((f) => f.answer.trim()).length === 0) {
      opportunities.push('Responder las preguntas frecuentes una sola vez libera horas cada semana.')
    }

    const priorities = recommend({
      industry: profile.industry,
      goals: profile.goals,
      channels: profile.contact_channels,
      services: services.map((s) => ({ name: s.name, price: s.price })),
    })
      .automations.slice(0, 3)
      .map((a) => a.blueprint.name)

    return {
      summary: `${profile.business_name} es un negocio de ${industryLabel.toLowerCase()}${
        profile.location ? ` en ${profile.location}` : ''
      }. ${template.headline}. Con los objetivos que has marcado (${profile.goals
        .map((g) => GOAL_LABELS[g].toLowerCase())
        .join(', ')}), el mayor margen de mejora está en atender rápido y no dejar ningún contacto sin seguimiento.`,
      strengths,
      opportunities,
      priorities,
    }
  },

  async generateBusinessStrategy(context: AiContext): Promise<BusinessStrategy> {
    const { profile, services } = context
    const template = getIndustryTemplate(profile.industry)
    const recommendation = recommend({
      industry: profile.industry,
      goals: profile.goals,
      channels: profile.contact_channels,
      services: services.map((s) => ({ name: s.name, price: s.price })),
    })

    const [first, second, third] = recommendation.automations

    return {
      headline: template.headline,
      focus: `Atender cada contacto en menos de un minuto y llevarlo hasta ${
        profile.goals.includes('mas_reservas') ? 'la reserva' : 'la venta'
      } sin intervención manual.`,
      quickWins: recommendation.automations.slice(0, 3).map((a) => a.blueprint.name),
      ninetyDayPlan: [
        {
          phase: 'Primeras 2 semanas',
          goal: 'Que ningún mensaje quede sin respuesta',
          actions: [first, second].filter(Boolean).map((a) => `Activar "${a.blueprint.name}"`),
        },
        {
          phase: 'Semanas 3 a 6',
          goal: 'Convertir el interés en citas y ventas',
          actions: [
            third ? `Activar "${third.blueprint.name}"` : 'Revisar la cualificación de contactos',
            'Completar el conocimiento del negocio con precios y condiciones',
          ],
        },
        {
          phase: 'Semanas 7 a 12',
          goal: 'Recuperar oportunidades y crecer con lo que ya tienes',
          actions: [
            'Activar la recuperación de contactos antiguos',
            'Pedir reseñas de forma sistemática',
            'Revisar los resultados y ajustar los agentes',
          ],
        },
      ],
    }
  },

  async generateBusinessSystem(context: AiContext) {
    return generateBusinessSystem({ profile: context.profile, services: context.services })
  },

  async generateAgent(context: AiContext, agentType: AgentType) {
    return generateAgent(context, agentType)
  },

  async generatePrompt(context: AiContext, agentType: AgentType): Promise<string> {
    return generateAgent(context, agentType).systemPrompt
  },

  async classifyLead(_context: AiContext, text: string): Promise<LeadClassification> {
    const normalized = text.toLowerCase()

    const hot = HOT_SIGNALS.filter((s) => normalized.includes(s)).length
    const cold = COLD_SIGNALS.filter((s) => normalized.includes(s)).length

    if (hot > cold && hot > 0) {
      return {
        temperature: 'caliente',
        intent: 'Interés de compra o reserva inmediata',
        confidence: Math.min(0.5 + hot * 0.15, 0.95),
        reasoning: 'Menciona precio, disponibilidad o quiere avanzar ya.',
      }
    }

    if (cold > 0) {
      return {
        temperature: 'frio',
        intent: 'Consulta informativa',
        confidence: Math.min(0.5 + cold * 0.15, 0.9),
        reasoning: 'Está explorando opciones, sin urgencia.',
      }
    }

    return {
      temperature: 'templado',
      intent: 'Interés general',
      confidence: 0.5,
      reasoning: 'No hay señales claras de urgencia ni de simple curiosidad.',
    }
  },

  async summarizeConversation(
    _context: AiContext,
    messages: Message[],
  ): Promise<ConversationSummary> {
    if (messages.length === 0) {
      return { summary: 'Todavía no hay mensajes.', nextAction: null, sentiment: 'neutro' }
    }

    const contactMessages = messages.filter((m) => m.role === 'contacto')
    const lastContact = contactMessages[contactMessages.length - 1]
    const allText = contactMessages.map((m) => m.content.toLowerCase()).join(' ')
    const isNegative = NEGATIVE_SIGNALS.some((s) => allText.includes(s))

    const preview = lastContact?.content.slice(0, 160) ?? ''

    return {
      summary: `${contactMessages.length} ${
        contactMessages.length === 1 ? 'mensaje' : 'mensajes'
      } del contacto. Lo último que dijo: "${preview}${preview.length >= 160 ? '…' : ''}"`,
      nextAction: isNegative
        ? 'Responder personalmente cuanto antes'
        : messages[messages.length - 1]?.role === 'contacto'
          ? 'Responder al último mensaje'
          : 'Esperar respuesta del contacto',
      sentiment: isNegative ? 'negativo' : 'neutro',
    }
  },

  async generateReply(input: GenerateReplyInput): Promise<string> {
    const { agent, profile, services, history } = input
    const normalized = input.incomingMessage.toLowerCase().trim()
    const activeServices = services.filter((s) => s.is_active)
    const lastAgentMessage = [...history].reverse().find((m) => m.role === 'agente_ia')?.content

    const matchedFaq = profile.faq.find(
      (f) => f.answer.trim() && overlaps(normalized, f.question.toLowerCase()),
    )
    if (matchedFaq) return matchedFaq.answer

    const matchedService = activeServices.find((s) => matchesServiceName(normalized, s.name))
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

    // Un "sí" suelto solo significa algo si el propio bot acaba de ofrecer
    // reservar — sin esto, confirmar una oferta caía en el mismo genérico que
    // cualquier otra cosa que no encajara con nada.
    const offeredBooking = lastAgentMessage?.includes('reserve un hueco') ?? false
    if (offeredBooking && AFFIRMATIVE_WORDS.has(normalized)) {
      return 'Perfecto. Dime tu nombre y el día que prefieres, y en cuanto pueda te lo confirmo.'
    }

    if (NEGATIVE_SIGNALS.some((s) => normalized.includes(s))) {
      return agent.handoff_rules.escalation_message
    }

    // Un saludo suelto ("hola") se distingue aquí, después de todo lo
    // específico — así un mensaje real que además saluda ("hola, cuánto
    // cuesta...") sigue respondiendo a lo que se preguntó, no al saludo.
    if (GREETING_SIGNALS.some((s) => normalized === s || normalized.startsWith(`${s} `))) {
      return `¡Hola! Soy el asistente de ${profile.business_name}. ¿En qué te puedo ayudar?`
    }

    return `Gracias por escribir a ${profile.business_name}. Cuéntame un poco más sobre lo que necesitas y te ayudo enseguida.`
  },
}

/**
 * "Implante dental" solo coincidía si el mensaje decía las dos palabras
 * seguidas — nadie escribe así. Basta con que aparezca una palabra propia
 * del nombre del servicio (no un relleno tipo "de"/"para").
 */
function matchesServiceName(normalizedText: string, serviceName: string): boolean {
  const name = serviceName.toLowerCase()
  if (normalizedText.includes(name)) return true

  const words = name.split(/\s+/).filter((w) => w.length > 3)
  return words.some((w) => normalizedText.includes(w))
}

function describeService(service: GenerateReplyInput['services'][number]): string {
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

/** Loose keyword overlap — enough to match an FAQ without a model. */
function overlaps(text: string, question: string): boolean {
  const words = question.split(/\s+/).filter((w) => w.length > 4)
  if (words.length === 0) return false
  const hits = words.filter((w) => text.includes(w)).length
  return hits / words.length >= 0.5
}
