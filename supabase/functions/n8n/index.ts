/**
 * Edge Function `n8n` — el puente entre la app y el motor de automatización.
 *
 * La app nunca habla con n8n directamente: no puede, porque la API key vive
 * aquí. Cada petición se autentica con la sesión de Supabase del usuario y se
 * comprueba que ese usuario pertenece al negocio antes de tocar nada.
 *
 * Rutas (bajo /functions/v1/n8n):
 *   POST   /workflows                     crear
 *   PATCH  /workflows/:id                 actualizar
 *   POST   /workflows/:id/activate        activar
 *   POST   /workflows/:id/deactivate      pausar
 *   POST   /workflows/:id/execute         ejecutar una vez
 *   GET    /workflows/:id                 consultar
 *   GET    /workflows/:id/executions      historial
 */
import {
  assertAutomationAccess,
  assertBusinessAccess,
  authenticate,
  CORS_HEADERS,
  errorResponse,
  HttpError,
  json,
  type AuthContext,
} from '../_shared/auth.ts'
import { n8n } from '../_shared/n8n-client.ts'
import {
  buildWorkflow,
  webhookPathFor,
  type AutomationRecord,
} from '../_shared/workflow-builder.ts'

const CALLBACK_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/n8n-callback`
const CALLBACK_SECRET = Deno.env.get('N8N_CALLBACK_SECRET') ?? ''

/** Datos de muestra para el botón "Probar ahora". */
const SAMPLE_CONTACT = {
  name: 'Contacto de prueba',
  email: 'prueba@sinaptkis.io',
  phone: '+34600000000',
  channel: 'web',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const ctx = await authenticate(request)
    const url = new URL(request.url)

    // /functions/v1/n8n/workflows/:id/:action → ['workflows', id, action]
    const segments = url.pathname.split('/').filter(Boolean)
    const start = segments.indexOf('n8n')
    const path = start >= 0 ? segments.slice(start + 1) : segments

    if (path[0] !== 'workflows') throw new HttpError(404, 'Ruta desconocida')

    const [, workflowId, action] = path

    if (!workflowId) {
      if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')
      return await createWorkflow(ctx, request)
    }

    if (action === 'activate') return await setActive(ctx, workflowId, true)
    if (action === 'deactivate') return await setActive(ctx, workflowId, false)
    if (action === 'execute') return await executeOnce(ctx, workflowId, request)
    if (action === 'executions') return await listExecutions(ctx, workflowId, url)

    if (request.method === 'GET') return await getWorkflow(ctx, workflowId)
    if (request.method === 'PATCH') return await updateWorkflow(ctx, workflowId, request)

    throw new HttpError(405, 'Método no permitido')
  } catch (error) {
    return errorResponse(error)
  }
})

/* ------------------------------------------------------------------ */

async function createWorkflow(ctx: AuthContext, request: Request): Promise<Response> {
  const body = await request.json()
  const businessId = String(body.businessId ?? '')
  const automation = body.automation as AutomationRecord | undefined

  if (!automation?.id) throw new HttpError(400, 'Falta la automatización')
  await assertBusinessAccess(ctx, businessId)

  // La automatización se lee de la base de datos, no del cuerpo de la petición:
  // así el cliente no puede inventarse acciones que no le corresponden.
  const { data: stored, error } = await ctx.db
    .from('automations')
    .select('id, business_id, name, description, category, trigger, actions')
    .eq('id', automation.id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'No se pudo leer la automatización')
  if (!stored) throw new HttpError(404, 'Esa automatización no existe')

  await ctx.db.from('automations').update({ sync_status: 'syncing' }).eq('id', stored.id)

  const definition = buildWorkflow(stored as AutomationRecord, CALLBACK_URL, CALLBACK_SECRET)

  try {
    const created = await n8n.create(definition)

    // Nunca se marca 'synced' antes de saber que n8n aceptó la definición —
    // si create() lanzara, el catch de abajo deja 'error' en su lugar.
    await ctx.db
      .from('automations')
      .update({
        n8n_workflow_id: created.id,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        sync_error: null,
        workflow_version: 1,
      })
      .eq('id', stored.id)

    return json(created)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    await ctx.db.from('automations').update({ sync_status: 'error', sync_error: message }).eq('id', stored.id)
    throw error
  }
}

async function updateWorkflow(
  ctx: AuthContext,
  workflowId: string,
  request: Request,
): Promise<Response> {
  const businessId = await assertAutomationAccess(ctx, workflowId)
  await request.json().catch(() => ({}))

  const { data: stored } = await ctx.db
    .from('automations')
    .select('id, business_id, name, description, category, trigger, actions, workflow_version')
    .eq('n8n_workflow_id', workflowId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!stored) throw new HttpError(404, 'Esa automatización no existe')

  await ctx.db.from('automations').update({ sync_status: 'syncing' }).eq('id', stored.id)

  const definition = buildWorkflow(stored as AutomationRecord, CALLBACK_URL, CALLBACK_SECRET)

  try {
    const updated = await n8n.update(workflowId, definition)

    await ctx.db
      .from('automations')
      .update({
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        sync_error: null,
        workflow_version: (stored.workflow_version ?? 0) + 1,
      })
      .eq('id', stored.id)

    return json(updated)
  } catch (error) {
    // La regla que importa: si n8n.update() falla, esto NUNCA llega a
    // 'synced' — se queda en 'error' con el motivo, y quien preguntó por el
    // estado (el panel) lo ve tal cual es.
    const message = error instanceof Error ? error.message : 'Error desconocido'
    await ctx.db.from('automations').update({ sync_status: 'error', sync_error: message }).eq('id', stored.id)
    throw error
  }
}

async function setActive(
  ctx: AuthContext,
  workflowId: string,
  active: boolean,
): Promise<Response> {
  await assertAutomationAccess(ctx, workflowId)
  return json(active ? await n8n.activate(workflowId) : await n8n.deactivate(workflowId))
}

async function getWorkflow(ctx: AuthContext, workflowId: string): Promise<Response> {
  await assertAutomationAccess(ctx, workflowId)
  return json(await n8n.get(workflowId))
}

async function listExecutions(
  ctx: AuthContext,
  workflowId: string,
  url: URL,
): Promise<Response> {
  await assertAutomationAccess(ctx, workflowId)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)
  return json(await n8n.executions(workflowId, limit))
}

async function executeOnce(
  ctx: AuthContext,
  workflowId: string,
  request: Request,
): Promise<Response> {
  const businessId = await assertAutomationAccess(ctx, workflowId)
  const payload = await request.json().catch(() => ({}))

  const { data: stored } = await ctx.db
    .from('automations')
    .select('id, trigger')
    .eq('n8n_workflow_id', workflowId)
    .maybeSingle()

  if (!stored) throw new HttpError(404, 'Esa automatización no existe')

  const startedAt = new Date().toISOString()

  // Los workflows programados no tienen webhook: no se pueden forzar a mano.
  if ((stored.trigger as { type?: string })?.type === 'programado') {
    throw new HttpError(
      400,
      'Esta automatización se ejecuta sola según su horario, no se puede lanzar a mano',
    )
  }

  // Una prueba sin datos crearía un contacto vacío en el CRM cada vez que el
  // usuario pulsa el botón, así que se rellena con un contacto de muestra
  // reconocible. Pero solo cuando la prueba viene realmente vacía: si alguien
  // (una integración real, o un intento manual con datos concretos) ya trae
  // nombre, email o teléfono, fusionar el email fijo de la muestra por encima
  // de un campo que simplemente no vino relleno haría que ese contacto se
  // confundiera por deduplicación con el de una prueba anterior sin relación.
  const hasRealContactData = Boolean(
    (payload as Record<string, unknown>)?.name ??
      (payload as Record<string, unknown>)?.nombre ??
      (payload as Record<string, unknown>)?.email ??
      (payload as Record<string, unknown>)?.phone ??
      (payload as Record<string, unknown>)?.telefono,
  )

  await n8n.trigger(webhookPathFor({ id: stored.id }), {
    ...(hasRealContactData ? {} : SAMPLE_CONTACT),
    ...payload,
    businessId,
    source: 'prueba_manual',
    triggeredAt: startedAt,
  })

  return json({
    id: `manual_${Date.now()}`,
    workflowId,
    status: 'success',
    startedAt,
    stoppedAt: new Date().toISOString(),
  })
}
