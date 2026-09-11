import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'
import { AuthLayout } from './auth-layout'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu email.').email('Escribe un email válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    try {
      await signIn(values.email, values.password)
      navigate('/app', { replace: true })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No hemos podido iniciar sesión.'
      setError('root', { message })
      toast.error(message)
    }
  }

  return (
    <AuthLayout
      title="Entra en tu cuenta"
      subtitle="Continúa construyendo el sistema digital de tu negocio."
      footer={
        <>
          ¿Todavía no tienes cuenta?{' '}
          <Link to="/registro" className="font-medium text-primary hover:underline">
            Crear una cuenta
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link to="/recuperar" className="text-xs text-muted-foreground hover:text-foreground">
              ¿La has olvidado?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}
