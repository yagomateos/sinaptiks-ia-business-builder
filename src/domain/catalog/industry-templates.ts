/**
 * Industry templates.
 *
 * A template packages everything a vertical needs: which automations matter,
 * which agents to create, the CRM pipeline, the integrations, and the seed
 * knowledge questions. Adding a vertical = adding an entry here.
 */
import type {
  AgentType,
  ContactChannel,
  Industry,
  IntegrationProvider,
  LeadStage,
} from '../types'

export interface PipelineTemplate {
  key: string
  name: string
  stages: LeadStage[]
  stageLabels: Partial<Record<LeadStage, string>>
}

export interface IndustryTemplate {
  industry: Industry
  label: string
  /** Short line shown while generating the system. */
  headline: string
  pipeline: PipelineTemplate
  /** Automation blueprint keys this vertical always benefits from. */
  coreAutomations: string[]
  /** Agents this vertical should get by default. */
  coreAgents: AgentType[]
  recommendedIntegrations: IntegrationProvider[]
  defaultChannels: ContactChannel[]
  /** Seeds the knowledge base with the questions this vertical is always asked. */
  knowledgeSeeds: string[]
  /** Pre-written FAQ starters the user can edit. */
  faqSeeds: { question: string; answer: string }[]
}

const DEFAULT_PIPELINE: PipelineTemplate = {
  key: 'estandar',
  name: 'Pipeline estándar',
  stages: ['nuevo', 'contactado', 'cualificado', 'cita', 'cliente', 'perdido'],
  stageLabels: {},
}

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    industry: 'clinica',
    label: 'Clínica / Salud',
    headline: 'Pacientes atendidos al instante y agenda siempre llena',
    pipeline: {
      key: 'clinica',
      name: 'Pipeline de clínica',
      stages: ['nuevo', 'contactado', 'cualificado', 'cita', 'cliente', 'perdido'],
      stageLabels: { cita: 'Cita agendada', cliente: 'Paciente' },
    },
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'cualificar_clientes',
      'reserva_cita',
      'recordatorio_cita',
      'seguimiento_24h',
      'reactivar_clientes',
      'solicitar_resenas',
    ],
    coreAgents: ['recepcionista', 'comercial', 'seguimiento'],
    recommendedIntegrations: ['n8n', 'telegram', 'google_calendar', 'gmail'],
    defaultChannels: ['telegram', 'telefono', 'web', 'google_business'],
    knowledgeSeeds: [
      '¿Qué tratamientos ofrecéis y en qué consiste cada uno?',
      '¿Cuáles son los precios y hay financiación disponible?',
      '¿Trabajáis con seguros médicos? ¿Con cuáles?',
      '¿Cuál es el horario de la clínica?',
      '¿Cómo se pide, cambia o cancela una cita?',
      '¿Dónde estáis y cómo se llega?',
    ],
    faqSeeds: [
      { question: '¿La primera consulta es gratuita?', answer: '' },
      { question: '¿Cuánto dura una sesión?', answer: '' },
      { question: '¿Aceptáis seguros médicos?', answer: '' },
    ],
  },
  {
    industry: 'restaurante',
    label: 'Restaurante / Hostelería',
    headline: 'Reservas sin llamadas y clientes que repiten',
    pipeline: {
      key: 'restaurante',
      name: 'Pipeline de restaurante',
      stages: ['nuevo', 'contactado', 'cita', 'cliente', 'perdido'],
      stageLabels: { cita: 'Reserva confirmada', cliente: 'Comensal' },
    },
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'reserva_cita',
      'recordatorio_cita',
      'solicitar_resenas',
      'reactivar_clientes',
      'resolver_dudas_frecuentes',
    ],
    coreAgents: ['recepcionista', 'seguimiento'],
    recommendedIntegrations: ['n8n', 'telegram', 'google_calendar'],
    defaultChannels: ['telegram', 'instagram', 'telefono', 'google_business'],
    knowledgeSeeds: [
      '¿Cuál es la carta y los precios aproximados?',
      '¿Qué horarios de cocina tenéis?',
      '¿Tenéis opciones vegetarianas, veganas o sin gluten?',
      '¿Se puede reservar? ¿Para cuántas personas?',
      '¿Tenéis terraza, parking o acceso adaptado?',
      '¿Hacéis eventos, grupos o menús cerrados?',
    ],
    faqSeeds: [
      { question: '¿Hace falta reservar?', answer: '' },
      { question: '¿Tenéis menú del día?', answer: '' },
      { question: '¿Admitís perros?', answer: '' },
    ],
  },
  {
    industry: 'psicologo',
    label: 'Psicología / Terapia',
    headline: 'Primer contacto cuidado y agenda organizada',
    pipeline: {
      key: 'psicologo',
      name: 'Pipeline de terapia',
      stages: ['nuevo', 'contactado', 'cualificado', 'cita', 'cliente', 'perdido'],
      stageLabels: { cita: 'Primera sesión', cliente: 'Paciente activo' },
    },
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'reserva_cita',
      'recordatorio_cita',
      'seguimiento_24h',
      'resolver_dudas_frecuentes',
    ],
    coreAgents: ['recepcionista', 'seguimiento'],
    recommendedIntegrations: ['n8n', 'telegram', 'google_calendar', 'gmail'],
    defaultChannels: ['telegram', 'web', 'email', 'telefono'],
    knowledgeSeeds: [
      '¿Qué tipo de terapia ofreces y para qué situaciones?',
      '¿Cuánto dura y cuánto cuesta una sesión?',
      '¿Atiendes online, presencial o ambas?',
      '¿Con qué frecuencia son las sesiones?',
      '¿Cuál es la política de cancelación?',
      '¿Cómo funciona la confidencialidad?',
    ],
    faqSeeds: [
      { question: '¿La primera sesión tiene coste?', answer: '' },
      { question: '¿Atiendes online?', answer: '' },
      { question: '¿Cuántas sesiones suelen hacer falta?', answer: '' },
    ],
  },
  {
    industry: 'inmobiliaria',
    label: 'Inmobiliaria',
    headline: 'Interesados cualificados y visitas organizadas',
    pipeline: {
      key: 'inmobiliaria',
      name: 'Pipeline inmobiliario',
      stages: ['nuevo', 'contactado', 'cualificado', 'cita', 'cliente', 'perdido'],
      stageLabels: { cita: 'Visita agendada', cliente: 'Operación cerrada' },
    },
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'cualificar_clientes',
      'reserva_cita',
      'seguimiento_24h',
      'recuperar_leads_antiguos',
      'presupuesto_automatico',
    ],
    coreAgents: ['recepcionista', 'comercial', 'seguimiento'],
    recommendedIntegrations: ['n8n', 'telegram', 'google_calendar', 'gmail'],
    defaultChannels: ['telegram', 'web', 'telefono', 'email'],
    knowledgeSeeds: [
      '¿En qué zonas trabajáis?',
      '¿Qué tipo de inmuebles gestionáis y en qué rango de precio?',
      '¿Qué honorarios cobráis y a quién?',
      '¿Qué documentación necesita el comprador o el inquilino?',
      '¿Ofrecéis ayuda con la financiación?',
      '¿Cómo se organiza una visita?',
    ],
    faqSeeds: [
      { question: '¿Cuáles son vuestros honorarios?', answer: '' },
      { question: '¿Puedo visitar el inmueble este fin de semana?', answer: '' },
      { question: '¿Ayudáis con la hipoteca?', answer: '' },
    ],
  },
  {
    industry: 'peluqueria',
    label: 'Peluquería / Estética',
    headline: 'Agenda completa y clientas que vuelven',
    pipeline: {
      key: 'peluqueria',
      name: 'Pipeline de salón',
      stages: ['nuevo', 'contactado', 'cita', 'cliente', 'perdido'],
      stageLabels: { cita: 'Cita reservada', cliente: 'Cliente habitual' },
    },
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'reserva_cita',
      'recordatorio_cita',
      'reactivar_clientes',
      'solicitar_resenas',
    ],
    coreAgents: ['recepcionista', 'seguimiento'],
    recommendedIntegrations: ['n8n', 'telegram', 'google_calendar'],
    defaultChannels: ['telegram', 'instagram', 'telefono', 'google_business'],
    knowledgeSeeds: [
      '¿Qué servicios ofrecéis y cuánto cuesta cada uno?',
      '¿Cuánto dura cada servicio?',
      '¿Qué horario tenéis y qué días cerráis?',
      '¿Se puede ir sin cita?',
      '¿Con qué marcas y productos trabajáis?',
      '¿Cuál es la política de cancelación?',
    ],
    faqSeeds: [
      { question: '¿Cuánto cuesta un corte?', answer: '' },
      { question: '¿Atendéis sin cita previa?', answer: '' },
      { question: '¿Hacéis color y mechas el mismo día?', answer: '' },
    ],
  },
  {
    industry: 'gimnasio',
    label: 'Gimnasio / Fitness',
    headline: 'Más altas y menos bajas cada mes',
    pipeline: {
      key: 'gimnasio',
      name: 'Pipeline de gimnasio',
      stages: ['nuevo', 'contactado', 'cualificado', 'cita', 'cliente', 'perdido'],
      stageLabels: { cita: 'Clase de prueba', cliente: 'Socio' },
    },
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'cualificar_clientes',
      'reserva_cita',
      'seguimiento_24h',
      'reactivar_clientes',
      'solicitar_resenas',
    ],
    coreAgents: ['recepcionista', 'comercial', 'seguimiento'],
    recommendedIntegrations: ['n8n', 'telegram', 'google_calendar', 'stripe'],
    defaultChannels: ['telegram', 'instagram', 'web', 'telefono'],
    knowledgeSeeds: [
      '¿Qué cuotas y modalidades de abono tenéis?',
      '¿Hay matrícula o permanencia?',
      '¿Qué clases dirigidas ofrecéis y en qué horarios?',
      '¿Se puede probar antes de apuntarse?',
      '¿Qué instalaciones tenéis?',
      '¿Cómo se da de baja un socio?',
    ],
    faqSeeds: [
      { question: '¿Cuánto cuesta la cuota mensual?', answer: '' },
      { question: '¿Hay permanencia?', answer: '' },
      { question: '¿Puedo hacer una clase de prueba?', answer: '' },
    ],
  },
  {
    industry: 'abogado',
    label: 'Abogacía / Legal',
    headline: 'Consultas filtradas y presupuestos enviados solos',
    pipeline: {
      key: 'abogado',
      name: 'Pipeline legal',
      stages: ['nuevo', 'contactado', 'cualificado', 'cita', 'cliente', 'perdido'],
      stageLabels: { cita: 'Consulta agendada', cliente: 'Expediente abierto' },
    },
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'cualificar_clientes',
      'reserva_cita',
      'presupuesto_automatico',
      'seguimiento_24h',
      'solicitar_resenas',
    ],
    coreAgents: ['recepcionista', 'comercial'],
    recommendedIntegrations: ['n8n', 'telegram', 'google_calendar', 'gmail'],
    defaultChannels: ['telefono', 'email', 'web', 'telegram'],
    knowledgeSeeds: [
      '¿En qué áreas del derecho trabajáis?',
      '¿Cómo se cobra: por hora, por caso o por iguala?',
      '¿La primera consulta tiene coste?',
      '¿Cuánto suele tardar un procedimiento de este tipo?',
      '¿Qué documentación necesita el cliente para empezar?',
      '¿Trabajáis con justicia gratuita?',
    ],
    faqSeeds: [
      { question: '¿Cuánto cuesta una primera consulta?', answer: '' },
      { question: '¿Lleváis casos en toda España?', answer: '' },
      { question: '¿Cuánto tarda el proceso?', answer: '' },
    ],
  },
  {
    industry: 'ecommerce',
    label: 'Ecommerce / Tienda online',
    headline: 'Menos carritos perdidos y soporte resuelto solo',
    pipeline: {
      key: 'ecommerce',
      name: 'Pipeline de tienda',
      stages: ['nuevo', 'contactado', 'cualificado', 'cliente', 'perdido'],
      stageLabels: { cualificado: 'Carrito iniciado', cliente: 'Comprador' },
    },
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'resolver_dudas_frecuentes',
      'recuperar_carrito',
      'solicitar_resenas',
      'reactivar_clientes',
      'campana_marketing',
    ],
    coreAgents: ['recepcionista', 'soporte', 'seguimiento'],
    recommendedIntegrations: ['n8n', 'telegram', 'stripe', 'gmail', 'instagram'],
    defaultChannels: ['web', 'instagram', 'email', 'telegram'],
    knowledgeSeeds: [
      '¿Cuáles son los plazos y costes de envío?',
      '¿Cómo funcionan las devoluciones y cambios?',
      '¿Qué métodos de pago aceptáis?',
      '¿Enviáis fuera de España?',
      '¿Cómo se sigue un pedido?',
      '¿Qué garantía tienen los productos?',
    ],
    faqSeeds: [
      { question: '¿Cuánto tarda el envío?', answer: '' },
      { question: '¿Puedo devolver un producto?', answer: '' },
      { question: '¿Hacéis envíos internacionales?', answer: '' },
    ],
  },
  {
    industry: 'servicios_profesionales',
    label: 'Servicios profesionales',
    headline: 'Clientes cualificados sin perseguir a nadie',
    pipeline: DEFAULT_PIPELINE,
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'cualificar_clientes',
      'presupuesto_automatico',
      'seguimiento_24h',
      'recuperar_leads_antiguos',
      'solicitar_resenas',
    ],
    coreAgents: ['recepcionista', 'comercial', 'seguimiento'],
    recommendedIntegrations: ['n8n', 'gmail', 'google_calendar', 'telegram'],
    defaultChannels: ['email', 'web', 'telefono', 'telegram'],
    knowledgeSeeds: [
      '¿Qué servicios ofreces exactamente?',
      '¿Cómo son tus tarifas y qué incluyen?',
      '¿Cómo es el proceso de trabajo desde el primer contacto?',
      '¿Cuánto tarda un proyecto tipo?',
      '¿Trabajas en remoto o presencial?',
      '¿Qué necesitas del cliente para empezar?',
    ],
    faqSeeds: [
      { question: '¿Cuánto cuesta tu servicio?', answer: '' },
      { question: '¿Cuánto tardas en entregar?', answer: '' },
      { question: '¿Trabajas en remoto?', answer: '' },
    ],
  },
  {
    industry: 'otro',
    label: 'Otro sector',
    headline: 'Un sistema base listo para adaptarse a tu negocio',
    pipeline: DEFAULT_PIPELINE,
    coreAutomations: [
      'captar_nuevos_leads',
      'respuesta_inmediata',
      'cualificar_clientes',
      'seguimiento_24h',
      'resolver_dudas_frecuentes',
    ],
    coreAgents: ['recepcionista', 'comercial'],
    recommendedIntegrations: ['n8n', 'telegram', 'gmail'],
    defaultChannels: ['telegram', 'email', 'web'],
    knowledgeSeeds: [
      '¿Qué vende exactamente tu negocio?',
      '¿Cuáles son tus precios?',
      '¿Qué horario tienes?',
      '¿Dónde estás ubicado?',
      '¿Qué te preguntan más a menudo?',
      '¿Cuáles son tus condiciones y políticas?',
    ],
    faqSeeds: [
      { question: '¿Qué horario tenéis?', answer: '' },
      { question: '¿Dónde estáis?', answer: '' },
      { question: '¿Cuánto cuesta?', answer: '' },
    ],
  },
]

export function getIndustryTemplate(industry: Industry): IndustryTemplate {
  return (
    INDUSTRY_TEMPLATES.find((t) => t.industry === industry) ??
    INDUSTRY_TEMPLATES[INDUSTRY_TEMPLATES.length - 1]
  )
}
