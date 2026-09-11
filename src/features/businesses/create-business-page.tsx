import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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

const createBusinessSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de tu negocio.'),
  industry: z.string().min(1, 'Elige el sector al que te dedicas.'),
  website: z.union([z.literal(''), z.string().trim().url('Escribe una URL válida (https://...).')]),
  city: z.string(),
  country: z.string(),
  description: z.string(),
})

type CreateBusinessValues = z.infer<typeof createBusinessSchema>

export function CreateBusinessPage() {
  const { user } = useAuth()
  const { businesses, refresh, setActiveBusinessId } = useBusiness()
  const navigate = useNavigate()

  const isFirstBusiness = businesses.length === 0

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateBusinessValues>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: { name: '', industry: '', website: '', city: '', country: 'España', description: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: CreateBusinessValues) => {
      if (!user) throw new Error('No hay sesión iniciada.')
      return businessesRepository.create(
        {
          name: values.name,
          industry: values.industry as Industry,
          website: values.website,
          city: values.city,
          country: values.country,
          description: values.description,
        },
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
      setError('root', { message })
      toast.error(message)
    },
  })

  function onSubmit(values: CreateBusinessValues) {
    mutation.mutate(values)
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

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre del negocio</Label>
              <Input
                id="name"
                placeholder="Clínica Dental Sonrisa"
                autoFocus
                aria-invalid={Boolean(errors.name)}
                {...register('name')}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="industry">Sector</Label>
              <Controller
                name="industry"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="industry" aria-invalid={Boolean(errors.industry)}>
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
                )}
              />
              {errors.industry ? (
                <p className="text-xs text-destructive">{errors.industry.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Usamos el sector para proponerte lo que mejor funciona en negocios como el tuyo.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="city">Ciudad</Label>
                <Input id="city" placeholder="Madrid" {...register('city')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">País</Label>
                <Input id="country" {...register('country')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="website">
                Web <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="website"
                type="url"
                placeholder="https://tunegocio.com"
                aria-invalid={Boolean(errors.website)}
                {...register('website')}
              />
              {errors.website && <p className="text-xs text-destructive">{errors.website.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">
                Descripción corta <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Clínica dental en el centro de Madrid, especializada en implantes y ortodoncia."
                rows={3}
                {...register('description')}
              />
            </div>

            {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

            <Button type="submit" className="w-full" loading={isSubmitting || mutation.isPending}>
              Continuar
              <ArrowRight />
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
