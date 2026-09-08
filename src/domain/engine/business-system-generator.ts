/**
 * BusinessSystemGenerator
 *
 * The orchestrator: business profile in, complete system proposal out.
 * Composes RecommendationEngine + AgentGenerator. Stays pure — persistence
 * is the caller's job (see services/system/system-provisioner.ts).
 */
import { recommend, type Recommendation } from './recommendation-engine'
import { generateAgent, type GeneratedAgent } from './agent-generator'
import type { AutomationBlueprint } from '../catalog/automation-blueprints'
import type { PipelineTemplate } from '../catalog/industry-templates'
import type {
  AutomationCategory,
  BusinessProfile,
  IntegrationProvider,
  Service,
} from '../types'

export interface ProposedAutomation {
  templateKey: string
  name: string
  description: string
  category: AutomationCategory
  trigger: AutomationBlueprint['trigger']
  actions: AutomationBlueprint['actions']
  requiredIntegrations: IntegrationProvider[]
  reasons: string[]
  score: number
}

export interface BusinessSystem {
  automations: ProposedAutomation[]
  agents: GeneratedAgent[]
  integrations: IntegrationProvider[]
  pipeline: PipelineTemplate
  knowledgeSeeds: string[]
  summary: {
    automationCount: number
    agentCount: number
    integrationCount: number
    pipelineCount: number
    hoursSavedPerMonth: number
    headline: string
  }
}

export interface GenerateBusinessSystemInput {
  profile: BusinessProfile
  services: Service[]
  /** Cap the proposal so the first run stays digestible. */
  maxAutomations?: number
  maxAgents?: number
}

const DEFAULT_MAX_AUTOMATIONS = 8
const DEFAULT_MAX_AGENTS = 4

export function generateBusinessSystem(
  input: GenerateBusinessSystemInput,
): BusinessSystem {
  const { profile, services } = input

  const recommendation: Recommendation = recommend({
    industry: profile.industry,
    goals: profile.goals,
    channels: profile.contact_channels,
    services: services.map((s) => ({ name: s.name, price: s.price })),
  })

  const automations = recommendation.automations
    .slice(0, input.maxAutomations ?? DEFAULT_MAX_AUTOMATIONS)
    .map(({ blueprint, reasons, score }) => ({
      templateKey: blueprint.key,
      name: blueprint.name,
      description: blueprint.description,
      category: blueprint.category,
      trigger: blueprint.trigger,
      actions: blueprint.actions,
      requiredIntegrations: blueprint.requiredIntegrations,
      reasons,
      score,
    }))

  const agents = recommendation.agents
    .slice(0, input.maxAgents ?? DEFAULT_MAX_AGENTS)
    .map(({ blueprint }) => generateAgent({ profile, services }, blueprint.type))

  const minutesSaved = recommendation.automations
    .slice(0, input.maxAutomations ?? DEFAULT_MAX_AUTOMATIONS)
    .reduce((total, a) => total + a.blueprint.minutesSavedPerRun * 40, 0)

  return {
    automations,
    agents,
    integrations: recommendation.integrations,
    pipeline: recommendation.pipeline,
    knowledgeSeeds: recommendation.knowledgeSeeds,
    summary: {
      automationCount: automations.length,
      agentCount: agents.length,
      integrationCount: recommendation.integrations.length,
      pipelineCount: 1,
      hoursSavedPerMonth: Math.round(minutesSaved / 60),
      headline: recommendation.template.headline,
    },
  }
}
