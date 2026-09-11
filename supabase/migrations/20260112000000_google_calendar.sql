-- ============================================================================
-- AGENDAR_CITA — Google Calendar hoy; cualquier proveedor que implemente
-- CalendarProvider mañana (ver supabase/functions/_shared/calendar/types.ts).
-- Las credenciales OAuth por negocio viven en channel_credentials (provider
-- 'google_calendar'), igual que el bot_token de Telegram — mismo patrón de
-- solo-escritura ya establecido ahí, no se repite aquí.
-- ============================================================================

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  automation_id uuid references automations(id) on delete set null,
  service text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/Madrid',
  provider text not null default 'google_calendar',
  external_event_id text,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmada', 'cancelada', 'error')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_business_id_idx on appointments(business_id);
create index appointments_lead_id_idx on appointments(lead_id);

create trigger appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();

alter table appointments enable row level security;

-- Mismo patrón que el bloque genérico de tablas tenant-scoped en
-- 20260101000000_init.sql — se repite a mano aquí porque esa tabla ya no
-- existía cuando se generó appointments.
create policy "appointments: members read" on appointments
  for select using (is_business_member(business_id) or is_super_admin());

create policy "appointments: members insert" on appointments
  for insert with check (is_business_member(business_id));

create policy "appointments: members update" on appointments
  for update using (is_business_member(business_id))
  with check (is_business_member(business_id));

create policy "appointments: admins delete" on appointments
  for delete using (has_business_role(business_id, array['owner','admin']::member_role[]));
