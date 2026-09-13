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

## Current task
Revisando `src/features/crm`

## Remaining
- `src/features/crm`
- Run production build (final)

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
