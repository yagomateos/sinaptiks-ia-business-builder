/**
 * Edge Function `n8n-health-check` — llamada cada 5 minutos por el cron de
 * Postgres (`run_n8n_health_check`, migración `n8n_health_check_dispatch`),
 * nunca por un cliente.
 *
 * Sentry (`_shared/sentry.ts`) ya vigila errores no controlados DENTRO de
 * las Edge Functions, pero eso no cubre que el propio proceso de n8n en la
 * VPS se caiga entero — ahí no hay ninguna Edge Function ejecutándose que
 * pueda fallar y reportarse sola. Esta función es lo único que de verdad
 * comprueba "¿sigue vivo el motor?" desde fuera, contra su endpoint estándar
 * `/healthz` (sin autenticar, ni falta que hace: solo dice si el proceso
 * responde).
 *
 * Un fallo aquí se reporta a Sentry igual que cualquier otro — mismo canal
 * de aviso, sin montar una alerta nueva por separado.
 */
import { reportError } from '../_shared/sentry.ts'

const DISPATCH_SECRET = Deno.env.get('AUTOMATION_DISPATCH_SECRET') ?? ''
const N8N_BASE_URL = (Deno.env.get('N8N_API_URL') ?? '').replace(/\/+$/, '')
const TIMEOUT_MS = 10_000

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  if (!DISPATCH_SECRET || request.headers.get('x-automation-secret') !== DISPATCH_SECRET) {
    console.warn('n8n-health-check rechazado: secreto incorrecto')
    return new Response('No autorizado', { status: 401 })
  }

  if (!N8N_BASE_URL) {
    // Sin motor configurado no hay nada que vigilar — no es un fallo real.
    return new Response('ok')
  }

  try {
    const response = await fetch(`${N8N_BASE_URL}/healthz`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) {
      reportError(new Error(`n8n respondió ${response.status} en /healthz`), { function: 'n8n-health-check' })
    }
  } catch (error) {
    // DNS que no resuelve, conexión rechazada, timeout... cualquiera de
    // estos significa lo mismo de cara al negocio: el motor no está
    // respondiendo, y hay que enterarse ahora, no cuando un cliente escriba
    // y nadie le conteste.
    reportError(error, { function: 'n8n-health-check' })
  }

  return new Response('ok')
})
