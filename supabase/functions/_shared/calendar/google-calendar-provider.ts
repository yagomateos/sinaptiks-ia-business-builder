/**
 * Implementación del CalendarProvider contra la API real de Google Calendar
 * v3. Nada fuera de este archivo y de google-calendar-oauth/index.ts sabe que
 * es Google — todo lo demás habla con la interfaz de types.ts.
 */
import type { AvailabilityQuery, CalendarProvider, CreateEventInput, CreateEventResult, TimeSlot } from './types.ts'

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

export const isGoogleCalendarConfigured = Boolean(CLIENT_ID && CLIENT_SECRET)

export interface GoogleCalendarCredential {
  refresh_token: string
  access_token?: string
  access_token_expires_at?: string
  calendar_id?: string
}

export class GoogleCalendarProvider implements CalendarProvider {
  constructor(
    private credential: GoogleCalendarCredential,
    /** Guarda el access_token refrescado para no pedir uno nuevo en cada llamada. */
    private readonly persistCredential: (patch: Partial<GoogleCalendarCredential>) => Promise<void>,
  ) {}

  private get calendarId(): string {
    return this.credential.calendar_id ?? 'primary'
  }

  private async getAccessToken(): Promise<string> {
    const expiresAt = this.credential.access_token_expires_at
      ? new Date(this.credential.access_token_expires_at).getTime()
      : 0

    if (this.credential.access_token && expiresAt > Date.now() + 60_000) {
      return this.credential.access_token
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('Google Calendar no está configurado (faltan GOOGLE_CLIENT_ID/SECRET)')
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: this.credential.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      throw new Error(`No se pudo refrescar el token de Google (${response.status}): ${await response.text()}`)
    }

    const data = (await response.json()) as { access_token: string; expires_in: number }
    const access_token_expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString()

    this.credential = { ...this.credential, access_token: data.access_token, access_token_expires_at }
    await this.persistCredential({ access_token: data.access_token, access_token_expires_at })

    return data.access_token
  }

  async listAvailability(query: AvailabilityQuery): Promise<TimeSlot[]> {
    const accessToken = await this.getAccessToken()
    const dayStart = new Date(query.date)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: this.calendarId }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Google Calendar freeBusy falló (${response.status}): ${await response.text()}`)
    }

    const data = (await response.json()) as {
      calendars: Record<string, { busy: { start: string; end: string }[] }>
    }
    const busy = data.calendars[this.calendarId]?.busy ?? []

    // Horario laboral fijo (9:00-20:00) a propósito: el negocio no tiene
    // todavía dónde configurar el suyo. Es el primer sitio real donde haría
    // falta si se pide más adelante — ver business_profiles.business_hours,
    // que existe pero nadie lee todavía.
    const workStart = new Date(dayStart)
    workStart.setUTCHours(9, 0, 0, 0)
    const workEnd = new Date(dayStart)
    workEnd.setUTCHours(20, 0, 0, 0)
    const durationMs = query.durationMinutes * 60 * 1000

    const busyRanges = busy
      .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
      .sort((a, b) => a.start - b.start)

    // Un hueco libre largo ofrece varias franjas seguidas (cada una dura
    // `durationMinutes`), no solo la primera — para que haya entre qué elegir
    // en vez de una única hora posible en todo el día.
    const slots: TimeSlot[] = []
    let cursor = workStart.getTime()

    for (const range of busyRanges) {
      while (range.start - cursor >= durationMs) {
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + durationMs).toISOString() })
        cursor += durationMs
      }
      cursor = Math.max(cursor, range.end)
    }
    while (workEnd.getTime() - cursor >= durationMs) {
      slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + durationMs).toISOString() })
      cursor += durationMs
    }

    return slots
  }

  /**
   * freeBusy acotado exactamente a [startsAt, endsAt) — a diferencia de
   * `listAvailability`, no depende de que la hora pedida caiga en uno de los
   * huecos alineados a la cuadrícula de franjas; comprueba la solicitud real
   * del cliente, venga a la hora que venga.
   */
  async isAvailable(startsAt: string, endsAt: string): Promise<boolean> {
    const accessToken = await this.getAccessToken()

    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: startsAt,
        timeMax: endsAt,
        items: [{ id: this.calendarId }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Google Calendar freeBusy falló (${response.status}): ${await response.text()}`)
    }

    const data = (await response.json()) as {
      calendars: Record<string, { busy: { start: string; end: string }[] }>
    }
    const busy = data.calendars[this.calendarId]?.busy ?? []

    return busy.length === 0
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const accessToken = await this.getAccessToken()

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: input.summary,
          description: input.description,
          start: { dateTime: input.startsAt, timeZone: input.timezone },
          end: { dateTime: input.endsAt, timeZone: input.timezone },
          attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : undefined,
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Google Calendar events.insert falló (${response.status}): ${await response.text()}`)
    }

    const data = (await response.json()) as { id: string; htmlLink?: string }
    return { externalEventId: data.id, htmlLink: data.htmlLink }
  }
}
