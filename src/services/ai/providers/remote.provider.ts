/**
 * Remote model providers (Anthropic, OpenAI, Ollama).
 *
 * All three share one transport: our own backend. The browser never holds a
 * model API key — it sends the request to VITE_API_BASE_URL with the user's
 * Supabase session token, and the backend adds the provider credentials.
 *
 * Every method falls back to the rule-based provider if the call fails, so a
 * provider outage degrades the product instead of breaking it.
 */
import { supabase } from '@/services/supabase/client'
import type { AgentType, AiProviderKey, Message } from '@/domain/types'
import { rulesProvider } from './rules.provider'
import type {
  AiContext,
  AiService,
  BusinessAnalysis,
  BusinessStrategy,
  ConversationSummary,
  GenerateReplyInput,
  LeadClassification,
} from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

export function createRemoteProvider(providerKey: AiProviderKey): AiService {
  async function call<T>(operation: string, body: unknown, fallback: () => Promise<T>): Promise<T> {
    if (!apiBaseUrl) return fallback()

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      const response = await fetch(`${apiBaseUrl}/ai/${operation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ provider: providerKey, ...(body as object) }),
      })

      if (!response.ok) throw new Error(`AI backend respondió ${response.status}`)
      return (await response.json()) as T
    } catch (error) {
      console.warn(`IA (${operation}) no disponible, usando reglas locales`, error)
      return fallback()
    }
  }

  return {
    providerKey,
    isLive: Boolean(apiBaseUrl),

    analyzeBusiness: (context: AiContext) =>
      call<BusinessAnalysis>('analyze-business', serialize(context), () =>
        rulesProvider.analyzeBusiness(context),
      ),

    generateBusinessStrategy: (context: AiContext) =>
      call<BusinessStrategy>('business-strategy', serialize(context), () =>
        rulesProvider.generateBusinessStrategy(context),
      ),

    // The system proposal stays rule-based on purpose: it must be deterministic
    // and instant. A model refines the copy later, not the structure.
    generateBusinessSystem: (context: AiContext) =>
      rulesProvider.generateBusinessSystem(context),

    generateAgent: (context: AiContext, agentType: AgentType) =>
      call('generate-agent', { ...serialize(context), agentType }, () =>
        rulesProvider.generateAgent(context, agentType),
      ),

    generatePrompt: (context: AiContext, agentType: AgentType) =>
      call<string>('generate-prompt', { ...serialize(context), agentType }, () =>
        rulesProvider.generatePrompt(context, agentType),
      ),

    classifyLead: (context: AiContext, text: string) =>
      call<LeadClassification>('classify-lead', { ...serialize(context), text }, () =>
        rulesProvider.classifyLead(context, text),
      ),

    summarizeConversation: (context: AiContext, messages: Message[]) =>
      call<ConversationSummary>(
        'summarize-conversation',
        { ...serialize(context), messages: messages.map(toWireMessage) },
        () => rulesProvider.summarizeConversation(context, messages),
      ),

    generateReply: (input: GenerateReplyInput) =>
      call<string>(
        'generate-reply',
        {
          agentId: input.agent.id,
          model: input.agent.model,
          systemPrompt: input.agent.system_prompt,
          history: input.history.map(toWireMessage),
          incomingMessage: input.incomingMessage,
        },
        () => rulesProvider.generateReply(input),
      ),
  }
}

function serialize(context: AiContext) {
  return { profile: context.profile, services: context.services }
}

function toWireMessage(message: Message) {
  return { role: message.role, content: message.content, at: message.created_at }
}
