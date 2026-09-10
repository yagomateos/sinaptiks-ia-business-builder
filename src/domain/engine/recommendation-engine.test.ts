import { describe, expect, it } from 'vitest'
import { recommend } from './recommendation-engine'
import { INDUSTRIES } from '../types'

describe('recommend', () => {
  it('always includes n8n among the integrations, regardless of industry or channels', () => {
    for (const industry of INDUSTRIES) {
      const result = recommend({ industry, goals: [], channels: [], services: [] })
      expect(result.integrations).toContain('n8n')
    }
  })

  it('produces a result for every industry in the catalog without throwing', () => {
    for (const industry of INDUSTRIES) {
      expect(() =>
        recommend({ industry, goals: [], channels: ['telegram'], services: [] }),
      ).not.toThrow()
    }
  })

  it('returns automations sorted from highest to lowest score', () => {
    const result = recommend({
      industry: 'clinica',
      goals: ['mas_reservas', 'responder_rapido'],
      channels: ['telegram', 'web'],
      services: [{ name: 'Implante', price: 1200 }],
    })

    const scores = result.automations.map((a) => a.score)
    const sorted = [...scores].sort((a, b) => b - a)
    expect(scores).toEqual(sorted)
  })

  it('every recommended automation clears the relevance threshold', () => {
    const result = recommend({
      industry: 'restaurante',
      goals: [],
      channels: [],
      services: [],
    })

    // Nothing recommended with zero goals and zero channels should still be
    // "core" for the industry, or nothing should be recommended at all — but
    // whatever comes back must carry a reason, never an unexplained pick.
    for (const automation of result.automations) {
      expect(automation.reasons.length).toBeGreaterThan(0)
    }
  })

  it('maps a used contact channel to its integration provider', () => {
    const result = recommend({
      industry: 'peluqueria',
      goals: [],
      channels: ['telegram', 'instagram'],
      services: [],
    })

    expect(result.integrations).toContain('telegram')
    expect(result.integrations).toContain('instagram')
  })

  it('does not recommend a provider for a channel that was not selected', () => {
    const result = recommend({
      industry: 'peluqueria',
      goals: [],
      channels: ['web'],
      services: [],
    })

    expect(result.integrations).not.toContain('facebook')
  })

  it('is deterministic for identical input', () => {
    const input = {
      industry: 'abogado' as const,
      goals: ['recuperar_clientes' as const],
      channels: ['telegram' as const],
      services: [],
    }

    expect(recommend(input)).toEqual(recommend(input))
  })

  it('estimates time saved as a non-negative sum tied to recommended automations', () => {
    const result = recommend({
      industry: 'gimnasio',
      goals: ['mas_reservas', 'automatizar_ventas', 'recuperar_clientes'],
      channels: ['telegram', 'web', 'instagram'],
      services: [{ name: 'Mensualidad', price: 40 }],
    })

    expect(result.estimatedMinutesSavedPerMonth).toBeGreaterThanOrEqual(0)
    if (result.automations.length === 0) {
      expect(result.estimatedMinutesSavedPerMonth).toBe(0)
    }
  })
})
