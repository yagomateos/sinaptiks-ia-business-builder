# Sinaptkis AI Business Builder

Un negocio entra con una descripción. Sale con un sistema digital configurado:
automatizaciones, agentes de IA, CRM y canales.

SaaS multiempresa construido sobre React + TypeScript + Vite + Supabase.

---

## Puesta en marcha

### 1. Instalar

```bash
npm install
```

### 2. Crear el proyecto de Supabase

Crea un proyecto en [supabase.com](https://supabase.com) y copia las credenciales:

```bash
cp .env.example .env.local
```

Rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings → API).

### 3. Aplicar el esquema

Abre el **SQL Editor** de tu proyecto y ejecuta el contenido de
`supabase/migrations/20260101000000_init.sql`.

Crea las 18 tablas, los índices, los triggers y las políticas de Row Level
Security.

> Con la CLI de Supabase: `supabase db push`

### 4. Arrancar

```bash
npm run dev
```

Abre http://localhost:5173, crea una cuenta y completa el onboarding.

Si no configuras las variables de entorno, la aplicación muestra una pantalla
explicando qué falta en lugar de fallar en blanco.

---

## Recorrido del producto

```
Registro → Crear negocio → Onboarding (6 pasos) → Generación del sistema → Dashboard
```

El onboarding recoge: datos del negocio, qué hace, cliente ideal, servicios con
precios, objetivos y canales. Con eso, el generador propone y crea las
automatizaciones, los agentes, el pipeline de CRM y las conexiones.

---

## Arquitectura

Cuatro capas, con una dirección de dependencia estricta:

```
UI (React)  →  Application Services  →  Supabase  →  External Services
```

```
src/
├── domain/                    Lógica de negocio pura. Sin React, sin I/O.
│   ├── types.ts               El modelo de datos completo
│   ├── vocabulary.ts          Etiquetas visibles (la UI nunca muestra un enum)
│   ├── catalog/               Los datos que definen el producto
│   │   ├── automation-blueprints.ts
│   │   ├── agent-blueprints.ts
│   │   └── industry-templates.ts
│   └── engine/
│       ├── recommendation-engine.ts     Puntúa el catálogo
│       ├── agent-generator.ts           Perfil → system prompt
│       └── business-system-generator.ts Orquestador
│
├── services/                  Acceso a datos y sistemas externos
│   ├── supabase/              Cliente y traducción de errores
│   ├── repositories/          Un repositorio por agregado
│   ├── system/                Servicios de aplicación (provisioning, n8n)
│   ├── n8n/                   Contrato + implementación real y simulada
│   ├── ai/                    Contrato + proveedores intercambiables
│   └── vector/                Chunking y base de conocimiento
│
├── features/                  Una carpeta por área del producto
├── components/                Primitivas de UI y layout
└── app/                       Router y guardas de ruta
```

### Por qué así

**El dominio no sabe que existe React ni Supabase.** `generateBusinessSystem()`
es una función pura: mismo perfil, mismo sistema. Se puede probar sin navegador
ni base de datos.

**El catálogo es datos, no código.** Añadir una automatización nueva al producto
es añadir una entrada en `automation-blueprints.ts`. Añadir un sector es una
entrada en `industry-templates.ts`. Ni la UI ni el motor cambian.

**Los servicios externos se declaran antes de existir.** `N8nService` y
`AiService` son interfaces. Hoy resuelven con una implementación simulada y con
reglas; mañana con n8n real y con Claude. Ningún componente cambia.

---

## Multi-tenant

Un usuario puede tener varios negocios. Cada fila de datos lleva `business_id` y
el aislamiento lo impone Postgres, no el frontend.

Las políticas RLS usan funciones `SECURITY DEFINER` (`is_business_member`,
`has_business_role`, `is_super_admin`) para evitar recursión entre políticas.
Consultar datos de otro negocio no devuelve error: devuelve cero filas.

Roles: `owner`, `admin`, `member`. A nivel de plataforma: `super_admin`, que
habilita `/admin`.

Para darte acceso de administrador:

```sql
update profiles set platform_role = 'super_admin' where email = 'tu@email.com';
```

---

## Seguridad

- **Ningún secreto en el frontend.** Todo lo prefijado con `VITE_` acaba en el
  bundle. La clave anónima de Supabase es pública por diseño; el resto
  (n8n, Anthropic, WhatsApp, Stripe) vive en el backend.
- **RLS activo en las 18 tablas.**
- **Rutas protegidas** por sesión, por negocio con onboarding completo y por rol.
- **Errores traducidos** a mensajes que una persona no técnica entiende.
- Estados de carga, vacío y error en cada pantalla.

---

## Conectar los servicios reales

La aplicación funciona sin ninguno de estos. Añadirlos no requiere tocar la UI.

### n8n

Levanta un backend con `VITE_API_BASE_URL` que exponga:

```
POST   /n8n/workflows
PATCH  /n8n/workflows/:id
POST   /n8n/workflows/:id/activate
POST   /n8n/workflows/:id/deactivate
POST   /n8n/workflows/:id/execute
GET    /n8n/workflows/:id
GET    /n8n/workflows/:id/executions
```

El backend guarda `N8N_API_KEY` y valida el token de Supabase que llega en
`Authorization`. El contrato está en `src/services/n8n/types.ts`.

### Modelos de IA

El mismo backend expone `POST /ai/:operation` (`analyze-business`,
`generate-agent`, `classify-lead`, `generate-reply`…) y usa el SDK de Anthropic
con `claude-opus-5`. El contrato está en `src/services/ai/types.ts`.

Si una llamada falla, el proveedor cae automáticamente a las reglas locales: una
caída del modelo degrada el producto, no lo rompe.

### Base de conocimiento (Qdrant)

`POST /knowledge/upsert`, `/knowledge/search`, `/knowledge/remove`. Mientras
tanto, la búsqueda funciona por palabras clave sobre Postgres.

---

## Comandos

```bash
npm run dev       # servidor de desarrollo
npm run build     # typecheck + build de producción
npm run preview   # servir el build
npm run lint      # eslint
```

---

## Estado

Implementado y funcionando: autenticación, multi-tenancy con RLS, onboarding,
perfil de negocio, generador de sistemas, dashboard, automatizaciones, agentes
IA con editor de instrucciones, base de conocimiento con chunking, CRM con lista
y kanban, bandeja de conversaciones, marketplace de conexiones, analíticas y
panel de administración.

Simulado tras una interfaz definitiva: ejecución en n8n, llamadas a modelos,
embeddings en Qdrant, y el intercambio OAuth de cada canal.
