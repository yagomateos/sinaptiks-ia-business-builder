import { httpN8nService, isN8nBackendConfigured } from './http-n8n.service'
import { mockN8nService } from './mock-n8n.service'
import type { N8nService } from './types'

/**
 * The rest of the app imports this and nothing else. Whether it is talking to
 * a real n8n instance or the in-memory stand-in is not a caller's concern.
 */
export const n8nService: N8nService = isN8nBackendConfigured
  ? httpN8nService
  : mockN8nService

export const isN8nLive = isN8nBackendConfigured

export type { N8nService, N8nWorkflow, N8nExecution } from './types'
