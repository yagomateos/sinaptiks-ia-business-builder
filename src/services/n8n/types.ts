import type { Automation } from '@/domain/types'

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

export interface CreateWorkflowInput {
  businessId: string
  automation: Automation
}

/**
 * The contract every n8n backend must satisfy.
 *
 * Implementations never run in the browser with credentials: the HTTP
 * implementation calls our own server, which holds the n8n API key.
 */
export interface N8nService {
  createWorkflow(input: CreateWorkflowInput): Promise<N8nWorkflow>
  updateWorkflow(workflowId: string, input: CreateWorkflowInput): Promise<N8nWorkflow>
  activateWorkflow(workflowId: string): Promise<N8nWorkflow>
  deactivateWorkflow(workflowId: string): Promise<N8nWorkflow>
  executeWorkflow(workflowId: string, payload?: Record<string, unknown>): Promise<N8nExecution>
  getWorkflow(workflowId: string): Promise<N8nWorkflow | null>
  getWorkflowExecutions(workflowId: string, limit?: number): Promise<N8nExecution[]>
}
