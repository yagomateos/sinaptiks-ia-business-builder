/**
 * Catalog of automation blueprints.
 *
 * Adding a new automation to the product = adding an entry here.
 * No UI change, no engine change.
 */
import type {
  AutomationAction,
  AutomationCategory,
  AutomationTrigger,
  BusinessGoal,
  ContactChannel,
  Industry,
  IntegrationProvider,
} from '../types'

export interface AutomationBlueprint {
  key: string
  name: string
  /** Plain-language description. No technical jargon. */
  description: string
  category: AutomationCategory
  trigger: AutomationTrigger
  actions: AutomationAction[]
  /** Goals this automation serves. Any match contributes to the score. */
  goals: BusinessGoal[]
  /** If set, at least one of these channels must be active. */
  requiresAnyChannel?: ContactChannel[]
  requiredIntegrations: IntegrationProvider[]
  /** Industries where this is especially relevant. */
  boostIndustries?: Industry[]
  /** Baseline relevance 0–10 for every business. */
  baseScore: number
  /** Estimated minutes of manual work saved per execution. */
  minutesSavedPerRun: number
}

export const AUTOMATION_BLUEPRINTS: AutomationBlueprint[] = [
  {
    key: 'captar_nuevos_leads',
    name: 'Captar nuevos leads',
    description:
      'Cada persona que te escribe o rellena un formulario entra automáticamente en tu lista de clientes potenciales, sin que tengas que apuntar nada.',
    category: 'captacion',
    trigger: {
      type: 'mensaje_entrante',
      description: 'Alguien contacta por cualquier canal',
      config: { channels: 'all' },
    },
    actions: [
      { type: 'crear_lead', description: 'Crear la ficha del contacto', config: { stage: 'nuevo' } },
      { type: 'notificar_equipo', description: 'Avisar al equipo', config: { level: 'info' } },
    ],
    goals: ['mas_clientes', 'reducir_admin', 'automatizar_marketing'],
    requiredIntegrations: ['n8n'],
    baseScore: 9,
    minutesSavedPerRun: 3,
  },
  {
    key: 'respuesta_inmediata',
    name: 'Responder automáticamente',
    description:
      'Contesta al instante a cualquier persona que te escriba, a cualquier hora, con la información de tu negocio.',
    category: 'atencion',
    trigger: {
      type: 'mensaje_entrante',
      description: 'Llega un mensaje nuevo',
      config: {},
    },
    actions: [
      { type: 'responder_ia', description: 'El agente IA responde', config: { agent: 'recepcionista' } },
      { type: 'actualizar_lead', description: 'Marcar como contactado', config: { stage: 'contactado' } },
    ],
    goals: ['responder_rapido', 'automatizar_whatsapp', 'automatizar_soporte', 'mas_clientes'],
    requiredIntegrations: ['n8n'],
    baseScore: 10,
    minutesSavedPerRun: 6,
  },
  {
    key: 'cualificar_clientes',
    name: 'Cualificar clientes',
    description:
      'Hace las preguntas clave para saber si un contacto encaja con tu negocio y lo clasifica por interés.',
    category: 'ventas',
    trigger: {
      type: 'cambio_estado',
      description: 'Un contacto pasa a "contactado"',
      config: { from: 'nuevo', to: 'contactado' },
    },
    actions: [
      { type: 'responder_ia', description: 'Preguntas de cualificación', config: { agent: 'comercial' } },
      { type: 'actualizar_lead', description: 'Asignar temperatura', config: {} },
    ],
    goals: ['mas_clientes', 'automatizar_ventas', 'reducir_admin'],
    requiredIntegrations: ['n8n'],
    baseScore: 8,
    minutesSavedPerRun: 8,
  },
  {
    key: 'reserva_cita',
    name: 'Agendar citas',
    description:
      'Ofrece los huecos libres de tu agenda y confirma la cita sin llamadas ni mensajes de ida y vuelta.',
    category: 'reservas',
    trigger: {
      type: 'mensaje_entrante',
      description: 'El contacto pide cita',
      config: { intent: 'reserva' },
    },
    actions: [
      { type: 'agendar_cita', description: 'Reservar en el calendario', config: {} },
      { type: 'enviar_email', description: 'Enviar confirmación', config: {} },
      { type: 'actualizar_lead', description: 'Pasar a "cita"', config: { stage: 'cita' } },
    ],
    goals: ['mas_reservas', 'reducir_admin', 'automatizar_ventas'],
    requiredIntegrations: ['n8n', 'google_calendar'],
    boostIndustries: ['clinica', 'psicologo', 'peluqueria', 'gimnasio', 'abogado', 'restaurante'],
    baseScore: 7,
    minutesSavedPerRun: 10,
  },
  {
    key: 'recordatorio_cita',
    name: 'Recordar citas',
    description:
      'Envía un recordatorio antes de cada cita para reducir las ausencias y los huecos vacíos.',
    category: 'reservas',
    trigger: {
      type: 'programado',
      description: '24 horas antes de la cita',
      config: { offset_hours: -24 },
    },
    actions: [
      { type: 'enviar_telegram', description: 'Recordatorio por Telegram', config: {} },
    ],
    goals: ['mas_reservas', 'reducir_admin'],
    requiresAnyChannel: ['telegram', 'email', 'telefono'],
    requiredIntegrations: ['n8n'],
    boostIndustries: ['clinica', 'psicologo', 'peluqueria', 'gimnasio', 'restaurante'],
    baseScore: 7,
    minutesSavedPerRun: 4,
  },
  {
    key: 'seguimiento_24h',
    name: 'Seguimiento a las 24 horas',
    description:
      'Si un contacto no responde, le escribe de nuevo al día siguiente para no perder la oportunidad.',
    category: 'seguimiento',
    trigger: {
      type: 'inactividad',
      description: 'Sin respuesta durante 24 horas',
      config: { hours: 24 },
    },
    actions: [
      { type: 'esperar', description: 'Esperar 24 horas', config: { hours: 24 } },
      { type: 'responder_ia', description: 'Mensaje de seguimiento', config: { agent: 'seguimiento' } },
    ],
    goals: ['mas_clientes', 'automatizar_ventas', 'recuperar_clientes'],
    requiredIntegrations: ['n8n'],
    baseScore: 8,
    minutesSavedPerRun: 5,
  },
  {
    key: 'recuperar_leads_antiguos',
    name: 'Recuperar leads antiguos',
    description:
      'Vuelve a contactar con las personas que se interesaron hace tiempo y nunca llegaron a comprar.',
    category: 'seguimiento',
    trigger: {
      type: 'programado',
      description: 'Cada semana, sobre contactos inactivos 30 días',
      config: { cron: 'weekly', inactive_days: 30 },
    },
    actions: [
      { type: 'responder_ia', description: 'Mensaje de reactivación', config: { agent: 'seguimiento' } },
      { type: 'actualizar_lead', description: 'Registrar el intento', config: {} },
    ],
    goals: ['recuperar_clientes', 'mas_clientes', 'automatizar_marketing'],
    requiredIntegrations: ['n8n'],
    baseScore: 6,
    minutesSavedPerRun: 7,
  },
  {
    key: 'reactivar_clientes',
    name: 'Reactivar clientes',
    description:
      'Detecta clientes que hace tiempo que no vuelven y les propone una nueva visita o compra.',
    category: 'fidelizacion',
    trigger: {
      type: 'programado',
      description: 'Cada mes, sobre clientes sin actividad',
      config: { cron: 'monthly', inactive_days: 90 },
    },
    actions: [
      { type: 'enviar_telegram', description: 'Propuesta personalizada', config: {} },
    ],
    goals: ['recuperar_clientes', 'automatizar_marketing', 'mas_reservas'],
    requiredIntegrations: ['n8n'],
    boostIndustries: ['peluqueria', 'gimnasio', 'clinica', 'restaurante', 'ecommerce'],
    baseScore: 6,
    minutesSavedPerRun: 6,
  },
  {
    key: 'solicitar_resenas',
    name: 'Solicitar reseñas',
    description:
      'Pide una valoración justo después de una buena experiencia, cuando el cliente está más receptivo.',
    category: 'reputacion',
    trigger: {
      type: 'cambio_estado',
      description: 'Un contacto pasa a "cliente"',
      config: { to: 'cliente', delay_hours: 24 },
    },
    actions: [
      { type: 'esperar', description: 'Esperar 24 horas', config: { hours: 24 } },
      { type: 'solicitar_resena', description: 'Enviar enlace de reseña', config: {} },
    ],
    goals: ['conseguir_resenas', 'automatizar_marketing'],
    requiredIntegrations: ['n8n'],
    boostIndustries: ['clinica', 'restaurante', 'peluqueria', 'gimnasio', 'abogado', 'psicologo'],
    baseScore: 6,
    minutesSavedPerRun: 3,
  },
  {
    key: 'resolver_dudas_frecuentes',
    name: 'Resolver dudas frecuentes',
    description:
      'Responde solo las preguntas que te repiten cada día: horarios, precios, ubicación o condiciones.',
    category: 'atencion',
    trigger: {
      type: 'mensaje_entrante',
      description: 'Pregunta sobre información del negocio',
      config: { intent: 'faq' },
    },
    actions: [
      { type: 'responder_ia', description: 'Respuesta con tu información', config: { agent: 'soporte' } },
    ],
    goals: ['automatizar_soporte', 'responder_rapido', 'reducir_admin'],
    requiredIntegrations: ['n8n'],
    baseScore: 7,
    minutesSavedPerRun: 5,
  },
  {
    key: 'derivar_a_humano',
    name: 'Avisar cuando hace falta una persona',
    description:
      'Cuando una conversación se complica o el cliente lo pide, te avisa para que entres tú.',
    category: 'atencion',
    trigger: {
      type: 'mensaje_entrante',
      description: 'La conversación necesita intervención humana',
      config: { intent: 'escalado' },
    },
    actions: [
      { type: 'notificar_equipo', description: 'Avisar al equipo', config: { level: 'aviso' } },
      { type: 'actualizar_lead', description: 'Marcar como prioritario', config: { temperature: 'caliente' } },
    ],
    goals: ['responder_rapido', 'automatizar_soporte'],
    requiredIntegrations: ['n8n'],
    baseScore: 7,
    minutesSavedPerRun: 2,
  },
  {
    key: 'presupuesto_automatico',
    name: 'Enviar presupuestos',
    description:
      'Prepara y envía un presupuesto con tus precios en cuanto el contacto explica lo que necesita.',
    category: 'ventas',
    trigger: {
      type: 'cambio_estado',
      description: 'Un contacto pasa a "cualificado"',
      config: { to: 'cualificado' },
    },
    actions: [
      { type: 'enviar_email', description: 'Enviar propuesta', config: {} },
      { type: 'actualizar_lead', description: 'Registrar envío', config: {} },
    ],
    goals: ['automatizar_ventas', 'mas_clientes', 'reducir_admin'],
    requiredIntegrations: ['n8n'],
    boostIndustries: ['abogado', 'inmobiliaria', 'servicios_profesionales'],
    baseScore: 5,
    minutesSavedPerRun: 15,
  },
  {
    key: 'recuperar_carrito',
    name: 'Recuperar compras sin terminar',
    description:
      'Escribe a quien dejó una compra a medias para que la complete.',
    category: 'ventas',
    trigger: {
      type: 'inactividad',
      description: 'Compra iniciada y no completada',
      config: { hours: 2 },
    },
    actions: [
      { type: 'esperar', description: 'Esperar 2 horas', config: { hours: 2 } },
      { type: 'enviar_email', description: 'Recordatorio de compra', config: {} },
    ],
    goals: ['automatizar_ventas', 'recuperar_clientes', 'mas_clientes'],
    requiredIntegrations: ['n8n', 'stripe'],
    boostIndustries: ['ecommerce'],
    baseScore: 3,
    minutesSavedPerRun: 4,
  },
  {
    key: 'resumen_diario',
    name: 'Resumen diario del negocio',
    description:
      'Cada mañana recibes un resumen de lo que pasó: contactos nuevos, citas y conversaciones pendientes.',
    category: 'administracion',
    trigger: {
      type: 'programado',
      description: 'Cada día a las 8:00',
      config: { cron: 'daily', hour: 8 },
    },
    actions: [
      { type: 'notificar_equipo', description: 'Enviar resumen', config: {} },
      { type: 'enviar_email', description: 'Copia por email', config: {} },
    ],
    goals: ['reducir_admin'],
    requiredIntegrations: ['n8n'],
    baseScore: 5,
    minutesSavedPerRun: 12,
  },
  {
    key: 'campana_marketing',
    name: 'Mantener el contacto',
    description:
      'Envía mensajes útiles de forma periódica a tus contactos para que no se olviden de ti.',
    category: 'fidelizacion',
    trigger: {
      type: 'programado',
      description: 'Cada dos semanas',
      config: { cron: 'biweekly' },
    },
    actions: [
      { type: 'enviar_email', description: 'Enviar contenido', config: {} },
    ],
    goals: ['automatizar_marketing', 'recuperar_clientes'],
    requiredIntegrations: ['n8n'],
    baseScore: 4,
    minutesSavedPerRun: 20,
  },
]

export function findAutomationBlueprint(key: string): AutomationBlueprint | undefined {
  return AUTOMATION_BLUEPRINTS.find((b) => b.key === key)
}
