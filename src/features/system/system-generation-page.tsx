import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Bot,
  Check,
  Clock,
  Loader2,
  Plug,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wordmark } from '@/components/layout/logo'
import { ErrorState } from '@/components/shared/states'
import { businessProfileRepository } from '@/services/repositories/business-profile.repository'
import { systemProvisioner } from '@/services/system/system-provisioner'
import { AUTOMATION_CATEGORY_LABELS, LEAD_STAGE_LABELS } from '@/domain/vocabulary'
import type { BusinessSystem } from '@/domain/engine/business-system-generator'
import { useBusiness } from '@/features/businesses/business-context'
import { cn } from '@/lib/utils'

const BUILD_STEPS = [
  'Analizando tu negocio',
  'Definiendo oportunidades',
  'Diseñando automatizaciones',
  'Creando agentes IA',
  'Configurando tu CRM',
  'Preparando conexiones',
] as const

/** Pacing for the build animation. The real work usually finishes sooner. */
const STEP_DURATION_MS = 850

export function SystemGenerationPage() {
  const { businessId = '' } = useParams()
  const navigate = useNavigate()
  const { refresh } = useBusiness()

  const [visibleStep, setVisibleStep] = useState(0)
  const [system, setSystem] = useState<BusinessSystem | null>(null)
  const [error, setError] = useState<unknown>(null)
  const started = useRef(false)

  const profileQuery = useQuery({
    queryKey: ['business-profile', businessId],
    queryFn: () => businessProfileRepository.get(businessId),
    enabled: Boolean(businessId),
  })

  const servicesQuery = useQuery({
    queryKey: ['services', businessId],
    queryFn: () => businessProfileRepository.listServices(businessId),
    enabled: Boolean(businessId),
  })

  const profile = profileQuery.data
  const services = servicesQuery.data

  // Provision once, as soon as we have everything the generator needs.
  useEffect(() => {
    if (started.current || !profile || !services) return
    started.current = true

    systemProvisioner
      .provision(businessId, profile, services)
      .then(async (result) => {
        setSystem(result.system)
        await refresh()
      })
      .catch(setError)
  }, [businessId, profile, services, refresh])

  // Advance the checklist on a timer so the user can follow what happened.
  useEffect(() => {
    if (visibleStep >= BUILD_STEPS.length) return
    const timer = setTimeout(() => setVisibleStep((s) => s + 1), STEP_DURATION_MS)
    return () => clearTimeout(timer)
  }, [visibleStep])

  const ready = system !== null && visibleStep >= BUILD_STEPS.length

  if (error || profileQuery.isError || servicesQuery.isError) {
    return (
      <Shell>
        <ErrorState
          title="No hemos podido construir tu sistema"
          error={error ?? profileQuery.error ?? servicesQuery.error}
          onRetry={() => window.location.reload()}
        />
      </Shell>
    )
  }

  if (!profile && profileQuery.isSuccess) {
    return (
      <Shell>
        <ErrorState
          title="Falta información de tu negocio"
          error={new Error('Vuelve a completar el cuestionario para poder generar tu sistema.')}
          onRetry={() => navigate(`/onboarding/${businessId}`)}
        />
      </Shell>
    )
  }

  return (
    <Shell>
      {ready ? (
        <SystemReady system={system} onContinue={() => navigate('/app', { replace: true })} />
      ) : (
        <BuildProgress visibleStep={visibleStep} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center px-6">
        <Wordmark />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">{children}</main>
    </div>
  )
}

function BuildProgress({ visibleStep }: { visibleStep: number }) {
  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-semibold tracking-tight">Construyendo tu sistema</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Estamos diseñando lo que tu negocio necesita. Tardará unos segundos.
      </p>

      <ol className="mt-10 space-y-1">
        {BUILD_STEPS.map((label, index) => {
          const done = index < visibleStep
          const active = index === visibleStep

          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-3 transition-all duration-300',
                active && 'bg-secondary/60',
                !done && !active && 'opacity-40',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors',
                  done ? 'bg-success text-success-foreground' : 'bg-secondary',
                )}
              >
                {done ? (
                  <Check className="h-3 w-3" strokeWidth={3.5} />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : null}
              </span>
              <span className={cn('text-sm', done && 'text-muted-foreground')}>{label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function SystemReady({ system, onContinue }: { system: BusinessSystem; onContinue(): void }) {
  const summary = [
    { label: 'Automatizaciones', value: system.summary.automationCount, icon: Workflow },
    { label: 'Agentes IA', value: system.summary.agentCount, icon: Bot },
    { label: 'Conexiones', value: system.summary.integrationCount, icon: Plug },
    { label: 'Pipeline CRM', value: system.summary.pipelineCount, icon: Users },
  ]

  return (
    <div className="animate-fade-in">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/10">
        <Check className="h-5 w-5 text-success" strokeWidth={3} />
      </div>

      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance">
        Tu sistema está preparado
      </h1>
      <p className="mt-2 text-sm text-muted-foreground text-balance">
        {system.summary.headline}. Esto es lo que hemos diseñado para ti.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label} className="p-4">
            <item.icon className="h-4 w-4 text-muted-foreground" />
            <p className="mt-3 text-2xl font-semibold tabular-nums">{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </Card>
        ))}
      </div>

      {system.summary.hoursSavedPerMonth > 0 && (
        <Card className="mt-3 flex items-center gap-3 bg-accent/40 p-4">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm">
            Estimamos que te ahorrará unas{' '}
            <span className="font-semibold">{system.summary.hoursSavedPerMonth} horas al mes</span>{' '}
            de trabajo manual.
          </p>
        </Card>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Automatizaciones</h2>
        <div className="mt-3 space-y-2">
          {system.automations.map((automation) => (
            <Card key={automation.templateKey} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{automation.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {automation.description}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {AUTOMATION_CATEGORY_LABELS[automation.category]}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Agentes IA</h2>
        <div className="mt-3 space-y-2">
          {system.agents.map((agent) => (
            <Card key={agent.type} className="flex items-start gap-3 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{agent.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {agent.description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Tu pipeline de clientes</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {system.pipeline.stages.map((stage, index) => (
            <div key={stage} className="flex items-center gap-2">
              <Badge variant="outline">
                {system.pipeline.stageLabels[stage] ?? LEAD_STAGE_LABELS[stage]}
              </Badge>
              {index < system.pipeline.stages.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </section>

      <Button size="lg" className="mt-10 w-full" onClick={onContinue}>
        <Sparkles />
        Entrar en mi sistema
      </Button>
    </div>
  )
}
