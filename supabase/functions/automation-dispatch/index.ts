/**
 * Edge Function `automation-dispatch` — el camino de disparo para eventos que
 * no ocurren dentro de una Edge Function.
 *
 * `mensaje_entrante` se dispara directamente desde conversation-pipeline.ts
 * porque ya corre en una Edge Function con acceso a los secretos de n8n. Pero
 * `cambio_estado` puede ocurrir desde el frontend (el dueño del negocio mueve
 * un lead de fase en el CRM) o desde la propia acción `actualizar_lead` de
 * otra automatización — ninguno de los dos sitios tiene la API key de n8n ni
 * debería tenerla. La única pieza que ve el cambio sin importar quién lo hizo
 * es un trigger de Postgres en `leads` (ver la migración
 * `automation_stage_dispatch`), que llama aquí vía `pg_net` con un secreto
 * compartido — no hay sesión de usuario posible, así que la única defensa es
 * ese secreto.
 */
import { n8n } from '../_shared/n8n-client.ts'
import { webhookPathFor } from '../_shared/workflow-builder.ts'

const DISPATCH_SECRET = Deno.env.get('AUTOMATION_DISPATCH_SECRET') ?? ''

interface DispatchBody {
  automationId?: string
  businessId?: string
  leadId?: string
  payload?: Record<string, unknown>
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  if (!DISPATCH_SECRET || request.headers.get('x-automation-secret') !== DISPATCH_SECRET) {
    console.warn('automation-dispatch rechazado: secreto incorrecto')
    return new Response('No autorizado', { status: 401 })
  }

  let body: DispatchBody
  try {
    body = await request.json()
  } catch {
    return new Response('Cuerpo no válido', { status: 400 })
  }

  if (!body.automationId || !body.businessId) {
    return new Response('Faltan datos', { status: 400 })
  }

  try {
    await n8n.trigger(webhookPathFor({ id: body.automationId }), {
      ...body.payload,
      businessId: body.businessId,
      leadId: body.leadId ?? null,
      source: 'evento_real',
      triggeredAt: new Date().toISOString(),
    })
  } catch (error) {
    // pg_net no reintenta según la respuesta que demos, así que no hay nadie
    // esperando este error — se deja constancia en los logs, igual que hace
    // fireAutomation en conversation-pipeline.ts para mensaje_entrante.
    console.error(`No se pudo disparar la automatización ${body.automationId} (cambio_estado)`, error)
    return new Response('Error al disparar', { status: 502 })
  }

  return new Response('ok')
})
