import { supabase } from '../supabase/client'
import { toAppError } from '../supabase/errors'
import type { LeadStage, UUID } from '@/domain/types'

export type AnalyticsRange = 7 | 30 | 90

export interface AnalyticsSnapshot {
  leadsGenerated: number
  leadsQualified: number
  conversations: number
  appointments: number
  customers: number
  conversionRate: number
  executions: number
  executionErrors: number
  minutesSaved: number
  leadsByStage: Record<LeadStage, number>
  dailyLeads: { date: string; count: number }[]
}

const EMPTY_STAGES: Record<LeadStage, number> = {
  nuevo: 0,
  contactado: 0,
  cualificado: 0,
  cita: 0,
  cliente: 0,
  perdido: 0,
}

/** Average manual minutes replaced by one automation run. */
const MINUTES_SAVED_PER_EXECUTION = 6

export const analyticsRepository = {
  async snapshot(businessId: UUID, range: AnalyticsRange): Promise<AnalyticsSnapshot> {
    const since = new Date()
    since.setDate(since.getDate() - range)
    const sinceIso = since.toISOString()

    const [leadsResult, conversationsResult, executionsResult] = await Promise.all([
      supabase
        .from('leads')
        .select('stage, created_at')
        .eq('business_id', businessId)
        .gte('created_at', sinceIso),
      supabase
        .from('conversations')
        .select('id')
        .eq('business_id', businessId)
        .gte('created_at', sinceIso),
      supabase
        .from('automation_executions')
        .select('status')
        .eq('business_id', businessId)
        .gte('started_at', sinceIso),
    ])

    if (leadsResult.error) throw toAppError(leadsResult.error, 'No hemos podido calcular tus resultados.')
    if (conversationsResult.error)
      throw toAppError(conversationsResult.error, 'No hemos podido calcular tus resultados.')
    if (executionsResult.error)
      throw toAppError(executionsResult.error, 'No hemos podido calcular tus resultados.')

    const leads = leadsResult.data ?? []
    const leadsByStage = { ...EMPTY_STAGES }
    const dailyMap = new Map<string, number>()

    for (const lead of leads) {
      leadsByStage[lead.stage as LeadStage] += 1
      const day = lead.created_at.slice(0, 10)
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1)
    }

    const executions = executionsResult.data ?? []
    const executionErrors = executions.filter((e) => e.status === 'error').length
    const successfulExecutions = executions.length - executionErrors

    const leadsGenerated = leads.length
    const customers = leadsByStage.cliente
    const leadsQualified =
      leadsByStage.cualificado + leadsByStage.cita + leadsByStage.cliente

    return {
      leadsGenerated,
      leadsQualified,
      conversations: (conversationsResult.data ?? []).length,
      appointments: leadsByStage.cita + leadsByStage.cliente,
      customers,
      conversionRate: leadsGenerated > 0 ? (customers / leadsGenerated) * 100 : 0,
      executions: executions.length,
      executionErrors,
      minutesSaved: successfulExecutions * MINUTES_SAVED_PER_EXECUTION,
      leadsByStage,
      dailyLeads: buildDailySeries(dailyMap, range),
    }
  },
}

function buildDailySeries(
  counts: Map<string, number>,
  range: AnalyticsRange,
): { date: string; count: number }[] {
  const series: { date: string; count: number }[] = []
  const today = new Date()

  for (let i = range - 1; i >= 0; i--) {
    const day = new Date(today)
    day.setDate(day.getDate() - i)
    const key = day.toISOString().slice(0, 10)
    series.push({ date: key, count: counts.get(key) ?? 0 })
  }

  return series
}
