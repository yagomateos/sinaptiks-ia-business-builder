import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'
import { AuthLayout } from './auth-layout'

const MIN_PASSWORD_LENGTH = 8

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Escribe tu nombre.'),
  email: z.string().trim().min(1, 'Escribe tu email.').email('Escribe un email válido.'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`),
})

type SignupValues = z.infer<typeof signupSchema>

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  })

  async function onSubmit(values: SignupValues) {
    try {
      const { needsConfirmation } = await signUp(values.email, values.password, values.fullName)

      if (needsConfirmation) {
        setConfirmationEmail(values.email)
      } else {
        toast.success('Cuenta creada. Vamos a montar tu sistema.')
        navigate('/nuevo-negocio', { replace: true })
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No hemos podido crear tu cuenta.'
      setError('root', { message })
      toast.error(message)
    }
  }

  if (confirmationEmail) {
    return (
      <AuthLayout
        title="Confirma tu email"
        subtitle={`Te hemos enviado un correo a ${confirmationEmail}. Ábrelo para activar tu cuenta y empezar.`}
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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Tu nombre</Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="María García"
            aria-invalid={Boolean(errors.fullName)}
            {...register('fullName')}
          />
          {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tu@empresa.com"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          <p className="text-xs text-muted-foreground">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</p>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Crear cuenta
        </Button>
      </form>
    </AuthLayout>
  )
}
