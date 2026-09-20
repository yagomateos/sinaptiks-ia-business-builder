/**
 * Cubre la regla de prioridad de `tts.ts`: con Piper Y ElevenLabs
 * configurados a la vez (el estado real de producción — Piper activo,
 * ElevenLabs guardado como fallback de pago para más adelante), debe usarse
 * Piper, nunca ElevenLabs.
 *
 * Las claves se leen de `Deno.env` al cargar los módulos — hay que fijarlas
 * ANTES del import (mismo motivo que en piper-client.test.ts).
 *
 * Ejecutar: deno test --allow-env supabase/functions/_shared/tts.test.ts
 */
Deno.env.set('PIPER_TTS_URL', 'https://piper.test/')
Deno.env.set('ELEVENLABS_API_KEY', 'test-elevenlabs-key')

const { isTtsConfigured, textToSpeech } = await import('./tts.ts')
import { assertEquals } from 'jsr:@std/assert@1'

const realFetch = globalThis.fetch

function mockFetch(handler: (url: string) => Response) {
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: string) => handler(url)) as any
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

Deno.test('isTtsConfigured es true cuando hay al menos un proveedor', () => {
  assertEquals(isTtsConfigured, true)
})

Deno.test('textToSpeech: con Piper y ElevenLabs configurados a la vez, gana Piper', async () => {
  let calledHost = ''
  mockFetch((url) => {
    calledHost = new URL(url).host
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
  })

  try {
    await textToSpeech('hola')
    assertEquals(calledHost, 'piper.test')
  } finally {
    restoreFetch()
  }
})
