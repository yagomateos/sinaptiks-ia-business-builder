/**
 * `detectHandoff` decide si un agente IA deja de responder y se avisa a una
 * persona (CLAUDE.md §11: "Human handoff is a real product behavior"). Un
 * fallo aquí es silencioso en dos direcciones: escala de más (avisos falsos
 * sin parar) o no escala nunca (un cliente que necesita ayuda humana se
 * queda hablando con el bot sin que nadie se entere).
 *
 * Ejecutar: deno test supabase/functions/_shared/conversation-pipeline.test.ts
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { detectHandoff } from './conversation-pipeline.ts'

Deno.test('detectHandoff: sin reglas configuradas, nunca deriva', () => {
  const result = detectHandoff(null, { incomingText: 'quiero hablar con un abogado', reply: '', contactTurns: 1 })
  assertEquals(result, null)
})

Deno.test('detectHandoff: detecta una palabra clave de escalado en el mensaje del contacto', () => {
  const result = detectHandoff(
    { escalate_on_keywords: ['reclamación', 'abogado'] },
    { incomingText: 'Quiero poner una reclamación', reply: 'Claro, te ayudo', contactTurns: 1 },
  )
  assertEquals(result, 'Mencionó "reclamación"')
})

Deno.test('detectHandoff: la palabra clave no distingue mayúsculas/minúsculas', () => {
  const result = detectHandoff(
    { escalate_on_keywords: ['ABOGADO'] },
    { incomingText: 'quiero un abogado ya', reply: '', contactTurns: 1 },
  )
  assertEquals(result, 'Mencionó "ABOGADO"')
})

Deno.test('detectHandoff: sin palabra clave ni turnos suficientes, no deriva', () => {
  const result = detectHandoff(
    { escalate_on_keywords: ['reclamación'], escalate_after_turns: 5 },
    { incomingText: 'Hola, una pregunta', reply: 'Dime', contactTurns: 2 },
  )
  assertEquals(result, null)
})

Deno.test('detectHandoff: deriva al alcanzar el número de turnos configurado', () => {
  const result = detectHandoff(
    { escalate_after_turns: 3 },
    { incomingText: 'Sigo sin entenderlo', reply: 'Déjame explicarte otra vez', contactTurns: 3 },
  )
  assertEquals(result, 'Lleva 3 mensajes sin resolverse')
})

Deno.test('detectHandoff: no deriva por turnos si todavía no llega al umbral', () => {
  const result = detectHandoff(
    { escalate_after_turns: 3 },
    { incomingText: 'Otra pregunta', reply: 'Claro', contactTurns: 2 },
  )
  assertEquals(result, null)
})

Deno.test('detectHandoff: deriva cuando el propio agente incluye el mensaje de escalado configurado', () => {
  const result = detectHandoff(
    { escalation_message: 'Te paso con un compañero' },
    { incomingText: 'Esto es muy complicado', reply: 'Entiendo. Te paso con un compañero para ayudarte mejor.', contactTurns: 1 },
  )
  assertEquals(result, 'El agente decidió derivarlo')
})

Deno.test('detectHandoff: la palabra clave del contacto tiene prioridad sobre el resto de señales', () => {
  const result = detectHandoff(
    { escalate_on_keywords: ['estafa'], escalate_after_turns: 10, escalation_message: 'Te paso con alguien' },
    { incomingText: 'Esto es una estafa', reply: 'Lamento el malentendido', contactTurns: 1 },
  )
  assertEquals(result, 'Mencionó "estafa"')
})

Deno.test('detectHandoff: una reclamación real (ejemplo de la lista por defecto) dispara la derivación', () => {
  const result = detectHandoff(
    { escalate_on_keywords: ['hablar con una persona', 'reclamación', 'queja', 'estafa'] },
    { incomingText: 'Quiero hablar con una persona, no me sirve el bot', reply: '', contactTurns: 1 },
  )
  assertEquals(result, 'Mencionó "hablar con una persona"')
})
