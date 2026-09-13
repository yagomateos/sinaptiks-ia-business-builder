# Project Progress

## Completed
- TypeScript errors fixed (frontend + las 14 Edge Functions, 0 errores)
- Authentication reviewed (fix: `signOut()` limpia la caché de React Query)
- n8n integration reviewed (fix: éxito falso en "Probar ahora", timeouts añadidos)
- `src/features/automations` reviewed:
  - `automation-detail-page.tsx`: promesa sin capturar en la comprobación
    de estado real en n8n (podía rechazar sin control con el nuevo timeout
    de 15s) — ahora tiene `.catch()`.
  - `automation-detail-page.tsx`: el historial de ejecuciones no distinguía
    "cargando" / "error" de "vacío de verdad" — un fallo de la query se veía
    igual que "todavía no se ha ejecutado ninguna vez".
  - `automations-page.tsx`: revisado, sin hallazgos.
  - `automation-status-badge.tsx`: revisado, sin hallazgos.
- `src/features/agents` reviewed:
  - `agent-detail-page.tsx`: el interruptor de "Activo/En pausa" solo
    tocaba el borrador local — no se guardaba hasta pulsar "Guardar" en
    otra parte de la página, a diferencia del mismo interruptor en la
    lista de agentes, que persiste al instante. Alguien podía "pausar" el
    agente, irse de la página sin guardar, y el agente seguía activo de
    verdad. Ahora persiste al momento, igual que en la lista.
  - `agents-page.tsx`: revisado, sin hallazgos.
- `src/features/crm` reviewed:
  - `lead-detail-page.tsx`: la tarjeta "Citas" ocultaba un fallo real de
    la consulta como si el contacto no tuviera ninguna cita — igual patrón
    que ya se corrigió en el historial de ejecuciones de automatizaciones.
    Ahora muestra el error con reintento.
  - `conversation-simulator-page.tsx`: no esperaba a `servicesQuery` antes
    de dejar escribir (el agente podía responder sin conocer los
    servicios reales si se enviaba un mensaje muy rápido); y un fallo real
    de red en agentes/perfil/servicios se veía igual que "todavía no
    tienes agentes" — mismo patrón de error escondido como vacío.
  - `leads-page.tsx`, `potential-badge.tsx`: revisados, sin hallazgos.
  - No tocado (no es un fallo del CRM en concreto, es así en toda la app:
    Ajustes, Conocimiento también): "Eliminar" contacto borra sin ninguna
    confirmación. Ver "Known issues".

## Current task
Ninguna — las 3 features pedidas están revisadas. Ejecutando el build de
producción final.

## Remaining
- (ninguno de los módulos pedidos)

## Known issues
- (fuera del alcance de `src/features/automations`, no tocado) El trigger
  de Postgres `rollup_automation_execution` (migración `20260101000000_init.sql`)
  pone `automations.status = 'error'` ante CUALQUIER ejecución fallida,
  incluida una prueba manual — puede marcar como "error" (y por tanto
  cancelar sus jobs programados) una automatización que en realidad sigue
  bien, por un solo fallo transitorio. Merece revisión aparte.
- Pendiente retomar: secreto propio por automatización en la URL del
  webhook de n8n (`sinaptkis/<id>/<secreto>`) — investigado, no
  implementado, en pausa por esta tanda de revisiones de features.
- (app entera, no solo CRM) Ningún botón "Eliminar" (contactos, agentes,
  documentos de Conocimiento, negocios en Ajustes) pide confirmación
  antes de borrar — un solo clic borra sin vuelta atrás. No existe
  ningún componente de confirmación (AlertDialog) en la app todavía; para
  arreglarlo de verdad haría falta construir uno, lo cual es más que un
  fix puntual — no lo he tocado en ningún módulo de esta tanda.
