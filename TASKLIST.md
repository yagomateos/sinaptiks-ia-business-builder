# Tasklist — 8 funcionalidades pendientes

Seguimiento de la implementación de las 8 funcionalidades pedidas. Se actualiza según se completa cada punto.

## 1. Agendar cita — Google Calendar ✅ Implementado

- `CalendarProvider` desacoplado (`supabase/functions/_shared/calendar/types.ts`) — sustituir Google por otro proveedor es añadir una clase, no tocar quien lo usa.
- `GoogleCalendarProvider`: disponibilidad real (`freeBusy`) y creación de eventos (`events.insert`), con refresco de token.
- Tabla `appointments` en Supabase (RLS igual que el resto de tablas tenant-scoped).
- Edge Function `google-calendar-oauth` (`/start` + `/callback`) con comprobación de pertenencia al negocio.
- `agendar_cita` conectado en `n8n-callback` (contacto directo con fecha + email).
- Botón real "Conectar con Google" en Canales.
- **Pendiente por credenciales**: falta `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Sin ellos, `/start` devuelve `503` con mensaje claro — no simula conexión.

## 2. Clasificador de intención ✅ Implementado

- `IntentClassifierProvider` desacoplado (`_shared/intent-classifier/types.ts`): `reserva | faq | ventas | soporte | humano | otro` + confianza.
- Heurístico por palabras clave (gratis, siempre disponible) + clasificador con Claude (contexto real del negocio) para casos ambiguos — el heurístico decide primero, así la mayoría de mensajes no gastan una llamada a IA.
- Conectado a automatizaciones: `mensaje_entrante` con `intent` dispara en cualquier mensaje que el clasificador etiquete igual con confianza suficiente. `escalado` sigue gobernado por `detectHandoff` (más fiable), con el clasificador como respaldo.
- **De paso**: se instaló Deno localmente y se corrigieron 3 errores de tipos reales preexistentes en `conversation-pipeline.ts` y `automation-inactivity-scan` que `supabase functions deploy` nunca detectaba (empaqueta con esbuild, no tipa).

## 3. Delay real en cambio_estado ✅ Implementado

- Tabla `scheduled_automation_jobs` (`scheduled_at`, estados `pendiente/procesando/completado/error/cancelado`, `attempts`/`max_attempts`, `last_error`).
- El trigger de `cambio_estado` ahora encola cuando hay `delay_hours` en vez de descartar la automatización.
- Cron cada 15 min (`automation-scheduled-jobs-run`) reclama jobs vencidos con un `UPDATE ... RETURNING` atómico (sin duplicados entre pases concurrentes), dispara vía `n8n.trigger`, y reintenta con backoff (15 min × intento) hasta `max_attempts`.
- Si la automatización se pausó/borró antes de que le tocara, el job se cancela en vez de disparar algo desactivado.
- Verificado en producción: cron programado y activo, función responde `401` sin secreto.

## 4. Búsqueda semántica de Knowledge ✅ Implementado

- **Bug real encontrado y corregido de paso**: el frontend ya llamaba a `POST /knowledge/upsert` al procesar cualquier documento (`vectorStore.upsert` en `src/services/vector/index.ts`), pero esa función no existía — cada documento acababa marcado como "error" en producción aunque sus fragmentos sí se guardaban en Postgres. Ahora la función existe y ese flujo funciona.
- `EmbeddingsProvider` y `VectorStoreProvider` desacoplados (`_shared/embeddings/`, `_shared/vector-store/`) — Qdrant y OpenAI son una implementación cada uno, sustituibles sin tocar quien las usa.
- Pipeline completo: chunk (ya existía) → embeddings (OpenAI `text-embedding-3-small`) → Qdrant (`knowledge_chunks` collection, filtrado por `businessId`) → resultados → agente IA.
- `_shared/knowledge-search.ts` unifica la búsqueda: semántica si Qdrant+embeddings están configurados (con fallback automático a palabra clave si la llamada falla), palabra clave si no — usado tanto por el chat real (`conversation-pipeline.ts`) como por la Edge Function `knowledge` (antes cada uno tenía su propia copia del `ILIKE`).
- Nueva Edge Function `knowledge` (`/upsert`, `/search`, `/remove`), autenticada igual que `n8n`/`channels`.
- **Pendiente por credenciales**: faltan `QDRANT_URL` y `OPENAI_API_KEY`. Sin ellos, `/upsert` no falla (devuelve `semantic: false`, los chunks se guardan igual en Postgres) y la búsqueda cae a palabra clave — Knowledge sigue funcionando, solo sin la parte semántica.

## 5. Resincronización con n8n — pendiente

## 6. Stripe — pendiente

## 7. Email programado (campañas) — pendiente

## 8. WhatsApp (arquitectura, sin activar) — pendiente

---

## Reglas seguidas en cada punto

- Reutilizar arquitectura existente (patrones de `_shared/*`, RLS por `business_id`, `IntegrationStatus` ya definido).
- Sin mocks: si faltan credenciales, se expone un estado honesto ("no conectado" / error claro), nunca una simulación silenciosa.
- Ninguna clave secreta en el frontend.
- Después de cada punto: `deno check` en las Edge Functions tocadas, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
