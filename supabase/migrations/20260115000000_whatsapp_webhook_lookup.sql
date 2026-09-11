-- ============================================================================
-- Localizar el negocio dueño de un número de WhatsApp Cloud API.
--
-- A diferencia de Telegram (un secreto distinto por bot en la propia URL del
-- webhook), WhatsApp Cloud API usa una única URL de webhook compartida por
-- todos los negocios que cuelgan de la misma app de Meta: quien identifica de
-- qué negocio es un mensaje entrante es el `phone_number_id` que trae el
-- propio payload. Esta función es la única forma de resolver ese
-- `phone_number_id` a un negocio y a su token de acceso — igual que
-- `find_business_by_telegram_secret`, solo la puede llamar la service role.
-- ============================================================================

create or replace function find_business_by_whatsapp_phone_number_id(phone_number_id text)
returns table (business_id uuid, access_token text)
language sql
stable
security definer
set search_path = public
as $$
  select business_id, credential ->> 'access_token'
  from channel_credentials
  where provider = 'whatsapp'
    and credential ->> 'phone_number_id' = phone_number_id
  limit 1;
$$;

revoke execute on function find_business_by_whatsapp_phone_number_id(text) from public, anon, authenticated;
