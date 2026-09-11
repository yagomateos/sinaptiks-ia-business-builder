/**
 * `GoogleCalendarProvider` es lo que decide qué huecos parecen libres y crea
 * la cita de verdad en el calendario del negocio. Un error en el cálculo de
 * huecos (`listAvailability`) ofrecería una hora ocupada, o crearía un
 * evento en el momento equivocado, sin que nada lo detectara antes de que un
 * cliente real reciba la cita mal puesta.
 *
 * `fetch` se sustituye por un doble en cada test (Deno no tiene red aquí, y
 * tampoco hay credenciales reales de Google) y se restaura al terminar.
 *
 * `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` se leen de `Deno.env` al cargar
 * el módulo, así que hay que fijarlos ANTES del import (mismo motivo que en
 * stripe-client.test.ts) — de ahí que vayan antes de cualquier otra cosa.
 *
 * Ejecutar: deno test --allow-env supabase/functions/_shared/calendar/google-calendar-provider.test.ts
 */
Deno.env.set('GOOGLE_CLIENT_ID', 'client-id-test')
Deno.env.set('GOOGLE_CLIENT_SECRET', 'client-secret-test')

const { GoogleCalendarProvider } = await import('./google-calendar-provider.ts')
import type { GoogleCalendarCredential } from './google-calendar-provider.ts'
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'

const realFetch = globalThis.fetch

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: string, init?: RequestInit) => handler(url, init)) as any
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

function validCredential(overrides: Partial<GoogleCalendarCredential> = {}): GoogleCalendarCredential {
  return {
    refresh_token: 'refresh-token-de-prueba',
    access_token: 'access-token-vigente',
    access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

Deno.test('listAvailability: devuelve huecos libres alrededor de un tramo ocupado', async () => {
  mockFetch((url) => {
    if (String(url).includes('/freeBusy')) {
      return new Response(
        JSON.stringify({
          calendars: {
            primary: {
              // Ocupado de 10:00 a 11:00 UTC.
              busy: [{ start: '2026-03-02T10:00:00.000Z', end: '2026-03-02T11:00:00.000Z' }],
            },
          },
        }),
        { status: 200 },
      )
    }
    throw new Error(`fetch inesperado: ${url}`)
  })

  try {
    const provider = new GoogleCalendarProvider(validCredential(), async () => {})
    const slots = await provider.listAvailability({ date: '2026-03-02', durationMinutes: 60 })

    // Antes del ocupado: solo cabe una franja de 60 min (9:00-10:00). Después
    // (11:00 en adelante): franjas seguidas hasta las 19:00. 1 + 9 = 10.
    assertEquals(slots.length, 10)
    assertEquals(slots[0], { start: '2026-03-02T09:00:00.000Z', end: '2026-03-02T10:00:00.000Z' })
    assertEquals(slots[1], { start: '2026-03-02T11:00:00.000Z', end: '2026-03-02T12:00:00.000Z' })
    assertEquals(slots.at(-1), { start: '2026-03-02T19:00:00.000Z', end: '2026-03-02T20:00:00.000Z' })
    // Ningún hueco puede solapar el tramo ocupado (10:00-11:00).
    for (const slot of slots) {
      assertEquals(slot.start === '2026-03-02T10:00:00.000Z', false)
    }
  } finally {
    restoreFetch()
  }
})

Deno.test('listAvailability: sin ningún evento, ofrece una franja por cada hora de la jornada laboral (9:00-20:00)', async () => {
  mockFetch(() =>
    new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), { status: 200 }),
  )

  try {
    const provider = new GoogleCalendarProvider(validCredential(), async () => {})
    const slots = await provider.listAvailability({ date: '2026-03-02', durationMinutes: 60 })

    // 9:00, 10:00, ..., 19:00 — franjas seguidas de 60 min, no solo la primera.
    assertEquals(slots.length, 11)
    assertEquals(slots[0], { start: '2026-03-02T09:00:00.000Z', end: '2026-03-02T10:00:00.000Z' })
    assertEquals(slots.at(-1), { start: '2026-03-02T19:00:00.000Z', end: '2026-03-02T20:00:00.000Z' })
  } finally {
    restoreFetch()
  }
})

Deno.test('listAvailability: un hueco largo ofrece varias franjas seguidas, no solapadas', async () => {
  mockFetch(() =>
    new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), { status: 200 }),
  )

  try {
    const provider = new GoogleCalendarProvider(validCredential(), async () => {})
    const slots = await provider.listAvailability({ date: '2026-03-02', durationMinutes: 30 })

    // 22 franjas de 30 min entre las 9:00 y las 20:00.
    assertEquals(slots.length, 22)
    // Cada franja empieza exactamente donde termina la anterior — sin huecos ni solapes.
    for (let i = 1; i < slots.length; i++) {
      assertEquals(slots[i].start, slots[i - 1].end)
    }
  } finally {
    restoreFetch()
  }
})

Deno.test('listAvailability: un día completamente ocupado no ofrece ningún hueco', async () => {
  mockFetch(() =>
    new Response(
      JSON.stringify({
        calendars: {
          primary: { busy: [{ start: '2026-03-02T09:00:00.000Z', end: '2026-03-02T20:00:00.000Z' }] },
        },
      }),
      { status: 200 },
    ),
  )

  try {
    const provider = new GoogleCalendarProvider(validCredential(), async () => {})
    const slots = await provider.listAvailability({ date: '2026-03-02', durationMinutes: 60 })

    assertEquals(slots, [])
  } finally {
    restoreFetch()
  }
})

Deno.test('listAvailability: propaga el error si Google responde con fallo', async () => {
  mockFetch(() => new Response('cuota excedida', { status: 429 }))

  try {
    const provider = new GoogleCalendarProvider(validCredential(), async () => {})
    await assertRejects(() => provider.listAvailability({ date: '2026-03-02', durationMinutes: 60 }))
  } finally {
    restoreFetch()
  }
})

Deno.test('createEvent: crea el evento y devuelve el id real de Google', async () => {
  mockFetch((url, init) => {
    assertEquals(String(url).includes('/events'), true)
    const body = JSON.parse(String(init?.body))
    assertEquals(body.attendees, [{ email: 'cliente@example.com' }])
    return new Response(JSON.stringify({ id: 'evt_123', htmlLink: 'https://calendar.google.com/evt_123' }), {
      status: 200,
    })
  })

  try {
    const provider = new GoogleCalendarProvider(validCredential(), async () => {})
    const result = await provider.createEvent({
      summary: 'Corte de pelo — Peluquería Ana',
      startsAt: '2026-03-02T10:00:00.000Z',
      endsAt: '2026-03-02T10:30:00.000Z',
      timezone: 'Europe/Madrid',
      attendeeEmail: 'cliente@example.com',
    })

    assertEquals(result, { externalEventId: 'evt_123', htmlLink: 'https://calendar.google.com/evt_123' })
  } finally {
    restoreFetch()
  }
})

Deno.test('createEvent: propaga el error si Google rechaza la creación', async () => {
  mockFetch(() => new Response('calendario no encontrado', { status: 404 }))

  try {
    const provider = new GoogleCalendarProvider(validCredential(), async () => {})
    await assertRejects(() =>
      provider.createEvent({
        summary: 'Cita',
        startsAt: '2026-03-02T10:00:00.000Z',
        endsAt: '2026-03-02T10:30:00.000Z',
        timezone: 'Europe/Madrid',
      }),
    )
  } finally {
    restoreFetch()
  }
})

Deno.test('getAccessToken (vía listAvailability): reutiliza el access_token si todavía no ha caducado', async () => {
  let tokenEndpointCalled = false
  mockFetch((url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      tokenEndpointCalled = true
      throw new Error('no debería refrescar un token todavía vigente')
    }
    return new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), { status: 200 })
  })

  try {
    const provider = new GoogleCalendarProvider(validCredential(), async () => {})
    await provider.listAvailability({ date: '2026-03-02', durationMinutes: 30 })
    assertEquals(tokenEndpointCalled, false)
  } finally {
    restoreFetch()
  }
})

Deno.test('getAccessToken (vía listAvailability): refresca y persiste el token cuando ha caducado', async () => {
  const captured: { patch?: Partial<GoogleCalendarCredential> } = {}
  mockFetch((url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'token-nuevo', expires_in: 3600 }), { status: 200 })
    }
    return new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), { status: 200 })
  })

  try {
    const expired = validCredential({
      access_token: 'token-viejo',
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    const provider = new GoogleCalendarProvider(expired, async (patch) => {
      captured.patch = patch
    })

    await provider.listAvailability({ date: '2026-03-02', durationMinutes: 30 })

    assertEquals(captured.patch?.access_token, 'token-nuevo')
  } finally {
    restoreFetch()
  }
})
