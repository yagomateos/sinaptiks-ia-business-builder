/**
 * Punto de entrada único del clasificador. Primero el heurístico (gratis,
 * inmediato); si no encuentra una señal clara y hay IA configurada, se afina
 * con ella — así la mayoría de mensajes (los que ya traen una palabra clave
 * reconocible) no gastan ni una llamada a Claude, y los ambiguos sí se
 * benefician de tener contexto real del negocio.
 */
import { isAnthropicConfigured } from '../anthropic-client.ts'
import { heuristicIntentClassifier } from './heuristic-classifier.ts'
import { claudeIntentClassifier } from './claude-classifier.ts'
import type { IntentClassification, IntentClassifierInput } from './types.ts'

export * from './types.ts'

/** Por debajo de esto, conversation-pipeline.ts no dispara automatizaciones. */
export const INTENT_CONFIDENCE_THRESHOLD = 0.55

const HEURISTIC_IS_CONFIDENT = 0.7

export async function classifyIntent(input: IntentClassifierInput): Promise<IntentClassification> {
  const heuristic = await heuristicIntentClassifier.classify(input)
  if (heuristic.confidence >= HEURISTIC_IS_CONFIDENT || !isAnthropicConfigured) {
    return heuristic
  }

  return await claudeIntentClassifier.classify(input)
}
