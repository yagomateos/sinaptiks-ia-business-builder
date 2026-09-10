-- ============================================================================
-- Dispara las automatizaciones "cambio_estado" cuando un lead cambia de fase.
--
-- El cambio de `stage` puede venir del frontend (RLS normal, sin API key de
-- n8n) o de la acción `actualizar_lead` de otra automatización (Edge
-- Function con service role, pero tampoco con la key de n8n — a propósito,
-- ver conversation-pipeline.ts). Un trigger de Postgres es el único sitio que
-- ve el cambio sin importar quién escribió: llama por pg_net a la Edge
-- Function `automation-dispatch`, que sí tiene la key de n8n, autenticado con
-- un secreto guardado en Vault (nunca legible por RLS, igual que
-- channel_credentials).
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- El secreto se guarda aparte con `supabase db query`, nunca en una
-- migración versionada — así el valor real no queda en el historial de git.
-- Si no está presente todavía (primer despliegue), el trigger se limita a no
-- disparar nada, no falla el update del lead.
select vault.create_secret(
  'placeholder-hasta-que-se-guarde-el-valor-real',
  'automation_dispatch_secret',
  'Secreto compartido entre el trigger de leads.stage y la Edge Function automation-dispatch'
)
where not exists (
  select 1 from vault.secrets where name = 'automation_dispatch_secret'
);

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

  -- Sin secreto real todavía (o sin pg_net disponible en local/preview), no
  -- hay nada que disparar — el cambio de fase del lead no debe fallar por
  -- esto bajo ningún concepto.
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
      -- "config.to" ausente significa "cualquier fase destino" — pero todos
      -- los blueprints del catálogo lo traen puesto, así que en la práctica
      -- siempre filtra.
      and (a.trigger -> 'config' ->> 'to' is null or a.trigger -> 'config' ->> 'to' = new.stage)
      and (a.trigger -> 'config' ->> 'from' is null or a.trigger -> 'config' ->> 'from' = old.stage)
      -- delay_hours implica que el disparo real debería esperar, no ocurrir
      -- al momento — todavía no hay infraestructura para eso (ver
      -- conversación), así que esos se dejan fuera aquí a propósito. La UI
      -- (isAutomationTriggerConnected) tiene que reflejar la misma condición.
      and a.trigger -> 'config' ->> 'delay_hours' is null
      -- responder_ia necesita un mensaje real al que responder. Un cambio de
      -- fase no trae ninguno, así que respondWithAgent caería a su "Hola" de
      -- respaldo y generaría una respuesta de IA inventada, sin que nadie
      -- haya escrito nada. Misma exclusión que mensaje_entrante en
      -- conversation-pipeline.ts, por la misma razón de fondo.
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

drop trigger if exists leads_stage_change_automations on leads;

create trigger leads_stage_change_automations
  after update of stage on leads
  for each row
  execute function notify_stage_change_automations();
