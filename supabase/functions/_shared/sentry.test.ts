/**
 * `sentry.ts` lee `SENTRY_DSN` al cargar el módulo (mismo motivo que en los
 * tests de `appointment-booking.ts`: hay que fijar la variable de entorno
 * ANTES de importar). Como aquí se prueban dos configuraciones distintas
 * (con DSN y sin DSN) en el mismo archivo, cada bloque importa el módulo con
 * un query string distinto para forzar una instancia nueva — si no, Deno
 * reutilizaría el módulo ya cacheado de la primera importación.
 *
 * Ejecutar: deno test --allow-env supabase/functions/_shared/sentry.test.ts
 */
import { assertEquals } from 'jsr:@std/assert@1'

const realFetch = globalThis.fetch

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: string, init?: RequestInit) => handler(url, init)) as any
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

Deno.test('sin SENTRY_DSN configurado: isSentryConfigured es false y reportError no llama a fetch', async () => {
  Deno.env.delete('SENTRY_DSN')
  const { isSentryConfigured, reportError } = await import('./sentry.ts?case=sin-dsn')

  assertEquals(isSentryConfigured, false)

  mockFetch(() => {
    throw new Error('no debería llamar a fetch sin DSN configurado')
  })

  try {
    reportError(new Error('no debería enviarse'))
    // reportError es fire-and-forget: si hubiera llamado a fetch, el mock
    // habría lanzado de forma síncrona al construir la Response de arriba.
  } finally {
    restoreFetch()
  }
})

Deno.test('con SENTRY_DSN mal formado: isSentryConfigured es false', async () => {
  Deno.env.set('SENTRY_DSN', 'esto-no-es-una-url')
  const { isSentryConfigured } = await import('./sentry.ts?case=dsn-invalido')

  assertEquals(isSentryConfigured, false)
})

Deno.test('con SENTRY_DSN válido: reportError manda un envelope al host y proyecto correctos', async () => {
  Deno.env.set('SENTRY_DSN', 'https://miclave@o123.ingest.sentry.io/456')
  const { isSentryConfigured, reportError } = await import('./sentry.ts?case=dsn-valido')

  assertEquals(isSentryConfigured, true)

  const calls: { url: string; body: string }[] = []
  mockFetch((url, init) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    return new Response(null, { status: 200 })
  })

  try {
    reportError(new Error('fallo de prueba'), { function: 'test' })
    // El envío es fire-and-forget (una promesa no esperada dentro de
    // reportError) — se cede el turno al microtask que hace el fetch antes
    // de comprobar que se llamó.
    await Promise.resolve()
    await Promise.resolve()

    assertEquals(calls.length, 1)
    assertEquals(
      calls[0].url,
      'https://o123.ingest.sentry.io/api/456/envelope/?sentry_key=miclave&sentry_version=7',
    )
    // El envelope son 3 líneas NDJSON: cabecera, tipo de item, y el evento.
    const lines = calls[0].body.trim().split('\n')
    assertEquals(lines.length, 3)
    const event = JSON.parse(lines[2])
    assertEquals(event.message, 'fallo de prueba')
    assertEquals(event.tags, { function: 'test' })
  } finally {
    restoreFetch()
    Deno.env.delete('SENTRY_DSN')
  }
})

Deno.test('reportError nunca lanza, aunque el error de entrada no sea un Error real', async () => {
  Deno.env.set('SENTRY_DSN', 'https://miclave@o123.ingest.sentry.io/456')
  const { reportError } = await import('./sentry.ts?case=entrada-rara')

  mockFetch(() => new Response(null, { status: 200 }))

  try {
    // No debe lanzar con un string, un objeto plano, o undefined.
    reportError('un string cualquiera')
    reportError({ algo: 'raro' })
    reportError(undefined)
  } finally {
    restoreFetch()
    Deno.env.delete('SENTRY_DSN')
  }
})
