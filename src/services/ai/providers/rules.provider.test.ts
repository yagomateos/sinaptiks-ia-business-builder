import { describe, expect, it } from 'vitest'
import { rulesProvider } from './rules.provider'
import { makeProfile, makeService } from '@/domain/engine/test-fixtures'
import type { AiAgent, Message } from '@/domain/types'
import type { GenerateReplyInput } from '../types'

function makeAgent(overrides: Partial<AiAgent> = {}): AiAgent {
  return {
    id: 'a1',
    business_id: 'b1',
    type: 'recepcionista',
    name: 'Recepcionista IA',
    description: null,
    objective: 'Atender al cliente',
    personality: 'Cercana',
    rules: [],
    system_prompt: 'Eres el recepcionista.',
    model: 'claude-opus-5',
    provider: 'anthropic',
    channels: ['telegram'],
    allowed_actions: [],
    handoff_rules: {
      escalate_on_keywords: ['queja'],
      escalate_after_turns: 8,
      escalate_on_negative_sentiment: true,
      escalation_message: 'Te pongo en contacto con el equipo.',
    },
    status: 'activo',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeMessage(role: Message['role'], content: string): Message {
  return {
    id: crypto.randomUUID(),
    conversation_id: 'c1',
    business_id: 'b1',
    role,
    content,
    metadata: {},
    created_at: new Date().toISOString(),
  }
}

function reply(overrides: Partial<GenerateReplyInput> & { incomingMessage: string }) {
  const input: GenerateReplyInput = {
    agent: makeAgent(),
    profile: makeProfile(),
    services: [],
    history: [],
    ...overrides,
  }
  return rulesProvider.generateReply(input)
}

describe('rulesProvider.generateReply', () => {
  it('answers a matching FAQ verbatim', async () => {
    const result = await reply({
      incomingMessage: '¿Aceptáis seguros médicos?',
      profile: makeProfile({
        faq: [{ question: '¿Aceptáis seguros?', answer: 'Sí, Sanitas y Adeslas.' }],
      }),
    })
    expect(result).toBe('Sí, Sanitas y Adeslas.')
  })

  it('describes a service matched by a single significant word, not just the full name', async () => {
    const result = await reply({
      incomingMessage: 'nevesito un implante',
      services: [makeService({ name: 'Implante dental', price: 1200 })],
    })
    expect(result).toContain('1200')
  })

  it('does not let a word shared by two services pick the wrong one', async () => {
    // "dental" alone can't disambiguate between two dental services — only a
    // word unique to one of them should trigger it.
    const result = await reply({
      incomingMessage: 'quiero información sobre lo dental',
      services: [
        makeService({ id: 's1', name: 'Implante dental', price: 1200 }),
        makeService({ id: 's2', name: 'Limpieza dental', price: 60 }),
      ],
    })
    expect(result).not.toContain('1200')
    expect(result).not.toContain('60 EUR')
  })

  it('still matches on a word unique to one service, even when another service shares its other word', async () => {
    const result = await reply({
      incomingMessage: 'quiero un implante',
      services: [
        makeService({ id: 's1', name: 'Implante dental', price: 1200 }),
        makeService({ id: 's2', name: 'Limpieza dental', price: 60 }),
      ],
    })
    expect(result).toContain('1200')
  })

  it('lists priced services when asked about price without naming one', async () => {
    const result = await reply({
      incomingMessage: 'cuanto cuesta?',
      services: [
        makeService({ id: 's1', name: 'Implante dental', price: 1200 }),
        makeService({ id: 's2', name: 'Ortodoncia', price: 2500 }),
      ],
    })
    expect(result).toContain('Implante dental')
    expect(result).toContain('Ortodoncia')
  })

  it('describes the single service directly when there is only one', async () => {
    const result = await reply({
      incomingMessage: 'que precio tiene',
      services: [makeService({ name: 'Implante dental', price: 1200 })],
    })
    expect(result).toContain('1200')
    expect(result).toContain('reserve un hueco')
  })

  it('offers to take booking details on a booking-intent message', async () => {
    const result = await reply({ incomingMessage: 'necesito una cita' })
    expect(result).toContain('qué día')
    expect(result).toContain('hora')
    expect(result).toContain('servicio')
  })

  it('treats a bare "sí" as confirmation only right after the bot offered to book', async () => {
    const history = [
      makeMessage('contacto', 'quiero el implante'),
      makeMessage(
        'agente_ia',
        'Sustitución de una pieza. El precio es 1200 EUR. ¿Quieres que te reserve un hueco?',
      ),
    ]
    const result = await reply({ incomingMessage: 'si', history })
    expect(result).toContain('nombre')
    expect(result).toContain('día')
    // El servicio ya se sabe por contexto (el que se acaba de describir), no
    // hace falta volver a preguntarlo.
    expect(result).toContain('hora')
  })

  it('captures the follow-up after the generic booking-intent prompt too, not just the offer-acceptance one', async () => {
    const history = [
      makeMessage('agente_ia', 'Perfecto, dime tu nombre, qué día y a qué hora te viene bien, y qué servicio necesitas, y en cuanto pueda te lo confirmo.'),
    ]
    const result = await reply({ incomingMessage: 'Yago Mateos, mañana a las 10, limpieza dental', history })
    expect(result).toContain('tomo nota')
  })

  it('does not treat a bare "sí" as a booking confirmation with no prior offer', async () => {
    const result = await reply({ incomingMessage: 'si' })
    expect(result).not.toContain('Dime tu nombre')
  })

  it('captures whatever comes right after asking for name and day', async () => {
    const history = [
      makeMessage('agente_ia', 'Perfecto, dime tu nombre, qué día y a qué hora te viene bien, y en cuanto pueda te lo confirmo.'),
    ]
    const result = await reply({ incomingMessage: 'Yago Mateos, mañana a las 10', history })
    expect(result).toContain('tomo nota')
  })

  it('still escalates on a negative signal even mid-booking-flow', async () => {
    const history = [
      makeMessage('agente_ia', 'Perfecto, dime tu nombre, qué día y a qué hora te viene bien, y en cuanto pueda te lo confirmo.'),
    ]
    const result = await reply({
      incomingMessage: 'esto es una queja, va todo fatal',
      history,
      agent: makeAgent({
        handoff_rules: {
          escalate_on_keywords: ['queja'],
          escalate_after_turns: 8,
          escalate_on_negative_sentiment: true,
          escalation_message: 'Te pongo con el equipo ahora mismo.',
        },
      }),
    })
    expect(result).toBe('Te pongo con el equipo ahora mismo.')
  })

  it('greets back on a bare greeting', async () => {
    const result = await reply({ incomingMessage: 'hola' })
    expect(result).toContain('¡Hola!')
  })

  it('does not let a greeting inside a real question steal the reply', async () => {
    const result = await reply({
      incomingMessage: 'hola, cuanto cuesta el implante',
      services: [makeService({ name: 'Implante dental', price: 1200 })],
    })
    expect(result).toContain('1200')
    expect(result).not.toContain('¡Hola!')
  })

  it('falls back to a generic reply when nothing matches', async () => {
    const result = await reply({ incomingMessage: 'xyzabc123 no sense at all' })
    expect(result).toContain('Gracias por escribir a')
  })

  it('is deterministic for identical input', async () => {
    const input: Parameters<typeof reply>[0] = {
      incomingMessage: 'cuanto cuesta el implante',
      services: [makeService({ name: 'Implante dental', price: 1200 })],
    }
    const a = await reply(input)
    const b = await reply(input)
    expect(a).toBe(b)
  })
})
