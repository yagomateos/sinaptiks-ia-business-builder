/**
 * Pipeline: Documento → chunks → embeddings → búsqueda → resultados → agente
 * IA. Un único punto de búsqueda, usado tanto por conversation-pipeline.ts
 * (lo que de verdad ve el agente en cada mensaje real) como por la Edge
 * Function `knowledge` (lo que llama el frontend al procesar/probar) — antes
 * cada uno tenía su propia copia del ILIKE, ahora hay una sola.
 *
 * Sin Qdrant/embeddings configurados, o si la llamada falla, cae a la misma
 * búsqueda por palabra clave que ya existía — nunca rompe Knowledge por
 * depender de un proveedor externo.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { embeddingsProvider, isEmbeddingsConfigured } from './embeddings/index.ts'
import { getVectorStoreProvider, isSemanticSearchConfigured } from './vector-store/index.ts'

export interface KnowledgeSearchHit {
  content: string
  documentId: string
  score: number
}

export async function searchKnowledgeChunks(
  admin: SupabaseClient,
  businessId: string,
  query: string,
  limit = 5,
): Promise<KnowledgeSearchHit[]> {
  if (isSemanticSearchConfigured) {
    try {
      return await searchSemantic(businessId, query, limit)
    } catch (error) {
      console.error('Búsqueda semántica de Knowledge falló, cae a palabra clave', error)
    }
  }

  return await searchByKeyword(admin, businessId, query, limit)
}

async function searchSemantic(businessId: string, query: string, limit: number): Promise<KnowledgeSearchHit[]> {
  const [vector] = await embeddingsProvider.embed([query])
  const store = getVectorStoreProvider()
  if (!store) throw new Error('Vector store no disponible')

  const hits = await store.search(vector, businessId, limit)
  return hits.map((h) => ({ content: h.payload.content, documentId: h.payload.documentId, score: h.score }))
}

async function searchByKeyword(
  admin: SupabaseClient,
  businessId: string,
  query: string,
  limit: number,
): Promise<KnowledgeSearchHit[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3)

  if (terms.length === 0) return []

  const { data } = await admin
    .from('knowledge_chunks')
    .select('content, document_id')
    .eq('business_id', businessId)
    .or(terms.map((t) => `content.ilike.%${t}%`).join(','))
    .limit(limit * 4)

  if (!data || data.length === 0) return []

  return data
    .map((row: { content: string; document_id: string }) => {
      const content = row.content.toLowerCase()
      const hits = terms.filter((t) => content.includes(t)).length
      return { content: row.content, documentId: row.document_id, score: hits / terms.length }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Solo el texto de los resultados, unido — es lo que usa el system prompt del agente. */
export async function searchKnowledge(
  admin: SupabaseClient,
  businessId: string,
  query: string,
): Promise<string | null> {
  const hits = await searchKnowledgeChunks(admin, businessId, query, 3)
  if (hits.length === 0) return null
  return hits.map((h) => h.content).join('\n\n')
}

/** No embeddings configurados no es un error — nada indexó nunca en Qdrant en primer lugar. */
export { isEmbeddingsConfigured, isSemanticSearchConfigured }
