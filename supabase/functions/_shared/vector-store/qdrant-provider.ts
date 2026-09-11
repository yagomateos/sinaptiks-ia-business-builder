/**
 * Implementación contra la API REST de Qdrant. VECTOR_SIZE tiene que
 * coincidir con el modelo de embeddings.ts/openai-embeddings.ts
 * (text-embedding-3-small → 1536).
 */
import type { VectorPoint, VectorSearchHit, VectorStoreProvider } from './types.ts'

const QDRANT_URL = (Deno.env.get('QDRANT_URL') ?? '').replace(/\/+$/, '')
const QDRANT_API_KEY = Deno.env.get('QDRANT_API_KEY') ?? ''
const COLLECTION = 'knowledge_chunks'
const VECTOR_SIZE = 1536

export const isQdrantConfigured = Boolean(QDRANT_URL)

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}) }
}

let collectionEnsured = false

/** Idempotente: Qdrant devuelve un error si ya existe, se ignora a propósito. */
async function ensureCollection(): Promise<void> {
  if (collectionEnsured) return

  await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ vectors: { size: VECTOR_SIZE, distance: 'Cosine' } }),
  })

  collectionEnsured = true
}

export const qdrantVectorStore: VectorStoreProvider = {
  async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return
    await ensureCollection()

    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })),
      }),
    })

    if (!response.ok) throw new Error(`Qdrant upsert falló (${response.status}): ${await response.text()}`)
  },

  async search(vector: number[], businessId: string, limit: number): Promise<VectorSearchHit[]> {
    await ensureCollection()

    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        vector,
        limit,
        filter: { must: [{ key: 'businessId', match: { value: businessId } }] },
        with_payload: true,
      }),
    })

    if (!response.ok) throw new Error(`Qdrant search falló (${response.status}): ${await response.text()}`)

    const data = (await response.json()) as {
      result: { id: string | number; score: number; payload: VectorPoint['payload'] }[]
    }
    return data.result.map((r) => ({ id: String(r.id), score: r.score, payload: r.payload }))
  },

  async removeDocument(businessId: string, documentId: string): Promise<void> {
    await ensureCollection()

    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete?wait=true`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'businessId', match: { value: businessId } },
            { key: 'documentId', match: { value: documentId } },
          ],
        },
      }),
    })

    if (!response.ok) throw new Error(`Qdrant delete falló (${response.status}): ${await response.text()}`)
  },
}
