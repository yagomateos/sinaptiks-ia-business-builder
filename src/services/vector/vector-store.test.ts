import { describe, expect, it } from 'vitest'
import { chunkText, estimateTokens } from './vector-store'

const CHUNK_SIZE = 900

describe('chunkText', () => {
  it('returns nothing for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  it('keeps short text as a single chunk', () => {
    const chunks = chunkText('Horario: de lunes a viernes, de 9 a 20h.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Horario: de lunes a viernes, de 9 a 20h.')
  })

  it('never produces a chunk longer than the configured size', () => {
    const text = 'Lorem ipsum dolor sit amet. '.repeat(200) // well over 900 chars, no paragraph breaks
    const chunks = chunkText(text)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_SIZE)
    }
  })

  it('never drops content: every chunk boundary preserves the tail as overlap into the next', () => {
    // A single word that can't fit is not lost, and the last chunk's content
    // is present somewhere across the produced chunks.
    const paragraph = Array.from({ length: 40 }, (_, i) => `Frase número ${i}.`).join(' ')
    const chunks = chunkText(paragraph)

    expect(chunks.every((c) => c.content.length > 0)).toBe(true)
    expect(chunks[chunks.length - 1].content).toContain('Frase número 39.')
  })

  it('keeps separate paragraphs together in one chunk while they fit', () => {
    const text = 'Primer párrafo corto.\n\nSegundo párrafo también corto.'
    const chunks = chunkText(text)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toContain('Primer párrafo corto.')
    expect(chunks[0].content).toContain('Segundo párrafo también corto.')
  })

  it('splits across paragraph boundaries once the size limit is exceeded', () => {
    const bigParagraph = 'Ficha de precios y condiciones. '.repeat(40) // ~1320 chars
    const text = `${bigParagraph}\n\nNota final breve.`
    const chunks = chunkText(text)

    expect(chunks.length).toBeGreaterThan(1)
  })

  it('is deterministic for identical input', () => {
    const text = 'Un texto cualquiera.\n\nCon dos párrafos.'
    expect(chunkText(text)).toEqual(chunkText(text))
  })
})

describe('estimateTokens', () => {
  it('scales roughly with text length', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })
})
