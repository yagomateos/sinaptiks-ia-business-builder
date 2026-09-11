import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/layout/logo'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-[52%] lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Wordmark className="mb-10" />

          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground text-balance">{subtitle}</p>

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}

          <div className="mt-10 flex gap-4 text-xs text-muted-foreground">
            <Link to="/privacidad" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link to="/terminos" className="hover:text-foreground">
              Términos
            </Link>
          </div>
        </div>
      </div>

      <aside className="hidden border-l bg-secondary/40 lg:flex lg:w-[48%] lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md">
          <p className="text-sm font-medium text-primary">Sinaptkis</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-balance">
            Tu negocio, con un sistema digital que trabaja solo.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Cuéntanos qué haces y a quién vendes. Sinaptkis diseña las automatizaciones, configura
            los agentes que atienden a tus clientes y te deja el sistema montado.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              'Responde a tus clientes en segundos, a cualquier hora',
              'Convierte cada mensaje en un contacto que puedes seguir',
              'Sin instalar nada y sin saber de tecnología',
            ].map((line) => (
              <li key={line} className="flex gap-3 text-sm">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="text-muted-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
