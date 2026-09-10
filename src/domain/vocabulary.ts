/**
 * Human-facing labels for domain vocabularies.
 * The UI never renders a raw enum key — it renders these.
 */
import type {
  AgentType,
  AutomationAction,
  AutomationCategory,
  AutomationStatus,
  BrandVoice,
  BusinessGoal,
  ContactChannel,
  Industry,
  IntegrationProvider,
  IntegrationStatus,
  LeadStage,
  LeadTemperature,
} from './types'

export const INDUSTRY_LABELS: Record<Industry, string> = {
  clinica: 'Clínica / Salud',
  restaurante: 'Restaurante / Hostelería',
  psicologo: 'Psicología / Terapia',
  inmobiliaria: 'Inmobiliaria',
  peluqueria: 'Peluquería / Estética',
  gimnasio: 'Gimnasio / Fitness',
  abogado: 'Abogacía / Legal',
  ecommerce: 'Ecommerce / Tienda online',
  servicios_profesionales: 'Servicios profesionales',
  otro: 'Otro sector',
}

export const GOAL_LABELS: Record<BusinessGoal, string> = {
  mas_clientes: 'Conseguir más clientes',
  mas_reservas: 'Conseguir más reservas',
  responder_rapido: 'Responder más rápido',
  automatizar_whatsapp: 'Automatizar mensajería',
  automatizar_ventas: 'Automatizar ventas',
  recuperar_clientes: 'Recuperar clientes',
  automatizar_soporte: 'Automatizar soporte',
  conseguir_resenas: 'Conseguir reseñas',
  reducir_admin: 'Reducir trabajo administrativo',
  automatizar_marketing: 'Automatizar marketing',
}

export const GOAL_DESCRIPTIONS: Record<BusinessGoal, string> = {
  mas_clientes: 'Captar y cualificar interesados de forma continua',
  mas_reservas: 'Convertir interés en citas confirmadas',
  responder_rapido: 'Contestar en segundos, a cualquier hora',
  automatizar_whatsapp: 'Atender mensajes sin estar pendiente',
  automatizar_ventas: 'Acompañar al cliente hasta la venta',
  recuperar_clientes: 'Volver a activar contactos que se enfriaron',
  automatizar_soporte: 'Resolver dudas frecuentes sin intervención',
  conseguir_resenas: 'Pedir valoraciones en el mejor momento',
  reducir_admin: 'Eliminar tareas repetitivas del día a día',
  automatizar_marketing: 'Mantener el contacto de forma constante',
}

export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  web: 'Web',
  instagram: 'Instagram',
  facebook: 'Facebook',
  email: 'Email',
  telefono: 'Teléfono',
  google_business: 'Google Business',
}

export const BRAND_VOICE_LABELS: Record<BrandVoice, string> = {
  cercano: 'Cercano',
  profesional: 'Profesional',
  entusiasta: 'Entusiasta',
  directo: 'Directo',
  empatico: 'Empático',
}

export const BRAND_VOICE_DESCRIPTIONS: Record<BrandVoice, string> = {
  cercano: 'Tuteo, tono amable y natural',
  profesional: 'Trato cuidado, preciso y sobrio',
  entusiasta: 'Energía positiva, motivador',
  directo: 'Frases cortas, sin rodeos',
  empatico: 'Escucha activa, tono cálido',
}

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  cualificado: 'Cualificado',
  cita: 'Cita',
  cliente: 'Cliente',
  perdido: 'Perdido',
}

export const LEAD_TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  frio: 'Frío',
  templado: 'Templado',
  caliente: 'Caliente',
}

export const AUTOMATION_STATUS_LABELS: Record<AutomationStatus, string> = {
  borrador: 'Borrador',
  preparada: 'Preparada',
  activa: 'Activa',
  pausada: 'Pausada',
  error: 'Con errores',
}

export const AUTOMATION_CATEGORY_LABELS: Record<AutomationCategory, string> = {
  captacion: 'Captación',
  atencion: 'Atención',
  ventas: 'Ventas',
  reservas: 'Reservas',
  seguimiento: 'Seguimiento',
  fidelizacion: 'Fidelización',
  reputacion: 'Reputación',
  administracion: 'Administración',
}

/**
 * El paso se guarda y se marca como ejecutado, pero no sale nada de verdad
 * todavía: n8n-callback no tiene conectado ese canal y solo deja una nota en
 * el registro de actividad (ver `supabase/functions/n8n-callback/index.ts`).
 * Esta lista tiene que coincidir con los `case` reales de ese switch — si se
 * conecta un canal ahí, se quita el tipo de aquí en el mismo cambio.
 */
export const UNCONNECTED_AUTOMATION_ACTIONS = new Set<AutomationAction['type']>([
  'enviar_whatsapp',
  'enviar_email',
  'agendar_cita',
  'solicitar_resena',
])

/**
 * `mensaje_entrante` dispara de verdad desde `conversation-pipeline.ts` — pero
 * solo cuando no depende de clasificar la intención del mensaje (`config`
 * vacío o solo con `channels`), o cuando la intención es "escalado" (ahí la
 * señal ya la calcula `detectHandoff`, así que reutilizarla es gratis). Con
 * intención "reserva" o "faq" seguiría necesitando clasificar el mensaje, que
 * todavía no existe, así que esos siguen sin disparar solos.
 *
 * `cambio_estado` dispara de verdad desde el trigger de Postgres
 * `notify_stage_change_automations` (migración `automation_stage_dispatch`),
 * salvo que tenga `delay_hours` — el disparo ahí es inmediato, no hay
 * infraestructura todavía para esperar antes de lanzarlo.
 *
 * `programado` no necesita nada nuestro: n8n usa su propio nodo de horario
 * (`n8n-nodes-base.scheduleTrigger`, ver `buildTriggerNode` en
 * `workflow-builder.ts`) y lo dispara solo en cuanto el workflow está
 * activo — comprobado contra producción, ya se ha ejecutado por su cuenta.
 *
 * `inactividad` dispara desde el cron `automation-inactivity-scan`
 * (migración `automation_inactivity_dispatch`), cada 30 minutos.
 *
 * Un paso `responder_ia` no dispara en ninguno de los casos: el pipeline ya
 * responde directamente a cada mensaje real (mensaje_entrante), y en el
 * resto no hay ningún mensaje real al que responder — respondWithAgent
 * caería a su "Hola" de respaldo e inventaría una respuesta. Debe coincidir
 * con las exclusiones reales en `conversation-pipeline.ts` y en las
 * migraciones `automation_stage_dispatch` / `automation_inactivity_dispatch`.
 */
export function isAutomationTriggerConnected(
  trigger: { type: string; config: Record<string, unknown> },
  actions: AutomationAction[],
): boolean {
  if (actions.some((a) => a.type === 'responder_ia')) return false

  if (trigger.type === 'mensaje_entrante') {
    const intent = trigger.config.intent
    return !intent || intent === 'escalado'
  }

  if (trigger.type === 'cambio_estado') {
    return !trigger.config.delay_hours
  }

  if (trigger.type === 'programado' || trigger.type === 'inactividad') {
    return true
  }

  return false
}

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  recepcionista: 'Recepcionista IA',
  comercial: 'Agente Comercial',
  seguimiento: 'Agente de Seguimiento',
  soporte: 'Agente de Soporte',
}

export const INTEGRATION_LABELS: Record<IntegrationProvider, string> = {
  n8n: 'Motor de automatización',
  whatsapp: 'WhatsApp Business',
  telegram: 'Telegram',
  google_calendar: 'Google Calendar',
  gmail: 'Gmail',
  instagram: 'Instagram',
  facebook: 'Facebook',
  stripe: 'Stripe',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  ollama: 'Ollama',
  qdrant: 'Base de conocimiento',
  elevenlabs: 'ElevenLabs',
}

export const INTEGRATION_DESCRIPTIONS: Record<IntegrationProvider, string> = {
  n8n: 'Ejecuta tus automatizaciones en segundo plano',
  whatsapp: 'Recibe y responde mensajes de WhatsApp',
  telegram: 'Recibe y responde mensajes de Telegram',
  google_calendar: 'Crea y consulta citas en tu calendario',
  gmail: 'Envía correos desde tu cuenta',
  instagram: 'Gestiona mensajes directos de Instagram',
  facebook: 'Gestiona mensajes de tu página de Facebook',
  stripe: 'Cobra pagos y suscripciones',
  openai: 'Modelos de IA de OpenAI',
  anthropic: 'Modelos de IA de Anthropic',
  ollama: 'Modelos de IA en tu propio servidor',
  qdrant: 'Almacena el conocimiento de tu negocio',
  elevenlabs: 'Voz natural para llamadas y audios',
}

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  no_conectado: 'No conectado',
  // No es un "conectando" con final: la conexión real llega cuando ese canal
  // esté disponible. Decir "Conectando" indefinidamente parece un fallo.
  conectando: 'En espera',
  conectado: 'Conectado',
  error: 'Error',
}
