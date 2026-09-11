/**
 * Application service for automations.
 *
 * Owns the rule that the UI must not: an automation can only go live once it
 * has a workflow in the execution engine.
 */
import { n8nService } from '@/services/n8n'
import { automationsRepository } from '@/services/repositories/automations.repository'
import { activityRepository } from '@/services/repositories/activity.repository'
import { AppError } from '@/services/supabase/errors'
import type { Automation, UUID } from '@/domain/types'

export const automationService = {
  /** Creates the workflow if needed, then activates it. */
  async activate(automation: Automation): Promise<Automation> {
    let workflowId = automation.n8n_workflow_id

    if (!workflowId) {
      const workflow = await n8nService.createWorkflow({
        businessId: automation.business_id,
        automation,
      })
      workflowId = workflow.id
    }

    await n8nService.activateWorkflow(workflowId)

    const updated = await automationsRepository.update(automation.id, {
      n8n_workflow_id: workflowId,
      status: 'activa',
    })

    await activityRepository.log({
      businessId: automation.business_id,
      action: `Automatización activada: ${automation.name}`,
      entityType: 'automation',
      entityId: automation.id,
    })

    return updated
  },

  async pause(automation: Automation): Promise<Automation> {
    if (automation.n8n_workflow_id) {
      await n8nService.deactivateWorkflow(automation.n8n_workflow_id)
    }

    const updated = await automationsRepository.update(automation.id, { status: 'pausada' })

    await activityRepository.log({
      businessId: automation.business_id,
      action: `Automatización pausada: ${automation.name}`,
      entityType: 'automation',
      entityId: automation.id,
    })

    return updated
  },

  /** Runs the automation once so the user can see it work. */
  async runOnce(automation: Automation): Promise<void> {
    if (!automation.n8n_workflow_id) {
      throw new AppError('Activa la automatización antes de probarla.')
    }

    const startedAt = Date.now()
    const execution = await n8nService.executeWorkflow(automation.n8n_workflow_id, {
      trigger: 'manual',
    })

    await automationsRepository.recordExecution({
      automationId: automation.id,
      businessId: automation.business_id,
      status: execution.status === 'success' ? 'exito' : 'error',
      n8nExecutionId: execution.id,
      durationMs: Date.now() - startedAt,
      errorMessage: execution.error ?? null,
      payload: { trigger: 'manual' },
    })
  },

  /**
   * "Sincronizar ahora" / "Reintentar". Antes, nada llamaba nunca a
   * n8nService.updateWorkflow tras la creación — un cambio en la
   * automatización podía quedarse solo en la base de datos, con el workflow
   * real de n8n congelado en la versión con la que se creó. El estado
   * (`sync_status`/`sync_error`/`workflow_version`) lo escribe la propia
   * Edge Function al hacer la llamada real — nunca se marca aquí "a mano"
   * como sincronizado.
   */
  async resync(automation: Automation): Promise<Automation> {
    if (!automation.n8n_workflow_id) {
      const workflow = await n8nService.createWorkflow({ businessId: automation.business_id, automation })
      return automationsRepository.update(automation.id, { n8n_workflow_id: workflow.id })
    }

    await n8nService.updateWorkflow(automation.n8n_workflow_id, {
      businessId: automation.business_id,
      automation,
    })
    return automationsRepository.getById(automation.id)
  },

  async syncStatus(automation: Automation): Promise<Automation> {
    if (!automation.n8n_workflow_id) return automation

    const workflow = await n8nService.getWorkflow(automation.n8n_workflow_id)
    if (!workflow) {
      return automationsRepository.update(automation.id, {
        n8n_workflow_id: null,
        status: 'borrador',
      })
    }

    const expected = workflow.active ? 'activa' : 'pausada'
    if (automation.status === expected || automation.status === 'error') return automation

    return automationsRepository.update(automation.id, { status: expected })
  },

  async remove(automation: Automation): Promise<void> {
    // Si n8n no confirma la desactivación, no se borra la fila local: perder
    // `n8n_workflow_id` dejaría el workflow real huérfano y activo, capaz de
    // seguir mandando mensajes a leads reales sin que nada lo indique.
    if (automation.n8n_workflow_id) {
      await n8nService.deactivateWorkflow(automation.n8n_workflow_id)
    }
    await automationsRepository.remove(automation.id)
  },

  async listExecutions(businessId: UUID, automationId?: UUID) {
    return automationsRepository.listExecutions(businessId, automationId)
  },
}
