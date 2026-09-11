# Sinaptkis AI Business Builder — Claude Code Instructions

## 1. Project

Sinaptkis AI Business Builder is a multi-tenant SaaS where a business describes how it works and the product generates and manages its digital operating system: CRM, automations, AI agents, knowledge, channels and business metrics.

The product is not an n8n UI. n8n is an execution engine behind the product. Users should work with business concepts such as leads, conversations, appointments and automations, not infrastructure concepts.

Production frontend: `https://sinaptiks-ia-business-builder.vercel.app`
Default branch: `master`

## 2. Stack actually used in this repository

- React 19 + TypeScript
- Vite
- React Router 7
- Tailwind CSS 3
- Radix UI primitives
- Lucide React
- React Hook Form + Zod
- TanStack Query
- Supabase JS / PostgreSQL / Auth / RLS
- Supabase Edge Functions (Deno)
- n8n as external automation engine
- Vitest for tests
- Oxlint for linting

Use npm. The repository has `package-lock.json`.

Useful commands:

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
npm run test:watch
```

`npm run build` is the production typecheck + Vite build and must pass before considering a change complete.

## 3. Read the repository before changing it

Do not speculate about code that has not been inspected.

Before implementing a non-trivial change:

1. Read the relevant existing files.
2. Trace the current data flow.
3. Check the domain types and existing services.
4. Check the relevant Supabase migration/RLS policy if data access changes.
5. Check existing tests.
6. Reuse the existing architecture instead of creating a parallel implementation.

Do not rebuild working functionality just because another architecture might be cleaner.

## 4. Architecture

The intended dependency direction is:

```text
UI (React)
  -> Application / feature services
  -> Supabase repositories / Edge Functions
  -> External services
```

The repository is organized around these concepts:

```text
src/
├── domain/       Pure business logic and domain types
├── services/     Supabase, repositories and external-service adapters
├── features/     Product areas
├── components/   Shared UI and layout primitives
└── app/          Router and route guards

supabase/
├── migrations/  PostgreSQL schema and RLS
└── functions/   Edge Functions
    ├── n8n/          app -> n8n
    ├── n8n-callback/ n8n -> app
    └── _shared/      shared server-side code
```

Keep domain logic independent of React, Supabase and I/O whenever practical.

Catalog data belongs in the existing domain catalog files rather than being duplicated inside components.

## 5. Domain model

`src/domain/types.ts` is the source of truth for the TypeScript domain model.

Important concepts already present include:

- `Profile`
- `Business`
- `BusinessMember`
- `BusinessProfile`
- `Service`
- `Lead`
- `Conversation`
- `Message`
- `Automation`
- `AutomationExecution`
- `AiAgent`
- `KnowledgeDocument`
- `KnowledgeChunk`
- `Integration`
- `ActivityLog`
- `Notification`
- `Subscription`

Existing business vocabularies include industries, goals, channels, lead stages, automation categories, agent types and integration providers. Reuse these types/constants instead of creating competing string unions.

## 6. Multi-tenancy and Supabase

This is a multi-tenant application.

A business-owned record must remain associated with `business_id` and must be protected by PostgreSQL RLS. The frontend is never the security boundary.

Current member roles:

- `owner`
- `admin`
- `member`

Platform roles:

- `user`
- `super_admin`

The database uses helper functions such as `is_business_member`, `has_business_role` and `is_super_admin` to implement RLS safely.

Rules:

- Never remove RLS to make a feature easier.
- Never trust a client-provided `business_id` without server/database authorization.
- Preserve tenant isolation on reads, inserts, updates and deletes.
- When adding a tenant-owned table, add the required RLS policies and indexes.
- When changing the schema, add a migration; do not silently rely on manual dashboard edits.
- Keep TypeScript domain types and database schema consistent.

## 7. Authentication and routes

Protected application routes must require a valid Supabase session and the appropriate business/role state.

Do not expose authenticated business data through public endpoints.

Super-admin functionality is separate from normal tenant access.

## 8. n8n integration

n8n is an external execution engine, not the product's user interface.

The app communicates with n8n through the existing server-side/Edge Function boundary. Secrets such as the n8n API key must never be placed in `VITE_*` variables or browser code.

There are two distinct directions:

```text
Browser -> Supabase Edge Function -> n8n
n8n -> n8n-callback -> Supabase
```

The app-side function authenticates the user/session and verifies business membership before operating on a workflow.

The callback does not have a user session, so it uses the callback secret.

Important security rule: the n8n function must read the automation definition from the database rather than trusting arbitrary actions supplied by the browser.

When changing an automation, keep the local automation definition and its real n8n workflow synchronized. Never report an automation as successfully synced if the n8n update failed.

Keep `n8n_workflow_id`, execution information and error state accurate.

Do not put n8n credentials in frontend code.

Development may use ngrok, but the free ngrok URL changes after restart. Do not design production code around a permanent ngrok URL; production should use a stable n8n host/domain.

## 9. External integrations

External providers are represented through provider abstractions where they already exist.

Current provider concepts include:

- n8n
- Telegram
- WhatsApp
- Google Calendar
- Gmail
- Instagram
- Facebook
- Stripe
- OpenAI
- Anthropic
- Ollama
- Qdrant
- ElevenLabs

Do not create fake successful connections for services that are not actually configured.

If credentials are missing, the UI should show an honest state such as not connected/configuration required/error. A simulation is acceptable only when it is explicitly the existing fallback behavior and is clearly separated from a real integration.

Never expose API keys, OAuth client secrets, webhook secrets or service credentials to the frontend.

## 10. AI providers

AI provider selection is intentionally abstracted. Existing provider keys include Anthropic, OpenAI, Ollama and the deterministic `rules` fallback.

Do not hard-code a single AI provider into business logic if an existing abstraction can be used.

AI output must be grounded in the current business context, services, prices, policies and relevant knowledge. Never invent prices, availability or business policies.

The `rules` provider is a fallback/simulation, not evidence that a real model integration exists.

## 11. AI agents

The product currently models agents such as:

- Recepcionista
- Comercial
- Seguimiento
- Soporte

Agents have business context, objective, personality, rules, system prompt, model/provider, channels, allowed actions and handoff rules.

Human handoff is a real product behavior. If a conversation is assigned to a human, the AI agent must stop responding until control is returned according to the existing implementation.

Do not put business-specific prompts directly into UI components when they belong in the agent/domain/service layer.

## 12. Knowledge base

Knowledge documents can come from supported sources such as PDF, TXT, DOCX, URL, FAQ, service data and text.

The current system has chunking and a keyword/Postgres fallback. Qdrant/vector search is a future/optional real provider, not something to pretend is active when it is not configured.

When modifying knowledge retrieval:

- preserve `business_id` isolation;
- preserve document/chunk relationships;
- do not silently discard processing errors;
- keep source metadata available for debugging;
- distinguish keyword fallback from semantic/vector retrieval.

## 13. CRM and conversations

The CRM uses these lead stages:

`nuevo -> contactado -> cualificado -> cita -> cliente -> perdido`

Leads also have temperature and a potential score/label calculated from conversations.

Conversations and messages belong to a business and may be handled by either the AI agent or a human.

When changing CRM behavior, check both the list and pipeline/kanban views and the conversation flows that update lead state.

## 14. Automations

Automations have a trigger, ordered actions, status, configuration and execution history.

Existing statuses:

- `borrador`
- `preparada`
- `activa`
- `pausada`
- `error`

Existing trigger types include new lead, incoming message, status change, scheduled, appointment created, inactivity and manual.

Existing action types include Telegram, WhatsApp, email, lead creation/update, appointment booking, team notification, AI response, wait and review request.

Do not add an action that merely records/logs success when the product promises a real external side effect. If a provider is unavailable, expose that limitation honestly.

For delayed actions, use real scheduling/execution semantics. Do not implement `wait` by immediately running the next action.

Prevent duplicate executions where the same event can be delivered more than once.

## 15. Email, calendar, billing and channels

When implementing external side effects:

- Email: use the existing server-side provider path; never invent recipients.
- Google Calendar: create/check real availability only when the provider is actually connected; respect business timezone and appointment duration.
- Stripe: keep customer/subscription state linked to the correct business and handle webhooks server-side.
- Telegram: treat it as a real connected channel when configured.
- WhatsApp: keep the provider model ready, but do not claim Meta/WhatsApp is connected without the required credentials/verification.

## 16. UI/UX

The product should feel like a professional SaaS, not an admin prototype.

Use the existing component system, Tailwind conventions, Radix primitives and Lucide icons.

Priorities:

- clear hierarchy;
- responsive layouts;
- accessible controls;
- useful loading, empty and error states;
- concise business-oriented language;
- consistent spacing and typography;
- no unnecessary animations or visual noise.

Avoid exposing technical implementation details such as n8n workflow IDs, API keys or provider internals to normal business users.

## 17. Validation and errors

Use Zod and the existing validation patterns at system boundaries.

External API failures must become explicit application states. Do not swallow errors or convert failures into fake success.

User-facing errors should be understandable to a non-technical business owner. Keep technical details in logs/activity/error metadata where appropriate.

## 18. Testing

At minimum, run after meaningful changes:

```bash
npm run lint
npm test
npm run build
```

For domain logic, prefer deterministic unit tests without browser/Supabase dependencies.

For changes to automations, integrations, RLS or external services, add or update tests for failure paths as well as the happy path.

Do not delete or weaken existing tests just to make a build pass.

## 19. Safe implementation workflow

For a normal feature or bug fix:

1. Inspect the existing implementation.
2. Identify the smallest correct change.
3. Implement it using the existing architecture.
4. Run targeted tests.
5. Run lint.
6. Run the production build.
7. Fix regressions before moving on.
8. Report what is real, what depends on external credentials, and what remains simulated.

For larger work, keep progress in the repository's existing documentation instead of putting temporary task lists into this file.

## 20. Avoid over-engineering

Do not create abstractions, providers, files or configuration only for hypothetical future requirements.

Do not refactor unrelated code while implementing a focused feature.

Prefer the minimum architecture that fits the current product and its existing patterns.

Do not replace a working implementation with a new framework/library unless there is a concrete reason.

## 21. Never fake production behavior

This is one of the most important rules for this project.

Do not:

- claim an email was sent when it was only logged;
- claim a calendar event was created when no provider call happened;
- claim Stripe is connected without real credentials/webhooks;
- claim vector search is active when the system is using keyword fallback;
- claim WhatsApp is connected without the required Meta setup;
- mark an n8n workflow synchronized when the remote update failed;
- expose fake metrics as real business activity.

If something cannot be made real because an external dependency is missing, implement the correct boundary/state and say clearly what is still required.

## 22. Current repository truth

Use the repository itself as the source of truth. The README documents the current production behavior and limitations; `src/domain/types.ts` defines the current domain vocabulary; `supabase/migrations/` defines the database contract; and the actual service/Edge Function implementations define runtime behavior.

When documentation and code disagree, investigate the code and update the documentation rather than blindly following stale text.

Do not put temporary TODOs, current sprint tasks or a personal roadmap in this file. Those belong in task-specific prompts/issues/docs.
