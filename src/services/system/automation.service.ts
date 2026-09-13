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

  /**
   * Lanza la automatización una vez para que el usuario la vea funcionar.
   *
   * Esto solo dispara el webhook de n8n — `executeWorkflow` siempre devuelve
   * `status: 'success'` en cuanto n8n ACEPTA la petición, mucho antes de que
   * el workflow real termine de ejecutarse. El resultado de verdad (éxito o
   * error de cada paso) lo escribe `n8n-callback` por su cuenta cuando el
   * workflow llega al final, exactamente igual que para cualquier disparo
   * real. Registrar aquí un "éxito" a partir de esa respuesta inmediata
   * duplicaría esa fila con un resultado inventado — y, si el workflow
   * fallaba de verdad segundos después, el historial mostraría un "éxito"
   * falso junto al error real en vez de reemplazarlo.
   */
  async runOnce(automation: Automation): Promise<void> {
    if (!automation.n8n_workflow_id) {
      throw new AppError('Activa la automatización antes de probarla.')
    }

    await n8nService.executeWorkflow(automation.n8n_workflow_id, {
      trigger: 'manual',
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
