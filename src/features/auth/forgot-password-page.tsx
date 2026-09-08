import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'
import { AuthLayout } from './auth-layout'

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await resetPassword(email.trim())
      setSent(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No hemos podido enviar el correo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Revisa tu correo"
        subtitle={`Si existe una cuenta con ${email}, te hemos enviado un enlace para cambiar la contraseña.`}
      >
        <div className="flex items-center gap-3 rounded-lg border bg-secondary/40 p-4">
          <MailCheck className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">El enlace caduca en una hora.</p>
        </div>
        <Button variant="outline" className="mt-6 w-full" asChild>
          <Link to="/entrar">Volver a entrar</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Recuperar contraseña"
      subtitle="Escribe tu email y te enviamos un enlace para crear una nueva."
      footer={
        <Link to="/entrar" className="font-medium text-primary hover:underline">
          Volver a entrar
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@empresa.com"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" loading={submitting}>
          Enviar enlace
        </Button>
      </form>
    </AuthLayout>
  )
}
