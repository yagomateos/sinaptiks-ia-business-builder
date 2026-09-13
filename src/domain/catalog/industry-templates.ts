/**
 * Industry templates.
 *
 * A template packages everything a vertical needs: which automations matter,
 * which agents to create, the CRM pipeline, the integrations, the seed
 * knowledge questions, and how the onboarding wizard should talk about this
 * vertical (step copy, placeholders, suggested goals). Adding a vertical =
 * adding an entry here — nothing else needs to change.
 */
import type {
  AgentType,
  BusinessGoal,
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

/**
 * Content that adapts the onboarding wizard to the vertical. The wizard keeps
 * the same 6 steps for every business — only this content changes per
 * industry, so there is one set of step components, never one per vertical.
 */
export interface IndustryOnboardingContent {
  /** Step 2 ("¿Qué hace tu negocio?") subtitle and description placeholder. */
  descriptionSubtitle: string
  descriptionPlaceholder: string
  /** Step 3 ("¿Quién es tu cliente ideal?") placeholder and thinking prompts. */
  idealCustomerPlaceholder: string
  idealCustomerHints: string[]
  /** Step 4: what "services" are called in this vertical, and an example. */
  serviceStepTitle: string
  serviceStepSubtitle: string
  serviceLabel: string
  serviceExample: {
    name: string
    description: string
    price: string
    durationMinutes: string
    features: string
  }
  /** Step 5: goals pre-selected and flagged "Recomendado" for this vertical. */
  suggestedGoals: BusinessGoal[]
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
  onboarding: IndustryOnboardingContent
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
    onboarding: {
      descriptionSubtitle:
        'Explica qué tratamientos hacéis y qué os diferencia. Cuanto más concreto, mejor responderán tus agentes a los pacientes.',
      descriptionPlaceholder:
        'Somos una clínica dental en Madrid. Hacemos implantes, ortodoncia invisible y estética dental. Llevamos 12 años y nos diferencia el trato cercano y que damos presupuesto cerrado desde la primera visita.',
      idealCustomerPlaceholder:
        'Personas de 30 a 60 años de Madrid centro que buscan una solución definitiva y valoran más la calidad y la confianza que el precio más bajo.',
      idealCustomerHints: [
        'Qué problema dental tienen antes de encontrarte',
        'Qué les preocupa al decidir: precio, dolor, tiempo',
        'Qué tipo de paciente prefieres evitar',
      ],
      serviceStepTitle: '¿Qué tratamientos ofreces?',
      serviceStepSubtitle:
        'Añade tus tratamientos con precio y duración. Es lo que tus agentes responderán cuando un paciente pregunte.',
      serviceLabel: 'Tratamiento',
      serviceExample: {
        name: 'Implante dental',
        description: 'Sustitución de una pieza dental con implante de titanio y corona de porcelana.',
        price: '1200',
        durationMinutes: '60',
        features: 'Primera visita, radiografía, garantía 10 años',
      },
      suggestedGoals: ['mas_reservas', 'responder_rapido', 'recuperar_clientes', 'conseguir_resenas'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Cuenta qué tipo de cocina hacéis y qué os hace diferentes. Tus agentes lo usarán para atender a quien pregunte por la carta o por reservar.',
      descriptionPlaceholder:
        'Somos un restaurante de cocina mediterránea en Valencia. Especialidad en arroces y pescado fresco. Llevamos 8 años y nos diferencia el producto de mercado y la terraza con vistas.',
      idealCustomerPlaceholder:
        'Familias y grupos de amigos de Valencia que buscan una comida de calidad para una ocasión especial, y turistas que buscan cocina local auténtica.',
      idealCustomerHints: [
        'Qué buscan al reservar: ocasión especial, comida rápida, grupo grande',
        'Qué les hace dudar antes de reservar',
        'Qué tipo de cliente prefieres evitar',
      ],
      serviceStepTitle: '¿Qué ofrece tu carta?',
      serviceStepSubtitle:
        'Añade tus platos o menús destacados con precio. Es lo que tus agentes recomendarán cuando alguien pregunte qué comer.',
      serviceLabel: 'Plato o menú',
      serviceExample: {
        name: 'Arroz de marisco',
        description: 'Arroz meloso con marisco fresco de lonja, para dos personas.',
        price: '38',
        durationMinutes: '',
        features: 'Para compartir, alérgenos: marisco',
      },
      suggestedGoals: ['mas_reservas', 'responder_rapido', 'conseguir_resenas', 'recuperar_clientes'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Explica qué tipo de terapia haces y a quién ayudas. Tus agentes lo usarán para responder con cuidado en el primer contacto.',
      descriptionPlaceholder:
        'Soy psicóloga sanitaria en Barcelona, especializada en terapia cognitivo-conductual para ansiedad y estrés. Atiendo presencial y online, con más de 10 años de experiencia.',
      idealCustomerPlaceholder:
        'Adultos de 25 a 45 años que llevan tiempo notando ansiedad o estrés y buscan un espacio serio y confidencial, presencial u online.',
      idealCustomerHints: [
        'Qué situación les lleva a buscar terapia',
        'Qué dudas o miedos tienen antes de dar el paso',
        'Qué tipo de caso prefieres derivar a otro profesional',
      ],
      serviceStepTitle: '¿Qué terapias o servicios ofreces?',
      serviceStepSubtitle:
        'Añade tus modalidades de terapia con precio y duración de sesión. Es lo que tus agentes explicarán en el primer contacto.',
      serviceLabel: 'Terapia o servicio',
      serviceExample: {
        name: 'Terapia individual online',
        description: 'Sesión de terapia cognitivo-conductual por videollamada para ansiedad y estrés.',
        price: '55',
        durationMinutes: '50',
        features: 'Primera sesión de valoración, videollamada, horario de tarde',
      },
      suggestedGoals: ['responder_rapido', 'mas_reservas', 'reducir_admin', 'mas_clientes'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Cuenta en qué tipo de operaciones e inmuebles estáis especializados. Tus agentes lo usarán para filtrar a compradores, vendedores e inquilinos.',
      descriptionPlaceholder:
        'Somos una inmobiliaria en Madrid centro especializada en compraventa de pisos de segunda mano. Llevamos 15 años en el barrio y nos diferencia el conocimiento local y el acompañamiento hasta la firma.',
      idealCustomerPlaceholder:
        'Familias que buscan comprar su primera o segunda vivienda en Madrid centro, con presupuesto definido y decisión de compra en menos de 6 meses.',
      idealCustomerHints: [
        'Si buscas más compradores, vendedores o ambos',
        'Qué presupuesto o zona suele interesar a tu cliente típico',
        'Qué tipo de interesado prefieres filtrar antes de agendar una visita',
      ],
      serviceStepTitle: '¿Qué propiedades gestionas?',
      serviceStepSubtitle:
        'Añade tus propiedades destacadas o tipos de inmueble con precio. Es lo que tus agentes mostrarán a quien pregunte.',
      serviceLabel: 'Propiedad',
      serviceExample: {
        name: 'Piso 3 habitaciones, Chamberí',
        description: '90m², exterior, reformado, con ascensor. A 5 minutos del metro.',
        price: '385000',
        durationMinutes: '',
        features: 'Exterior, ascensor, reformado, trastero',
      },
      suggestedGoals: ['mas_clientes', 'responder_rapido', 'reducir_admin', 'recuperar_clientes'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Cuenta qué servicios hacéis y qué os diferencia. Tus agentes lo usarán para recomendar servicio y agendar cita.',
      descriptionPlaceholder:
        'Somos un salón de peluquería y estética en Sevilla. Hacemos color, cortes, tratamientos capilares y manicura. Llevamos 6 años y nos diferencia el asesoramiento personalizado en cada visita.',
      idealCustomerPlaceholder:
        'Mujeres y hombres de 20 a 55 años de la zona que buscan un salón de confianza para su cuidado habitual, no solo para ocasiones especiales.',
      idealCustomerHints: [
        'Qué servicio suelen pedir primero',
        'Qué les hace elegir un salón fijo en vez de ir cambiando',
        'Qué tipo de cliente prefieres evitar',
      ],
      serviceStepTitle: '¿Qué tratamientos o servicios ofreces?',
      serviceStepSubtitle:
        'Añade tus servicios con precio y duración. Es lo que tus agentes dirán cuando alguien pregunte por precios o disponibilidad.',
      serviceLabel: 'Tratamiento',
      serviceExample: {
        name: 'Color + mechas',
        description: 'Coloración completa con mechas balayage, incluye lavado y peinado.',
        price: '85',
        durationMinutes: '120',
        features: 'Lavado, secado, producto profesional',
      },
      suggestedGoals: ['mas_reservas', 'responder_rapido', 'conseguir_resenas', 'recuperar_clientes'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Cuenta qué tipo de gimnasio o centro sois y qué os diferencia. Tus agentes lo usarán para captar y fidelizar socios.',
      descriptionPlaceholder:
        'Somos un gimnasio de barrio en Zaragoza con sala de musculación, clases dirigidas y entrenamiento personal. Llevamos 5 años y nos diferencia el trato cercano y los grupos reducidos en las clases.',
      idealCustomerPlaceholder:
        'Personas de 25 a 50 años de la zona que quieren entrenar de forma constante, con o sin experiencia previa, y valoran un ambiente cercano más que una cadena grande.',
      idealCustomerHints: [
        'Qué les frena para apuntarse: precio, permanencia, vergüenza a empezar',
        'Qué clase o servicio suele engancharlos',
        'Qué tipo de socio prefieres evitar',
      ],
      serviceStepTitle: '¿Qué cuotas, clases o planes ofreces?',
      serviceStepSubtitle:
        'Añade tus modalidades de abono, clases dirigidas o bonos con precio. Es lo que tus agentes explicarán a quien pregunte por precios.',
      serviceLabel: 'Cuota o clase',
      serviceExample: {
        name: 'Cuota mensual básica',
        description: 'Acceso libre a sala de musculación y cardio, sin permanencia.',
        price: '39',
        durationMinutes: '',
        features: 'Sin matrícula, acceso ilimitado, sin permanencia',
      },
      suggestedGoals: ['mas_clientes', 'recuperar_clientes', 'conseguir_resenas', 'reducir_admin'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Cuenta en qué áreas del derecho trabajáis y cómo es vuestro proceso. Tus agentes lo usarán para filtrar y orientar a quien consulta.',
      descriptionPlaceholder:
        'Somos un despacho de abogados en Bilbao especializado en derecho laboral y de familia. Llevamos 10 años y nos diferencia el trato directo con el abogado desde la primera consulta, sin intermediarios.',
      idealCustomerPlaceholder:
        'Particulares y pequeñas empresas de la zona que necesitan asesoramiento en un caso concreto de laboral o familia, y valoran la claridad sobre honorarios desde el principio.',
      idealCustomerHints: [
        'Qué tipo de caso es más rentable o interesante para el despacho',
        'Qué documentación suelen necesitar antes de la primera cita',
        'Qué tipo de consulta prefieres derivar a otro despacho',
      ],
      serviceStepTitle: '¿Qué áreas o servicios legales ofreces?',
      serviceStepSubtitle:
        'Añade tus áreas de práctica o servicios con precio orientativo. Es lo que tus agentes explicarán en la primera consulta.',
      serviceLabel: 'Área o servicio legal',
      serviceExample: {
        name: 'Despido improcedente',
        description: 'Reclamación por despido improcedente, desde la reclamación previa hasta el juicio.',
        price: '',
        durationMinutes: '',
        features: 'Primera consulta gratuita, honorarios según resultado',
      },
      suggestedGoals: ['responder_rapido', 'mas_clientes', 'reducir_admin', 'automatizar_ventas'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Cuenta qué vendéis y qué os diferencia de otras tiendas. Tus agentes lo usarán para resolver dudas y recuperar carritos.',
      descriptionPlaceholder:
        'Somos una tienda online de ropa deportiva sostenible. Vendemos en toda España con envío en 24-48h. Nos diferencia el material reciclado y la política de devolución sin preguntas.',
      idealCustomerPlaceholder:
        'Personas de 20 a 40 años activas en redes que valoran la sostenibilidad y buscan calidad en ropa deportiva, dispuestas a pagar algo más por un producto responsable.',
      idealCustomerHints: [
        'Qué les hace dudar antes de comprar: envío, devoluciones, tallas',
        'Qué canal usan más para escribir: Instagram, WhatsApp, email',
        'Qué tipo de cliente prefieres evitar',
      ],
      serviceStepTitle: '¿Qué productos vendes?',
      serviceStepSubtitle:
        'Añade tus productos o categorías destacadas con precio. Es lo que tus agentes recomendarán cuando alguien pregunte.',
      serviceLabel: 'Producto',
      serviceExample: {
        name: 'Mallas deportivas recicladas',
        description: 'Mallas de compresión fabricadas con poliéster reciclado, varias tallas y colores.',
        price: '39',
        durationMinutes: '',
        features: 'Envío 24-48h, devolución gratuita 30 días',
      },
      suggestedGoals: ['automatizar_soporte', 'recuperar_clientes', 'conseguir_resenas', 'automatizar_marketing'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Cuenta qué haces y para quién. Tus agentes lo usarán para cualificar a quien contacta antes de pasarte el contacto.',
      descriptionPlaceholder:
        'Soy consultora de marketing digital para pequeñas empresas. Ayudo a definir estrategia, gestionar redes sociales y publicidad online. Trabajo en remoto con clientes de toda España.',
      idealCustomerPlaceholder:
        'Pequeñas empresas y autónomos que quieren mejorar su presencia online pero no tienen equipo de marketing propio, con un presupuesto mensual definido.',
      idealCustomerHints: [
        'Qué problema tienen antes de contactarte',
        'Qué presupuesto suele manejar tu cliente típico',
        'Qué tipo de proyecto prefieres evitar',
      ],
      serviceStepTitle: '¿Qué servicios ofreces?',
      serviceStepSubtitle:
        'Añade tus servicios con precio o tarifa orientativa. Es lo que tus agentes explicarán cuando alguien pregunte qué haces.',
      serviceLabel: 'Servicio',
      serviceExample: {
        name: 'Gestión de redes sociales',
        description: 'Creación y publicación de contenido en Instagram y Facebook, 3 publicaciones por semana.',
        price: '350',
        durationMinutes: '',
        features: 'Informe mensual, sin permanencia',
      },
      suggestedGoals: ['mas_clientes', 'reducir_admin', 'automatizar_ventas', 'responder_rapido'],
    },
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
    onboarding: {
      descriptionSubtitle:
        'Explícalo como se lo contarías a un cliente. Cuanto más concreto, mejor responderán tus agentes.',
      descriptionPlaceholder:
        'Contamos a qué se dedica tu negocio, desde cuándo, y qué te diferencia de la competencia.',
      idealCustomerPlaceholder:
        'Describe quién suele comprarte o contratarte: edad, zona, qué busca y qué valora al decidir.',
      idealCustomerHints: [
        'Qué problema tienen antes de encontrarte',
        'Qué les preocupa al decidir',
        'Qué tipo de cliente prefieres evitar',
      ],
      serviceStepTitle: '¿Qué vendes?',
      serviceStepSubtitle:
        'Añade tus servicios o productos con sus precios. Es lo que tus agentes responderán cuando pregunten.',
      serviceLabel: 'Servicio',
      serviceExample: {
        name: 'Nombre del servicio',
        description: 'Breve descripción de qué incluye',
        price: '0',
        durationMinutes: '60',
        features: 'Qué incluye, separado por comas',
      },
      suggestedGoals: [],
    },
  },
]

export function getIndustryTemplate(industry: Industry): IndustryTemplate {
  return (
    INDUSTRY_TEMPLATES.find((t) => t.industry === industry) ??
    INDUSTRY_TEMPLATES[INDUSTRY_TEMPLATES.length - 1]
  )
}
