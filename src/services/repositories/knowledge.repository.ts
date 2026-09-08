import { supabase } from '../supabase/client'
import { toAppError, unwrap } from '../supabase/errors'
import type { KnowledgeChunk, KnowledgeDocument, UUID } from '@/domain/types'

export type KnowledgeDocumentDraft = Omit<
  KnowledgeDocument,
  'id' | 'created_at' | 'updated_at' | 'chunk_count' | 'error_message'
>

export const knowledgeRepository = {
  async listDocuments(businessId: UUID): Promise<KnowledgeDocument[]> {
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (error) throw toAppError(error, 'No hemos podido cargar tu conocimiento.')
    return (data ?? []) as KnowledgeDocument[]
  },

  async getDocument(documentId: UUID): Promise<KnowledgeDocument> {
    const result = await supabase
      .from('knowledge_documents')
      .select('*')
      .eq('id', documentId)
      .single()

    return unwrap(result, 'No hemos encontrado este documento.')
  },

  async createDocument(draft: KnowledgeDocumentDraft): Promise<KnowledgeDocument> {
    const result = await supabase.from('knowledge_documents').insert(draft).select().single()
    return unwrap(result, 'No hemos podido guardar el documento.')
  },

  async updateDocument(
    documentId: UUID,
    patch: Partial<KnowledgeDocument>,
  ): Promise<KnowledgeDocument> {
    const result = await supabase
      .from('knowledge_documents')
      .update(patch)
      .eq('id', documentId)
      .select()
      .single()

    return unwrap(result, 'No hemos podido actualizar el documento.')
  },

  async removeDocument(documentId: UUID): Promise<void> {
    const { error } = await supabase.from('knowledge_documents').delete().eq('id', documentId)
    if (error) throw toAppError(error, 'No hemos podido eliminar el documento.')
  },

  async listChunks(documentId: UUID): Promise<KnowledgeChunk[]> {
    const { data, error } = await supabase
      .from('knowledge_chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })

    if (error) throw toAppError(error, 'No hemos podido cargar el contenido procesado.')
    return (data ?? []) as KnowledgeChunk[]
  },

  async replaceChunks(
    documentId: UUID,
    businessId: UUID,
    chunks: { content: string; tokenCount: number }[],
  ): Promise<KnowledgeChunk[]> {
    const { error: deleteError } = await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', documentId)

    if (deleteError) throw toAppError(deleteError, 'No hemos podido procesar el documento.')
    if (chunks.length === 0) return []

    const result = await supabase
      .from('knowledge_chunks')
      .insert(
        chunks.map((chunk, index) => ({
          document_id: documentId,
          business_id: businessId,
          chunk_index: index,
          content: chunk.content,
          token_count: chunk.tokenCount,
        })),
      )
      .select()

    return unwrap(result, 'No hemos podido guardar el contenido procesado.')
  },
}
