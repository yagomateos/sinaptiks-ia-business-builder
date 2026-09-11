/**
 * `isDue` es lo único que evita avisar dos veces por la misma cita o el
 * mismo periodo de inactividad (CLAUDE.md §14: "Prevent duplicate
 * executions"); `findBroadcastCandidates` decide a quién le toca un
 * "programado" sin contacto directo. Sin test, un cambio aquí podría avisar
 * de más (spam real a un lead) o de menos (recordatorio que nunca sale) sin
 * que nada lo note antes de producción.
 *
 * Ejecutar: deno test supabase/functions/_shared/automation-broadcast.test.ts
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { findBroadcastCandidates, isDue, type BroadcastCandidate } from './automation-broadcast.ts'

function candidate(overrides: Partial<BroadcastCandidate>): BroadcastCandidate {
  return {
    id: '1',
    full_name: 'Contacto',
    email: null,
    phone: null,
    last_reminder_sent_at: null,
    reference: '2026-01-10T00:00:00.000Z',
    ...overrides,
  }
}

Deno.test('isDue: nunca se ha avisado -> toca avisar', () => {
  assertEquals(isDue(candidate({ last_reminder_sent_at: null })), true)
})

Deno.test('isDue: el último aviso es anterior a la referencia actual -> toca avisar de nuevo', () => {
  // La cita/inactividad de referencia es más reciente que el último aviso
  // (p. ej. una cita nueva después de haber avisado de la anterior).
  assertEquals(
    isDue(candidate({ last_reminder_sent_at: '2026-01-01T00:00:00.000Z', reference: '2026-01-10T00:00:00.000Z' })),
    true,
  )
})

Deno.test('isDue: ya se avisó para esta misma referencia -> no toca avisar otra vez', () => {
  assertEquals(
    isDue(candidate({ last_reminder_sent_at: '2026-01-10T00:00:00.000Z', reference: '2026-01-10T00:00:00.000Z' })),
    false,
  )
})

Deno.test('isDue: se avisó después de la referencia -> no toca avisar otra vez', () => {
  assertEquals(
    isDue(candidate({ last_reminder_sent_at: '2026-01-15T00:00:00.000Z', reference: '2026-01-10T00:00:00.000Z' })),
    false,
  )
})

/**
 * Doble mínimo del cliente de Supabase: cada método de la cadena
 * (`.from/.select/.eq/.not/.gte/.lt`) devuelve el propio objeto, y al
 * esperarlo (`await`) resuelve con los datos fijados para esa tabla. Basta
 * para probar el mapeo y la elección de columna de referencia sin montar
 * una base de datos real.
 */
function fakeAdmin(rows: Record<string, unknown>[]) {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    gte: () => chain,
    lt: () => chain,
    then: (resolve: (value: { data: Record<string, unknown>[] }) => unknown) =>
      resolve({ data: rows }),
  }
  // deno-lint-ignore no-explicit-any
  return chain as any
}

Deno.test('findBroadcastCandidates: con offset_hours, usa next_action_at como referencia', async () => {
  const admin = fakeAdmin([
    {
      id: 'lead-1',
      full_name: 'Ana',
      email: 'ana@example.com',
      phone: null,
      last_reminder_sent_at: null,
      next_action_at: '2026-01-10T09:00:00.000Z',
    },
  ])

  const result = await findBroadcastCandidates(admin, 'biz-1', { config: { offset_hours: -24 } })

  assertEquals(result.length, 1)
  assertEquals(result[0].id, 'lead-1')
  assertEquals(result[0].reference, '2026-01-10T09:00:00.000Z')
})

Deno.test('findBroadcastCandidates: con inactive_days, usa last_contacted_at como referencia', async () => {
  const admin = fakeAdmin([
    {
      id: 'lead-2',
      full_name: 'Bruno',
      email: null,
      phone: '600000000',
      last_reminder_sent_at: '2025-12-01T00:00:00.000Z',
      last_contacted_at: '2025-11-01T00:00:00.000Z',
    },
  ])

  const result = await findBroadcastCandidates(admin, 'biz-1', { config: { inactive_days: 30 } })

  assertEquals(result.length, 1)
  assertEquals(result[0].id, 'lead-2')
  assertEquals(result[0].reference, '2025-11-01T00:00:00.000Z')
})

Deno.test('findBroadcastCandidates: sin offset_hours ni inactive_days, no hay a quién avisar', async () => {
  const admin = fakeAdmin([{ id: 'lead-3' }])

  const result = await findBroadcastCandidates(admin, 'biz-1', { config: {} })

  assertEquals(result, [])
})
