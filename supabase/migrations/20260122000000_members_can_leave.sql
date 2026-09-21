-- ============================================================================
-- Un admin o miembro no podía abandonar un negocio por su cuenta: las
-- políticas de business_members solo dejaban borrar filas a owner/admin
-- (ni siquiera la suya propia) — quitar acceso hoy solo podía hacerlo otra
-- persona con permiso, nunca uno mismo. El propietario queda excluido a
-- propósito: dejaría el negocio sin nadie al mando (para eso existe
-- "Eliminar negocio", que sí puede hacer el propietario).
-- ============================================================================

create policy "members: leave own membership" on business_members
  for delete using (user_id = auth.uid() and role != 'owner');
