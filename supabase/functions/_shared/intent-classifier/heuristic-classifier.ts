/**
 * Clasificador por palabras clave — funciona siempre, sin ningún proveedor
 * de IA configurado ni coste por mensaje. Mismo espíritu que rules-reply.ts:
 * mejor una intención razonable por señales conocidas que nada en absoluto.
 * Es también el fallback de ClaudeIntentClassifier si la llamada falla.
 */
import type { IntentClassification, IntentClassifierInput, IntentClassifierProvider } from './types.ts'

const SIGNALS: { intent: IntentClassification['intent']; words: string[] }[] = [
  {
    intent: 'humano',
    words: [
      'hablar con una persona', 'hablar con alguien', 'reclamación', 'queja', 'abogado',
      'denuncia', 'esto es una estafa', 'quiero cancelar', 'no es lo que pedí',
    ],
  },
  {
    intent: 'reserva',
    words: [
      'quiero reservar', 'pedir cita', 'coger cita', 'necesito una cita', 'quiero una cita',
      'dar cita', 'pedir hora', 'quiero cita', 'agendar', 'quiero hueco', 'hay hueco',
      'teneis hueco', 'tenéis hueco', 'disponibilidad para', 'que dia puedo',
    ],
  },
  {
    intent: 'soporte',
    words: [
      'no funciona', 'no me funciona', 'tengo un problema', 'error al', 'no puedo acceder',
      'se ha roto', 'no llega', 'sigue sin funcionar', 'ayuda con mi pedido', 'incidencia',
    ],
  },
  {
    intent: 'ventas',
    words: [
      'quiero comprar', 'quiero contratar', 'cuanto cuesta', 'cuánto cuesta', 'que precio',
      'qué precio', 'precio de', 'presupuesto', 'tarifa', 'me interesa contratar', 'descuento',
    ],
  },
  {
    intent: 'faq',
    words: [
      'donde estais', 'dónde estáis', 'horario', 'que horario', 'cuando abrís', 'cuándo abrís',
      'aceptáis', 'aceptais', 'tenéis parking', 'como llego', 'cómo llego', 'que necesito para',
    ],
  },
]

export const heuristicIntentClassifier: IntentClassifierProvider = {
  // deno-lint-ignore require-await
  async classify(input: IntentClassifierInput): Promise<IntentClassification> {
    const text = input.text.toLowerCase()

    for (const { intent, words } of SIGNALS) {
      if (words.some((w) => text.includes(w))) {
        return { intent, confidence: 0.75 }
      }
    }

    return { intent: 'otro', confidence: 0.3 }
  },
}
