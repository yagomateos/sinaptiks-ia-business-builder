-- ============================================================================
-- SINAPTKIS AI BUSINESS BUILDER — initial schema
-- Multi-tenant SaaS. Every tenant-owned row carries business_id and is
-- isolated by RLS. A user only ever sees data for businesses they belong to.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

create type platform_role as enum ('user', 'super_admin');
create type member_role as enum ('owner', 'admin', 'member');

create type industry as enum (
  'clinica', 'restaurante', 'psicologo', 'inmobiliaria', 'peluqueria',
  'gimnasio', 'abogado', 'ecommerce', 'servicios_profesionales', 'otro'
);

create type brand_voice as enum ('cercano', 'profesional', 'entusiasta', 'directo', 'empatico');

create type lead_stage as enum ('nuevo', 'contactado', 'cualificado', 'cita', 'cliente', 'perdido');
create type lead_temperature as enum ('frio', 'templado', 'caliente');

create type conversation_status as enum ('abierta', 'pendiente', 'cerrada');
create type conversation_handler as enum ('agente_ia', 'humano');
create type message_role as enum ('contacto', 'agente_ia', 'humano', 'sistema');

create type automation_status as enum ('borrador', 'preparada', 'activa', 'pausada', 'error');
create type automation_category as enum (
  'captacion', 'atencion', 'ventas', 'reservas',
  'seguimiento', 'fidelizacion', 'reputacion', 'administracion'
);
create type execution_status as enum ('exito', 'error', 'en_curso', 'cancelada');

create type agent_type as enum ('recepcionista', 'comercial', 'seguimiento', 'soporte');
create type agent_status as enum ('borrador', 'activo', 'pausado');
create type ai_provider as enum ('anthropic', 'openai', 'ollama', 'rules');

create type knowledge_source_type as enum ('pdf', 'txt', 'docx', 'url', 'faq', 'servicio', 'texto');
create type knowledge_status as enum ('pendiente', 'procesando', 'listo', 'error');

create type integration_provider as enum (
  'n8n', 'whatsapp', 'google_calendar', 'gmail', 'instagram', 'facebook',
  'stripe', 'openai', 'anthropic', 'ollama', 'qdrant', 'elevenlabs'
);
create type integration_status as enum ('no_conectado', 'conectando', 'conectado', 'error');

create type notification_level as enum ('info', 'exito', 'aviso', 'error');
create type plan_key as enum ('starter', 'growth', 'scale');
create type subscription_status as enum ('trial', 'activa', 'morosa', 'cancelada');

-- ============================================================================
-- SHARED HELPERS
-- ============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- PROFILES
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  platform_role platform_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever an auth user is created.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- BUSINESSES & MEMBERSHIP
-- ============================================================================

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  industry industry not null default 'otro',
  website text,
  city text,
  country text,
  description text,
  logo_url text,
  onboarding_completed boolean not null default false,
  system_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index businesses_owner_id_idx on businesses(owner_id);
create index businesses_industry_idx on businesses(industry);

create trigger businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_members_user_id_idx on business_members(user_id);
create index business_members_business_id_idx on business_members(business_id);

-- ----------------------------------------------------------------------------
-- Tenancy helpers.
-- SECURITY DEFINER so RLS policies can call them without recursing into
-- business_members' own policies.
-- ----------------------------------------------------------------------------

create or replace function is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members
    where business_id = target_business_id
      and user_id = auth.uid()
  );
$$;

create or replace function has_business_role(target_business_id uuid, roles member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members
    where business_id = target_business_id
      and user_id = auth.uid()
      and role = any(roles)
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and platform_role = 'super_admin'
  );
$$;

-- Creating a business makes the creator its owner + member, and seeds billing.
create or replace function handle_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (business_id, user_id) do nothing;

  insert into public.subscriptions (business_id, plan, status, trial_ends_at)
  values (new.id, 'starter', 'trial', now() + interval '14 days')
  on conflict (business_id) do nothing;

  return new;
end;
$$;

-- ============================================================================
-- BUSINESS PROFILE & SERVICES
-- ============================================================================

create table business_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  business_name text not null,
  industry industry not null default 'otro',
  description text,
  location text,
  website text,
  ideal_customer text,
  value_proposition text,
  brand_voice brand_voice not null default 'profesional',
  business_hours jsonb not null default '[]'::jsonb,
  contact_channels text[] not null default '{}',
  goals text[] not null default '{}',
  faq jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  policies text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger business_profiles_updated_at
  before update on business_profiles
  for each row execute function set_updated_at();

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2),
  currency text not null default 'EUR',
  duration_minutes integer,
  url text,
  features text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index services_business_id_idx on services(business_id);

create trigger services_updated_at
  before update on services
  for each row execute function set_updated_at();

-- ============================================================================
-- AI AGENTS
-- ============================================================================

create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type agent_type not null,
  name text not null,
  description text,
  objective text not null default '',
  personality text not null default '',
  rules text[] not null default '{}',
  system_prompt text not null default '',
  model text not null default 'claude-opus-5',
  provider ai_provider not null default 'anthropic',
  channels text[] not null default '{}',
  allowed_actions text[] not null default '{}',
  handoff_rules jsonb not null default '{}'::jsonb,
  status agent_status not null default 'borrador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, type)
);

create index ai_agents_business_id_idx on ai_agents(business_id);

create trigger ai_agents_updated_at
  before update on ai_agents
  for each row execute function set_updated_at();

-- ============================================================================
-- CRM
-- ============================================================================

create table leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  source text not null default 'manual',
  stage lead_stage not null default 'nuevo',
  temperature lead_temperature not null default 'templado',
  notes text,
  value_estimate numeric(12,2),
  last_contacted_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  assigned_agent_id uuid references ai_agents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_business_id_idx on leads(business_id);
create index leads_business_stage_idx on leads(business_id, stage);
create index leads_business_created_idx on leads(business_id, created_at desc);
create index leads_email_idx on leads(business_id, email) where email is not null;

create trigger leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================

create table conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  channel text not null default 'web',
  subject text,
  status conversation_status not null default 'abierta',
  handled_by conversation_handler not null default 'agente_ia',
  assigned_agent_id uuid references ai_agents(id) on delete set null,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_business_id_idx on conversations(business_id);
create index conversations_business_last_msg_idx on conversations(business_id, last_message_at desc nulls last);
create index conversations_lead_id_idx on conversations(lead_id);

create trigger conversations_updated_at
  before update on conversations
  for each row execute function set_updated_at();

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  role message_role not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on messages(conversation_id, created_at);
create index messages_business_id_idx on messages(business_id);

-- Keep the conversation's last_message_at in sync.
create or replace function touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
    set last_message_at = new.created_at,
        updated_at = now(),
        unread_count = case
          when new.role = 'contacto' then unread_count + 1
          else unread_count
        end
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on messages
  for each row execute function touch_conversation();

-- ============================================================================
-- AUTOMATIONS
-- ============================================================================

create table automations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  template_key text,
  name text not null,
  description text,
  category automation_category not null default 'captacion',
  status automation_status not null default 'borrador',
  trigger jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  n8n_workflow_id text,
  last_execution_at timestamptz,
  execution_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, template_key)
);

create index automations_business_id_idx on automations(business_id);
create index automations_business_status_idx on automations(business_id, status);

create trigger automations_updated_at
  before update on automations
  for each row execute function set_updated_at();

create table automation_executions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  status execution_status not null default 'en_curso',
  n8n_execution_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_message text,
  payload jsonb not null default '{}'::jsonb
);

create index automation_executions_automation_idx
  on automation_executions(automation_id, started_at desc);
create index automation_executions_business_idx
  on automation_executions(business_id, started_at desc);

-- Roll execution counters up onto the automation.
create or replace function rollup_automation_execution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.automations
    set execution_count = execution_count + 1,
        error_count = error_count + case when new.status = 'error' then 1 else 0 end,
        last_execution_at = new.started_at,
        status = case
          when new.status = 'error' then 'error'::automation_status
          else status
        end,
        updated_at = now()
  where id = new.automation_id;
  return new;
end;
$$;

create trigger automation_executions_rollup
  after insert on automation_executions
  for each row execute function rollup_automation_execution();

-- ============================================================================
-- KNOWLEDGE BASE (RAG)
-- ============================================================================

create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null,
  source_type knowledge_source_type not null default 'texto',
  source_url text,
  storage_path text,
  content text,
  status knowledge_status not null default 'pendiente',
  chunk_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_documents_business_idx on knowledge_documents(business_id);

create trigger knowledge_documents_updated_at
  before update on knowledge_documents
  for each row execute function set_updated_at();

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  vector_id text,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index knowledge_chunks_document_idx on knowledge_chunks(document_id, chunk_index);
create index knowledge_chunks_business_idx on knowledge_chunks(business_id);

-- Which documents a given agent is allowed to draw on.
create table ai_agent_knowledge (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references ai_agents(id) on delete cascade,
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agent_id, document_id)
);

create index ai_agent_knowledge_agent_idx on ai_agent_knowledge(agent_id);
create index ai_agent_knowledge_business_idx on ai_agent_knowledge(business_id);

-- ============================================================================
-- INTEGRATIONS
-- ============================================================================

create table integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider integration_provider not null,
  status integration_status not null default 'no_conectado',
  -- Display config only. Secrets never live here; they stay server-side.
  config jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider)
);

create index integrations_business_idx on integrations(business_id);

create trigger integrations_updated_at
  before update on integrations
  for each row execute function set_updated_at();

-- ============================================================================
-- ACTIVITY, NOTIFICATIONS, BILLING
-- ============================================================================

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  actor_label text not null default 'Sistema',
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_logs_business_created_idx on activity_logs(business_id, created_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  level notification_level not null default 'info',
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_business_created_idx on notifications(business_id, created_at desc);
create index notifications_unread_idx on notifications(business_id, read_at) where read_at is null;

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  plan plan_key not null default 'starter',
  status subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

-- Deferred until subscriptions exists.
create trigger on_business_created
  after insert on businesses
  for each row execute function handle_new_business();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table profiles              enable row level security;
alter table businesses            enable row level security;
alter table business_members      enable row level security;
alter table business_profiles     enable row level security;
alter table services              enable row level security;
alter table leads                 enable row level security;
alter table conversations         enable row level security;
alter table messages              enable row level security;
alter table automations           enable row level security;
alter table automation_executions enable row level security;
alter table ai_agents             enable row level security;
alter table ai_agent_knowledge    enable row level security;
alter table knowledge_documents   enable row level security;
alter table knowledge_chunks      enable row level security;
alter table integrations          enable row level security;
alter table activity_logs         enable row level security;
alter table notifications         enable row level security;
alter table subscriptions         enable row level security;

-- ---------------------------------------------------------------- profiles --

create policy "profiles: read own" on profiles
  for select using (id = auth.uid() or is_super_admin());

create policy "profiles: update own" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ------------------------------------------------------------- businesses --

create policy "businesses: members read" on businesses
  for select using (is_business_member(id) or is_super_admin());

create policy "businesses: authenticated create own" on businesses
  for insert with check (owner_id = auth.uid());

create policy "businesses: owners and admins update" on businesses
  for update using (has_business_role(id, array['owner','admin']::member_role[]))
  with check (has_business_role(id, array['owner','admin']::member_role[]));

create policy "businesses: owners delete" on businesses
  for delete using (has_business_role(id, array['owner']::member_role[]));

-- -------------------------------------------------------- business_members --

create policy "members: read own memberships" on business_members
  for select using (user_id = auth.uid() or is_business_member(business_id) or is_super_admin());

create policy "members: owners and admins manage" on business_members
  for insert with check (has_business_role(business_id, array['owner','admin']::member_role[]));

create policy "members: owners and admins update" on business_members
  for update using (has_business_role(business_id, array['owner','admin']::member_role[]));

create policy "members: owners and admins remove" on business_members
  for delete using (has_business_role(business_id, array['owner','admin']::member_role[]));

-- ----------------------------------------------------------------------------
-- Tenant-scoped tables. Same shape everywhere: membership grants full access.
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
  tenant_tables text[] := array[
    'business_profiles', 'services', 'leads', 'conversations', 'messages',
    'automations', 'automation_executions', 'ai_agents', 'ai_agent_knowledge',
    'knowledge_documents', 'knowledge_chunks', 'integrations',
    'activity_logs', 'notifications', 'subscriptions'
  ];
begin
  foreach t in array tenant_tables loop
    execute format(
      'create policy "%1$s: members read" on %1$I
         for select using (is_business_member(business_id) or is_super_admin());',
      t
    );
    execute format(
      'create policy "%1$s: members insert" on %1$I
         for insert with check (is_business_member(business_id));',
      t
    );
    execute format(
      'create policy "%1$s: members update" on %1$I
         for update using (is_business_member(business_id))
         with check (is_business_member(business_id));',
      t
    );
    execute format(
      'create policy "%1$s: admins delete" on %1$I
         for delete using (has_business_role(business_id, array[''owner'',''admin'']::member_role[]));',
      t
    );
  end loop;
end
$$;

-- ============================================================================
-- ADMIN AGGREGATES
-- Super-admin only. SECURITY DEFINER + an explicit guard so a normal user
-- calling this gets nothing.
-- ============================================================================

create or replace function admin_platform_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select json_build_object(
    'users', (select count(*) from profiles),
    'businesses', (select count(*) from businesses),
    'businesses_onboarded', (select count(*) from businesses where onboarding_completed),
    'automations', (select count(*) from automations),
    'automations_active', (select count(*) from automations where status = 'activa'),
    'agents', (select count(*) from ai_agents),
    'agents_active', (select count(*) from ai_agents where status = 'activo'),
    'executions', (select count(*) from automation_executions),
    'executions_failed', (select count(*) from automation_executions where status = 'error'),
    'leads', (select count(*) from leads),
    'conversations', (select count(*) from conversations),
    'messages_ai', (select count(*) from messages where role = 'agente_ia')
  ) into result;

  return result;
end;
$$;
