import type { AiProviderKey } from '@/domain/types'

export interface ModelOption {
  id: string
  label: string
  provider: AiProviderKey
  /** Shown in advanced settings only. */
  hint: string
}

/**
 * Models offered in the agent editor.
 * The user picks a label; the id is what the backend sends to the provider.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'claude-opus-5',
    label: 'Máxima calidad',
    provider: 'anthropic',
    hint: 'Claude Opus 5 — la mejor conversación, ideal para ventas y casos delicados.',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Equilibrado',
    provider: 'anthropic',
    hint: 'Claude Sonnet 5 — buen resultado con menor coste por conversación.',
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Máxima velocidad',
    provider: 'anthropic',
    hint: 'Claude Haiku 4.5 — respuestas muy rápidas para consultas sencillas.',
  },
  {
    id: 'gpt-4.1',
    label: 'OpenAI',
    provider: 'openai',
    hint: 'Requiere conectar tu cuenta de OpenAI.',
  },
  {
    id: 'llama3.1',
    label: 'En tu servidor',
    provider: 'ollama',
    hint: 'Requiere un servidor Ollama accesible desde el motor.',
  },
]

export const DEFAULT_MODEL_ID = 'claude-opus-5'
export const DEFAULT_PROVIDER: AiProviderKey = 'anthropic'

export function findModel(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((m) => m.id === id)
}
