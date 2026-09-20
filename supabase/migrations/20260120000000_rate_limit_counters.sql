-- ============================================================================
-- Límite de uso por usuario para operaciones que cuestan dinero de verdad
-- (Claude/OpenAI/embeddings) — hasta ahora, cualquier cuenta autenticada
-- podía llamar a `ai/generate-reply` o a la ingesta de conocimiento sin
-- ningún límite propio, con claves de pago reales detrás.
--
-- Tabla + función internas, nunca expuestas a RLS de negocio: no guardan
-- ningún dato del usuario más allá de un contador, y solo se tocan a través
-- de `check_rate_limit()` (security definer), igual que oauth_start_codes.
-- ============================================================================

create table rate_limit_counters (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table rate_limit_counters enable row level security;
-- Sin políticas: nadie sujeto a RLS puede leer ni escribir esta tabla
-- directamente — solo la función de abajo, que corre con privilegios propios.

create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  insert into rate_limit_counters (key, window_start, count)
  values (p_key, now(), 0)
  on conflict (key) do nothing;

  select window_start, count into v_window_start, v_count
  from rate_limit_counters
  where key = p_key
  for update;

  if now() - v_window_start > make_interval(secs => p_window_seconds) then
    update rate_limit_counters
    set window_start = now(), count = 1
    where key = p_key;
    return true;
  end if;

  if v_count >= p_limit then
    return false;
  end if;

  update rate_limit_counters
  set count = count + 1
  where key = p_key;

  return true;
end;
$$;

-- Cualquier usuario autenticado puede EJECUTAR la función (para comprobar su
-- propio límite), pero eso no le da acceso a la tabla en sí — security
-- definer hace que la función corra con los privilegios de quien la creó,
-- no con los de quien la llama.
grant execute on function check_rate_limit(text, int, int) to authenticated;
