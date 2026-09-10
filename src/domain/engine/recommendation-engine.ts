/**
 * RecommendationEngine
 *
 * Pure, deterministic scoring over the blueprint catalogs.
 * Input:  industry, goals, channels, services
 * Output: recommended automations, agents, integrations, pipeline
 *
 * New rules are added by editing the catalogs or the SCORING constants —
 * never by touching the UI.
 */
import {
  AUTOMATION_BLUEPRINTS,
  type AutomationBlueprint,
} from '../catalog/automation-blueprints'
import { AGENT_BLUEPRINTS, type AgentBlueprint } from '../catalog/agent-blueprints'
import {
  getIndustryTemplate,
  type IndustryTemplate,
  type PipelineTemplate,
} from '../catalog/industry-templates'
import type {
  BusinessGoal,
  ContactChannel,
  Industry,
  IntegrationProvider,
} from '../types'

const SCORING = {
  /** Points per matching user goal. */
  goalMatch: 4,
  /** Points when the blueprint is core to the industry template. */
  industryCore: 6,
  /** Points when the blueprint explicitly boosts this industry. */
  industryBoost: 3,
  /** Points when the business actually uses a preferred channel. */
  channelMatch: 2,
  /** Penalty when a required channel is missing entirely. */
  missingChannelPenalty: -8,
  /** Points when the business has priced services (enables sales flows). */
  hasPricedServices: 2,
  /** Minimum score to be recommended at all. */
  threshold: 8,
} as const

/**
 * Score alone is not enough to earn a place in the proposal. A blueprint must
 * also be *relevant*: it serves a goal the user actually picked, or it is
 * standard for their industry. Without this, a high baseline score is enough to
 * recommend things nobody asked for.
 */
function isRelevant(matchedGoalCount: number, isIndustryCore: boolean): boolean {
  return matchedGoalCount > 0 || isIndustryCore
}

export interface RecommendationInput {
  industry: Industry
  goals: BusinessGoal[]
  channels: ContactChannel[]
  services: { name: string; price: number | null }[]
}

export interface ScoredAutomation {
  blueprint: AutomationBlueprint
  score: number
  reasons: string[]
}

export interface ScoredAgent {
  blueprint: AgentBlueprint
  score: number
  reasons: string[]
}

export interface Recommendation {
  automations: ScoredAutomation[]
  agents: ScoredAgent[]
  integrations: IntegrationProvider[]
  pipeline: PipelineTemplate
  template: IndustryTemplate
  knowledgeSeeds: string[]
  estimatedMinutesSavedPerMonth: number
}

/** Assumed monthly execution volume per automation, for the time-saved estimate. */
const ASSUMED_RUNS_PER_MONTH = 40

export function recommend(input: RecommendationInput): Recommendation {
  const template = getIndustryTemplate(input.industry)
  const goals = new Set(input.goals)
  const channels = new Set(input.channels)
  const hasPricedServices = input.services.some((s) => s.price !== null && s.price > 0)

  const automations = scoreAutomations(input, template, goals, channels, hasPricedServices)
  const agents = scoreAgents(input, template, goals, channels)

  const integrations = collectIntegrations(template, automations, channels)

  const estimatedMinutesSavedPerMonth = automations.reduce(
    (total, a) => total + a.blueprint.minutesSavedPerRun * ASSUMED_RUNS_PER_MONTH,
    0,
  )

  return {
    automations,
    agents,
    integrations,
    pipeline: template.pipeline,
    template,
    knowledgeSeeds: template.knowledgeSeeds,
    estimatedMinutesSavedPerMonth,
  }
}

/* ------------------------------------------------------------------ */
/* Automations                                                         */
/* ------------------------------------------------------------------ */

function scoreAutomations(
  input: RecommendationInput,
  template: IndustryTemplate,
  goals: Set<BusinessGoal>,
  channels: Set<ContactChannel>,
  hasPricedServices: boolean,
): ScoredAutomation[] {
  const coreKeys = new Set(template.coreAutomations)

  return AUTOMATION_BLUEPRINTS.map((blueprint) => {
    const reasons: string[] = []
    let score = blueprint.baseScore

    const matchedGoals = blueprint.goals.filter((g) => goals.has(g))
    if (matchedGoals.length > 0) {
      score += matchedGoals.length * SCORING.goalMatch
      reasons.push('Responde a un objetivo que has marcado')
    }

    const isCore = coreKeys.has(blueprint.key)
    if (isCore) {
      score += SCORING.industryCore
      reasons.push(`Habitual en negocios como el tuyo`)
    }

    if (blueprint.boostIndustries?.includes(input.industry)) {
      score += SCORING.industryBoost
      if (!isCore) reasons.push('Encaja con tu sector')
    }

    if (blueprint.requiresAnyChannel) {
      const available = blueprint.requiresAnyChannel.filter((c) => channels.has(c))
      if (available.length === 0) {
        score += SCORING.missingChannelPenalty
      } else {
        score += SCORING.channelMatch
        reasons.push('Usa un canal que ya tienes activo')
      }
    }

    if (hasPricedServices && blueprint.category === 'ventas') {
      score += SCORING.hasPricedServices
    }

    return {
      blueprint,
      score,
      reasons,
      relevant: isRelevant(matchedGoals.length, isCore),
    }
  })
    .filter((a) => a.relevant && a.score >= SCORING.threshold)
    .map(({ blueprint, score, reasons }) => ({ blueprint, score, reasons }))
    .sort((a, b) => b.score - a.score)
}

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

function scoreAgents(
  input: RecommendationInput,
  template: IndustryTemplate,
  goals: Set<BusinessGoal>,
  channels: Set<ContactChannel>,
): ScoredAgent[] {
  const coreTypes = new Set(template.coreAgents)

  return AGENT_BLUEPRINTS.map((blueprint) => {
    const reasons: string[] = []
    let score = blueprint.baseScore

    const matchedGoals = blueprint.goals.filter((g) => goals.has(g))
    if (matchedGoals.length > 0) {
      score += matchedGoals.length * SCORING.goalMatch
      reasons.push('Cubre objetivos que has marcado')
    }

    const isCore = coreTypes.has(blueprint.type)
    if (isCore) {
      score += SCORING.industryCore
      reasons.push('Recomendado para tu sector')
    }

    if (blueprint.boostIndustries?.includes(input.industry)) {
      score += SCORING.industryBoost
    }

    const matchedChannels = blueprint.preferredChannels.filter((c) => channels.has(c))
    if (matchedChannels.length > 0) {
      score += SCORING.channelMatch
      reasons.push('Trabaja en los canales que usas')
    }

    return {
      blueprint,
      score,
      reasons,
      relevant: isRelevant(matchedGoals.length, isCore),
    }
  })
    .filter((a) => a.relevant && a.score >= SCORING.threshold)
    .map(({ blueprint, score, reasons }) => ({ blueprint, score, reasons }))
    .sort((a, b) => b.score - a.score)
}

/* ------------------------------------------------------------------ */
/* Integrations                                                        */
/* ------------------------------------------------------------------ */

const CHANNEL_INTEGRATIONS: Partial<Record<ContactChannel, IntegrationProvider>> = {
  telegram: 'telegram',
  whatsapp: 'whatsapp',
  instagram: 'instagram',
  facebook: 'facebook',
  email: 'gmail',
}

function collectIntegrations(
  template: IndustryTemplate,
  automations: ScoredAutomation[],
  channels: Set<ContactChannel>,
): IntegrationProvider[] {
  const set = new Set<IntegrationProvider>(['n8n'])

  for (const provider of template.recommendedIntegrations) set.add(provider)

  for (const { blueprint } of automations) {
    for (const provider of blueprint.requiredIntegrations) set.add(provider)
  }

  for (const channel of channels) {
    const provider = CHANNEL_INTEGRATIONS[channel]
    if (provider) set.add(provider)
  }

  return [...set]
}
