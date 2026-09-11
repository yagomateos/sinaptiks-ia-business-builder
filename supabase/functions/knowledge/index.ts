/**
 * Edge Function `knowledge` — el otro extremo de src/services/vector/index.ts
 * (remoteVectorStore). Antes esta ruta no existía: cada "Procesar documento"
 * llamaba a /knowledge/upsert, recibía un 404, y el documento quedaba
 * marcado como "error" aunque sus fragmentos sí se habían guardado en
 * Postgres — el propio flujo de Knowledge estaba roto en producción.
 *
 * Rutas (bajo /functions/v1/knowledge):
 *   POST /upsert   indexa chunks en el vector store (o no hace nada si no
 *                  hay Qdrant/embeddings — nunca rompe el flujo)
 *   POST /search   busca — semántica si está configurado, palabra clave si no
 *   POST /remove   borra los vectores de un documento
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  assertBusinessAccess,
  authenticate,
  CORS_HEADERS,
  errorResponse,
  HttpError,
  json,
  type AuthContext,
} from '../_shared/auth.ts'
import { embeddingsProvider } from '../_shared/embeddings/index.ts'
import { getVectorStoreProvider, isSemanticSearchConfigured } from '../_shared/vector-store/index.ts'
import { searchKnowledgeChunks } from '../_shared/knowledge-search.ts'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface UpsertRecord {
  id: string
  businessId: string
  documentId: string
  chunkIndex: number
  content: string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const ctx = await authenticate(request)
    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const start = segments.indexOf('knowledge')
    const path = start >= 0 ? segments.slice(start + 1) : segments

    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

    if (path[0] === 'upsert') return await handleUpsert(ctx, request)
    if (path[0] === 'search') return await handleSearch(ctx, request)
    if (path[0] === 'remove') return await handleRemove(ctx, request)

    throw new HttpError(404, 'Ruta desconocida')
  } catch (error) {
    return errorResponse(error)
  }
})

async function handleUpsert(ctx: AuthContext, request: Request): Promise<Response> {
  const body = (await request.json()) as { records?: UpsertRecord[] }
  const records = body.records ?? []
  if (records.length === 0) return json({ ok: true, indexed: 0, semantic: isSemanticSearchConfigured })

  const businessId = records[0].businessId
  await assertBusinessAccess(ctx, businessId)

  if (!isSemanticSearchConfigured) {
    // Los chunks ya viven en Postgres — los guardó
    // knowledgeRepository.replaceChunks antes de llamar aquí. Sin
    // Qdrant/embeddings esto no es un error: es el fallback a palabra clave,
    // que ya funciona sobre esa misma tabla.
    return json({ ok: true, indexed: 0, semantic: false })
  }

  const vectors = await embeddingsProvider.embed(records.map((r) => r.content))
  const store = getVectorStoreProvider()!

  await store.upsert(
    records.map((r, i) => ({
      id: r.id,
      vector: vectors[i],
      payload: { businessId: r.businessId, documentId: r.documentId, chunkIndex: r.chunkIndex, content: r.content },
    })),
  )

  // vector_id = el propio id del chunk (es el mismo id que se usó como punto
  // en Qdrant) — sirve de marca de "esto ya está indexado semánticamente".
  await Promise.all(
    records.map((r) => admin.from('knowledge_chunks').update({ vector_id: r.id }).eq('id', r.id)),
  )

  return json({ ok: true, indexed: records.length, semantic: true })
}

async function handleSearch(ctx: AuthContext, request: Request): Promise<Response> {
  const body = (await request.json()) as { businessId?: string; query?: string; limit?: number }
  if (!body.businessId || !body.query) throw new HttpError(400, 'Faltan businessId o query')

  await assertBusinessAccess(ctx, body.businessId)

  const hits = await searchKnowledgeChunks(admin, body.businessId, body.query, body.limit ?? 5)
  return json(hits)
}

async function handleRemove(ctx: AuthContext, request: Request): Promise<Response> {
  const body = (await request.json()) as { businessId?: string; documentId?: string }
  if (!body.businessId || !body.documentId) throw new HttpError(400, 'Faltan businessId o documentId')

  await assertBusinessAccess(ctx, body.businessId)

  if (isSemanticSearchConfigured) {
    try {
      await getVectorStoreProvider()!.removeDocument(body.businessId, body.documentId)
    } catch (error) {
      // El cascade delete de knowledge_chunks en Postgres ya limpió lo
      // importante — un fallo aquí no debe impedir borrar el documento.
      console.error('No se pudieron borrar los vectores de Qdrant', error)
    }
  }

  return json({ ok: true })
}
