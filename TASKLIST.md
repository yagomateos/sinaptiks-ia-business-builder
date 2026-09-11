# Tasklist — 8 funcionalidades pendientes

Seguimiento de la implementación de las 8 funcionalidades pedidas. Se actualiza según se completa cada punto.

## 1. Agendar cita — Google Calendar ✅ Implementado

- `CalendarProvider` desacoplado (`supabase/functions/_shared/calendar/types.ts`) — sustituir Google por otro proveedor es añadir una clase, no tocar quien lo usa.
- `GoogleCalendarProvider`: disponibilidad real (`freeBusy`) y creación de eventos (`events.insert`), con refresco de token.
- Tabla `appointments` en Supabase (RLS igual que el resto de tablas tenant-scoped).
- Edge Function `google-calendar-oauth` (`/start` + `/callback`) con comprobación de pertenencia al negocio.
- `agendar_cita` conectado en `n8n-callback` (contacto directo con fecha + email).
- Botón real "Conectar con Google" en Canales.
- **Credenciales configuradas y conexión verificada en producción** (2026-09-11): `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` puestos como secrets; hubo que corregir dos bugs reales para completarla — la credencial de Google tenía que ser de tipo "Web application" (no "Desktop app", que solo admite `redirect_uri=http://localhost`), y el callback tiraba un 500 (`Response.redirect` con URL relativa) cuando `APP_URL` no estaba configurado. La cuenta de prueba está añadida como test user en la pantalla de consentimiento OAuth (la app sigue en modo "Testing" en Google — para que cualquier negocio pueda conectarla sin ese límite hace falta pasar la verificación de Google para el scope de Calendar).

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

## 5. Resincronización con n8n ✅ Implementado

- Nuevas columnas en `automations`: `sync_status` (`synced|syncing|error`, `null` = nunca sincronizada), `last_synced_at`, `sync_error`, `workflow_version`.
- `n8n/index.ts` (`createWorkflow` y `updateWorkflow`) ahora escribe ese estado real alrededor de la llamada a n8n: `syncing` antes, `synced` + `last_synced_at` + `workflow_version + 1` solo si `n8n.update()`/`n8n.create()` tuvo éxito, `error` + `sync_error` si falló — **nunca se marca sincronizado si n8n falló**, tal como se pidió.
- `automationService.resync()` + botón "Sincronizar ahora" / "Reintentar" en la ficha de la automatización, con el estado y el error visibles en el panel "Resumen".
- Esto es justo lo que habría detectado antes el desajuste que encontré a mano esta sesión (los workflows de "Recordar citas"/"Reactivar clientes" con `enviar_whatsapp` grabado en vez de `enviar_telegram`) — ahora el panel lo muestra en vez de quedar en silencio.

## 6. Stripe ✅ Implementado

- `_shared/stripe-client.ts`: REST directo a Stripe (mismo estilo que el resto de clientes del proyecto), con verificación de firma de webhook por HMAC-SHA256 vía Web Crypto (algoritmo documentado por Stripe, sin SDK).
- Edge Function `stripe` (`/checkout`, `/portal`): autenticada, crea/reutiliza el customer y devuelve la URL real de Stripe — nunca simula un pago.
- Edge Function `stripe-webhook`: sin sesión (la llama Stripe), verifica la firma antes de tocar nada. Es la única fuente de verdad del estado — `checkout.session.completed` guarda `stripe_customer_id`/`stripe_subscription_id`, `customer.subscription.updated/created` actualiza plan/estado/`current_period_end`, `customer.subscription.deleted` marca `cancelada`.
- Reutiliza la tabla `subscriptions` que ya existía (`plan_key`, `subscription_status`).
- Pestaña "Facturación" en Ajustes: plan actual, botón "Gestionar facturación" (portal) y elegir plan (checkout) — si Stripe no está configurado, el error real llega hasta el usuario en vez de fingir que funcionó.
- **Pendiente por credenciales**: faltan `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, y los Price ID (`STRIPE_PRICE_STARTER/GROWTH/SCALE`) — estos últimos no pueden existir hasta crear los productos en una cuenta real de Stripe.

## 7. Email programado (campañas) ✅ Implementado

- `_shared/automation-broadcast.ts` extrae el cálculo de destinatarios de un disparador "programado" (`offset_hours`: leads con cita ese día; `inactive_days`: leads sin contacto desde hace ese tiempo) — antes solo lo usaba Telegram, ahora es compartido.
- `sendTelegramBroadcast` se refactoriza para usarlo (mismo comportamiento, sin la lógica duplicada); nuevo `sendEmailBroadcast` lo reutiliza para `enviar_email`/`solicitar_resena` sin contacto directo — hasta ahora un "programado" con esas acciones caía siempre en "pendiente de canal", tuviera Resend configurado o no.
- Reutiliza Resend (`sendAutomationEmail`) y `last_reminder_sent_at` para no avisar dos veces por la misma cita o el mismo periodo de inactividad — igual que Telegram, así que un negocio con el mismo lead en dos automatizaciones (una por Telegram, otra por email) para la misma condición comparte el marcador de "ya avisado": es una limitación conocida del diseño ya existente para Telegram, no algo nuevo de este punto.
- Los blueprints del catálogo "Resumen diario" y "Mantener el contacto" (`programado` con solo `cron`, sin `offset_hours`/`inactive_days`) no tienen aquí una condición de destinatario reconocible — decidir a quién le toca (¿toda la cartera? ¿el dueño del negocio?) es una funcionalidad distinta a "recordatorio"/"reactivación"; siguen registrándose como pendientes en la actividad del negocio en vez de fingir un envío.

## 8. WhatsApp (arquitectura, sin activar) ✅ Implementado

- `_shared/whatsapp-client.ts`: cliente mínimo de WhatsApp Cloud API — `sendWhatsAppMessage`, `getWhatsAppPhoneInfo` (para validar credenciales al conectar) y `verifyWhatsAppSignature` (HMAC-SHA256 vía Web Crypto, mismo patrón que `verifyStripeSignature`).
- A diferencia de Telegram (un webhook por bot), WhatsApp Cloud API usa una única URL compartida por todos los negocios: `find_business_by_whatsapp_phone_number_id` (nueva función de base de datos, solo accesible a la service role) resuelve el `phone_number_id` del propio payload al negocio dueño — mismo patrón de aislamiento que `find_business_by_telegram_secret`.
- Edge Function `whatsapp-webhook`: doble verificación real, una por dirección — el handshake `GET` contra `WHATSAPP_VERIFY_TOKEN`, y cada mensaje `POST` contra la firma `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`. Sin alguno de los dos configurado, responde `503`/`401` en vez de fingir que procesó el mensaje.
- `channels` gana `connect-whatsapp`/`disconnect-whatsapp`: valida `phone_number_id` + token de acceso llamando de verdad a la Graph API antes de guardar nada (igual que `connect-telegram` con `getMe`).
- `n8n-callback` conecta `enviar_whatsapp` para contacto directo (`wa:<numero>`, resuelto igual que `tg:<chat_id>`) — antes caía siempre en "pendiente de canal".
- **Deliberadamente sin activar** (2026-09-11, decisión de producto: el negocio se centra solo en Telegram por ahora): se construyó un formulario de conexión en el marketplace (`whatsapp.service.ts` + `ConnectWhatsAppDialog`) y se deshizo en la misma sesión — sigue oculto del marketplace (`HIDDEN_FOR_NOW` en `integrations-page.tsx`) porque conectar de verdad exige verificación de empresa con Meta, un trámite que ningún cambio de código puede completar. La arquitectura ya funciona en cuanto un negocio tenga sus credenciales de Meta (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, y por negocio: `phone_number_id` + token de acceso vía `connect-whatsapp`) — falta el formulario de conexión en el marketplace y quitarlo de `HIDDEN_FOR_NOW`, que es justamente lo que no se puede probar de verdad sin esas credenciales.

---

## Reglas seguidas en cada punto

- Reutilizar arquitectura existente (patrones de `_shared/*`, RLS por `business_id`, `IntegrationStatus` ya definido).
- Sin mocks: si faltan credenciales, se expone un estado honesto ("no conectado" / error claro), nunca una simulación silenciosa.
- Ninguna clave secreta en el frontend.
- Después de cada punto: `deno check` en las Edge Functions tocadas, `npx tsc -b`, `npm run lint`, `npm test`, `npm run build`.
