-- ============================================================================
-- RESINCRONIZACIÓN CON N8N
--
-- n8n/index.ts ya sabía construir y mandar la definición de un workflow
-- (updateWorkflow), pero nada en la app lo llamaba nunca tras la creación
-- inicial — y ni crear ni actualizar dejaban constancia de si de verdad
-- había llegado a n8n o no. Se descubrió esta sesión de la forma incómoda:
-- dos automatizaciones llevaban con la acción equivocada grabada en n8n
-- desde que se crearon, sin que nada lo detectara.
-- ============================================================================

alter table automations add column sync_status text
  check (sync_status is null or sync_status in ('synced', 'syncing', 'error'));
alter table automations add column last_synced_at timestamptz;
alter table automations add column sync_error text;
alter table automations add column workflow_version integer not null default 0;

-- Las que ya tienen un workflow en n8n se dan por sincronizadas la primera
-- vez — es lo más honesto que se puede afirmar sin volver a comprobarlas una
-- por una contra la API de n8n.
update automations
set sync_status = 'synced', last_synced_at = updated_at, workflow_version = 1
where n8n_workflow_id is not null;
