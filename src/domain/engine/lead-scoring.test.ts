import { describe, expect, it } from 'vitest'
import { scoreLead, type ScoredMessage } from './lead-scoring'

function msg(role: ScoredMessage['role'], content: string, minutesAgo = 0): ScoredMessage {
  return {
    role,
    content,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  }
}

describe('scoreLead', () => {
  it('scores a single low-effort message as frío, not descartado', () => {
    const result = scoreLead({
      messages: [msg('contacto', 'Hola')],
      channel: 'web',
    })

    expect(result.label).toBe('frio')
    expect(result.isPotential).toBe(false)
  })

  it('gives a strong buying-intent message a high score', () => {
    const result = scoreLead({
      messages: [msg('contacto', '¿Tenéis hueco esta semana? Quiero reservar cuanto antes')],
      channel: 'telefono',
    })

    expect(result.score).toBeGreaterThanOrEqual(55)
    expect(['caliente', 'muy_caliente']).toContain(result.label)
    expect(result.signals.detectedIntents).toContain('reserva')
    expect(result.signals.detectedIntents).toContain('urgencia')
  })

  it('labels an explicit rejection as descartado regardless of score', () => {
    const result = scoreLead({
      messages: [
        msg('contacto', '¿Cuánto cuesta? Quiero reservar ya', 10),
        msg('agente_ia', 'Claro, te cuento...', 9),
        msg('contacto', 'No, al final no me interesa, no volváis a escribirme', 1),
      ],
      channel: 'whatsapp',
    })

    expect(result.label).toBe('descartado')
    expect(result.temperature).toBe('frio')
  })

  it('a merely curious message scores lower than a buying-intent one on the same channel', () => {
    const curious = scoreLead({
      messages: [msg('contacto', 'Hola, solo quería saber qué hacéis, por curiosidad')],
      channel: 'web',
    })
    const buying = scoreLead({
      messages: [msg('contacto', '¿Cuánto cuesta? Quiero reservar')],
      channel: 'web',
    })

    expect(buying.score).toBeGreaterThan(curious.score)
  })

  it('weighs a phone call higher than a social DM for the same message', () => {
    const byPhone = scoreLead({
      messages: [msg('contacto', 'Hola, buenas')],
      channel: 'telefono',
    })
    const byInstagram = scoreLead({
      messages: [msg('contacto', 'Hola, buenas')],
      channel: 'instagram',
    })

    expect(byPhone.score).toBeGreaterThan(byInstagram.score)
  })

  it('rewards a sustained back-and-forth conversation over a single message', () => {
    const long = scoreLead({
      messages: [
        msg('contacto', 'Hola, quería preguntar por vuestros servicios', 20),
        msg('agente_ia', 'Claro, cuéntame qué necesitas', 19),
        msg('contacto', 'Busco algo para el mes que viene', 15),
        msg('agente_ia', 'Perfecto, tenemos varias opciones', 14),
        msg('contacto', 'Vale, ¿y qué precio tienen?', 10),
        msg('agente_ia', 'Depende del servicio', 9),
        msg('contacto', 'Entiendo, lo pienso y os digo', 5),
      ],
      channel: 'web',
    })
    const short = scoreLead({
      messages: [msg('contacto', 'Hola, quería preguntar por vuestros servicios')],
      channel: 'web',
    })

    expect(long.score).toBeGreaterThan(short.score)
  })

  it('bounds the score between 0 and 100 even with every positive signal stacked', () => {
    const result = scoreLead({
      messages: [
        msg('contacto', 'Quiero reservar ya, es urgente, ¿tenéis hueco esta semana?', 5),
        msg('contacto', 'Mi teléfono es 600123456 y mi email es yo@ejemplo.com', 3),
      ],
      channel: 'telefono',
      callDurationSeconds: 600,
      sharedContactDetails: true,
    })

    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('detects contact details shared in the message text even without the explicit flag', () => {
    const result = scoreLead({
      messages: [msg('contacto', 'Llámame al 600123456 cuando puedas')],
      channel: 'web',
    })

    expect(result.signals.sharedContactDetails).toBe(true)
  })

  it('uses call duration for conversation length on phone calls instead of message timestamps', () => {
    const result = scoreLead({
      messages: [msg('contacto', 'Hola')],
      channel: 'telefono',
      callDurationSeconds: 300,
    })

    expect(result.signals.conversationMinutes).toBe(5)
  })

  it('is deterministic: identical input always produces identical output', () => {
    const input = {
      messages: [msg('contacto', '¿Cuánto cuesta el implante?', 2)],
      channel: 'telegram' as const,
    }

    expect(scoreLead(input)).toEqual(scoreLead(input))
  })
})
