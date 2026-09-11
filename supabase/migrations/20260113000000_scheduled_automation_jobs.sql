-- ============================================================================
-- DELAY REAL EN cambio_estado (delay_hours)
--
-- Antes, un cambio_estado con delay_hours se excluía sin más — la automatización
-- nunca disparaba. Ahora se encola un job con scheduled_at en el futuro, y un
-- cron (cada 15 min) lo recoge cuando toca. Mismo secreto (automation_dispatch_secret)
-- y mismo patrón de pg_cron + pg_net que automation_inactivity_dispatch.
-- ============================================================================

create table scheduled_automation_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  automation_id uuid not null references automations(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'procesando', 'completado', 'error', 'cancelado')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index scheduled_automation_jobs_due_idx
  on scheduled_automation_jobs(scheduled_at)
  where status = 'pendiente';
create index scheduled_automation_jobs_business_id_idx on scheduled_automation_jobs(business_id);

alter table scheduled_automation_jobs enable row level security;

create policy "scheduled_automation_jobs: members read" on scheduled_automation_jobs
  for select using (is_business_member(business_id) or is_super_admin());

-- Nadie inserta/actualiza esto desde el cliente — lo hace el trigger de
-- cambio_estado (SECURITY DEFINER) y la Edge Function del cron (service
-- role, que no pasa por RLS). Sin políticas de insert/update/delete a
-- propósito.

-- ----------------------------------------------------------------------------
-- El trigger de cambio_estado ahora encola en vez de descartar cuando hay
-- delay_hours, y sigue disparando inmediato cuando no lo hay.
-- ----------------------------------------------------------------------------
create or replace function notify_stage_change_automations()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  dispatch_secret text;
  automation record;
  delay_hours numeric;
begin
  if new.stage is not distinct from old.stage then
    return new;
  end if;

  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets
  where name = 'automation_dispatch_secret';

  if dispatch_secret is null or dispatch_secret = 'placeholder-hasta-que-se-guarde-el-valor-real' then
    return new;
  end if;

  for automation in
    select a.id, a.trigger
    from automations a
    where a.business_id = new.business_id
      and a.status = 'activa'
      and a.n8n_workflow_id is not null
      and a.trigger ->> 'type' = 'cambio_estado'
      and (a.trigger -> 'config' ->> 'to' is null or a.trigger -> 'config' ->> 'to' = new.stage::text)
      and (a.trigger -> 'config' ->> 'from' is null or a.trigger -> 'config' ->> 'from' = old.stage::text)
      and not exists (
        select 1 from jsonb_array_elements(a.actions) as step
        where step ->> 'type' = 'responder_ia'
      )
  loop
    delay_hours := (automation.trigger -> 'config' ->> 'delay_hours')::numeric;

    if delay_hours is not null and delay_hours > 0 then
      insert into scheduled_automation_jobs (business_id, automation_id, lead_id, payload, scheduled_at)
      values (
        new.business_id,
        automation.id,
        new.id,
        jsonb_build_object(
          'name', new.full_name,
          'email', new.email,
          'phone', new.phone,
          'channel', new.source,
          'from', old.stage,
          'to', new.stage
        ),
        now() + (delay_hours || ' hours')::interval
      );
    else
      perform net.http_post(
        url => 'https://cmeihhnnrabzgevkyuru.supabase.co/functions/v1/automation-dispatch',
        headers => jsonb_build_object(
          'Content-Type', 'application/json',
          'x-automation-secret', dispatch_secret
        ),
        body => jsonb_build_object(
          'automationId', automation.id,
          'businessId', new.business_id,
          'leadId', new.id,
          'payload', jsonb_build_object(
            'name', new.full_name,
            'email', new.email,
            'phone', new.phone,
            'channel', new.source,
            'from', old.stage,
            'to', new.stage
          )
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Cron: cada 15 minutos, pide a la Edge Function que reclame y ejecute los
-- jobs cuya hora ya llegó.
-- ----------------------------------------------------------------------------
create or replace function run_scheduled_automation_jobs()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  dispatch_secret text;
begin
  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets
  where name = 'automation_dispatch_secret';

  if dispatch_secret is null or dispatch_secret = 'placeholder-hasta-que-se-guarde-el-valor-real' then
    return;
  end if;

  perform net.http_post(
    url => 'https://cmeihhnnrabzgevkyuru.supabase.co/functions/v1/automation-scheduled-jobs-run',
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-secret', dispatch_secret
    ),
    body => '{}'::jsonb
  );
end;
$$;

select cron.schedule('automation-scheduled-jobs-run', '*/15 * * * *', 'select run_scheduled_automation_jobs()');
