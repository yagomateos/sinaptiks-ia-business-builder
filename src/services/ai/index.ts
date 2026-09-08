import type { AiProviderKey } from '@/domain/types'
import { createRemoteProvider } from './providers/remote.provider'
import { rulesProvider } from './providers/rules.provider'
import type { AiService } from './types'

export const anthropicProvider = createRemoteProvider('anthropic')
export const openAiProvider = createRemoteProvider('openai')
export const ollamaProvider = createRemoteProvider('ollama')

const PROVIDERS: Record<AiProviderKey, AiService> = {
  anthropic: anthropicProvider,
  openai: openAiProvider,
  ollama: ollamaProvider,
  rules: rulesProvider,
}

const configuredProvider = (import.meta.env.VITE_AI_PROVIDER as AiProviderKey) || 'rules'
const hasBackend = Boolean(import.meta.env.VITE_API_BASE_URL)

/**
 * The single AI entry point for the whole app.
 *
 * Without a backend there is nowhere to hold model credentials, so the
 * rule-based provider is used — the product still works end to end.
 */
export const aiService: AiService =
  hasBackend && PROVIDERS[configuredProvider] ? PROVIDERS[configuredProvider] : rulesProvider

export function getProvider(key: AiProviderKey): AiService {
  return PROVIDERS[key] ?? rulesProvider
}

export { rulesProvider }
export type { AiService } from './types'
export * from './types'
