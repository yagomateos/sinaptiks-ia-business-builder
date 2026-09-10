-- Permite que un aviso enlace a lo que lo originó (una automatización que
-- falló, un lead que se puso muy caliente), igual que ya hace activity_logs.
alter table notifications
  add column entity_type text,
  add column entity_id uuid;
