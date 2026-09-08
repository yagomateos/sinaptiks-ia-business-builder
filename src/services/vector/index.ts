import { supabase } from '@/services/supabase/client'
import type { UUID } from '@/domain/types'
import type { RetrievalHit, VectorRecord, VectorStore } from './vector-store'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

/**
 * Keyword fallback used until Qdrant is connected. Retrieval quality is lower
 * than embeddings, but the pipeline shape — and every caller — is identical.
 */
const localVectorStore: VectorStore = {
  isLive: false,

  async upsert() {
    // Chunks already live in Postgres; nothing else to do without embeddings.
  },

  async search(businessId: UUID, query: string, limit = 5): Promise<RetrievalHit[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3)

    if (terms.length === 0) return []

    const { data, error } = await supabase
      .from('knowledge_chunks')
      .select('content, document_id')
      .eq('business_id', businessId)
      .or(terms.map((t) => `content.ilike.%${t}%`).join(','))
      .limit(limit * 4)

    if (error || !data) return []

    return data
      .map((row) => {
        const content = row.content.toLowerCase()
        const hits = terms.filter((t) => content.includes(t)).length
        return {
          content: row.content,
          documentId: row.document_id as UUID,
          score: hits / terms.length,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  },

  async removeDocument() {
    // Cascade delete on knowledge_chunks already handles this.
  },
}

const remoteVectorStore: VectorStore = {
  isLive: true,

  async upsert(records: VectorRecord[]): Promise<void> {
    await call('/knowledge/upsert', { records })
  },

  async search(businessId: UUID, query: string, limit = 5): Promise<RetrievalHit[]> {
    return call<RetrievalHit[]>('/knowledge/search', { businessId, query, limit })
  },

  async removeDocument(businessId: UUID, documentId: UUID): Promise<void> {
    await call('/knowledge/remove', { businessId, documentId })
  },
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new Error(`Base de conocimiento respondió ${response.status}`)
  return (await response.json()) as T
}

export const vectorStore: VectorStore = apiBaseUrl ? remoteVectorStore : localVectorStore

export { chunkText, estimateTokens } from './vector-store'
export type { VectorStore, VectorRecord, RetrievalHit } from './vector-store'
