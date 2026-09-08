import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/misc'
import { Wordmark } from '@/components/layout/logo'
import { ErrorState, LoadingState } from '@/components/shared/states'
import { businessesRepository } from '@/services/repositories/businesses.repository'
import {
  businessProfileRepository,
  type ServiceDraft,
} from '@/services/repositories/business-profile.repository'
import { activityRepository } from '@/services/repositories/activity.repository'
import { getIndustryTemplate } from '@/domain/catalog/industry-templates'
import type { BusinessProfile, Industry } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import {
  StepBusiness,
  StepChannels,
  StepDescription,
  StepGoals,
  StepIdealCustomer,
  StepServices,
} from './steps'
import { emptyService, STEPS, STEP_COUNT, type OnboardingDraft } from './types'

export function OnboardingPage() {
  const { businessId = '' } = useParams()
  const navigate = useNavigate()
  const { refresh } = useBusiness()

  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<OnboardingDraft | null>(null)
  const [seededBusinessId, setSeededBusinessId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const businessQuery = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => businessesRepository.getById(businessId),
    enabled: Boolean(businessId),
  })

  const profileQuery = useQuery({
    queryKey: ['business-profile', businessId],
    queryFn: () => businessProfileRepository.get(businessId),
    enabled: Boolean(businessId),
  })

  const business = businessQuery.data
  const savedProfile = profileQuery.data
  const profileLoaded = profileQuery.isSuccess

  // Seed the wizard during render, once the business and any saved profile have
  // loaded. Doing this in an effect would render an empty wizard first.
  if (business && profileLoaded && businessId !== seededBusinessId) {
    setSeededBusinessId(businessId)
    setDraft({
      name: business.name,
      industry: business.industry,
      website: business.website ?? '',
      city: business.city ?? '',
      country: business.country ?? '',
      description: savedProfile?.description ?? business.description ?? '',
      idealCustomer: savedProfile?.ideal_customer ?? '',
      valueProposition: savedProfile?.value_proposition ?? '',
      brandVoice: savedProfile?.brand_voice ?? 'profesional',
      services: [emptyService()],
      goals: savedProfile?.goals ?? [],
      channels: savedProfile?.contact_channels ?? [],
    })
  }

  const mutation = useMutation({
    mutationFn: async (finalDraft: OnboardingDraft) => {
      const location = [finalDraft.city, finalDraft.country].filter(Boolean).join(', ')
      const template = getIndustryTemplate(finalDraft.industry)

      await businessesRepository.update(businessId, {
        name: finalDraft.name.trim(),
        industry: finalDraft.industry,
        website: finalDraft.website.trim() || null,
        city: finalDraft.city.trim() || null,
        country: finalDraft.country.trim() || null,
        description: finalDraft.description.trim() || null,
        onboarding_completed: true,
      })

      const profileDraft: Omit<BusinessProfile, 'id' | 'created_at' | 'updated_at'> = {
        business_id: businessId,
        business_name: finalDraft.name.trim(),
        industry: finalDraft.industry,
        description: finalDraft.description.trim() || null,
        location: location || null,
        website: finalDraft.website.trim() || null,
        ideal_customer: finalDraft.idealCustomer.trim() || null,
        value_proposition: finalDraft.valueProposition.trim() || null,
        brand_voice: finalDraft.brandVoice,
        business_hours: [],
        contact_channels: finalDraft.channels,
        goals: finalDraft.goals,
        faq: template.faqSeeds,
        objections: [],
        policies: null,
      }

      await businessProfileRepository.upsert(profileDraft)
      await businessProfileRepository.replaceServices(
        businessId,
        toServiceDrafts(businessId, finalDraft),
      )

      await activityRepository.log({
        businessId,
        action: 'Onboarding completado',
        entityType: 'business',
        entityId: businessId,
      })
    },
    onSuccess: async () => {
      await refresh()
      navigate(`/generando/${businessId}`, { replace: true })
    },
    onError: (caught) => {
      const message = caught instanceof Error ? caught.message : 'No hemos podido guardar tus datos.'
      toast.error(message)
    },
  })

  const currentStep = STEPS[step]

  const validation = useMemo(() => (draft ? validateStep(step, draft) : null), [step, draft])

  if (businessQuery.isError) {
    return (
      <CenteredShell>
        <ErrorState error={businessQuery.error} onRetry={() => businessQuery.refetch()} />
      </CenteredShell>
    )
  }

  if (!draft) {
    return (
      <CenteredShell>
        <LoadingState label="Preparando tus preguntas…" />
      </CenteredShell>
    )
  }

  function update(patch: Partial<OnboardingDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setError(null)
  }

  function goNext() {
    if (validation) {
      setError(validation)
      return
    }

    if (step < STEP_COUNT - 1) {
      setStep((s) => s + 1)
      window.scrollTo({ top: 0 })
      return
    }

    mutation.mutate(draft!)
  }

  function goBack() {
    if (step === 0) return
    setStep((s) => s - 1)
    setError(null)
    window.scrollTo({ top: 0 })
  }

  const isLastStep = step === STEP_COUNT - 1

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-6">
          <Wordmark />
          <p className="text-xs text-muted-foreground">
            Paso {step + 1} de {STEP_COUNT}
          </p>
        </div>
        <Progress value={((step + 1) / STEP_COUNT) * 100} className="h-0.5 rounded-none" />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{currentStep.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground text-balance">{currentStep.subtitle}</p>

        <div className="mt-8">
          {step === 0 && <StepBusiness draft={draft} update={update} />}
          {step === 1 && <StepDescription draft={draft} update={update} />}
          {step === 2 && <StepIdealCustomer draft={draft} update={update} />}
          {step === 3 && <StepServices draft={draft} update={update} />}
          {step === 4 && <StepGoals draft={draft} update={update} />}
          {step === 5 && <StepChannels draft={draft} update={update} />}
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </main>

      <footer className="sticky bottom-0 border-t bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-6 py-4">
          <Button variant="ghost" onClick={goBack} disabled={step === 0}>
            <ArrowLeft />
            Atrás
          </Button>

          <Button onClick={goNext} loading={mutation.isPending}>
            {isLastStep ? (
              <>
                <Sparkles />
                Construir mi sistema
              </>
            ) : (
              <>
                Continuar
                <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </footer>
    </div>
  )
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center px-6">
        <Wordmark />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">{children}</main>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function validateStep(step: number, draft: OnboardingDraft): string | null {
  switch (step) {
    case 0:
      return draft.name.trim().length >= 2 ? null : 'Escribe el nombre de tu negocio.'
    case 1:
      return draft.description.trim().length >= 20
        ? null
        : 'Cuéntanos un poco más — al menos un par de frases.'
    case 2:
      return draft.idealCustomer.trim().length >= 10
        ? null
        : 'Describe brevemente a tu cliente ideal.'
    case 3:
      return draft.services.some((s) => s.name.trim())
        ? null
        : 'Añade al menos un servicio con nombre.'
    case 4:
      return draft.goals.length > 0 ? null : 'Elige al menos un objetivo.'
    case 5:
      return draft.channels.length > 0 ? null : 'Marca al menos un canal.'
    default:
      return null
  }
}

function toServiceDrafts(businessId: string, draft: OnboardingDraft): ServiceDraft[] {
  return draft.services
    .filter((s) => s.name.trim())
    .map((s) => ({
      business_id: businessId,
      name: s.name.trim(),
      description: s.description.trim() || null,
      price: s.price ? Number(s.price) : null,
      currency: 'EUR',
      duration_minutes: s.durationMinutes ? Number(s.durationMinutes) : null,
      url: s.url.trim() || null,
      features: s.features
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
      is_active: true,
    }))
}

export type { Industry }
