/**
 * Real n8n backend, reached through our own server.
 *
 * The browser never holds the n8n API key. It calls VITE_API_BASE_URL, which
 * is our backend; that backend adds the n8n credentials server-side.
 */
import { AppError } from '../supabase/errors'
import { supabase } from '../supabase/client'
import type {
  CreateWorkflowInput,
  N8nExecution,
  N8nService,
  N8nWorkflow,
} from './types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

export const isN8nBackendConfigured = Boolean(apiBaseUrl)

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) {
    throw new AppError('El motor de automatización todavía no está conectado.')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    // Las Edge Functions devuelven {"error": "mensaje concreto"} (ver
    // errorResponse en supabase/functions/_shared/auth.ts) — sin esto, un
    // error específico y útil (p. ej. "esto se ejecuta solo, no se puede
    // lanzar a mano") se descartaba y el usuario solo veía un genérico que
    // no explica nada.
    const parsedMessage = (() => {
      try {
        return (JSON.parse(body) as { error?: string }).error
      } catch {
        return undefined
      }
    })()
    throw new AppError(parsedMessage ?? 'El motor de automatización ha devuelto un error.', body)
  }

  return (await response.json()) as T
}

export const httpN8nService: N8nService = {
  createWorkflow: (input: CreateWorkflowInput) =>
    call<N8nWorkflow>('/n8n/workflows', { method: 'POST', body: JSON.stringify(input) }),

  updateWorkflow: (workflowId: string, input: CreateWorkflowInput) =>
    call<N8nWorkflow>(`/n8n/workflows/${workflowId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  activateWorkflow: (workflowId: string) =>
    call<N8nWorkflow>(`/n8n/workflows/${workflowId}/activate`, { method: 'POST' }),

  deactivateWorkflow: (workflowId: string) =>
    call<N8nWorkflow>(`/n8n/workflows/${workflowId}/deactivate`, { method: 'POST' }),

  executeWorkflow: (workflowId: string, payload = {}) =>
    call<N8nExecution>(`/n8n/workflows/${workflowId}/execute`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getWorkflow: (workflowId: string) =>
    call<N8nWorkflow | null>(`/n8n/workflows/${workflowId}`),

  getWorkflowExecutions: (workflowId: string, limit = 20) =>
    call<N8nExecution[]>(`/n8n/workflows/${workflowId}/executions?limit=${limit}`),
}
