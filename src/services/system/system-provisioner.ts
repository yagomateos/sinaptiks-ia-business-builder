/**
 * Turns the generated BusinessSystem into persisted rows.
 *
 * This is the seam between the pure domain engine and the database: the
 * generator decides *what* the system is, this decides how it is stored.
 */
import { aiService } from '@/services/ai'
import { DEFAULT_MODEL_ID, DEFAULT_PROVIDER } from '@/services/ai/models'
import { agentsRepository, type AiAgentDraft } from '@/services/repositories/agents.repository'
import {
  automationsRepository,
  type AutomationDraft,
} from '@/services/repositories/automations.repository'
import { businessesRepository } from '@/services/repositories/businesses.repository'
import { integrationsRepository } from '@/services/repositories/integrations.repository'
import { knowledgeRepository } from '@/services/repositories/knowledge.repository'
import { activityRepository } from '@/services/repositories/activity.repository'
import type { BusinessSystem } from '@/domain/engine/business-system-generator'
import type { BusinessProfile, Service, UUID } from '@/domain/types'

export interface ProvisionResult {
  system: BusinessSystem
  automationCount: number
  agentCount: number
  integrationCount: number
}

export const systemProvisioner = {
  /** Preview only — computes the proposal without writing anything. */
  async preview(profile: BusinessProfile, services: Service[]): Promise<BusinessSystem> {
    return aiService.generateBusinessSystem({ profile, services })
  },

  /** Generates and persists the full system for a business. */
  async provision(
    businessId: UUID,
    profile: BusinessProfile,
    services: Service[],
  ): Promise<ProvisionResult> {
    const system = await aiService.generateBusinessSystem({ profile, services })

    const automationDrafts: AutomationDraft[] = system.automations.map((automation) => ({
      business_id: businessId,
      template_key: automation.templateKey,
      name: automation.name,
      description: automation.description,
      category: automation.category,
      status: 'preparada',
      trigger: automation.trigger,
      actions: automation.actions,
      configuration: { reasons: automation.reasons },
      n8n_workflow_id: null,
    }))

    const agentDrafts: AiAgentDraft[] = system.agents.map((agent) => ({
      business_id: businessId,
      type: agent.type,
      name: agent.name,
      description: agent.description,
      objective: agent.objective,
      personality: agent.personality,
      rules: agent.rules,
      system_prompt: agent.systemPrompt,
      model: DEFAULT_MODEL_ID,
      provider: DEFAULT_PROVIDER,
      channels: agent.channels,
      allowed_actions: agent.allowedActions,
      handoff_rules: agent.handoffRules,
      status: 'borrador',
    }))

    const [automations, agents, integrations] = await Promise.all([
      automationsRepository.createMany(automationDrafts),
      agentsRepository.createMany(agentDrafts),
      integrationsRepository.ensureMany(businessId, system.integrations),
    ])

    await this.seedKnowledge(businessId, system, profile)

    await businessesRepository.update(businessId, {
      system_generated_at: new Date().toISOString(),
    })

    await activityRepository.log({
      businessId,
      action: 'Sistema digital generado',
      entityType: 'business',
      entityId: businessId,
      metadata: {
        automations: automations.length,
        agents: agents.length,
        integrations: integrations.length,
      },
    })

    return {
      system,
      automationCount: automations.length,
      agentCount: agents.length,
      integrationCount: integrations.length,
    }
  },

  /**
   * Seeds the knowledge base with what the business already told us, plus the
   * questions its industry always gets asked.
   */
  async seedKnowledge(
    businessId: UUID,
    system: BusinessSystem,
    profile: BusinessProfile,
  ): Promise<void> {
    const existing = await knowledgeRepository.listDocuments(businessId)
    if (existing.length > 0) return

    const sections: string[] = []

    if (profile.description) sections.push(`Qué hace el negocio:\n${profile.description}`)
    if (profile.value_proposition) sections.push(`Propuesta de valor:\n${profile.value_proposition}`)
    if (profile.ideal_customer) sections.push(`Cliente ideal:\n${profile.ideal_customer}`)
    if (profile.location) sections.push(`Ubicación:\n${profile.location}`)

    const answeredFaq = profile.faq.filter((f) => f.answer.trim())
    if (answeredFaq.length > 0) {
      sections.push(
        `Preguntas frecuentes:\n${answeredFaq.map((f) => `${f.question}\n${f.answer}`).join('\n\n')}`,
      )
    }

    if (sections.length > 0) {
      await knowledgeRepository.createDocument({
        business_id: businessId,
        title: 'Información de tu negocio',
        source_type: 'texto',
        source_url: null,
        storage_path: null,
        content: sections.join('\n\n'),
        status: 'pendiente',
      })
    }

    if (system.knowledgeSeeds.length > 0) {
      await knowledgeRepository.createDocument({
        business_id: businessId,
        title: 'Preguntas por responder',
        source_type: 'faq',
        source_url: null,
        storage_path: null,
        content: system.knowledgeSeeds.map((q) => `${q}\n(pendiente de responder)`).join('\n\n'),
        status: 'pendiente',
      })
    }
  },
}
