/**
 * Edge Function `automation-scheduled-jobs-run` — llamada cada 15 minutos por
 * el cron de Postgres (`run_scheduled_automation_jobs`, migración
 * `scheduled_automation_jobs`), nunca por un cliente.
 *
 * Reclama los jobs pendientes cuya `scheduled_at` ya llegó y dispara su
 * automatización. El UPDATE de reclamo (`status='pendiente' → 'procesando'`)
 * es una sola sentencia SQL — dos ejecuciones concurrentes de este cron no
 * pueden reclamar la misma fila dos veces, Postgres serializa el UPDATE por
 * fila.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { n8n } from '../_shared/n8n-client.ts'
import { webhookPathFor } from '../_shared/workflow-builder.ts'

const DISPATCH_SECRET = Deno.env.get('AUTOMATION_DISPATCH_SECRET') ?? ''
const MAX_JOBS_PER_RUN = 50
/** Cuánto esperar antes de reintentar un job fallido, por intento (backoff simple). */
const RETRY_BACKOFF_MINUTES = 15

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface ScheduledJob {
  id: string
  business_id: string
  automation_id: string
  lead_id: string | null
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  if (!DISPATCH_SECRET || request.headers.get('x-automation-secret') !== DISPATCH_SECRET) {
    console.warn('automation-scheduled-jobs-run rechazado: secreto incorrecto')
    return new Response('No autorizado', { status: 401 })
  }

  // Reclamo atómico: solo esta llamada se queda con las filas que todavía
  // dicen 'pendiente' en el momento exacto del UPDATE.
  const { data: claimed, error: claimError } = await admin
    .from('scheduled_automation_jobs')
    .update({ status: 'procesando' })
    .eq('status', 'pendiente')
    .lte('scheduled_at', new Date().toISOString())
    .select('id, business_id, automation_id, lead_id, payload, attempts, max_attempts')
    .limit(MAX_JOBS_PER_RUN)

  if (claimError) {
    console.error('No se pudieron reclamar jobs programados', claimError)
    return Response.json({ ok: false, error: claimError.message }, { status: 500 })
  }

  const jobs = (claimed ?? []) as ScheduledJob[]
  let completed = 0
  let retried = 0
  let failed = 0
  let cancelled = 0

  for (const job of jobs) {
    // La automatización pudo pausarse/borrarse entre que se encoló el job y
    // que le tocó ejecutarse — no tiene sentido disparar algo que el negocio
    // ya desactivó.
    const { data: automation } = await admin
      .from('automations')
      .select('status')
      .eq('id', job.automation_id)
      .maybeSingle()

    if (!automation || automation.status !== 'activa') {
      await admin
        .from('scheduled_automation_jobs')
        .update({ status: 'cancelado', processed_at: new Date().toISOString() })
        .eq('id', job.id)
      cancelled++
      continue
    }

    try {
      await n8n.trigger(webhookPathFor({ id: job.automation_id }), {
        ...job.payload,
        businessId: job.business_id,
        leadId: job.lead_id,
        source: 'evento_real',
        triggeredAt: new Date().toISOString(),
      })

      await admin
        .from('scheduled_automation_jobs')
        .update({ status: 'completado', processed_at: new Date().toISOString() })
        .eq('id', job.id)
      completed++
    } catch (error) {
      const attempts = job.attempts + 1
      const message = error instanceof Error ? error.message : String(error)
      const exhausted = attempts >= job.max_attempts

      await admin
        .from('scheduled_automation_jobs')
        .update({
          status: exhausted ? 'error' : 'pendiente',
          attempts,
          last_error: message,
          processed_at: exhausted ? new Date().toISOString() : null,
          // Reintento con backoff: no se reintenta en el mismo pase del
          // cron, se aplaza para dar margen a que el fallo (n8n caído,
          // límite de tasa...) se resuelva solo.
          ...(exhausted ? {} : { scheduled_at: new Date(Date.now() + attempts * RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString() }),
        })
        .eq('id', job.id)

      console.error(`Job ${job.id} (automatización ${job.automation_id}) falló`, error)
      if (exhausted) failed++
      else retried++
    }
  }

  return Response.json({ ok: true, claimed: jobs.length, completed, retried, failed, cancelled })
})
