-- El email del dueño (profiles.email, vía auth) no siempre es a donde quiere
-- que lleguen los avisos del negocio — puede ser una cuenta de demo, o
-- preferir que le escriban a otra bandeja. `notification_email` es
-- explícito y opcional; si no está, el código que lo use cae al email del
-- dueño.
alter table business_profiles add column notification_email text;
