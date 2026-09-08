import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  Clock,
  MessageSquare,
  Percent,
  TrendingUp,
  UserCheck,
  Users,
  Workflow,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { ErrorState } from '@/components/shared/states'
import {
  analyticsRepository,
  type AnalyticsRange,
} from '@/services/repositories/analytics.repository'
import { LEAD_STAGE_LABELS } from '@/domain/vocabulary'
import { LEAD_STAGES } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { formatDuration, formatNumber, formatPercent } from '@/lib/utils'

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
]

export function AnalyticsPage() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const [range, setRange] = useState<AnalyticsRange>(30)

  const query = useQuery({
    queryKey: ['analytics', businessId, range],
    queryFn: () => analyticsRepository.snapshot(businessId, range),
    enabled: Boolean(businessId),
  })

  const snapshot = query.data

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resultados"
        description="Qué está consiguiendo tu sistema."
        actions={
          <Tabs value={String(range)} onValueChange={(v) => setRange(Number(v) as AnalyticsRange)}>
            <TabsList>
              {RANGES.map((item) => (
                <TabsTrigger key={item.value} value={String(item.value)}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading || !snapshot ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[108px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Clientes captados" value={formatNumber(snapshot.leadsGenerated)} icon={Users} />
            <StatCard
              label="Cualificados"
              value={formatNumber(snapshot.leadsQualified)}
              icon={UserCheck}
            />
            <StatCard
              label="Conversaciones"
              value={formatNumber(snapshot.conversations)}
              icon={MessageSquare}
            />
            <StatCard label="Citas" value={formatNumber(snapshot.appointments)} icon={CalendarCheck} />
            <StatCard
              label="Clientes cerrados"
              value={formatNumber(snapshot.customers)}
              icon={TrendingUp}
              tone="success"
            />
            <StatCard
              label="Conversión"
              value={formatPercent(snapshot.conversionRate)}
              icon={Percent}
            />
            <StatCard
              label="Automatizaciones ejecutadas"
              value={formatNumber(snapshot.executions)}
              icon={Workflow}
            />
            <StatCard
              label="Errores"
              value={formatNumber(snapshot.executionErrors)}
              icon={XCircle}
              tone={snapshot.executionErrors > 0 ? 'destructive' : 'default'}
            />
          </div>

          <Card className="flex items-center gap-4 bg-accent/40 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Tiempo ahorrado</p>
              <p className="text-sm text-muted-foreground">
                Tu sistema te ha ahorrado unas{' '}
                <span className="font-semibold text-foreground">
                  {formatDuration(snapshot.minutesSaved)}
                </span>{' '}
                de trabajo manual en este periodo.
              </p>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Clientes nuevos por día</CardTitle>
              </CardHeader>
              <CardContent>
                <DailyChart data={snapshot.dailyLeads} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Dónde están tus clientes</CardTitle>
              </CardHeader>
              <CardContent>
                <StageBreakdown
                  counts={snapshot.leadsByStage}
                  total={snapshot.leadsGenerated}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function DailyChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)

  if (data.every((d) => d.count === 0)) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Todavía no hay datos en este periodo.
      </p>
    )
  }

  return (
    <div className="flex h-40 items-end gap-[2px]" role="img" aria-label="Clientes nuevos por día">
      {data.map((point) => (
        <div
          key={point.date}
          className="group relative flex-1 rounded-t-sm bg-primary/70 transition-colors hover:bg-primary"
          style={{ height: `${Math.max((point.count / max) * 100, 2)}%` }}
        >
          <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
            {point.count} · {point.date.slice(5)}
          </span>
        </div>
      ))}
    </div>
  )
}

function StageBreakdown({
  counts,
  total,
}: {
  counts: Record<string, number>
  total: number
}) {
  if (total === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Todavía no hay clientes en este periodo.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {LEAD_STAGES.map((stage) => {
        const count = counts[stage] ?? 0
        const percent = (count / total) * 100

        return (
          <div key={stage}>
            <div className="flex items-center justify-between text-sm">
              <span>{LEAD_STAGE_LABELS[stage]}</span>
              <span className="tabular-nums text-muted-foreground">
                {count} · {formatPercent(percent)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
