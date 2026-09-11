import { isEmbeddingsConfigured } from '../embeddings/index.ts'
import { isQdrantConfigured, qdrantVectorStore } from './qdrant-provider.ts'
import type { VectorStoreProvider } from './types.ts'

export type { VectorPoint, VectorPointPayload, VectorSearchHit, VectorStoreProvider } from './types.ts'

/** Hacen falta ambas piezas: de nada sirve el vector store sin poder generar el vector, o al revés. */
export const isSemanticSearchConfigured = isQdrantConfigured && isEmbeddingsConfigured

export function getVectorStoreProvider(): VectorStoreProvider | null {
  return isSemanticSearchConfigured ? qdrantVectorStore : null
}
