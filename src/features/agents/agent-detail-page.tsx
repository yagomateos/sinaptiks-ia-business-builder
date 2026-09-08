import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bot, Plus, Settings2, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { PageHeader } from '@/components/shared/page-header'
import { ErrorState, LoadingState } from '@/components/shared/states'
import { agentsRepository } from '@/services/repositories/agents.repository'
import { businessProfileRepository } from '@/services/repositories/business-profile.repository'
import { aiService } from '@/services/ai'
import { MODEL_OPTIONS } from '@/services/ai/models'
import { CHANNEL_LABELS } from '@/domain/vocabulary'
import { CONTACT_CHANNELS, type ContactChannel } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { useEditableDraft } from '@/hooks/use-editable-draft'
import { cn } from '@/lib/utils'

export function AgentDetailPage() {
  const { agentId = '' } = useParams()
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const queryClient = useQueryClient()

  const [showAdvanced, setShowAdvanced] = useState(false)

  const query = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => agentsRepository.getById(agentId),
    enabled: Boolean(agentId),
  })

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

  const [draft, update, setDraft] = useEditableDraft(query.data, agentId)

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Nada que guardar')
      return agentsRepository.update(draft.id, {
        name: draft.name,
        description: draft.description,
        objective: draft.objective,
        personality: draft.personality,
        rules: draft.rules,
        system_prompt: draft.system_prompt,
        model: draft.model,
        channels: draft.channels,
        handoff_rules: draft.handoff_rules,
        status: draft.status,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      queryClient.invalidateQueries({ queryKey: ['agents', businessId] })
      toast.success('Cambios guardados')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido guardar.'),
  })

  const regenerate = useMutation({
    mutationFn: async () => {
      const profile = profileQuery.data
      const services = servicesQuery.data
      if (!profile || !services || !draft) {
        throw new Error('Faltan datos del negocio para regenerar las instrucciones.')
      }
      return aiService.generatePrompt({ profile, services }, draft.type)
    },
    onSuccess: (systemPrompt) => {
      setDraft((prev) => (prev ? { ...prev, system_prompt: systemPrompt } : prev))
      toast.success('Instrucciones regeneradas con la información actual de tu negocio')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No hemos podido regenerar.'),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (!draft) return null

  function toggleChannel(channel: ContactChannel) {
    const channels = draft!.channels.includes(channel)
      ? draft!.channels.filter((c) => c !== channel)
      : [...draft!.channels, channel]
    update({ channels })
  }

  const isActive = draft.status === 'activo'

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/app/agentes">
          <ArrowLeft />
          Agentes IA
        </Link>
      </Button>

      <PageHeader
        title={draft.name}
        description={draft.description ?? undefined}
        actions={
          <>
            <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
              <Switch
                checked={isActive}
                onCheckedChange={(checked) => update({ status: checked ? 'activo' : 'pausado' })}
                aria-label="Activar agente"
              />
              <span className="text-sm">{isActive ? 'Activo' : 'En pausa'}</span>
            </div>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
              Guardar
            </Button>
          </>
        }
      />

      <Tabs defaultValue="basico">
        <TabsList>
          <TabsTrigger value="basico">
            <Bot />
            Configuración
          </TabsTrigger>
          <TabsTrigger value="avanzado">
            <Settings2 />
            Instrucciones avanzadas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basico" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Qué hace este agente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="objective">Objetivo</Label>
                <Textarea
                  id="objective"
                  rows={3}
                  value={draft.objective}
                  onChange={(e) => update({ objective: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Lo que este agente tiene que conseguir en cada conversación.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="personality">Cómo habla</Label>
                <Textarea
                  id="personality"
                  rows={3}
                  value={draft.personality}
                  onChange={(e) => update({ personality: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Reglas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {draft.rules.map((rule, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={rule}
                    onChange={(e) => {
                      const rules = [...draft.rules]
                      rules[index] = e.target.value
                      update({ rules })
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => update({ rules: draft.rules.filter((_, i) => i !== index) })}
                    aria-label="Quitar regla"
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => update({ rules: [...draft.rules, ''] })}
              >
                <Plus />
                Añadir regla
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Dónde atiende</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {CONTACT_CHANNELS.map((channel) => {
                  const selected = draft.channels.includes(channel)
                  return (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => toggleChannel(channel)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm transition-colors',
                        selected
                          ? 'border-primary bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-secondary',
                      )}
                    >
                      {CHANNEL_LABELS[channel]}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cuándo avisarte a ti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="escalationMessage">Qué dice antes de pasarte la conversación</Label>
                <Textarea
                  id="escalationMessage"
                  rows={2}
                  value={draft.handoff_rules.escalation_message ?? ''}
                  onChange={(e) =>
                    update({
                      handoff_rules: {
                        ...draft.handoff_rules,
                        escalation_message: e.target.value,
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="escalateTurns">Después de cuántos mensajes sin avanzar</Label>
                <Input
                  id="escalateTurns"
                  type="number"
                  min="2"
                  max="30"
                  className="max-w-[120px]"
                  value={draft.handoff_rules.escalate_after_turns ?? 8}
                  onChange={(e) =>
                    update({
                      handoff_rules: {
                        ...draft.handoff_rules,
                        escalate_after_turns: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(draft.handoff_rules.escalate_on_keywords ?? []).map((keyword) => (
                  <Badge key={keyword} variant="secondary">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="avanzado" className="space-y-6">
          <Card className="border-warning/30 bg-warning/5 p-4">
            <p className="text-sm">
              Aquí puedes editar las instrucciones completas que sigue el agente. Si no estás
              seguro, usa la pestaña anterior — es más difícil equivocarse.
            </p>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm">Instrucciones completas</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={regenerate.isPending}
                  onClick={() => regenerate.mutate()}
                >
                  <Wand2 />
                  Regenerar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced((current) => !current)}
                >
                  {showAdvanced ? 'Ocultar' : 'Editar'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showAdvanced ? (
                <Textarea
                  rows={24}
                  className="font-mono text-xs leading-relaxed"
                  value={draft.system_prompt}
                  onChange={(e) => update({ system_prompt: e.target.value })}
                />
              ) : (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/50 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                  {draft.system_prompt}
                </pre>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Modelo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={draft.model} onValueChange={(model) => update({ model })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {MODEL_OPTIONS.find((m) => m.id === draft.model)?.hint}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Acciones permitidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {draft.allowed_actions.map((action) => (
                  <Badge key={action} variant="outline">
                    {action.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
