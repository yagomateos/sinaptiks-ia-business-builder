/**
 * Cliente HTTP de n8n. Solo se usa desde Edge Functions: la API key vive en
 * los secretos de Supabase y nunca sale de aquí.
 */
import { HttpError } from './auth.ts'

const baseUrl = (Deno.env.get('N8N_API_URL') ?? '').replace(/\/+$/, '')
const apiKey = Deno.env.get('N8N_API_KEY') ?? ''

export interface N8nWorkflow {
  id: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface N8nExecution {
  id: string
  workflowId: string
  status: 'success' | 'error' | 'running' | 'waiting'
  startedAt: string
  stoppedAt: string | null
  error?: string
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl || !apiKey) {
    throw new HttpError(503, 'El motor de automatización no está configurado')
  }

  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const text = await response.text()

  if (!response.ok) {
    console.error(`n8n ${init?.method ?? 'GET'} ${path} → ${response.status}`, text)
    // El detalle de n8n se queda en los logs; al usuario le llega algo legible.
    throw new HttpError(
      response.status === 404 ? 404 : 502,
      response.status === 404
        ? 'Ese flujo ya no existe en el motor'
        : 'El motor de automatización ha devuelto un error',
    )
  }

  return (text ? JSON.parse(text) : {}) as T
}

/** n8n devuelve muchos más campos; nos quedamos con lo que usa la app. */
function toWorkflow(raw: Record<string, unknown>): N8nWorkflow {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    active: Boolean(raw.active),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
  }
}

export const n8n = {
  async create(workflow: unknown): Promise<N8nWorkflow> {
    return toWorkflow(await call('/workflows', { method: 'POST', body: JSON.stringify(workflow) }))
  },

  async update(id: string, workflow: unknown): Promise<N8nWorkflow> {
    return toWorkflow(
      await call(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(workflow) }),
    )
  },

  async activate(id: string): Promise<N8nWorkflow> {
    return toWorkflow(await call(`/workflows/${id}/activate`, { method: 'POST' }))
  },

  async deactivate(id: string): Promise<N8nWorkflow> {
    return toWorkflow(await call(`/workflows/${id}/deactivate`, { method: 'POST' }))
  },

  async get(id: string): Promise<N8nWorkflow | null> {
    try {
      return toWorkflow(await call(`/workflows/${id}`))
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null
      throw error
    }
  },

  async remove(id: string): Promise<void> {
    await call(`/workflows/${id}`, { method: 'DELETE' })
  },

  async executions(workflowId: string, limit = 20): Promise<N8nExecution[]> {
    const raw = await call<{ data?: Record<string, unknown>[] }>(
      `/executions?workflowId=${encodeURIComponent(workflowId)}&limit=${limit}`,
    )

    return (raw.data ?? []).map((e) => ({
      id: String(e.id),
      workflowId: String(e.workflowId ?? workflowId),
      status: e.finished
        ? 'success'
        : ((e.status as string) === 'error' || e.stoppedAt === null ? 'error' : 'running'),
      startedAt: String(e.startedAt ?? new Date().toISOString()),
      stoppedAt: e.stoppedAt ? String(e.stoppedAt) : null,
    }))
  },

  /**
   * Dispara el workflow por su webhook. La API pública de n8n no permite
   * ejecutar un workflow directamente, así que se llama a su URL de webhook.
   */
  async trigger(webhookPath: string, payload: unknown): Promise<void> {
    const response = await fetch(`${baseUrl}/webhook/${webhookPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`n8n webhook ${webhookPath} → ${response.status}`, body)
      throw new HttpError(
        502,
        response.status === 404
          ? 'La automatización tiene que estar activa para poder probarla'
          : 'El motor no pudo ejecutar la automatización',
      )
    }
  },
}

export const isConfigured = Boolean(baseUrl && apiKey)
