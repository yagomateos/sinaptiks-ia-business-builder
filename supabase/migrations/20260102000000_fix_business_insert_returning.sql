-- ============================================================================
-- Arregla el arranque del primer negocio.
--
-- `insert(...).select()` se traduce a INSERT ... RETURNING, y Postgres evalúa
-- la política de SELECT sobre la fila devuelta. La única política de lectura
-- exigía pertenecer a business_members, pero esa fila la crea un trigger
-- AFTER INSERT que aún no ha materializado en ese punto: el insert se hacía
-- correctamente y aun así devolvía 42501.
--
-- El propietario debe poder leer su propio negocio por el hecho de serlo, sin
-- depender de la tabla de miembros. Además de arreglar el RETURNING, esto
-- evita que un negocio quede inaccesible si su fila de membresía se pierde.
-- ============================================================================

create policy "businesses: owner reads own" on businesses
  for select using (owner_id = auth.uid());

-- Misma razón para subscriptions: la crea el mismo trigger y su lectura
-- dependía de una membresía que puede no existir todavía.
create policy "subscriptions: owner reads own" on subscriptions
  for select using (
    exists (
      select 1 from businesses
      where businesses.id = subscriptions.business_id
        and businesses.owner_id = auth.uid()
    )
  );
