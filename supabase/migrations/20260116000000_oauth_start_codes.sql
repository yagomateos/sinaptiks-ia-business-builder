-- ============================================================================
-- Códigos de un solo uso para iniciar un OAuth de canal (hoy solo Google
-- Calendar) sin mandar el JWT de sesión completo por la URL del navegador.
--
-- Antes, `google-calendar-oauth/start` recibía el token de sesión entero como
-- `?token=` en la URL — expuesto en el historial del navegador y en
-- cualquier log de acceso. `google-calendar-oauth/mint-start-code` (con
-- sesión real, autenticado igual que cualquier otra Edge Function) crea aquí
-- un código de corta vida; `/start` lo consume una sola vez y lo borra.
--
-- Solo la service role toca esta tabla: RLS activo sin ninguna política
-- deniega el acceso a cualquiera sujeto a RLS, incluido el propio dueño del
-- código — mismo espíritu que channel_credentials, un paso más estricto.
-- ============================================================================

create table oauth_start_codes (
  code uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index oauth_start_codes_expires_at_idx on oauth_start_codes(expires_at);

alter table oauth_start_codes enable row level security;
