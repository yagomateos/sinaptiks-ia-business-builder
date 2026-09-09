/**
 * Autenticación y aislamiento multiempresa para las Edge Functions.
 *
 * Toda petición llega con el token de sesión de Supabase del usuario. Aquí se
 * verifica y se comprueba que esa persona pertenece al negocio sobre el que
 * dice actuar. Sin esto, cualquiera con una sesión válida podría manipular las
 * automatizaciones de otro negocio: el RLS protege la base de datos, pero no
 * las llamadas que esta función hace a n8n.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export interface AuthContext {
  userId: string
  /** Cliente que actúa como el usuario, sujeto a RLS. */
  db: SupabaseClient
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function authenticate(request: Request): Promise<AuthContext> {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Falta la sesión')
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: header } } },
  )

  const { data, error } = await db.auth.getUser()
  if (error || !data.user) throw new HttpError(401, 'Sesión no válida')

  return { userId: data.user.id, db }
}

/**
 * Confirma que el usuario pertenece al negocio.
 *
 * La consulta va con el cliente sujeto a RLS: si no es miembro, no ve la fila
 * y la comprobación falla sola. No hay forma de saltárselo desde el cliente.
 */
export async function assertBusinessAccess(
  ctx: AuthContext,
  businessId: string,
): Promise<void> {
  if (!businessId) throw new HttpError(400, 'Falta el negocio')

  const { data, error } = await ctx.db
    .from('business_members')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', ctx.userId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'No se pudo comprobar el acceso')
  if (!data) throw new HttpError(403, 'No tienes acceso a este negocio')
}

/** Comprueba que la automatización pertenece a un negocio del usuario. */
export async function assertAutomationAccess(
  ctx: AuthContext,
  workflowId: string,
): Promise<string> {
  const { data, error } = await ctx.db
    .from('automations')
    .select('id, business_id')
    .eq('n8n_workflow_id', workflowId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'No se pudo comprobar el acceso')
  if (!data) throw new HttpError(404, 'Esa automatización no existe')

  await assertBusinessAccess(ctx, data.business_id)
  return data.business_id
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status)
  }
  console.error('Error no controlado', error)
  return json({ error: 'Error interno' }, 500)
}
