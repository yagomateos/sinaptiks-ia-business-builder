/**
 * Clasificador con IA — más fino que el de palabras clave cuando el mensaje
 * no encaja en ninguna señal conocida, usando el contexto real del negocio
 * (nombre, sector, servicios). Implementa el mismo IntentClassifierProvider
 * que el heurístico: conversation-pipeline.ts no distingue cuál está usando.
 */
import { completeJson } from '../anthropic-client.ts'
import { INTENT_TYPES, type IntentClassification, type IntentClassifierInput, type IntentClassifierProvider } from './types.ts'
import { heuristicIntentClassifier } from './heuristic-classifier.ts'

export const claudeIntentClassifier: IntentClassifierProvider = {
  async classify(input: IntentClassifierInput): Promise<IntentClassification> {
    try {
      const result = await completeJson<{ intent: string; confidence: number }>(
        `Clasificas la intención de un mensaje que le escribe un cliente a un negocio, en español.

Responde ÚNICAMENTE con un JSON válido, sin explicaciones antes ni después, con esta forma exacta:
{"intent": ${INTENT_TYPES.map((t) => `"${t}"`).join('|')}, "confidence": number}

- reserva: quiere pedir o cambiar una cita/hora.
- faq: pregunta información general (horario, ubicación, condiciones...).
- ventas: quiere comprar, contratar, o pregunta precio con intención de compra.
- soporte: tiene un problema con algo que ya tiene o ya contrató.
- humano: pide explícitamente hablar con una persona, o suena enfadado/es una queja.
- otro: no encaja claramente en ninguna de las anteriores (saludo suelto, charla, etc).

confidence: 0 a 1, qué tan seguro estás.`,
        `Negocio: ${input.businessName} (${input.industry}). Servicios: ${input.services.join(', ') || 'sin listar'}.

Mensaje del cliente: "${input.text}"`,
        { effort: 'low', maxTokens: 150 },
      )

      const intent = INTENT_TYPES.includes(result.intent as IntentClassification['intent'])
        ? (result.intent as IntentClassification['intent'])
        : 'otro'
      const confidence = Number.isFinite(result.confidence) ? Math.min(Math.max(result.confidence, 0), 1) : 0.5

      return { intent, confidence }
    } catch (error) {
      // Mismo principio que el resto del pipeline: un fallo de la IA no deja
      // sin clasificar — cae al heurístico, igual que responder_ia cae al
      // motor de reglas cuando Claude falla.
      console.error('Clasificador de intención con IA falló, cae al heurístico', error)
      return await heuristicIntentClassifier.classify(input)
    }
  },
}
