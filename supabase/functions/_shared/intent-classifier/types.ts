/**
 * Contrato del clasificador de intención, independiente de proveedor —
 * conversation-pipeline.ts solo conoce esto, nunca si por debajo hay Claude,
 * un proveedor distinto o el clasificador por palabras clave.
 */

export const INTENT_TYPES = ['reserva', 'faq', 'ventas', 'soporte', 'humano', 'otro'] as const
export type IntentType = (typeof INTENT_TYPES)[number]

export interface IntentClassification {
  intent: IntentType
  /** 0-1. Por debajo del umbral de conversation-pipeline.ts, no dispara nada. */
  confidence: number
}

export interface IntentClassifierInput {
  text: string
  businessName: string
  industry: string
  services: string[]
}

export interface IntentClassifierProvider {
  classify(input: IntentClassifierInput): Promise<IntentClassification>
}
