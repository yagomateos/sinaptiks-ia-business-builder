/**
 * Contrato de embeddings, independiente de proveedor — el vector store y la
 * búsqueda de Knowledge solo hablan con esto, nunca directamente con OpenAI.
 */
export interface EmbeddingsProvider {
  embed(texts: string[]): Promise<number[][]>
}
