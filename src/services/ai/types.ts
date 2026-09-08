import type { BusinessSystem } from '@/domain/engine/business-system-generator'
import type { GeneratedAgent } from '@/domain/engine/agent-generator'
import type {
  AgentType,
  AiAgent,
  BusinessProfile,
  LeadTemperature,
  Message,
  Service,
} from '@/domain/types'

export interface BusinessAnalysis {
  /** One-paragraph read of the business, in the user's language. */
  summary: string
  strengths: string[]
  opportunities: string[]
  /** Highest-impact next moves, ordered. */
  priorities: string[]
}

export interface BusinessStrategy {
  headline: string
  focus: string
  quickWins: string[]
  ninetyDayPlan: { phase: string; goal: string; actions: string[] }[]
}

export interface LeadClassification {
  temperature: LeadTemperature
  intent: string
  confidence: number
  reasoning: string
}

export interface ConversationSummary {
  summary: string
  nextAction: string | null
  sentiment: 'positivo' | 'neutro' | 'negativo'
}

export interface GenerateReplyInput {
  agent: AiAgent
  profile: BusinessProfile
  services: Service[]
  history: Message[]
  incomingMessage: string
}

export interface AiContext {
  profile: BusinessProfile
  services: Service[]
}

/**
 * The AI capability surface of the product.
 *
 * Every provider implements this. Components depend on the interface, never on
 * a provider — swapping Anthropic for Ollama changes one env var.
 */
export interface AiService {
  readonly providerKey: string
  readonly isLive: boolean

  analyzeBusiness(context: AiContext): Promise<BusinessAnalysis>
  generateBusinessStrategy(context: AiContext): Promise<BusinessStrategy>
  generateBusinessSystem(context: AiContext): Promise<BusinessSystem>
  generateAgent(context: AiContext, agentType: AgentType): Promise<GeneratedAgent>
  generatePrompt(context: AiContext, agentType: AgentType): Promise<string>
  classifyLead(context: AiContext, text: string): Promise<LeadClassification>
  summarizeConversation(context: AiContext, messages: Message[]): Promise<ConversationSummary>
  generateReply(input: GenerateReplyInput): Promise<string>
}
