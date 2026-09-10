import { describe, expect, it } from 'vitest'
import { generateAgent } from './agent-generator'
import { AGENT_TYPES } from '../types'
import { makeProfile as profile, makeService as service } from './test-fixtures'

describe('generateAgent', () => {
  it('produces a valid agent for every agent type without throwing', () => {
    for (const type of AGENT_TYPES) {
      expect(() => generateAgent({ profile: profile(), services: [] }, type)).not.toThrow()
    }
  })

  it('replaces the {{business_name}} placeholder in the objective', () => {
    const agent = generateAgent({ profile: profile(), services: [] }, 'recepcionista')
    expect(agent.objective).not.toContain('{{business_name}}')
    expect(agent.objective).toContain('Clínica Sonrisa')
  })

  it('falls back to every contact channel when none of the blueprint preferred ones match', () => {
    const agent = generateAgent(
      { profile: profile({ contact_channels: ['facebook'] }), services: [] },
      'recepcionista',
    )
    expect(agent.channels).toEqual(['facebook'])
  })

  it('gives soporte a shorter escalation window than the default', () => {
    const soporte = generateAgent({ profile: profile(), services: [] }, 'soporte')
    const recepcionista = generateAgent({ profile: profile(), services: [] }, 'recepcionista')

    expect(soporte.handoffRules.escalate_after_turns).toBeLessThan(
      recepcionista.handoffRules.escalate_after_turns,
    )
  })

  it('gives comercial extra negotiation-related escalation keywords', () => {
    const comercial = generateAgent({ profile: profile(), services: [] }, 'comercial')
    expect(comercial.handoffRules.escalate_on_keywords).toContain('descuento')
  })

  it('names the business in the escalation message', () => {
    const agent = generateAgent({ profile: profile(), services: [] }, 'recepcionista')
    expect(agent.handoffRules.escalation_message).toContain('Clínica Sonrisa')
  })

  it('includes an active priced service in the system prompt, and excludes inactive ones', () => {
    const agent = generateAgent(
      {
        profile: profile(),
        services: [
          service({ name: 'Implante dental', price: 1200, is_active: true }),
          service({ id: 's2', name: 'Servicio retirado', is_active: false }),
        ],
      },
      'recepcionista',
    )

    expect(agent.systemPrompt).toContain('Implante dental')
    expect(agent.systemPrompt).toContain('1200')
    expect(agent.systemPrompt).not.toContain('Servicio retirado')
  })

  it('excludes unanswered FAQ entries from the system prompt', () => {
    const agent = generateAgent(
      {
        profile: profile({
          faq: [
            { question: '¿Aceptáis seguros?', answer: 'Sí, Sanitas y Adeslas.' },
            { question: '¿Hay parking?', answer: '' },
          ],
        }),
        services: [],
      },
      'recepcionista',
    )

    expect(agent.systemPrompt).toContain('¿Aceptáis seguros?')
    expect(agent.systemPrompt).not.toContain('¿Hay parking?')
  })

  it('lists the channels it attends by in the system prompt', () => {
    const agent = generateAgent(
      { profile: profile({ contact_channels: ['telegram'] }), services: [] },
      'recepcionista',
    )
    expect(agent.systemPrompt).toContain('Telegram')
  })

  it('is deterministic for identical input', () => {
    const context = { profile: profile(), services: [service()] }
    const a = generateAgent(context, 'comercial')
    const b = generateAgent(context, 'comercial')
    expect(a).toEqual(b)
  })
})
