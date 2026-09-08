import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/layout/logo'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center px-6">
        <Wordmark />
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-primary">404</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Esta página no existe</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Puede que el enlace esté mal o que la página se haya movido.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/app">Volver al inicio</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}
