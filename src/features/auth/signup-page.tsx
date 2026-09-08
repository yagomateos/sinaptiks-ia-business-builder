import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'
import { AuthLayout } from './auth-layout'

const MIN_PASSWORD_LENGTH = 8

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  function validate(): string | null {
    if (fullName.trim().length < 2) return 'Escribe tu nombre.'
    if (!email.includes('@')) return 'Escribe un email válido.'
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    }
    return null
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const { needsConfirmation } = await signUp(email.trim(), password, fullName.trim())

      if (needsConfirmation) {
        setAwaitingConfirmation(true)
      } else {
        toast.success('Cuenta creada. Vamos a montar tu sistema.')
        navigate('/nuevo-negocio', { replace: true })
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No hemos podido crear tu cuenta.'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (awaitingConfirmation) {
    return (
      <AuthLayout
        title="Confirma tu email"
        subtitle={`Te hemos enviado un correo a ${email}. Ábrelo para activar tu cuenta y empezar.`}
      >
        <div className="flex items-center gap-3 rounded-lg border bg-secondary/40 p-4">
          <MailCheck className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Si no lo ves, revisa la carpeta de spam.
          </p>
        </div>
        <Button variant="outline" className="mt-6 w-full" asChild>
          <Link to="/entrar">Volver a entrar</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Construyamos tu sistema digital"
      subtitle="Crea tu cuenta. En unos minutos tendrás tu negocio configurado."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Tu nombre</Label>
          <Input
            id="fullName"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="María García"
          />
        </div>

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

        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" loading={submitting}>
          Crear cuenta
        </Button>
      </form>
    </AuthLayout>
  )
}
