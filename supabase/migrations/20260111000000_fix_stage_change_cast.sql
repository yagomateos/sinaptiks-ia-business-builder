-- Bug real introducido en automation_stage_dispatch: comparar
-- `trigger->'config'->>'to'` (text) contra `new.stage` (enum lead_stage) no
-- tiene operador `=` en Postgres — cualquier UPDATE que cambiara `stage` en
-- `leads` fallaba entero y hacía rollback, en silencio para quien llamaba
-- (ni el frontend ni n8n-callback comprobaban el error de esa escritura
-- concreta). Se corrige convirtiendo el enum a texto antes de comparar.
create or replace function notify_stage_change_automations()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  dispatch_secret text;
  automation record;
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
      and a.trigger -> 'config' ->> 'delay_hours' is null
      and not exists (
        select 1 from jsonb_array_elements(a.actions) as step
        where step ->> 'type' = 'responder_ia'
      )
  loop
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
  end loop;

  return new;
end;
$$;
