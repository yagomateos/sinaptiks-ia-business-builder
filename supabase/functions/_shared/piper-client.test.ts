/**
 * `PIPER_TTS_URL`/`PIPER_VOICE` se leen de `Deno.env` al cargar el módulo —
 * hay que fijarlos ANTES del import (mismo motivo que en n8n-client.test.ts).
 *
 * Ejecutar: deno test --allow-env supabase/functions/_shared/piper-client.test.ts
 */
Deno.env.set('PIPER_TTS_URL', 'https://piper.test/')

const { textToSpeech, isPiperConfigured } = await import('./piper-client.ts')
import { assertEquals } from 'jsr:@std/assert@1'

const realFetch = globalThis.fetch

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: string, init?: RequestInit) => handler(url, init)) as any
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

Deno.test('isPiperConfigured es true con PIPER_TTS_URL', () => {
  assertEquals(isPiperConfigured, true)
})

Deno.test('textToSpeech: pide el audio con la voz por defecto y la URL sin barra final duplicada', async () => {
  mockFetch((url, init) => {
    assertEquals(url, 'https://piper.test/v1/audio/speech')
    const body = JSON.parse(String(init?.body))
    assertEquals(body.voice, 'es_ES-davefx-medium')
    assertEquals(body.input, 'hola')
    assertEquals(body.response_format, 'mp3')
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
  })

  try {
    const audio = await textToSpeech('hola')
    assertEquals(audio.length, 3)
  } finally {
    restoreFetch()
  }
})

Deno.test('textToSpeech: Piper responde con error -> lanza con el status y el cuerpo', async () => {
  mockFetch(() => new Response('voz no encontrada', { status: 404 }))

  try {
    await textToSpeech('hola')
    throw new Error('no debería haber resuelto')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assertEquals(message.includes('404'), true)
    assertEquals(message.includes('voz no encontrada'), true)
  } finally {
    restoreFetch()
  }
})

Deno.test('textToSpeech: sin PIPER_TTS_URL -> lanza sin llamar a fetch', async () => {
  Deno.env.delete('PIPER_TTS_URL')
  const { textToSpeech: textToSpeechSinUrl, isPiperConfigured: configuradoSinUrl } = await import(
    './piper-client.ts?case=sin-url'
  )

  assertEquals(configuradoSinUrl, false)

  mockFetch(() => {
    throw new Error('no debería llamar a fetch sin PIPER_TTS_URL')
  })

  try {
    await textToSpeechSinUrl('hola')
    throw new Error('no debería haber resuelto')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assertEquals(message.includes('PIPER_TTS_URL'), true)
  } finally {
    restoreFetch()
    Deno.env.set('PIPER_TTS_URL', 'https://piper.test/')
  }
})
