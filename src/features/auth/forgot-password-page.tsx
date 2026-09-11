import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'
import { AuthLayout } from './auth-layout'

const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Escribe tu email.').email('Escribe un email válido.'),
})

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ForgotPasswordValues) {
    try {
      await resetPassword(values.email)
      setSentTo(values.email)
    } catch (caught) {
      setError('root', {
        message: caught instanceof Error ? caught.message : 'No hemos podido enviar el correo.',
      })
    }
  }

  if (sentTo) {
    return (
      <AuthLayout
        title="Revisa tu correo"
        subtitle={`Si existe una cuenta con ${sentTo}, te hemos enviado un enlace para cambiar la contraseña.`}
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

        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Enviar enlace
        </Button>
      </form>
    </AuthLayout>
  )
}
