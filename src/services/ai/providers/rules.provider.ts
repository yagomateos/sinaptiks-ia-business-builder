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
    const { agent, profile, services } = input
    const normalized = input.incomingMessage.toLowerCase()

    const matchedFaq = profile.faq.find(
      (f) => f.answer.trim() && overlaps(normalized, f.question.toLowerCase()),
    )
    if (matchedFaq) return matchedFaq.answer

    const matchedService = services.find(
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
      return agent.handoff_rules.escalation_message
    }

    return `Gracias por escribir a ${profile.business_name}. Cuéntame un poco más sobre lo que necesitas y te ayudo enseguida.`
  },
}

/** Loose keyword overlap — enough to match an FAQ without a model. */
function overlaps(text: string, question: string): boolean {
  const words = question.split(/\s+/).filter((w) => w.length > 4)
  if (words.length === 0) return false
  const hits = words.filter((w) => text.includes(w)).length
  return hits / words.length >= 0.5
}
