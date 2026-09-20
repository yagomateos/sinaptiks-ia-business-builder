import { describe, expect, it } from 'vitest'
import { checkPlanQuota, PLAN_LIMITS } from './plan-limits'

describe('PLAN_LIMITS', () => {
  it('starter limita automatizaciones y agentes; growth solo agentes; scale nada', () => {
    expect(PLAN_LIMITS.starter).toEqual({ maxActiveAutomations: 3, maxActiveAgents: 1 })
    expect(PLAN_LIMITS.growth).toEqual({ maxActiveAutomations: null, maxActiveAgents: 3 })
    expect(PLAN_LIMITS.scale).toEqual({ maxActiveAutomations: null, maxActiveAgents: null })
  })
})

describe('checkPlanQuota', () => {
  it('permite activar por debajo del límite', () => {
    expect(checkPlanQuota('starter', 'automations', 2)).toEqual({ allowed: true })
  })

  it('bloquea justo al llegar al límite (Starter: 3 automatizaciones activas)', () => {
    expect(checkPlanQuota('starter', 'automations', 3)).toEqual({ allowed: false, limit: 3 })
  })

  it('bloquea por encima del límite', () => {
    expect(checkPlanQuota('starter', 'automations', 5)).toEqual({ allowed: false, limit: 3 })
  })

  it('Starter solo permite 1 agente activo', () => {
    expect(checkPlanQuota('starter', 'agents', 0)).toEqual({ allowed: true })
    expect(checkPlanQuota('starter', 'agents', 1)).toEqual({ allowed: false, limit: 1 })
  })

  it('Growth no limita automatizaciones activas, solo agentes', () => {
    expect(checkPlanQuota('growth', 'automations', 999)).toEqual({ allowed: true })
    expect(checkPlanQuota('growth', 'agents', 3)).toEqual({ allowed: false, limit: 3 })
  })

  it('Scale no limita nada', () => {
    expect(checkPlanQuota('scale', 'automations', 999)).toEqual({ allowed: true })
    expect(checkPlanQuota('scale', 'agents', 999)).toEqual({ allowed: true })
  })
})
