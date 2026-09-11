import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { extractDocxText, extractPdfText } from '@/lib/document-text'
import type { KnowledgeDocument, KnowledgeSourceType, KnowledgeStatus } from '@/domain/types'
import { useBusiness } from '@/features/businesses/business-context'
import { formatRelative } from '@/lib/utils'

const FILE_SOURCE_TYPES: KnowledgeSourceType[] = ['txt', 'pdf', 'docx']
const FILE_ACCEPT: Partial<Record<KnowledgeSourceType, string>> = {
  txt: '.txt,text/plain',
  pdf: '.pdf,application/pdf',
  docx: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

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
    mutationFn: async () => {
      await knowledgeRepository.removeDocument(document.id)
      // Best-effort: el cascade delete de Postgres ya se encargó de lo
      // importante (knowledge_chunks), esto solo limpia el vector store
      // remoto para no dejar puntos huérfanos en Qdrant.
      await vectorStore.removeDocument(businessId, document.id).catch(() => undefined)
    },
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

const addKnowledgeSchema = z
  .object({
    title: z.string().trim().min(2, 'Ponle un título.'),
    sourceType: z.string(),
    content: z.string(),
    url: z.string(),
  })
  .superRefine((data, ctx) => {
    const sourceType = data.sourceType as KnowledgeSourceType

    if (sourceType === 'url') {
      if (!data.url.trim()) {
        ctx.addIssue({ code: 'custom', message: 'Escribe la dirección de la página.', path: ['url'] })
      }
      return
    }

    if (data.content.trim().length < 10) {
      const message = FILE_SOURCE_TYPES.includes(sourceType)
        ? 'Sube un archivo con algo de texto dentro.'
        : 'Escribe algo de contenido.'
      ctx.addIssue({ code: 'custom', message, path: ['content'] })
    }
  })

type AddKnowledgeValues = z.infer<typeof addKnowledgeSchema>

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
  const [extracting, setExtracting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddKnowledgeValues>({
    resolver: zodResolver(addKnowledgeSchema),
    defaultValues: { title: '', sourceType: 'texto', content: '', url: '' },
  })

  const sourceType = useWatch({ control, name: 'sourceType' }) as KnowledgeSourceType
  const content = useWatch({ control, name: 'content' })

  const create = useMutation({
    mutationFn: (values: AddKnowledgeValues) =>
      knowledgeRepository.createDocument({
        business_id: businessId,
        title: values.title,
        source_type: values.sourceType as KnowledgeSourceType,
        source_url: values.sourceType === 'url' ? values.url.trim() : null,
        storage_path: null,
        content: values.sourceType === 'url' ? null : values.content.trim(),
        status: 'pendiente',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge', businessId] })
      toast.success('Información añadida. Procésala para que tus agentes la usen.')
      reset()
      onOpenChange(false)
    },
    onError: (caught) =>
      setError('root', {
        message: caught instanceof Error ? caught.message : 'No hemos podido guardarlo.',
      }),
  })

  function onSubmit(values: AddKnowledgeValues) {
    create.mutate(values)
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="docTitle">Título</Label>
            <Input
              id="docTitle"
              placeholder="Precios y condiciones"
              autoFocus
              aria-invalid={Boolean(errors.title)}
              {...register('title')}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Controller
              name="sourceType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="texto">Texto escrito por mí</SelectItem>
                    <SelectItem value="faq">Preguntas frecuentes</SelectItem>
                    <SelectItem value="url">Página web</SelectItem>
                    <SelectItem value="txt">Archivo de texto (.txt)</SelectItem>
                    <SelectItem value="pdf">Archivo PDF</SelectItem>
                    <SelectItem value="docx">Documento Word (.docx)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {sourceType === 'url' ? (
            <div className="space-y-1.5">
              <Label htmlFor="docUrl">Dirección</Label>
              <Input
                id="docUrl"
                type="url"
                placeholder="https://tunegocio.com/precios"
                aria-invalid={Boolean(errors.url)}
                {...register('url')}
              />
              <p className="text-xs text-muted-foreground">
                Leeremos el texto de esta página en cuanto pulses "Procesar".
              </p>
              {errors.url && <p className="text-xs text-destructive">{errors.url.message}</p>}
            </div>
          ) : FILE_SOURCE_TYPES.includes(sourceType) ? (
            <div className="space-y-1.5">
              <Label htmlFor="docFile">Archivo</Label>
              <Input
                id="docFile"
                type="file"
                accept={FILE_ACCEPT[sourceType]}
                disabled={extracting}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return

                  setValue('content', '')
                  setExtracting(true)
                  try {
                    const text =
                      sourceType === 'pdf'
                        ? await extractPdfText(file)
                        : sourceType === 'docx'
                          ? await extractDocxText(file)
                          : await file.text()

                    setValue('content', text, { shouldValidate: true })
                    if (!getValues('title').trim()) {
                      setValue('title', file.name.replace(/\.(txt|pdf|docx)$/i, ''))
                    }
                  } catch {
                    setError('content', {
                      message: 'No hemos podido leer ese archivo. ¿Está dañado o protegido?',
                    })
                  } finally {
                    setExtracting(false)
                  }
                }}
              />
              {extracting && <p className="text-xs text-muted-foreground">Leyendo archivo…</p>}
              {!extracting && content && (
                <p className="text-xs text-muted-foreground">
                  {content.length.toLocaleString('es-ES')} caracteres leídos.
                </p>
              )}
              {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="docContent">Contenido</Label>
              <Textarea
                id="docContent"
                rows={8}
                aria-invalid={Boolean(errors.content)}
                placeholder={
                  sourceType === 'faq'
                    ? '¿Cuánto cuesta la primera visita?\nLa primera visita es gratuita e incluye estudio y presupuesto.\n\n¿Aceptáis seguros?\nSí, trabajamos con Sanitas, Adeslas y DKV.'
                    : 'Escribe aquí la información: precios, horarios, condiciones, garantías…'
                }
                {...register('content')}
              />
              {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
            </div>
          )}

          {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting || create.isPending} disabled={extracting}>
              Añadir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
