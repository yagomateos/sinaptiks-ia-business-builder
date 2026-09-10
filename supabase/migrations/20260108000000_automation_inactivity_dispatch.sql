-- ============================================================================
-- Dispara las automatizaciones "inactividad": sin cron, nadie las lanza —
-- a diferencia de "programado" (n8n tiene su propio nodo de horario nativo),
-- "inactividad" depende de que algo compruebe cada cierto tiempo qué
-- conversaciones llevan N horas esperando respuesta del contacto.
-- ============================================================================

-- `last_message_role` permite distinguir "esperamos respuesta del contacto"
-- (última fue nuestra) de "el contacto acaba de escribir" sin volver a leer
-- la tabla messages en cada scan.
alter table conversations add column last_message_role message_role;

-- Marca la última vez que se avisó por inactividad en esta conversación. Se
-- resetea a null en cuanto el contacto vuelve a escribir (ver
-- touch_conversation más abajo) — así, si nunca responde, no se le vuelve a
-- avisar en cada pasada del cron, pero si escribe y luego vuelve a callarse,
-- el ciclo empieza de cero.
alter table conversations add column last_inactivity_notice_at timestamptz;

update conversations c
set last_message_role = m.role
from (
  select distinct on (conversation_id) conversation_id, role
  from messages
  order by conversation_id, created_at desc
) m
where m.conversation_id = c.id;

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
        last_message_role = new.role,
        last_inactivity_notice_at = case
          when new.role = 'contacto' then null
          else last_inactivity_notice_at
        end,
        unread_count = case
          when new.role = 'contacto' then unread_count + 1
          else unread_count
        end
  where id = new.conversation_id;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Cron: cada 30 minutos, pide a la Edge Function que revise y dispare.
-- Reutiliza el secreto de automation_dispatch_secret (misma confianza: lo
-- llama nuestro propio pg_net, no un tercero).
-- ----------------------------------------------------------------------------

create extension if not exists pg_cron;

create or replace function run_inactivity_scan()
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
    url => 'https://cmeihhnnrabzgevkyuru.supabase.co/functions/v1/automation-inactivity-scan',
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-secret', dispatch_secret
    ),
    body => '{}'::jsonb
  );
end;
$$;

select cron.schedule('automation-inactivity-scan', '*/30 * * * *', 'select run_inactivity_scan()');
