-- ============================================================================
-- rollup_automation_execution marcaba automations.status = 'error' ante
-- CUALQUIER ejecución fallida, incluida una prueba manual ("Probar ahora").
-- Eso podía dejar una automatización activa y sana marcada como rota (y sus
-- jobs programados cancelados) solo porque alguien la probó a mano con datos
-- que fallaron, o durante un fallo transitorio del motor.
--
-- Una prueba manual (source = 'prueba_manual', ver n8n/index.ts executeOnce)
-- no es una ejecución de producción real: su resultado sigue contando para
-- las estadísticas (execution_count, error_count) pero ya no debe apagar una
-- automatización que en producción sigue funcionando. Un fallo real
-- (source = 'evento_real', o sin source por venir de una acción antigua)
-- se sigue marcando como 'error', tal como pide CLAUDE.md: nunca esconder un
-- fallo real de producción.
-- ============================================================================

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
          when new.status = 'error'
            and coalesce(new.payload ->> 'source', '') <> 'prueba_manual'
            then 'error'::automation_status
          else status
        end,
        updated_at = now()
  where id = new.automation_id;
  return new;
end;
$$;
