/**
 * Solo cubre `transcribeAudio` — es la pieza nueva de este mes (notas de voz
 * de clientes en Telegram) y no tenía ningún test. `complete()` ya se ejerce
 * indirectamente a través de otros flujos; no es el foco de esta cobertura.
 *
 * `OPENAI_API_KEY` se lee de `Deno.env` al cargar el módulo — hay que
 * fijarla ANTES del import (mismo motivo que en n8n-client.test.ts).
 *
 * Ejecutar: deno test --allow-env supabase/functions/_shared/openai-client.test.ts
 */
Deno.env.set('OPENAI_API_KEY', 'test-api-key')

const { transcribeAudio } = await import('./openai-client.ts')
import { HttpError } from './auth.ts'
import { assertEquals, assertInstanceOf } from 'jsr:@std/assert@1'

const realFetch = globalThis.fetch

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: string, init?: RequestInit) => handler(url, init)) as any
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

const audio = new Uint8Array([1, 2, 3])

Deno.test('transcribeAudio: Whisper responde con texto -> lo devuelve recortado', async () => {
  mockFetch((url, init) => {
    assertEquals(url, 'https://api.openai.com/v1/audio/transcriptions')
    assertEquals(init?.method, 'POST')
    assertEquals((init?.headers as Record<string, string>)?.Authorization, 'Bearer test-api-key')
    return new Response(JSON.stringify({ text: '  hola, quiero una cita  ' }), { status: 200 })
  })

  try {
    const text = await transcribeAudio(audio, 'nota.ogg')
    assertEquals(text, 'hola, quiero una cita')
  } finally {
    restoreFetch()
  }
})

Deno.test('transcribeAudio: Whisper responde con error -> HttpError 502, nunca se finge una transcripción', async () => {
  mockFetch(() => new Response('modelo saturado', { status: 429 }))

  try {
    await transcribeAudio(audio)
    throw new Error('no debería haber resuelto')
  } catch (error) {
    assertInstanceOf(error, HttpError)
    assertEquals(error.status, 502)
  } finally {
    restoreFetch()
  }
})

Deno.test('transcribeAudio: Whisper responde 200 pero sin texto -> HttpError 502 en vez de devolver vacío', async () => {
  mockFetch(() => new Response(JSON.stringify({ text: '   ' }), { status: 200 }))

  try {
    await transcribeAudio(audio)
    throw new Error('no debería haber resuelto')
  } catch (error) {
    assertInstanceOf(error, HttpError)
    assertEquals(error.status, 502)
  } finally {
    restoreFetch()
  }
})

Deno.test('transcribeAudio: sin OPENAI_API_KEY -> HttpError 503, sin llamar a Whisper', async () => {
  Deno.env.delete('OPENAI_API_KEY')
  const { transcribeAudio: transcribeSinClave } = await import('./openai-client.ts?case=sin-clave')

  mockFetch(() => {
    throw new Error('no debería llamar a fetch sin clave configurada')
  })

  try {
    await transcribeSinClave(audio)
    throw new Error('no debería haber resuelto')
  } catch (error) {
    assertInstanceOf(error, HttpError)
    assertEquals(error.status, 503)
  } finally {
    restoreFetch()
    Deno.env.set('OPENAI_API_KEY', 'test-api-key')
  }
})
