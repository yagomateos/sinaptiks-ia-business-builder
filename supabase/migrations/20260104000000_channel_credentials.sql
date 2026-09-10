-- ============================================================================
-- Credenciales de canal — de solo escritura desde el cliente.
--
-- Un token de bot de Telegram (o cualquier credencial de canal futura) da
-- control real sobre ese canal: quien lo tenga puede enviar mensajes en
-- nombre del negocio y leer lo que llega. `integrations.config` es jsonb
-- legible por cualquier miembro vía RLS normal — perfecto para un estado
-- "conectado o no", pésimo para un secreto.
--
-- Esta tabla resuelve eso al revés de lo habitual: los miembros pueden
-- INSERTAR y ACTUALIZAR su propia credencial (para guardarla desde el
-- formulario de conexión), pero nadie tiene política de SELECT. Ni siquiera
-- el dueño del negocio puede releer el token una vez guardado — el mismo
-- patrón que una contraseña. Solo la service role (que usan las Edge
-- Functions, sin pasar por RLS) puede leerlo para de verdad enviar el
-- mensaje.
-- ============================================================================

create table channel_credentials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider integration_provider not null,
  -- La forma depende del proveedor. Para telegram: { bot_token, webhook_secret }.
  credential jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider)
);

create trigger channel_credentials_updated_at
  before update on channel_credentials
  for each row execute function set_updated_at();

alter table channel_credentials enable row level security;

-- Guardar y actualizar: sí. Volver a leer el valor guardado: no, para nadie
-- sujeto a RLS — ninguna política de SELECT en esta tabla es intencional.
create policy "channel_credentials: members insert" on channel_credentials
  for insert with check (is_business_member(business_id));

create policy "channel_credentials: members update" on channel_credentials
  for update using (is_business_member(business_id))
  with check (is_business_member(business_id));

create policy "channel_credentials: admins delete" on channel_credentials
  for delete using (has_business_role(business_id, array['owner','admin']::member_role[]));

-- ----------------------------------------------------------------------------
-- Localizar el negocio dueño de un secreto de webhook de Telegram.
--
-- La Edge Function del webhook recibe un secreto en la URL, no un business_id
-- — así no se expone qué negocio es cada uno. Esta función es la única forma
-- de resolver ese secreto a un negocio, y solo la puede llamar la service
-- role (se ejecuta con sus propios privilegios, sin pasar por RLS, y no está
-- expuesta a través de la API pública de PostgREST).
-- ----------------------------------------------------------------------------

create or replace function find_business_by_telegram_secret(secret text)
returns table (business_id uuid, bot_token text)
language sql
stable
security definer
set search_path = public
as $$
  select business_id, credential ->> 'bot_token'
  from channel_credentials
  where provider = 'telegram'
    and credential ->> 'webhook_secret' = secret
  limit 1;
$$;

revoke execute on function find_business_by_telegram_secret(text) from public, anon, authenticated;
