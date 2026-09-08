import { Wordmark } from '@/components/layout/logo'

/**
 * Rendered instead of the app when Supabase credentials are missing.
 * Better than a blank screen with a console error.
 */
export function SetupRequiredPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center px-6">
        <Wordmark />
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Falta configurar la conexión</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sinaptkis necesita saber a qué proyecto de Supabase conectarse. Crea un archivo{' '}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">.env.local</code> en
          la raíz del proyecto con estas dos variables:
        </p>

        <pre className="mt-6 overflow-x-auto rounded-lg border bg-secondary/50 p-4 font-mono text-xs leading-relaxed">
          {`VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon`}
        </pre>

        <p className="mt-6 text-sm text-muted-foreground">
          Las encontrarás en tu proyecto de Supabase, en Project Settings → API. Después ejecuta la
          migración de{' '}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
            supabase/migrations
          </code>{' '}
          y reinicia el servidor de desarrollo.
        </p>

        <div className="mt-8 rounded-lg border p-4">
          <p className="text-sm font-medium">Variables opcionales</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando tengas un backend para n8n y los modelos de IA, añade{' '}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
              VITE_API_BASE_URL
            </code>{' '}
            y{' '}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
              VITE_AI_PROVIDER
            </code>
            . Sin ellas la aplicación funciona igual, con reglas locales.
          </p>
        </div>
      </main>
    </div>
  )
}
