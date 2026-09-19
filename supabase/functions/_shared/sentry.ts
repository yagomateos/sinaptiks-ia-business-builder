/**
 * Reporte de errores no controlados de las Edge Functions a Sentry, sin
 * dependencia pesada — un POST directo a su API de ingesta (formato
 * "envelope"), igual de ligero que el resto de clientes de este proyecto
 * (anthropic-client.ts, openai-client.ts...).
 *
 * Sin SENTRY_DSN, `reportError()` no hace nada — mismo patrón que el resto
 * de proveedores opcionales. Nunca debe romper ni retrasar la respuesta
 * real al usuario: es fire-and-forget, envuelto en try/catch por completo.
 */
const dsn = Deno.env.get('SENTRY_DSN') ?? ''

interface ParsedDsn {
  publicKey: string
  host: string
  projectId: string
}

function parseDsn(raw: string): ParsedDsn | null {
  try {
    const url = new URL(raw)
    const publicKey = url.username
    const projectId = url.pathname.replace(/^\//, '')
    if (!publicKey || !projectId || !url.host) return null
    return { publicKey, host: url.host, projectId }
  } catch {
    return null
  }
}

const parsed = dsn ? parseDsn(dsn) : null

export const isSentryConfigured = Boolean(parsed)

export function reportError(error: unknown, tags: Record<string, string> = {}): void {
  if (!parsed) return

  try {
    const eventId = crypto.randomUUID().replace(/-/g, '')
    const message = error instanceof Error ? error.message : String(error)

    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'other',
      level: 'error',
      message,
      tags,
      extra: {
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
      },
    }

    const envelope = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n')

    fetch(`https://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.publicKey}&sentry_version=7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    }).catch(() => {
      // Best-effort de verdad: si Sentry no responde, no pasa nada más.
    })
  } catch {
    // El reporte de errores nunca debe generar uno nuevo.
  }
}
