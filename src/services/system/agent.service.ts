/**
 * Application service for AI agents.
 *
 * Owns la misma regla que la UI no debe imponer por su cuenta: activar un
 * agente está sujeto al límite de agentes activos del plan del negocio (ver
 * plan-quota.ts). Antes, `agents-page.tsx` y `agent-detail-page.tsx` escribían
 * directo al repositorio y nada comprobaba esto.
 */
import { agentsRepository } from '@/services/repositories/agents.repository'
import { activityRepository } from '@/services/repositories/activity.repository'
import { assertCanActivateAgent } from '@/services/system/plan-quota'
import type { AgentStatus, AiAgent } from '@/domain/types'

export const agentService = {
  async setStatus(agent: AiAgent, status: AgentStatus): Promise<AiAgent> {
    if (status === 'activo') {
      await assertCanActivateAgent(agent.business_id, () => agentsRepository.countActive(agent.business_id))
    }

    const updated = await agentsRepository.update(agent.id, { status })

    await activityRepository.log({
      businessId: agent.business_id,
      action: status === 'activo' ? `Agente activado: ${agent.name}` : `Agente pausado: ${agent.name}`,
      entityType: 'agent',
      entityId: agent.id,
    })

    return updated
  },
}
