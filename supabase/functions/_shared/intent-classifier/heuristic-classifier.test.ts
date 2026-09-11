/**
 * El heurístico decide primero en `conversation-pipeline.ts` — la mayoría de
 * mensajes no llegan a gastar una llamada a Claude. Un fallo aquí (una
 * palabra que deja de disparar, o dispara la intención equivocada) mueve mal
 * automatizaciones reales (`mensaje_entrante` con `intent`) sin que nada lo
 * note hasta producción.
 *
 * Ejecutar: deno test supabase/functions/_shared/intent-classifier/heuristic-classifier.test.ts
 */
import { assertEquals, assertGreaterOrEqual } from 'jsr:@std/assert@1'
import { heuristicIntentClassifier } from './heuristic-classifier.ts'
import type { IntentClassifierInput } from './types.ts'

function input(text: string): IntentClassifierInput {
  return { text, businessName: 'Negocio de prueba', industry: 'servicios', services: [] }
}

Deno.test('heuristicIntentClassifier: detecta intención de reserva', async () => {
  const result = await heuristicIntentClassifier.classify(input('Hola, quiero pedir cita para el jueves'))
  assertEquals(result.intent, 'reserva')
})

Deno.test('heuristicIntentClassifier: detecta intención de ventas', async () => {
  const result = await heuristicIntentClassifier.classify(input('¿Cuánto cuesta el tratamiento?'))
  assertEquals(result.intent, 'ventas')
})

Deno.test('heuristicIntentClassifier: detecta intención de soporte', async () => {
  const result = await heuristicIntentClassifier.classify(input('Tengo un problema con mi pedido'))
  assertEquals(result.intent, 'soporte')
})

Deno.test('heuristicIntentClassifier: detecta petición explícita de hablar con una persona', async () => {
  const result = await heuristicIntentClassifier.classify(input('Quiero hablar con una persona, por favor'))
  assertEquals(result.intent, 'humano')
})

Deno.test('heuristicIntentClassifier: detecta preguntas frecuentes (horario, ubicación)', async () => {
  const result = await heuristicIntentClassifier.classify(input('¿Qué horario tenéis los sábados?'))
  assertEquals(result.intent, 'faq')
})

Deno.test('heuristicIntentClassifier: sin ninguna señal reconocida, cae a "otro" con confianza baja', async () => {
  const result = await heuristicIntentClassifier.classify(input('Hola buenas'))
  assertEquals(result.intent, 'otro')
  assertEquals(result.confidence < 0.5, true)
})

Deno.test('heuristicIntentClassifier: no distingue mayúsculas/minúsculas', async () => {
  const result = await heuristicIntentClassifier.classify(input('QUIERO RESERVAR para mañana'))
  assertEquals(result.intent, 'reserva')
})

Deno.test('heuristicIntentClassifier: una señal reconocida siempre supera el umbral de confianza (0.75)', async () => {
  const result = await heuristicIntentClassifier.classify(input('Necesito una cita cuanto antes'))
  assertGreaterOrEqual(result.confidence, 0.75)
})
