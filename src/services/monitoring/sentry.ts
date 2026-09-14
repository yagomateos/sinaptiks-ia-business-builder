/**
 * Monitorización de errores del frontend. Sigue el mismo patrón que el
 * resto de proveedores opcionales del proyecto (n8n, IA): sin
 * VITE_SENTRY_DSN configurada, `init()` no hace nada — la app funciona
 * exactamente igual que hoy, sin ningún error de red ni consola.
 *
 * Cuando se configure una cuenta real, basta con añadir la variable de
 * entorno; no hace falta tocar ningún componente.
 */
import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

export const isErrorMonitoringConfigured = Boolean(dsn)

export function initErrorMonitoring(): void {
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  })
}

export { Sentry }
