/**
 * `bookCalendarAppointment` es el punto único que ahora comparten
 * `agendar_cita` (automatización) y `registrar_solicitud_cita` (la
 * herramienta que el agente llama en plena conversación) para reservar de
 * verdad en Google Calendar. Un fallo aquí no solo rompe una automatización
 * — hace que el agente le prometa al cliente una cita confirmada que nunca
 * se creó, o al revés, que no confirme una que sí se pudo crear.
 *
 * `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` se leen al cargar el módulo del
 * proveedor de Google — hay que fijarlos ANTES del import (mismo motivo que
 * en los demás tests de calendar/).
 *
 * Ejecutar: deno test --allow-env supabase/functions/_shared/appointment-booking.test.ts
 */
Deno.env.set('GOOGLE_CLIENT_ID', 'client-id-test')
Deno.env.set('GOOGLE_CLIENT_SECRET', 'client-secret-test')

const { bookCalendarAppointment } = await import('./appointment-booking.ts')
import { assertEquals } from 'jsr:@std/assert@1'

const realFetch = globalThis.fetch

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: string, init?: RequestInit) => handler(url, init)) as any
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

/**
 * Doble mínimo del cliente de Supabase, hecho a medida de las tablas que
 * toca `bookCalendarAppointment` (a través de `getCalendarProvider`,
 * `getBusinessName` y sus propios inserts/updates de `appointments`) — no es
 * un mock genérico, solo cubre exactamente esta secuencia de llamadas.
 */
function fakeAdmin(options: { hasCalendarCredential: boolean }) {
  const appointments: Record<string, unknown>[] = []
  const state = { updateCalls: [] as Record<string, unknown>[] }

  const chain = {
    _table: '',
    from(table: string) {
      this._table = table
      return this
    },
    select() {
      return this
    },
    eq() {
      return this
    },
    insert(row: Record<string, unknown>) {
      const inserted = { id: 'appt-1', ...row }
      appointments.push(inserted)
      return {
        select: () => ({
          single: async () => ({ data: { id: 'appt-1' }, error: null }),
        }),
      }
    },
    update(patch: Record<string, unknown>) {
      state.updateCalls.push(patch)
      return { eq: async () => ({ data: null, error: null }) }
    },
    async maybeSingle() {
      if (this._table === 'channel_credentials') {
        return {
          data: options.hasCalendarCredential
            ? { credential: { refresh_token: 'refresh-token', access_token: 'token', access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString() } }
            : null,
        }
      }
      if (this._table === 'business_profiles') {
        return { data: { business_name: 'Clínica de prueba' } }
      }
      return { data: null }
    },
  }

  return {
    // deno-lint-ignore no-explicit-any
    client: { from: (table: string) => chain.from(table) } as any,
    appointments,
    updateCalls: state.updateCalls,
  }
}

const baseInput = {
  leadId: 'lead-1',
  automationId: null,
  service: 'Limpieza dental',
  startsAt: new Date('2026-03-02T10:00:00.000Z'),
  durationMinutes: 60,
  timezone: 'Europe/Madrid',
  attendeeEmail: 'cliente@example.com',
}

Deno.test('bookCalendarAppointment: sin calendario conectado, devuelve sin_calendario sin tocar Google', async () => {
  const { client } = fakeAdmin({ hasCalendarCredential: false })

  mockFetch(() => {
    throw new Error('no debería llamar a fetch sin calendario conectado')
  })

  try {
    const result = await bookCalendarAppointment(client, 'biz-1', baseInput)
    assertEquals(result.status, 'sin_calendario')
  } finally {
    restoreFetch()
  }
})

Deno.test('bookCalendarAppointment: hueco libre -> confirmada, con el evento real de Google', async () => {
  const { client, updateCalls } = fakeAdmin({ hasCalendarCredential: true })

  mockFetch((url) => {
    if (String(url).includes('/freeBusy')) {
      return new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), { status: 200 })
    }
    if (String(url).includes('/events')) {
      return new Response(JSON.stringify({ id: 'evt_abc123' }), { status: 200 })
    }
    throw new Error(`fetch inesperado: ${url}`)
  })

  try {
    const result = await bookCalendarAppointment(client, 'biz-1', baseInput)

    assertEquals(result.status, 'confirmada')
    if (result.status === 'confirmada') {
      assertEquals(result.externalEventId, 'evt_abc123')
    }
    // El appointment se actualiza a 'confirmada' con el id real del evento.
    assertEquals(updateCalls.at(-1), { status: 'confirmada', external_event_id: 'evt_abc123' })
  } finally {
    restoreFetch()
  }
})

Deno.test('bookCalendarAppointment: hueco ocupado -> conflicto, sin crear el evento', async () => {
  const { client, updateCalls } = fakeAdmin({ hasCalendarCredential: true })
  let eventsCalled = false

  mockFetch((url) => {
    if (String(url).includes('/freeBusy')) {
      return new Response(
        JSON.stringify({
          calendars: { primary: { busy: [{ start: '2026-03-02T10:00:00.000Z', end: '2026-03-02T11:00:00.000Z' }] } },
        }),
        { status: 200 },
      )
    }
    if (String(url).includes('/events')) {
      eventsCalled = true
      return new Response(JSON.stringify({ id: 'no-debería-crearse' }), { status: 200 })
    }
    throw new Error(`fetch inesperado: ${url}`)
  })

  try {
    const result = await bookCalendarAppointment(client, 'biz-1', baseInput)

    assertEquals(result.status, 'conflicto')
    assertEquals(eventsCalled, false)
    assertEquals(updateCalls.at(-1), { status: 'error', notes: 'Ese hueco ya está ocupado en el calendario' })
  } finally {
    restoreFetch()
  }
})

Deno.test('bookCalendarAppointment: Google rechaza la creación -> error, sin dejarlo como confirmada', async () => {
  const { client, updateCalls } = fakeAdmin({ hasCalendarCredential: true })

  mockFetch((url) => {
    if (String(url).includes('/freeBusy')) {
      return new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), { status: 200 })
    }
    if (String(url).includes('/events')) {
      return new Response('cuenta de Google suspendida', { status: 403 })
    }
    throw new Error(`fetch inesperado: ${url}`)
  })

  try {
    const result = await bookCalendarAppointment(client, 'biz-1', baseInput)

    assertEquals(result.status, 'error')
    assertEquals((updateCalls.at(-1) as { status: string }).status, 'error')
  } finally {
    restoreFetch()
  }
})
