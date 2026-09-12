/**
 * Bug real visto en producción (2026-09-12): un cliente pedía una cita a
 * las 10:00 y quedaba reservada a las 12:00 en Google Calendar; otra a las
 * 16:00 quedaba a las 18:00 — siempre 2 horas por delante, el offset exacto
 * de CEST (Europe/Madrid en verano) sobre UTC. `new Date("2026-09-14T10:00:00")`
 * trataba la cadena como UTC en vez de como hora de Madrid.
 *
 * Ejecutar: deno test supabase/functions/_shared/timezone.test.ts
 */
import { assertEquals } from 'jsr:@std/assert@1'
import { zonedWallClockToUtc } from './timezone.ts'

Deno.test('zonedWallClockToUtc: 10:00 de Madrid en septiembre (CEST, UTC+2) es 08:00 UTC', () => {
  const result = zonedWallClockToUtc('2026-09-14T10:00:00', 'Europe/Madrid')
  assertEquals(result?.toISOString(), '2026-09-14T08:00:00.000Z')
})

Deno.test('zonedWallClockToUtc: reproduce el bug real — pedir las 16:00 no puede confirmar las 18:00', () => {
  const result = zonedWallClockToUtc('2026-09-14T16:00:00', 'Europe/Madrid')
  assertEquals(result?.toISOString(), '2026-09-14T14:00:00.000Z')

  // El propio bug, para que quede documentado qué NO debe volver a pasar:
  // interpretar la cadena como UTC sin corregir daba las 18:00 al mostrarla
  // de vuelta en Madrid.
  const buggy = new Date('2026-09-14T16:00:00Z')
  const shownInMadrid = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(buggy)
  assertEquals(shownInMadrid, '18:00')
})

Deno.test('zonedWallClockToUtc: en enero (CET, UTC+1) el offset es de 1 hora, no 2', () => {
  const result = zonedWallClockToUtc('2026-01-14T10:00:00', 'Europe/Madrid')
  assertEquals(result?.toISOString(), '2026-01-14T09:00:00.000Z')
})

Deno.test('zonedWallClockToUtc: una cadena ya con offset explícito se respeta tal cual', () => {
  const result = zonedWallClockToUtc('2026-09-14T10:00:00+02:00', 'Europe/Madrid')
  assertEquals(result?.toISOString(), '2026-09-14T08:00:00.000Z')
})

Deno.test('zonedWallClockToUtc: una cadena ya en UTC (Z) se respeta tal cual', () => {
  const result = zonedWallClockToUtc('2026-09-14T08:00:00Z', 'Europe/Madrid')
  assertEquals(result?.toISOString(), '2026-09-14T08:00:00.000Z')
})

Deno.test('zonedWallClockToUtc: una cadena inválida devuelve null en vez de "Invalid Date"', () => {
  const result = zonedWallClockToUtc('no es una fecha', 'Europe/Madrid')
  assertEquals(result, null)
})

Deno.test('zonedWallClockToUtc: funciona igual para otra zona horaria (Nueva York, UTC-4 en verano)', () => {
  const result = zonedWallClockToUtc('2026-07-14T10:00:00', 'America/New_York')
  assertEquals(result?.toISOString(), '2026-07-14T14:00:00.000Z')
})
