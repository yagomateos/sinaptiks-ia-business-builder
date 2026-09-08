import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Wordmark } from '@/components/layout/logo'
import { useAuth } from '@/features/auth/auth-context'
import { useBusiness } from './business-context'
import { businessesRepository } from '@/services/repositories/businesses.repository'
import { INDUSTRIES, type Industry } from '@/domain/types'
import { INDUSTRY_LABELS } from '@/domain/vocabulary'

export function CreateBusinessPage() {
  const { user } = useAuth()
  const { businesses, refresh, setActiveBusinessId } = useBusiness()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [industry, setIndustry] = useState<Industry | ''>('')
  const [website, setWebsite] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('España')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isFirstBusiness = businesses.length === 0

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('No hay sesión iniciada.')
      return businessesRepository.create(
        { name, industry: industry as Industry, website, city, country, description },
        user.id,
      )
    },
    onSuccess: async (business) => {
      await refresh()
      setActiveBusinessId(business.id)
      navigate(`/onboarding/${business.id}`, { replace: true })
    },
    onError: (caught) => {
      const message = caught instanceof Error ? caught.message : 'No hemos podido crear el negocio.'
      setError(message)
      toast.error(message)
    },
  })

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (name.trim().length < 2) {
      setError('Escribe el nombre de tu negocio.')
      return
    }
    if (!industry) {
      setError('Elige el sector al que te dedicas.')
      return
    }

    setError(null)
    mutation.mutate()
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between px-6">
        <Wordmark />
        {!isFirstBusiness && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/app')}>
            Cancelar
          </Button>
        )}
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg">
          <p className="text-sm font-medium text-primary">
            {isFirstBusiness ? 'Empecemos' : 'Nuevo negocio'}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
            ¿Cómo se llama tu negocio?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-balance">
            Con esto creamos tu espacio. Después te haremos unas preguntas para diseñar tu sistema.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre del negocio</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Clínica Dental Sonrisa"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="industry">Sector</Label>
              <Select value={industry} onValueChange={(value) => setIndustry(value as Industry)}>
                <SelectTrigger id="industry">
                  <SelectValue placeholder="Elige tu sector" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {INDUSTRY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Usamos el sector para proponerte lo que mejor funciona en negocios como el tuyo.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="city">Ciudad</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Madrid"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">País</Label>
                <Input
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="website">
                Web <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://tunegocio.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">
                Descripción corta <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Clínica dental en el centro de Madrid, especializada en implantes y ortodoncia."
                rows={3}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" loading={mutation.isPending}>
              Continuar
              <ArrowRight />
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
