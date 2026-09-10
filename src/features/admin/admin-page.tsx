import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bot,
  Building2,
  MessageSquare,
  Sparkles,
  Users,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { ErrorState } from '@/components/shared/states'
import { Wordmark } from '@/components/layout/logo'
import { adminRepository } from '@/services/repositories/admin.repository'
import { INDUSTRY_LABELS } from '@/domain/vocabulary'
import { formatNumber, formatRelative } from '@/lib/utils'

export function AdminPage() {
  const statsQuery = useQuery({ queryKey: ['admin-stats'], queryFn: () => adminRepository.stats() })
  const businessesQuery = useQuery({
    queryKey: ['admin-businesses'],
    queryFn: () => adminRepository.listBusinesses(),
  })
  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminRepository.listUsers(),
  })
  const errorsQuery = useQuery({
    queryKey: ['admin-recent-errors'],
    queryFn: () => adminRepository.listRecentErrors(),
  })

  const stats = statsQuery.data

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <Wordmark />
          <Badge variant="secondary">Administración</Badge>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app">
            <ArrowLeft />
            Volver a la app
          </Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-[1400px] space-y-6 px-6 py-8">
        <PageHeader
          title="Panel de Sinaptkis"
          description="Estado de la plataforma en todos los clientes."
        />

        {statsQuery.isError ? (
          <ErrorState error={statsQuery.error} onRetry={() => statsQuery.refetch()} />
        ) : !stats ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[108px]" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Usuarios" value={formatNumber(stats.users)} icon={Users} />
            <StatCard
              label="Negocios"
              value={formatNumber(stats.businesses)}
              icon={Building2}
              hint={`${stats.businesses_onboarded} con onboarding completo`}
            />
            <StatCard
              label="Automatizaciones"
              value={formatNumber(stats.automations)}
              icon={Workflow}
              hint={`${stats.automations_active} activas`}
            />
            <StatCard
              label="Agentes IA"
              value={formatNumber(stats.agents)}
              icon={Bot}
              hint={`${stats.agents_active} activos`}
            />
            <StatCard label="Ejecuciones" value={formatNumber(stats.executions)} icon={Zap} />
            <StatCard
              label="Ejecuciones con error"
              value={formatNumber(stats.executions_failed)}
              icon={XCircle}
              tone={stats.executions_failed > 0 ? 'destructive' : 'default'}
            />
            <StatCard
              label="Conversaciones"
              value={formatNumber(stats.conversations)}
              icon={MessageSquare}
            />
            <StatCard
              label="Respuestas de IA"
              value={formatNumber(stats.messages_ai)}
              icon={Sparkles}
              hint="Proxy de consumo de IA"
            />
          </div>
        )}

        <Tabs defaultValue="negocios">
          <TabsList>
            <TabsTrigger value="negocios">Negocios</TabsTrigger>
            <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
            <TabsTrigger value="errores">
              Errores recientes
              {(errorsQuery.data?.length ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1.5">
                  {errorsQuery.data!.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="errores">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Últimos fallos de automatización</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {(errorsQuery.data ?? []).map((err) => (
                  <div key={err.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">
                        {err.automation_name}
                        <span className="font-normal text-muted-foreground"> · {err.business_name}</span>
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(err.started_at)}
                      </span>
                    </div>
                    {err.error_message && (
                      <p className="mt-1 text-xs text-destructive">{err.error_message}</p>
                    )}
                  </div>
                ))}
                {(errorsQuery.data ?? []).length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Sin fallos recientes en ningún negocio.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="negocios">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Últimos negocios</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {(businessesQuery.data ?? []).map((business) => (
                  <div key={business.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{business.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {INDUSTRY_LABELS[business.industry]}
                        {business.city ? ` · ${business.city}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(business.created_at)}
                    </span>
                    <Badge variant={business.system_generated_at ? 'success' : 'outline'}>
                      {business.system_generated_at ? 'Sistema activo' : 'Sin generar'}
                    </Badge>
                  </div>
                ))}
                {(businessesQuery.data ?? []).length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Todavía no hay negocios.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="usuarios">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Últimos usuarios</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {(usersQuery.data ?? []).map((user) => (
                  <div key={user.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{user.full_name ?? 'Sin nombre'}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(user.created_at)}
                    </span>
                    {user.platform_role === 'super_admin' && (
                      <Badge variant="default">Sinaptkis</Badge>
                    )}
                  </div>
                ))}
                {(usersQuery.data ?? []).length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Todavía no hay usuarios.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
