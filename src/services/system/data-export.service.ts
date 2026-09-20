/**
 * Exportar todos los datos de un negocio — el dueño tiene derecho a una
 * copia completa (portabilidad de datos), no solo a lo que se ve pantalla
 * por pantalla. Reutiliza los repositorios existentes en vez de abrir una
 * ruta paralela a Supabase: la única pieza nueva aquí es juntarlos.
 *
 * Los mensajes de cada conversación y las citas de cada contacto se piden
 * en paralelo, no con una consulta masiva — es una acción explícita y poco
 * frecuente (el dueño la pide desde Ajustes), no una pantalla que se
 * renderiza constantemente, así que el coste de varias peticiones no
 * importa tanto como reutilizar los métodos que ya existen.
 */
import { businessesRepository } from '@/services/repositories/businesses.repository'
import { businessProfileRepository } from '@/services/repositories/business-profile.repository'
import { leadsRepository } from '@/services/repositories/leads.repository'
import { conversationsRepository } from '@/services/repositories/conversations.repository'
import { automationsRepository } from '@/services/repositories/automations.repository'
import { agentsRepository } from '@/services/repositories/agents.repository'
import { appointmentsRepository } from '@/services/repositories/appointments.repository'
import { subscriptionsRepository } from '@/services/repositories/subscriptions.repository'
import { integrationsRepository } from '@/services/repositories/integrations.repository'
import type { UUID } from '@/domain/types'

// leadsRepository.list/conversationsRepository.list limitan a 200 filas por
// defecto (para que la pantalla no se ralentice con miles de contactos) —
// una exportación de verdad quiere todo lo que sea razonable llevarse en un
// único JSON, así que pide explícitamente muchas más.
const EXPORT_ROW_LIMIT = 5000

export const dataExportService = {
  async exportBusiness(businessId: UUID): Promise<Record<string, unknown>> {
    const [business, businessProfile, services, leads, conversations, automations, agents, integrations, subscription] =
      await Promise.all([
        businessesRepository.getById(businessId),
        businessProfileRepository.get(businessId),
        businessProfileRepository.listServices(businessId),
        leadsRepository.list(businessId, {}, { limit: EXPORT_ROW_LIMIT }),
        conversationsRepository.list(businessId, 'todas', { limit: EXPORT_ROW_LIMIT }),
        automationsRepository.list(businessId, 'todas'),
        agentsRepository.list(businessId),
        integrationsRepository.list(businessId),
        subscriptionsRepository.getByBusiness(businessId),
      ])

    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conversation) => ({
        ...conversation,
        messages: await conversationsRepository.listMessages(conversation.id),
      })),
    )

    const appointments = (
      await Promise.all(leads.map((lead) => appointmentsRepository.listForLead(lead.id)))
    ).flat()

    return {
      exported_at: new Date().toISOString(),
      business,
      business_profile: businessProfile,
      services,
      leads,
      conversations: conversationsWithMessages,
      appointments,
      automations,
      agents,
      integrations,
      subscription,
    }
  },
}
