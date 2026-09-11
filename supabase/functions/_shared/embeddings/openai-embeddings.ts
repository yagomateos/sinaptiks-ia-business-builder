/**
 * Embeddings vía OpenAI (text-embedding-3-small, 1536 dimensiones — debe
 * coincidir con VECTOR_SIZE en vector-store/qdrant-provider.ts). Sustituir
 * por otro proveedor es añadir una clase junto a esta e implementar
 * EmbeddingsProvider; nada más del código sabe que es OpenAI.
 */
import type { EmbeddingsProvider } from './types.ts'

const API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const MODEL = 'text-embedding-3-small'

export const isEmbeddingsConfigured = Boolean(API_KEY)

export const openAiEmbeddings: EmbeddingsProvider = {
  async embed(texts: string[]): Promise<number[][]> {
    if (!API_KEY) throw new Error('Los embeddings no están configurados (falta OPENAI_API_KEY)')
    if (texts.length === 0) return []

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: texts }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI embeddings falló (${response.status}): ${await response.text()}`)
    }

    const data = (await response.json()) as { data: { embedding: number[]; index: number }[] }
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
  },
}
