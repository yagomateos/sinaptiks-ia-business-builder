-- El contador de turnos para escalar a humano contaba TODO el historial de
-- la conversación, no los turnos desde la última vez que se le devolvió a la
-- IA. Una conversación que superó el umbral una vez quedaba inservible para
-- siempre: reasignarla a IA duraba un solo mensaje, porque el turno 9, 10,
-- 11... seguía cumpliendo "contactTurns >= 8" y volvía a derivar sin dar
-- tiempo a resolver nada.
alter table conversations
  add column handled_by_since timestamptz not null default now();

update conversations set handled_by_since = created_at;
