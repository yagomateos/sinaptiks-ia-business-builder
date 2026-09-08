/**
 * Vector store contract for the knowledge base.
 *
 * Pipeline: Document → Chunk → Embedding → Vector store → Retrieval → Agent.
 * Chunking is implemented here (it is pure). Embedding and search go through
 * the backend, which holds the Qdrant and embedding-model credentials.
 */
import type { UUID } from '@/domain/types'

export interface VectorRecord {
  id: string
  businessId: UUID
  documentId: UUID
  chunkIndex: number
  content: string
}

export interface RetrievalHit {
  content: string
  documentId: UUID
  score: number
}

export interface VectorStore {
  readonly isLive: boolean
  upsert(records: VectorRecord[]): Promise<void>
  search(businessId: UUID, query: string, limit?: number): Promise<RetrievalHit[]>
  removeDocument(businessId: UUID, documentId: UUID): Promise<void>
}

const CHUNK_SIZE = 900
const CHUNK_OVERLAP = 120

export interface TextChunk {
  content: string
  tokenCount: number
}

/**
 * Splits text on paragraph boundaries, packing up to CHUNK_SIZE characters and
 * carrying CHUNK_OVERLAP characters of tail into the next chunk so a fact split
 * across a boundary stays retrievable.
 */
export function chunkText(text: string): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n{2,}/).filter((p) => p.trim())
  const chunks: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 2 <= CHUNK_SIZE) {
      current = current ? `${current}\n\n${paragraph}` : paragraph
      continue
    }

    if (current) {
      chunks.push(current)
      current = current.slice(-CHUNK_OVERLAP)
      current = current ? `${current}\n\n${paragraph}` : paragraph
    } else {
      current = paragraph
    }

    while (current.length > CHUNK_SIZE) {
      chunks.push(current.slice(0, CHUNK_SIZE))
      current = current.slice(CHUNK_SIZE - CHUNK_OVERLAP)
    }
  }

  if (current.trim()) chunks.push(current)

  return chunks.map((content) => ({
    content: content.trim(),
    tokenCount: estimateTokens(content),
  }))
}

/** Rough estimate — the real count comes from the provider at embed time. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
