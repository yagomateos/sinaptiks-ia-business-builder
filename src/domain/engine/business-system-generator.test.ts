import { describe, expect, it } from 'vitest'
import { generateBusinessSystem } from './business-system-generator'
import { INDUSTRIES } from '../types'
import { makeProfile, makeService } from './test-fixtures'

describe('generateBusinessSystem', () => {
  it('produces a system for every industry in the catalog without throwing', () => {
    for (const industry of INDUSTRIES) {
      expect(() =>
        generateBusinessSystem({ profile: makeProfile({ industry }), services: [] }),
      ).not.toThrow()
    }
  })

  it('caps the number of automations and agents at the requested maximum', () => {
    const system = generateBusinessSystem({
      profile: makeProfile({
        goals: ['mas_reservas', 'responder_rapido', 'automatizar_ventas', 'recuperar_clientes'],
        contact_channels: ['telegram', 'web', 'instagram', 'facebook', 'email', 'telefono'],
      }),
      services: [makeService()],
      maxAutomations: 2,
      maxAgents: 1,
    })

    expect(system.automations.length).toBeLessThanOrEqual(2)
    expect(system.agents.length).toBeLessThanOrEqual(1)
  })

  it('keeps the summary counts consistent with the actual arrays returned', () => {
    const system = generateBusinessSystem({
      profile: makeProfile(),
      services: [makeService()],
    })

    expect(system.summary.automationCount).toBe(system.automations.length)
    expect(system.summary.agentCount).toBe(system.agents.length)
    expect(system.summary.integrationCount).toBe(system.integrations.length)
  })

  it('every generated agent is a fully formed agent, not a stub', () => {
    const system = generateBusinessSystem({
      profile: makeProfile({ goals: ['mas_reservas'] }),
      services: [],
    })

    for (const agent of system.agents) {
      expect(agent.systemPrompt.length).toBeGreaterThan(100)
      expect(agent.name).toBeTruthy()
    }
  })

  it('never reports negative hours saved', () => {
    const system = generateBusinessSystem({ profile: makeProfile(), services: [] })
    expect(system.summary.hoursSavedPerMonth).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic for identical input', () => {
    const input = { profile: makeProfile(), services: [makeService()] }
    expect(generateBusinessSystem(input)).toEqual(generateBusinessSystem(input))
  })
})
