-- Marca cuándo se envió el último recordatorio/reactivación por
-- automatización "programado" a este lead. Sin esto, cada vez que el cron o
-- el horario de n8n vuelve a disparar, se le mandaría el mismo aviso otra
-- vez a quien ya lo recibió para esta misma cita o este mismo periodo de
-- inactividad.
alter table leads add column last_reminder_sent_at timestamptz;
