/**
 * Test de la copia que puntúa conversaciones reales (Telegram, n8n) en
 * producción. `src/domain/engine/lead-scoring.test.ts` cubre la copia del
 * simulador — esta existe porque, al ser una copia deliberada (ver el
 * comentario en `lead-scoring.ts`), nada más detectaría que ambas divergieran.
 *
 * Ejecutar: deno test supabase/functions/_shared/lead-scoring.test.ts
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from 'jsr:@std/assert@1'
import { scoreLead, type ScoredMessage } from './lead-scoring.ts'

function msg(role: ScoredMessage['role'], content: string, minutesAgo = 0): ScoredMessage {
  return {
    role,
    content,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  }
}

Deno.test('scoreLead: un mensaje de bajo esfuerzo puntúa frío, no descartado', () => {
  const result = scoreLead({
    messages: [msg('contacto', 'Hola')],
    channel: 'web',
  })

  assertEquals(result.label, 'frio')
  assertEquals(result.isPotential, false)
})

Deno.test('scoreLead: un mensaje con fuerte intención de compra puntúa alto', () => {
  const result = scoreLead({
    messages: [msg('contacto', '¿Tenéis hueco esta semana? Quiero reservar cuanto antes')],
    channel: 'telefono',
  })

  assertGreaterOrEqual(result.score, 55)
  assertEquals(['caliente', 'muy_caliente'].includes(result.label), true)
  assertEquals(result.signals.detectedIntents.includes('reserva'), true)
  assertEquals(result.signals.detectedIntents.includes('urgencia'), true)
})

Deno.test('scoreLead: un rechazo explícito marca descartado sin importar la puntuación', () => {
  const result = scoreLead({
    messages: [
      msg('contacto', '¿Cuánto cuesta? Quiero reservar ya', 10),
      msg('agente_ia', 'Claro, te cuento...', 9),
      msg('contacto', 'No, al final no me interesa, no volváis a escribirme', 1),
    ],
    channel: 'whatsapp',
  })

  assertEquals(result.label, 'descartado')
  assertEquals(result.temperature, 'frio')
})

Deno.test('scoreLead: un mensaje curioso puntúa menos que uno con intención de compra en el mismo canal', () => {
  const curious = scoreLead({
    messages: [msg('contacto', 'Hola, solo quería saber qué hacéis, por curiosidad')],
    channel: 'web',
  })
  const buying = scoreLead({
    messages: [msg('contacto', '¿Cuánto cuesta? Quiero reservar')],
    channel: 'web',
  })

  assertGreaterOrEqual(buying.score, curious.score + 1)
})

Deno.test('scoreLead: una llamada telefónica pesa más que un DM social para el mismo mensaje', () => {
  const byPhone = scoreLead({
    messages: [msg('contacto', 'Hola, buenas')],
    channel: 'telefono',
  })
  const byInstagram = scoreLead({
    messages: [msg('contacto', 'Hola, buenas')],
    channel: 'instagram',
  })

  assertGreaterOrEqual(byPhone.score, byInstagram.score + 1)
})

Deno.test('scoreLead: la puntuación queda acotada entre 0 y 100 incluso apilando toda señal positiva', () => {
  const result = scoreLead({
    messages: [
      msg('contacto', 'Quiero reservar ya, es urgente, ¿tenéis hueco esta semana?', 5),
      msg('contacto', 'Mi teléfono es 600123456 y mi email es yo@ejemplo.com', 3),
    ],
    channel: 'telefono',
    callDurationSeconds: 600,
    sharedContactDetails: true,
  })

  assertLessOrEqual(result.score, 100)
  assertGreaterOrEqual(result.score, 0)
})

Deno.test('scoreLead: detecta datos de contacto en el texto aunque no venga el flag explícito', () => {
  const result = scoreLead({
    messages: [msg('contacto', 'Llámame al 600123456 cuando puedas')],
    channel: 'web',
  })

  assertEquals(result.signals.sharedContactDetails, true)
})

Deno.test('scoreLead: en llamadas usa la duración real en vez de los timestamps de mensajes', () => {
  const result = scoreLead({
    messages: [msg('contacto', 'Hola')],
    channel: 'telefono',
    callDurationSeconds: 300,
  })

  assertEquals(result.signals.conversationMinutes, 5)
})

Deno.test('scoreLead: es determinista — mismo input, mismo output', () => {
  const input = {
    messages: [msg('contacto', '¿Cuánto cuesta el implante?', 2)],
    channel: 'telegram',
  }

  assertEquals(scoreLead(input), scoreLead(input))
})
