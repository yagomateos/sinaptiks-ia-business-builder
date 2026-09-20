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
import { reportError } from './sentry.ts'

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

// Antes esto era un único valor fijo ('*' sin ALLOWED_ORIGIN configurado):
// cualquier página web podía leer la respuesta de estas funciones si de
// algún modo tenía el token de sesión de quien la visitara. Con
// ALLOWED_ORIGINS configurada (lista separada por comas — hace falta más de
// uno porque el desarrollo local apunta a este mismo proyecto desplegado,
// no a uno aparte), solo se refleja el origen exacto de quien llama cuando
// está en la lista. Sin configurar, se mantiene el '*' de siempre: nunca
// rompe un entorno que todavía no la haya puesto.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export function corsOriginFor(request: Request): string {
  if (ALLOWED_ORIGINS.length === 0) return '*'
  const origin = request.headers.get('origin') ?? ''
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
}

export function corsHeadersFor(request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': corsOriginFor(request),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    Vary: 'Origin',
  }
}

/**
 * Valor estático de respaldo — lo siguen usando los `json()` que se
 * construyen en lo profundo de cada función, donde no siempre hay a mano el
 * `Request` original. `applyCors()` corrige el header ya en la respuesta
 * final antes de devolverla, así que este valor solo importa de verdad
 * mientras ALLOWED_ORIGINS no esté configurada.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length === 1 ? ALLOWED_ORIGINS[0] : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

/**
 * Corrige el `Access-Control-Allow-Origin` de una respuesta ya construida
 * para que refleje el origen real de quien llama — se aplica una vez, en el
 * borde de cada función (`Deno.serve`), así que no hace falta tocar cada
 * `json()`/`errorResponse()` de más adentro para que el límite por origen
 * sea real en la respuesta que de verdad ve el navegador.
 */
export function applyCors(response: Response, request: Request): Response {
  response.headers.set('Access-Control-Allow-Origin', corsOriginFor(request))
  response.headers.set('Vary', 'Origin')
  return response
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
  // Solo lo de verdad inesperado (no un HttpError ya manejado) merece una
  // alerta — un 404/400 esperado no es una emergencia que deba despertar
  // a nadie.
  reportError(error)
  return json({ error: 'Error interno' }, 500)
}
