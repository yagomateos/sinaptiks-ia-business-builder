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

## 3. Delay real en cambio_estado — ⏳ en progreso

## 4. Búsqueda semántica de Knowledge — pendiente

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
