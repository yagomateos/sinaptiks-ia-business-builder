/**
 * Edge Function `team-invites` — invitar a alguien a un negocio.
 *
 * Hasta ahora esto no existía: Ajustes → Equipo prometía "podrás invitar a
 * más personas cuando conectemos el envío de correos" (Resend ya está
 * conectado desde hace semanas) pero no había ningún camino real para
 * añadir a una segunda persona a un negocio.
 *
 * Rutas (bajo /functions/v1/team-invites):
 *   POST /invite         crea la invitación y manda el email (owner/admin)
 *   GET  /:code           vista previa pública (sin sesión) — negocio, rol, quién invita
 *   POST /accept          el invitado, ya con sesión, se une de verdad
 *   POST /revoke           cancela una invitación pendiente (owner/admin)
 *   GET  /list?businessId= invitaciones pendientes de un negocio (owner/admin)
 *
 * La creación y la revocación se hacen con el cliente sujeto a RLS del
 * propio usuario — la política de la tabla ya exige owner/admin, así que no
 * hace falta repetir esa comprobación aquí. Solo `accept` necesita la
 * service role: quien acepta no es todavía miembro del negocio, así que RLS
 * le impide insertarse a sí mismo en `business_members`.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  applyCors,
  authenticate,
  corsHeadersFor,
  errorResponse,
  HttpError,
  json,
  type AuthContext,
} from '../_shared/auth.ts'
import { isResendConfigured, sendEmail } from '../_shared/resend-client.ts'
import { teamInviteEmailHtml } from '../_shared/email-templates.ts'

const APP_URL = Deno.env.get('APP_URL') || 'https://sinaptiks-ia-business-builder.vercel.app'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

const INVITABLE_ROLES = new Set(['admin', 'member'])

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(request) })
  }

  const response = await (async () => {
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split('/').filter(Boolean)
      const start = segments.indexOf('team-invites')
      const path = start >= 0 ? segments.slice(start + 1) : segments

      if (request.method === 'GET' && path[0] === 'list') {
        return await handleList(await authenticate(request), url)
      }
      if (request.method === 'GET' && path[0]) {
        return await handlePreview(path[0])
      }
      if (request.method === 'POST' && path[0] === 'invite') {
        return await handleInvite(await authenticate(request), request)
      }
      if (request.method === 'POST' && path[0] === 'accept') {
        return await handleAccept(await authenticate(request), request)
      }
      if (request.method === 'POST' && path[0] === 'revoke') {
        return await handleRevoke(await authenticate(request), request)
      }

      throw new HttpError(404, 'Ruta desconocida')
    } catch (error) {
      return errorResponse(error)
    }
  })()

  return applyCors(response, request)
})

/* ------------------------------------------------------------------ */

async function handleInvite(ctx: AuthContext, request: Request): Promise<Response> {
  const body = await request.json()
  const businessId = String(body.businessId ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = String(body.role ?? 'member')

  if (!businessId) throw new HttpError(400, 'Falta el negocio')
  if (!email || !email.includes('@')) throw new HttpError(400, 'Escribe un email válido')
  if (!INVITABLE_ROLES.has(role)) throw new HttpError(400, 'Rol no válido')

  // Ya es miembro: invitarlo de nuevo no tiene sentido y solo confundiría.
  const { data: existingProfile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existingProfile) {
    const { data: existingMember } = await ctx.db
      .from('business_members')
      .select('id')
      .eq('business_id', businessId)
      .eq('user_id', existingProfile.id)
      .maybeSingle()
    if (existingMember) throw new HttpError(409, 'Esa persona ya tiene acceso a este negocio')
  }

  // El insert corre con el cliente sujeto a RLS: la política de la tabla ya
  // exige que quien llama sea owner/admin de ese negocio, así que si no lo
  // es, esto falla solo con un 42501, sin lógica extra aquí.
  const { data: invite, error } = await ctx.db
    .from('business_invites')
    .insert({ business_id: businessId, email, role, invited_by: ctx.userId })
    .select('code')
    .single()

  if (error) {
    // Índice único: ya había una invitación pendiente para este email en este negocio.
    if (error.code === '23505') throw new HttpError(409, 'Ya hay una invitación pendiente para ese email')
    throw new HttpError(500, 'No se pudo crear la invitación')
  }

  const [{ data: business }, { data: inviter }] = await Promise.all([
    admin.from('businesses').select('name').eq('id', businessId).maybeSingle(),
    admin.from('profiles').select('full_name, email').eq('id', ctx.userId).maybeSingle(),
  ])

  const inviteUrl = `${APP_URL}/invitacion/${invite.code}`

  // El envío es best-effort: si Resend no está configurado o falla (p. ej.
  // el modo de prueba de Resend solo entrega al email de la propia cuenta),
  // la invitación sigue existiendo de verdad — se devuelve el enlace para
  // que quien invita pueda compartirlo a mano.
  let emailSent = false
  if (isResendConfigured) {
    try {
      await sendEmail({
        to: email,
        subject: `${inviter?.full_name ?? 'Alguien'} te ha invitado a ${business?.name ?? 'su negocio'} en Sinaptkis`,
        html: teamInviteEmailHtml({
          businessName: business?.name ?? 'su negocio',
          inviterName: inviter?.full_name || inviter?.email || 'Un compañero',
          inviteUrl,
        }),
      })
      emailSent = true
    } catch (error) {
      console.error('No se pudo enviar el email de invitación', error)
    }
  }

  return json({ code: invite.code, inviteUrl, emailSent })
}

async function handlePreview(code: string): Promise<Response> {
  const { data: invite } = await admin
    .from('business_invites')
    .select('email, role, status, expires_at, businesses(name), profiles!invited_by(full_name, email)')
    .eq('code', code)
    .maybeSingle()

  if (!invite) throw new HttpError(404, 'Esta invitación no existe')

  const business = Array.isArray(invite.businesses) ? invite.businesses[0] : invite.businesses
  const inviter = Array.isArray(invite.profiles) ? invite.profiles[0] : invite.profiles
  const expired = new Date(invite.expires_at).getTime() < Date.now()

  return json({
    businessName: (business as { name?: string } | null)?.name ?? 'este negocio',
    inviterName:
      (inviter as { full_name?: string; email?: string } | null)?.full_name ??
      (inviter as { full_name?: string; email?: string } | null)?.email ??
      'un compañero',
    role: invite.role,
    email: invite.email,
    status: expired && invite.status === 'pendiente' ? 'caducada' : invite.status,
  })
}

async function handleAccept(ctx: AuthContext, request: Request): Promise<Response> {
  const body = await request.json()
  const code = String(body.code ?? '')
  if (!code) throw new HttpError(400, 'Falta el código de invitación')

  const { data: invite } = await admin
    .from('business_invites')
    .select('id, business_id, email, role, status, expires_at')
    .eq('code', code)
    .maybeSingle()

  if (!invite) throw new HttpError(404, 'Esta invitación no existe')
  if (invite.status !== 'pendiente') throw new HttpError(410, 'Esta invitación ya no está disponible')
  if (new Date(invite.expires_at).getTime() < Date.now()) throw new HttpError(410, 'Esta invitación ha caducado')

  const { data: profile } = await admin.from('profiles').select('email').eq('id', ctx.userId).maybeSingle()
  if (!profile || profile.email.toLowerCase() !== invite.email.toLowerCase()) {
    // La invitación es de un email concreto — aceptarla con otra cuenta le
    // daría acceso al negocio a alguien que nunca fue invitado.
    throw new HttpError(403, 'Esta invitación es para otra dirección de email. Entra con esa cuenta para aceptarla.')
  }

  const { error: memberError } = await admin
    .from('business_members')
    .upsert(
      { business_id: invite.business_id, user_id: ctx.userId, role: invite.role },
      { onConflict: 'business_id,user_id' },
    )
  if (memberError) throw new HttpError(500, 'No se pudo añadir el acceso')

  await admin
    .from('business_invites')
    .update({ status: 'aceptada', accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return json({ businessId: invite.business_id })
}

async function handleRevoke(ctx: AuthContext, request: Request): Promise<Response> {
  const body = await request.json()
  const inviteId = String(body.inviteId ?? '')
  if (!inviteId) throw new HttpError(400, 'Falta la invitación')

  // El update corre con el cliente sujeto a RLS — la política ya exige
  // owner/admin del negocio de esa invitación.
  const { data, error } = await ctx.db
    .from('business_invites')
    .update({ status: 'revocada' })
    .eq('id', inviteId)
    .eq('status', 'pendiente')
    .select('id')
    .maybeSingle()

  if (error) throw new HttpError(500, 'No se pudo revocar la invitación')
  if (!data) throw new HttpError(404, 'Esa invitación no existe o ya no está pendiente')

  return json({ ok: true })
}

async function handleList(ctx: AuthContext, url: URL): Promise<Response> {
  const businessId = url.searchParams.get('businessId') ?? ''
  if (!businessId) throw new HttpError(400, 'Falta el negocio')

  // El select corre con el cliente sujeto a RLS — sin acceso de owner/admin
  // a ese negocio, esto devuelve cero filas en vez de un error.
  const { data, error } = await ctx.db
    .from('business_invites')
    .select('id, email, role, status, expires_at, created_at')
    .eq('business_id', businessId)
    .eq('status', 'pendiente')
    .order('created_at', { ascending: false })

  if (error) throw new HttpError(500, 'No se pudieron cargar las invitaciones')
  return json(data ?? [])
}
