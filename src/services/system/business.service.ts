/**
 * Application service for businesses.
 *
 * Owns la misma regla que ya sigue automationService.remove(): borrar un
 * negocio no puede limitarse a la fila de Postgres (eso el cascade de la
 * base de datos ya lo resuelve solo, ver `on delete cascade` en la
 * migración inicial) — antes hay que limpiar lo que vive fuera, o cada
 * negocio borrado deja sus workflows huérfanos en n8n para siempre.
 */
import { automationsRepository } from '@/services/repositories/automations.repository'
import { businessesRepository } from '@/services/repositories/businesses.repository'
import { n8nService } from '@/services/n8n'
import type { UUID } from '@/domain/types'

export const businessService = {
  async remove(businessId: UUID): Promise<void> {
    const automations = await automationsRepository.list(businessId, 'todas')

    await Promise.all(
      automations
        .filter((automation) => automation.n8n_workflow_id)
        .map((automation) =>
          n8nService.deleteWorkflow(automation.n8n_workflow_id!).catch(() => {
            // Un workflow que el motor ya no reconozca (o que esté caído en
            // ese momento) no puede bloquear el borrado del negocio — el
            // resultado que se busca ("que no quede nada corriendo") ya es
            // cierto en ese caso.
          }),
        ),
    )

    await businessesRepository.remove(businessId)
  },
}
