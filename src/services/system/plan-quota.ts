/**
 * Comprueba el límite del plan antes de activar una automatización o un
 * agente — la página de Ajustes → Facturación promete "hasta N
 * automatizaciones activas" / "hasta N agentes IA" por plan, pero hasta
 * ahora nada lo hacía cumplir: un negocio en Starter podía activar tantas
 * automatizaciones o agentes como uno en Scale.
 *
 * Sin negocio con plan asignado (no debería pasar: el trigger de la base de
 * datos crea uno en 'starter' al crear el negocio), se trata como Starter —
 * el plan más restrictivo, nunca el más permisivo. La decisión en sí
 * (`checkPlanQuota`) es lógica pura de dominio; aquí solo se resuelve la
 * parte de I/O (leer la suscripción real, contar los activos reales).
 */
import { subscriptionsRepository } from '@/services/repositories/subscriptions.repository'
import { AppError } from '@/services/supabase/errors'
import { checkPlanQuota, type PlanQuotaKind } from '@/domain/catalog/plan-limits'
import type { PlanKey, UUID } from '@/domain/types'

async function currentPlan(businessId: UUID): Promise<PlanKey> {
  const subscription = await subscriptionsRepository.getByBusiness(businessId)
  return subscription?.plan ?? 'starter'
}

async function assertQuota(
  kind: PlanQuotaKind,
  businessId: UUID,
  countActive: () => Promise<number>,
  message: (limit: number) => string,
): Promise<void> {
  const plan = await currentPlan(businessId)
  const active = await countActive()
  const result = checkPlanQuota(plan, kind, active)
  if (!result.allowed) throw new AppError(message(result.limit))
}

export function assertCanActivateAutomation(businessId: UUID, countActive: () => Promise<number>): Promise<void> {
  return assertQuota(
    'automations',
    businessId,
    countActive,
    (limit) =>
      `Tu plan actual permite hasta ${limit} automatización${limit === 1 ? '' : 'es'} activa${limit === 1 ? '' : 's'} a la vez. Pausa otra o mejora de plan para activar esta.`,
  )
}

export function assertCanActivateAgent(businessId: UUID, countActive: () => Promise<number>): Promise<void> {
  return assertQuota(
    'agents',
    businessId,
    countActive,
    (limit) =>
      `Tu plan actual permite hasta ${limit} agente${limit === 1 ? '' : 's'} IA activo${limit === 1 ? '' : 's'} a la vez. Pausa otro o mejora de plan para activar este.`,
  )
}
