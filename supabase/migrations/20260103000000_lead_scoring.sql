-- ============================================================================
-- Potencial de contacto y canal Telegram
--
-- El CRM ya tenía `temperature` (frío/templado/caliente), pero es un campo que
-- alguien pone a mano y se queda obsoleto. Esto añade una valoración calculada
-- a partir de la conversación real, con la traza de por qué salió esa nota.
-- ============================================================================

-- Telegram como canal e integración.
alter type integration_provider add value if not exists 'telegram';

create type potential_label as enum (
  'descartado',
  'frio',
  'templado',
  'caliente',
  'muy_caliente'
);

alter table leads
  -- 0–100. Null mientras no haya conversación que medir: es distinto de cero,
  -- que significaría "medido y sin potencial".
  add column potential_score smallint
    check (potential_score is null or potential_score between 0 and 100),
  add column potential_label potential_label,
  add column scored_at timestamptz,
  -- Las señales que produjeron la nota: cuántos mensajes, qué intenciones se
  -- detectaron, qué canal. Sin esto la puntuación es un número sin defensa.
  add column score_signals jsonb;

-- Los contactos con más potencial son los que el usuario mira primero.
create index leads_business_potential_idx
  on leads(business_id, potential_score desc nulls last);

comment on column leads.potential_score is
  'Potencial calculado de la conversación (0-100). Null = sin medir todavía.';
comment on column leads.score_signals is
  'Señales que produjeron la puntuación, para poder explicarla.';
