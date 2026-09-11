/**
 * Contrato de calendario, independiente de proveedor. `agendar_cita` (y
 * cualquier otro sitio que necesite disponibilidad o crear un evento) habla
 * solo con esto — sustituir Google por Outlook/Cal.com el día de mañana es
 * añadir una clase nueva junto a google-calendar-provider.ts, no tocar quien
 * lo usa.
 */

export interface TimeSlot {
  start: string // ISO 8601
  end: string
}

export interface AvailabilityQuery {
  /** Día a comprobar — solo se usa la fecha, la hora se ignora. */
  date: string
  durationMinutes: number
}

export interface CreateEventInput {
  summary: string
  description?: string
  startsAt: string // ISO 8601
  endsAt: string
  timezone: string
  attendeeEmail?: string | null
}

export interface CreateEventResult {
  externalEventId: string
  htmlLink?: string
}

export interface CalendarProvider {
  listAvailability(query: AvailabilityQuery): Promise<TimeSlot[]>
  createEvent(input: CreateEventInput): Promise<CreateEventResult>
}
