/**
 * In-memory n8n implementation used until a real n8n instance is wired up.
 *
 * It exists so the rest of the app can be written against the final contract:
 * swapping in HttpN8nService must require no caller changes.
 */
import type {
  CreateWorkflowInput,
  N8nExecution,
  N8nService,
  N8nWorkflow,
} from './types'

const workflows = new Map<string, N8nWorkflow>()
const executions = new Map<string, N8nExecution[]>()

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function workflowId(): string {
  return `wf_${Math.random().toString(36).slice(2, 12)}`
}

export const mockN8nService: N8nService = {
  async createWorkflow(input: CreateWorkflowInput): Promise<N8nWorkflow> {
    await delay(220)
    const now = new Date().toISOString()
    const workflow: N8nWorkflow = {
      id: workflowId(),
      name: `[${input.businessId.slice(0, 8)}] ${input.automation.name}`,
      active: false,
      createdAt: now,
      updatedAt: now,
    }
    workflows.set(workflow.id, workflow)
    executions.set(workflow.id, [])
    return workflow
  },

  async updateWorkflow(id: string, input: CreateWorkflowInput): Promise<N8nWorkflow> {
    await delay(160)
    const existing = workflows.get(id)
    if (!existing) throw new Error('El flujo no existe')

    const updated: N8nWorkflow = {
      ...existing,
      name: `[${input.businessId.slice(0, 8)}] ${input.automation.name}`,
      updatedAt: new Date().toISOString(),
    }
    workflows.set(id, updated)
    return updated
  },

  async activateWorkflow(id: string): Promise<N8nWorkflow> {
    await delay(160)
    return setActive(id, true)
  },

  async deactivateWorkflow(id: string): Promise<N8nWorkflow> {
    await delay(160)
    return setActive(id, false)
  },

  async executeWorkflow(id: string, payload = {}): Promise<N8nExecution> {
    await delay(400)
    const startedAt = new Date().toISOString()
    const execution: N8nExecution = {
      id: `ex_${Math.random().toString(36).slice(2, 12)}`,
      workflowId: id,
      status: 'success',
      startedAt,
      stoppedAt: new Date().toISOString(),
    }

    if ('forceError' in payload) {
      execution.status = 'error'
      execution.error = 'Fallo simulado de ejecución'
    }

    executions.set(id, [execution, ...(executions.get(id) ?? [])])
    return execution
  },

  async getWorkflow(id: string): Promise<N8nWorkflow | null> {
    await delay(80)
    return workflows.get(id) ?? null
  },

  async getWorkflowExecutions(id: string, limit = 20): Promise<N8nExecution[]> {
    await delay(120)
    return (executions.get(id) ?? []).slice(0, limit)
  },
}

function setActive(id: string, active: boolean): N8nWorkflow {
  const existing = workflows.get(id)
  if (!existing) throw new Error('El flujo no existe')
  const updated = { ...existing, active, updatedAt: new Date().toISOString() }
  workflows.set(id, updated)
  return updated
}
