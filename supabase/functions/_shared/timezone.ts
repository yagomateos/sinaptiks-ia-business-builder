/**
 * Convierte una fecha/hora "de pared" en una zona horaria concreta al
 * instante UTC real que le corresponde.
 *
 * Claude calcula `fecha_hora_iso` como "2026-09-14T10:00:00" pensando en
 * hora de Madrid (se le dice explícitamente la zona en el prompt), pero esa
 * cadena no lleva offset — `new Date(str)` la interpreta como UTC
 * directamente, dos horas por delante de lo que el cliente pidió en verano
 * (CEST, UTC+2). Bug real visto en producción: pedían las 10:00 y quedaba
 * reservado a las 12:00. Este helper corrige eso sin depender de una
 * librería de zonas horarias — usa Intl, que ya trae los datos de DST.
 */
export function zonedWallClockToUtc(isoLocal: string, timeZone: string): Date | null {
  // Si ya trae offset explícito ("...+02:00" o "...Z"), no hay ambigüedad
  // que corregir: se interpreta tal cual.
  const hasOffset = /[+-]\d{2}:\d{2}$/.test(isoLocal) || isoLocal.endsWith('Z')
  const naive = new Date(hasOffset ? isoLocal : `${isoLocal}Z`)
  if (isNaN(naive.getTime())) return null
  if (hasOffset) return naive

  // `naive` es un instante cuyos campos UTC coinciden numéricamente con la
  // cadena original. Formatearlo en la zona destino y comparar contra
  // formatearlo en UTC da el offset real de esa zona en esa fecha concreta
  // (con el cambio de horario de verano/invierno ya resuelto por Intl).
  const asZoned = new Date(naive.toLocaleString('en-US', { timeZone }))
  const asUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = asUtc.getTime() - asZoned.getTime()

  return new Date(naive.getTime() + offsetMs)
}
