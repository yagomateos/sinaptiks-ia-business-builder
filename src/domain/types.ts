/**
 * Core domain types for Sinaptkis AI Business Builder.
 * Pure TypeScript — no React, no Supabase, no I/O.
 */

export type UUID = string
export type ISODate = string

/* ------------------------------------------------------------------ */
/* Identity & tenancy                                                  */
/* ------------------------------------------------------------------ */

export type MemberRole = 'owner' | 'admin' | 'member'
export type PlatformRole = 'user' | 'super_admin'

export interface Profile {
  id: UUID
  email: string
  full_name: string | null
  avatar_url: string | null
  platform_role: PlatformRole
  created_at: ISODate
  updated_at: ISODate
}

export interface Business {
  id: UUID
  owner_id: UUID
  name: string
  slug: string
  industry: Industry
  website: string | null
  city: string | null
  country: string | null
  description: string | null
  logo_url: string | null
  onboarding_completed: boolean
  system_generated_at: ISODate | null
  created_at: ISODate
  updated_at: ISODate
}

export interface BusinessMember {
  id: UUID
  business_id: UUID
  user_id: UUID
  role: MemberRole
  created_at: ISODate
}

/* ------------------------------------------------------------------ */
/* Industry / goals / channels vocabularies                            */
/* ------------------------------------------------------------------ */

export const INDUSTRIES = [
  'clinica',
  'restaurante',
  'psicologo',
  'inmobiliaria',
  'peluqueria',
  'gimnasio',
  'abogado',
  'ecommerce',
  'servicios_profesionales',
  'otro',
] as const
export type Industry = (typeof INDUSTRIES)[number]

export const BUSINESS_GOALS = [
  'mas_clientes',
  'mas_reservas',
  'responder_rapido',
  'automatizar_whatsapp',
  'automatizar_ventas',
  'recuperar_clientes',
  'automatizar_soporte',
  'conseguir_resenas',
  'reducir_admin',
  'automatizar_marketing',
] as const
export type BusinessGoal = (typeof BUSINESS_GOALS)[number]

export const CONTACT_CHANNELS = [
  'whatsapp',
  'web',
  'instagram',
  'facebook',
  'email',
  'telefono',
  'google_business',
] as const
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]

/* ------------------------------------------------------------------ */
/* Business profile — the context object for AI agents                 */
/* ------------------------------------------------------------------ */

export interface BusinessHours {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
  open: string | null
  close: string | null
  closed: boolean
}

export interface FaqEntry {
  question: string
  answer: string
}

export interface ObjectionEntry {
  objection: string
  response: string
}

export interface BusinessProfile {
  id: UUID
  business_id: UUID
  business_name: string
  industry: Industry
  description: string | null
  location: string | null
  website: string | null
  ideal_customer: string | null
  value_proposition: string | null
  brand_voice: BrandVoice
  business_hours: BusinessHours[]
  contact_channels: ContactChannel[]
  goals: BusinessGoal[]
  faq: FaqEntry[]
  objections: ObjectionEntry[]
  policies: string | null
  created_at: ISODate
  updated_at: ISODate
}

export const BRAND_VOICES = [
  'cercano',
  'profesional',
  'entusiasta',
  'directo',
  'empatico',
] as const
export type BrandVoice = (typeof BRAND_VOICES)[number]

export interface Service {
  id: UUID
  business_id: UUID
  name: string
  description: string | null
  price: number | null
  currency: string
  duration_minutes: number | null
  url: string | null
  features: string[]
  is_active: boolean
  created_at: ISODate
  updated_at: ISODate
}

/* ------------------------------------------------------------------ */
/* CRM                                                                 */
/* ------------------------------------------------------------------ */

export const LEAD_STAGES = [
  'nuevo',
  'contactado',
  'cualificado',
  'cita',
  'cliente',
  'perdido',
] as const
export type LeadStage = (typeof LEAD_STAGES)[number]

export const LEAD_TEMPERATURES = ['frio', 'templado', 'caliente'] as const
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number]

export interface Lead {
  id: UUID
  business_id: UUID
  full_name: string
  email: string | null
  phone: string | null
  source: ContactChannel | 'manual' | 'importado'
  stage: LeadStage
  temperature: LeadTemperature
  notes: string | null
  value_estimate: number | null
  last_contacted_at: ISODate | null
  next_action: string | null
  next_action_at: ISODate | null
  assigned_agent_id: UUID | null
  created_at: ISODate
  updated_at: ISODate
}

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

export type ConversationStatus = 'abierta' | 'pendiente' | 'cerrada'
export type ConversationHandler = 'agente_ia' | 'humano'
export type MessageRole = 'contacto' | 'agente_ia' | 'humano' | 'sistema'

export interface Conversation {
  id: UUID
  business_id: UUID
  lead_id: UUID | null
  channel: ContactChannel
  subject: string | null
  status: ConversationStatus
  handled_by: ConversationHandler
  assigned_agent_id: UUID | null
  last_message_at: ISODate | null
  unread_count: number
  created_at: ISODate
  updated_at: ISODate
}

export interface Message {
  id: UUID
  conversation_id: UUID
  business_id: UUID
  role: MessageRole
  content: string
  metadata: Record<string, unknown>
  created_at: ISODate
}

/* ------------------------------------------------------------------ */
/* Automations                                                         */
/* ------------------------------------------------------------------ */

export const AUTOMATION_STATUSES = [
  'borrador',
  'preparada',
  'activa',
  'pausada',
  'error',
] as const
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number]

export const AUTOMATION_CATEGORIES = [
  'captacion',
  'atencion',
  'ventas',
  'reservas',
  'seguimiento',
  'fidelizacion',
  'reputacion',
  'administracion',
] as const
export type AutomationCategory = (typeof AUTOMATION_CATEGORIES)[number]

export interface AutomationTrigger {
  type:
    | 'nuevo_lead'
    | 'mensaje_entrante'
    | 'cambio_estado'
    | 'programado'
    | 'cita_creada'
    | 'inactividad'
    | 'manual'
  description: string
  config: Record<string, unknown>
}

export interface AutomationAction {
  type:
    | 'enviar_whatsapp'
    | 'enviar_email'
    | 'crear_lead'
    | 'actualizar_lead'
    | 'agendar_cita'
    | 'notificar_equipo'
    | 'responder_ia'
    | 'esperar'
    | 'solicitar_resena'
  description: string
  config: Record<string, unknown>
}

export interface Automation {
  id: UUID
  business_id: UUID
  template_key: string | null
  name: string
  description: string | null
  category: AutomationCategory
  status: AutomationStatus
  trigger: AutomationTrigger
  actions: AutomationAction[]
  configuration: Record<string, unknown>
  n8n_workflow_id: string | null
  last_execution_at: ISODate | null
  execution_count: number
  error_count: number
  created_at: ISODate
  updated_at: ISODate
}

export type ExecutionStatus = 'exito' | 'error' | 'en_curso' | 'cancelada'

export interface AutomationExecution {
  id: UUID
  automation_id: UUID
  business_id: UUID
  status: ExecutionStatus
  n8n_execution_id: string | null
  started_at: ISODate
  finished_at: ISODate | null
  duration_ms: number | null
  error_message: string | null
  payload: Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/* AI agents                                                           */
/* ------------------------------------------------------------------ */

export const AGENT_TYPES = [
  'recepcionista',
  'comercial',
  'seguimiento',
  'soporte',
] as const
export type AgentType = (typeof AGENT_TYPES)[number]

export type AgentStatus = 'borrador' | 'activo' | 'pausado'

export interface AgentHandoffRules {
  escalate_on_keywords: string[]
  escalate_after_turns: number
  escalate_on_negative_sentiment: boolean
  escalation_message: string
}

export interface AiAgent {
  id: UUID
  business_id: UUID
  type: AgentType
  name: string
  description: string | null
  objective: string
  personality: string
  rules: string[]
  system_prompt: string
  model: string
  provider: AiProviderKey
  channels: ContactChannel[]
  allowed_actions: string[]
  handoff_rules: AgentHandoffRules
  status: AgentStatus
  created_at: ISODate
  updated_at: ISODate
}

/* ------------------------------------------------------------------ */
/* Knowledge base / RAG                                                */
/* ------------------------------------------------------------------ */

export type KnowledgeSourceType = 'pdf' | 'txt' | 'docx' | 'url' | 'faq' | 'servicio' | 'texto'
export type KnowledgeStatus = 'pendiente' | 'procesando' | 'listo' | 'error'

export interface KnowledgeDocument {
  id: UUID
  business_id: UUID
  title: string
  source_type: KnowledgeSourceType
  source_url: string | null
  storage_path: string | null
  content: string | null
  status: KnowledgeStatus
  chunk_count: number
  error_message: string | null
  created_at: ISODate
  updated_at: ISODate
}

export interface KnowledgeChunk {
  id: UUID
  document_id: UUID
  business_id: UUID
  chunk_index: number
  content: string
  token_count: number | null
  vector_id: string | null
  created_at: ISODate
}

/* ------------------------------------------------------------------ */
/* Integrations                                                        */
/* ------------------------------------------------------------------ */

export const INTEGRATION_PROVIDERS = [
  'n8n',
  'whatsapp',
  'google_calendar',
  'gmail',
  'instagram',
  'facebook',
  'stripe',
  'openai',
  'anthropic',
  'ollama',
  'qdrant',
  'elevenlabs',
] as const
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]

export const INTEGRATION_STATUSES = [
  'no_conectado',
  'conectando',
  'conectado',
  'error',
] as const
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number]

export interface Integration {
  id: UUID
  business_id: UUID
  provider: IntegrationProvider
  status: IntegrationStatus
  /** Non-sensitive display config only. Secrets live server-side. */
  config: Record<string, unknown>
  connected_at: ISODate | null
  last_error: string | null
  created_at: ISODate
  updated_at: ISODate
}

/* ------------------------------------------------------------------ */
/* Activity, notifications, billing                                    */
/* ------------------------------------------------------------------ */

export interface ActivityLog {
  id: UUID
  business_id: UUID
  actor_id: UUID | null
  actor_label: string
  action: string
  entity_type: string | null
  entity_id: UUID | null
  metadata: Record<string, unknown>
  created_at: ISODate
}

export type NotificationLevel = 'info' | 'exito' | 'aviso' | 'error'

export interface Notification {
  id: UUID
  business_id: UUID
  user_id: UUID | null
  level: NotificationLevel
  title: string
  body: string | null
  read_at: ISODate | null
  created_at: ISODate
}

export type PlanKey = 'starter' | 'growth' | 'scale'
export type SubscriptionStatus = 'trial' | 'activa' | 'morosa' | 'cancelada'

export interface Subscription {
  id: UUID
  business_id: UUID
  plan: PlanKey
  status: SubscriptionStatus
  trial_ends_at: ISODate | null
  current_period_end: ISODate | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: ISODate
  updated_at: ISODate
}

/* ------------------------------------------------------------------ */
/* AI provider abstraction                                             */
/* ------------------------------------------------------------------ */

export type AiProviderKey = 'anthropic' | 'openai' | 'ollama' | 'rules'
