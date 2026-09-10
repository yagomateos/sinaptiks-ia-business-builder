import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, FileText, Globe, HelpCircle, Layers, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/page-header'
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/shared/states'
import { knowledgeRepository } from '@/services/repositories/knowledge.repository'
import { urlFetchService } from '@/services/knowledge/url-fetch.service'
import { chunkText, vectorStore } from '@/services/vector'
import type { KnowledgeDocument, KnowledgeSourceType, KnowledgeStatus } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { formatRelative } from '@/lib/utils'

const SOURCE_LABELS: Partial<Record<KnowledgeSourceType, string>> = {
  texto: 'Texto',
  url: 'Página web',
  faq: 'Preguntas',
  pdf: 'PDF',
  txt: 'Archivo',
  docx: 'Documento',
  servicio: 'Servicio',
}

const STATUS_LABELS: Record<KnowledgeStatus, string> = {
  pendiente: 'Sin procesar',
  procesando: 'Procesando',
  listo: 'Listo',
  error: 'Error',
}

const STATUS_VARIANTS: Record<KnowledgeStatus, 'outline' | 'secondary' | 'success' | 'destructive'> = {
  pendiente: 'outline',
  procesando: 'secondary',
  listo: 'success',
  error: 'destructive',
}

export function KnowledgePage() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const [adding, setAdding] = useState(false)

  const query = useQuery({
    queryKey: ['knowledge', businessId],
    queryFn: () => knowledgeRepository.listDocuments(businessId),
    enabled: Boolean(businessId),
  })

  const documents = query.data ?? []
  const readyCount = documents.filter((d) => d.status === 'listo').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conocimiento de tu negocio"
        description="Todo lo que tus agentes saben sobre ti. Cuanto más completo, mejor responderán."
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Añadir información
          </Button>
        }
      />

      {query.isLoading ? (
        <CardGridSkeleton count={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Todavía no has añadido nada"
          description="Añade tus precios, horarios, condiciones o las preguntas que más te hacen. Tus agentes lo usarán para responder."
          action={{ label: 'Añadir información', onClick: () => setAdding(true) }}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {readyCount} de {documents.length} listos para usar por tus agentes
          </p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {documents.map((document) => (
              <DocumentCard key={document.id} document={document} businessId={businessId} />
            ))}
          </div>
        </>
      )}

      <AddKnowledgeDialog open={adding} onOpenChange={setAdding} businessId={businessId} />
    </div>
  )
}

function DocumentCard({
  document,
  businessId,
}: {
  document: KnowledgeDocument
  businessId: string
}) {
  const queryClient = useQueryClient()
  const [viewingChunks, setViewingChunks] = useState(false)

  const process = useMutation({
    mutationFn: async () => {
      let content = document.content?.trim() ?? ''

      // Una URL se relee cada vez que se procesa: "Actualizar" debe traer lo
      // que haya ahora en la página, no re-partir el texto que se guardó la
      // última vez.
      if (document.source_type === 'url') {
        if (!document.source_url) {
          throw new Error('Este documento no tiene una dirección que leer.')
        }
        await knowledgeRepository.updateDocument(document.id, { status: 'procesando' })
        content = await urlFetchService.fetchText(businessId, document.source_url)
        await knowledgeRepository.updateDocument(document.id, { content })
      }

      if (!content) {
        throw new Error('Este documento no tiene contenido que procesar.')
      }

      await knowledgeRepository.updateDocument(document.id, { status: 'procesando' })

      const chunks = chunkText(content)
      const saved = await knowledgeRepository.replaceChunks(document.id, businessId, chunks)

      await vectorStore.upsert(
        saved.map((chunk) => ({
          id: chunk.id,
          businessId,
          documentId: document.id,
          chunkIndex: chunk.chunk_index,
          content: chunk.content,
        })),
      )

      return knowledgeRepository.updateDocument(document.id, {
        status: 'listo',
        chunk_count: chunks.length,
        error_message: null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', businessId] })
      toast.success('Tus agentes ya pueden usar esta información')
    },
    onError: async (error) => {
      const message = error instanceof Error ? error.message : 'No hemos podido procesarlo.'
      await knowledgeRepository.updateDocument(document.id, {
        status: 'error',
        error_message: message,
      })
      queryClient.invalidateQueries({ queryKey: ['knowledge', businessId] })
      toast.error(message)
    },
  })

  const remove = useMutation({
    mutationFn: () => knowledgeRepository.removeDocument(document.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', businessId] })
      toast.success('Eliminado')
    },
  })

  const Icon =
    document.source_type === 'url' ? Globe : document.source_type === 'faq' ? HelpCircle : FileText

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <Badge variant={STATUS_VARIANTS[document.status]}>{STATUS_LABELS[document.status]}</Badge>
      </div>

      <div className="mt-4 min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{document.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {SOURCE_LABELS[document.source_type] ?? document.source_type} ·{' '}
          {formatRelative(document.created_at)}
        </p>
        {document.content && (
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {document.content}
          </p>
        )}
        {document.error_message && (
          <p className="mt-2 text-xs text-destructive">{document.error_message}</p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          loading={process.isPending}
          onClick={() => process.mutate()}
        >
          {document.status === 'listo' ? 'Actualizar' : 'Procesar'}
        </Button>
        {document.status === 'listo' && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setViewingChunks(true)}
            aria-label="Ver fragmentos"
          >
            <Layers className="text-muted-foreground" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          loading={remove.isPending}
          onClick={() => remove.mutate()}
          aria-label="Eliminar"
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>

      <ChunksDialog
        document={document}
        open={viewingChunks}
        onOpenChange={setViewingChunks}
      />
    </Card>
  )
}

function ChunksDialog({
  document,
  open,
  onOpenChange,
}: {
  document: KnowledgeDocument
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const chunksQuery = useQuery({
    queryKey: ['knowledge-chunks', document.id],
    queryFn: () => knowledgeRepository.listChunks(document.id),
    enabled: open,
  })

  const chunks = chunksQuery.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{document.title}</DialogTitle>
          <DialogDescription>
            Así es como tus agentes ven este documento: dividido en {chunks.length || '…'}{' '}
            fragmentos que buscan por palabra clave según lo que pregunte cada cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {chunksQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : chunks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin fragmentos todavía.
            </p>
          ) : (
            chunks.map((chunk) => (
              <div key={chunk.id} className="rounded-md border bg-secondary/30 p-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Fragmento {chunk.chunk_index + 1}
                </p>
                <p className="whitespace-pre-wrap text-xs leading-relaxed">{chunk.content}</p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddKnowledgeDialog({
  open,
  onOpenChange,
  businessId,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  businessId: string
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>('texto')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      knowledgeRepository.createDocument({
        business_id: businessId,
        title: title.trim(),
        source_type: sourceType,
        source_url: sourceType === 'url' ? url.trim() : null,
        storage_path: null,
        content: sourceType === 'url' ? null : content.trim(),
        status: 'pendiente',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', businessId] })
      toast.success('Información añadida. Procésala para que tus agentes la usen.')
      setTitle('')
      setContent('')
      setUrl('')
      onOpenChange(false)
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'No hemos podido guardarlo.'),
  })

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (title.trim().length < 2) {
      setError('Ponle un título.')
      return
    }
    if (sourceType === 'url' && !url.trim()) {
      setError('Escribe la dirección de la página.')
      return
    }
    if (sourceType !== 'url' && content.trim().length < 10) {
      setError('Escribe algo de contenido.')
      return
    }

    setError(null)
    create.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir información</DialogTitle>
          <DialogDescription>
            Escribe lo que quieres que tus agentes sepan sobre tu negocio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="docTitle">Título</Label>
            <Input
              id="docTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Precios y condiciones"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={sourceType}
              onValueChange={(value) => setSourceType(value as KnowledgeSourceType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="texto">Texto escrito por mí</SelectItem>
                <SelectItem value="faq">Preguntas frecuentes</SelectItem>
                <SelectItem value="url">Página web</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sourceType === 'url' ? (
            <div className="space-y-1.5">
              <Label htmlFor="docUrl">Dirección</Label>
              <Input
                id="docUrl"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://tunegocio.com/precios"
              />
              <p className="text-xs text-muted-foreground">
                Leeremos el texto de esta página en cuanto pulses "Procesar".
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="docContent">Contenido</Label>
              <Textarea
                id="docContent"
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  sourceType === 'faq'
                    ? '¿Cuánto cuesta la primera visita?\nLa primera visita es gratuita e incluye estudio y presupuesto.\n\n¿Aceptáis seguros?\nSí, trabajamos con Sanitas, Adeslas y DKV.'
                    : 'Escribe aquí la información: precios, horarios, condiciones, garantías…'
                }
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Añadir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
