import type { PlanKey } from '@/domain/types'

/**
 * Cuántas automatizaciones y agentes ACTIVOS permite cada plan — no los que
 * existen en borrador, solo los que de verdad consumen ejecución real
 * (workflows corriendo en n8n, agentes respondiendo a clientes).
 *
 * Son los mismos números que se muestran en Ajustes → Facturación
 * (`settings-page.tsx`): si cambian aquí, cambian ahí también, porque esa
 * página los lee de esta misma tabla.
 */
export interface PlanLimits {
  /** `null` = sin límite. */
  maxActiveAutomations: number | null
  maxActiveAgents: number | null
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  starter: { maxActiveAutomations: 3, maxActiveAgents: 1 },
  growth: { maxActiveAutomations: null, maxActiveAgents: 3 },
  scale: { maxActiveAutomations: null, maxActiveAgents: null },
}

export type PlanQuotaKind = 'automations' | 'agents'

export type PlanQuotaResult = { allowed: true } | { allowed: false; limit: number }

/**
 * Decisión pura de "¿cabe una más?" — sin tocar Supabase ni nada externo,
 * para poder probarla sin mocks. La parte de I/O (leer la suscripción real,
 * contar los activos reales) vive en `plan-quota.ts`.
 */
export function checkPlanQuota(plan: PlanKey, kind: PlanQuotaKind, activeCount: number): PlanQuotaResult {
  const limit = kind === 'automations' ? PLAN_LIMITS[plan].maxActiveAutomations : PLAN_LIMITS[plan].maxActiveAgents
  if (limit === null) return { allowed: true }
  return activeCount < limit ? { allowed: true } : { allowed: false, limit }
}
