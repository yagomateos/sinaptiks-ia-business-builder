-- ============================================================================
-- Invitar a alguien a un negocio — hasta ahora era imposible: Ajustes →
-- Equipo prometía "podrás invitar a más personas cuando conectemos el envío
-- de correos" (Resend ya está conectado desde hace semanas) pero no existía
-- ningún camino, ni en la UI ni en el backend, para añadir a una segunda
-- persona a un negocio salvo tocando la base de datos a mano.
-- ============================================================================

create table business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  email text not null,
  role member_role not null default 'member',
  code uuid not null unique default gen_random_uuid(),
  invited_by uuid not null references profiles(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'revocada')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index business_invites_business_id_idx on business_invites(business_id);
create index business_invites_code_idx on business_invites(code);

-- Como mucho una invitación pendiente por email y negocio a la vez — invitar
-- dos veces a la misma persona sin haber revocado la primera no debe crear
-- dos filas sueltas.
create unique index business_invites_pending_unique
  on business_invites(business_id, email)
  where status = 'pendiente';

alter table business_invites enable row level security;

-- Solo owner/admin ven, crean y revocan invitaciones de su negocio — igual
-- que ya gestionan los miembros existentes (ver "members: owners and admins
-- manage" más abajo en la migración inicial).
create policy "invites: owners and admins read" on business_invites
  for select using (has_business_role(business_id, array['owner','admin']::member_role[]));

create policy "invites: owners and admins create" on business_invites
  for insert with check (has_business_role(business_id, array['owner','admin']::member_role[]));

create policy "invites: owners and admins revoke" on business_invites
  for update using (has_business_role(business_id, array['owner','admin']::member_role[]))
  with check (has_business_role(business_id, array['owner','admin']::member_role[]));
