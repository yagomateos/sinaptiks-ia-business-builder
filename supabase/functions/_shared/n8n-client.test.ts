/**
 * `N8N_API_URL`/`N8N_API_KEY` se leen de `Deno.env` al cargar el módulo —
 * hay que fijarlos ANTES del import (mismo motivo que en los demás tests de
 * clientes con configuración a nivel de módulo, ver stripe-client.test.ts).
 *
 * Ejecutar: deno test --allow-env supabase/functions/_shared/n8n-client.test.ts
 */
Deno.env.set('N8N_API_URL', 'https://n8n.test')
Deno.env.set('N8N_API_KEY', 'test-api-key')

const { n8n } = await import('./n8n-client.ts')
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

/** Lo que produce un fetch() real cuando su AbortSignal se dispara. */
function timeoutError(): never {
  throw new DOMException('The signal has been aborted', 'TimeoutError')
}

Deno.test('n8n.create: un timeout de verdad (fetch aborta) se convierte en 504, no en un TypeError crudo', async () => {
  mockFetch(() => timeoutError())

  try {
    await n8n.create({ name: 'test' })
    throw new Error('no debería haber resuelto')
  } catch (error) {
    assertInstanceOf(error, HttpError)
    assertEquals(error.status, 504)
  } finally {
    restoreFetch()
  }
})

Deno.test('n8n.trigger: un timeout de verdad también se convierte en 504', async () => {
  mockFetch(() => timeoutError())

  try {
    await n8n.trigger('sinaptkis/automation-1', { hola: 'mundo' })
    throw new Error('no debería haber resuelto')
  } catch (error) {
    assertInstanceOf(error, HttpError)
    assertEquals(error.status, 504)
  } finally {
    restoreFetch()
  }
})

Deno.test('n8n.create: pasa el AbortSignal con timeout a fetch', async () => {
  let receivedSignal: AbortSignal | undefined
  mockFetch((_url, init) => {
    receivedSignal = init?.signal as AbortSignal
    return new Response(JSON.stringify({ id: 'wf_1', name: 'x', active: false }), { status: 200 })
  })

  try {
    await n8n.create({ name: 'test' })
    assertEquals(receivedSignal instanceof AbortSignal, true)
  } finally {
    restoreFetch()
  }
})

Deno.test('n8n.create: un error real de n8n (500) sigue devolviendo un HttpError legible, no el timeout', async () => {
  mockFetch(() => new Response('boom', { status: 500 }))

  try {
    await n8n.create({ name: 'test' })
    throw new Error('no debería haber resuelto')
  } catch (error) {
    assertInstanceOf(error, HttpError)
    assertEquals(error.status, 502)
  } finally {
    restoreFetch()
  }
})

Deno.test('n8n.trigger: sin N8N_API_URL configurado, falla con 503 en vez de un fetch a una URL rota', async () => {
  mockFetch(() => {
    throw new Error('no debería llamar a fetch sin el motor configurado')
  })

  try {
    // Import con un query distinto para forzar una instancia de módulo nueva
    // que lea el entorno SIN N8N_API_URL, sin afectar al resto de tests de
    // este archivo (que sí lo necesitan configurado).
    const originalUrl = Deno.env.get('N8N_API_URL')
    Deno.env.delete('N8N_API_URL')
    const { n8n: unconfigured } = await import('./n8n-client.ts?unconfigured-test')
    if (originalUrl) Deno.env.set('N8N_API_URL', originalUrl)

    try {
      await unconfigured.trigger('sinaptkis/automation-1', {})
      throw new Error('no debería haber resuelto')
    } catch (error) {
      assertInstanceOf(error, HttpError)
      assertEquals(error.status, 503)
    }
  } finally {
    restoreFetch()
  }
})
