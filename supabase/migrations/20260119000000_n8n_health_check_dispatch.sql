-- ============================================================================
-- Vigila que el propio proceso de n8n en la VPS siga vivo — Sentry ya avisa
-- de errores dentro de nuestras Edge Functions, pero no de que el motor
-- entero se haya caído (nada nuestro se ejecuta en ese caso para poder
-- fallar y reportarse solo). Mismo patrón de pg_cron + pg_net que
-- automation_inactivity_dispatch y scheduled_automation_jobs.
-- ============================================================================

create extension if not exists pg_cron;

create or replace function run_n8n_health_check()
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
    url => 'https://cmeihhnnrabzgevkyuru.supabase.co/functions/v1/n8n-health-check',
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automation-secret', dispatch_secret
    ),
    body => '{}'::jsonb
  );
end;
$$;

select cron.schedule('n8n-health-check', '*/5 * * * *', 'select run_n8n_health_check()');
