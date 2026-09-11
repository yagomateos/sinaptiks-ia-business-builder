/**
 * Contrato del vector store, independiente de proveedor — igual que
 * CalendarProvider o IntentClassifierProvider, nadie fuera de este directorio
 * habla directamente con Qdrant.
 */
export interface VectorPointPayload {
  businessId: string
  documentId: string
  chunkIndex: number
  content: string
}

export interface VectorPoint {
  /** Mismo id que knowledge_chunks.id — así vector_id apunta directo a él. */
  id: string
  vector: number[]
  payload: VectorPointPayload
}

export interface VectorSearchHit {
  id: string
  score: number
  payload: VectorPointPayload
}

export interface VectorStoreProvider {
  upsert(points: VectorPoint[]): Promise<void>
  search(vector: number[], businessId: string, limit: number): Promise<VectorSearchHit[]>
  removeDocument(businessId: string, documentId: string): Promise<void>
}
