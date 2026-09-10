/**
 * Adonde llega quien pulsa el enlace del correo de "recuperar contraseña".
 *
 * Supabase establece una sesión temporal de recuperación a partir del token
 * que trae la URL (lo hace el propio cliente, antes de que este componente
 * se monte) — aquí solo queda pedir la contraseña nueva y guardarla.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'
import { AuthLayout } from './auth-layout'

const MIN_PASSWORD_LENGTH = 8

export function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      await updatePassword(password)
      toast.success('Contraseña actualizada')
      navigate('/app', { replace: true })
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'No hemos podido cambiar la contraseña.'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Crea una nueva contraseña"
      subtitle="El enlace es válido una sola vez. Elige una contraseña que no uses en ningún otro sitio."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña nueva</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
          />
          <p className="text-xs text-muted-foreground">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Repite la contraseña</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" loading={submitting}>
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  )
}
