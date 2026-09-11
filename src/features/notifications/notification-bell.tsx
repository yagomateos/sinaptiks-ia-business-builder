/**
 * Campana de avisos.
 *
 * `activityRepository.notify/listNotifications/markNotificationRead` existían
 * desde hace tiempo pero nadie los llamaba: ni había quien escribiera avisos
 * ni una forma de verlos. Este componente es el lado de lectura; los
 * escritores (automatización que falla, lead que se pone muy caliente) viven
 * junto a donde ocurre cada evento.
 */
import { Bell } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { activityRepository } from '@/services/repositories/activity.repository'
import type { Notification, NotificationLevel } from '@/domain/types'
import { formatRelative } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useBusiness } from '@/features/businesses/business-context'

export function NotificationBell() {
  const { activeBusiness } = useBusiness()
  const businessId = activeBusiness?.id ?? ''
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications', businessId],
    queryFn: () => activityRepository.listNotifications(businessId),
    enabled: Boolean(businessId),
    // No hay push: sondear cada minuto es barato y mantiene la campana al día
    // sin que el usuario tenga que recargar la página.
    refetchInterval: 60_000,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => activityRepository.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', businessId] }),
  })

  if (!businessId) return null

  const notifications = query.data ?? []
  const unread = notifications.filter((n) => !n.read_at)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-medium leading-none text-destructive-foreground">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <DropdownMenuLabel className="px-3 py-2.5">Avisos</DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />

        <div className="max-h-[360px] overflow-y-auto">
          {query.isError ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">No hemos podido cargar los avisos.</p>
              <Button variant="ghost" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={() => query.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Todavía no hay avisos.
            </p>
          ) : (
            notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onRead={() => !n.read_at && markRead.mutate(n.id)}
              />
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: Notification
  onRead(): void
}) {
  const content = (
    <div
      className={cn(
        'flex gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-secondary/60',
        LEVEL_BORDER[notification.level],
        !notification.read_at && 'bg-secondary/30',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs leading-snug', !notification.read_at && 'font-medium')}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {notification.body}
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {formatRelative(notification.created_at)}
        </p>
      </div>
      {!notification.read_at && (
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </div>
  )

  if (notification.entity_type === 'automation' && notification.entity_id) {
    return (
      <DropdownMenuItem asChild className="cursor-pointer p-0 focus:bg-transparent">
        <Link to={`/app/automatizaciones/${notification.entity_id}`} onClick={onRead}>
          {content}
        </Link>
      </DropdownMenuItem>
    )
  }

  if (notification.entity_type === 'lead' && notification.entity_id) {
    return (
      <DropdownMenuItem asChild className="cursor-pointer p-0 focus:bg-transparent">
        <Link to={`/app/clientes/${notification.entity_id}`} onClick={onRead}>
          {content}
        </Link>
      </DropdownMenuItem>
    )
  }

  if (notification.entity_type === 'conversation' && notification.entity_id) {
    return (
      <DropdownMenuItem asChild className="cursor-pointer p-0 focus:bg-transparent">
        <Link to={`/app/conversaciones/${notification.entity_id}`} onClick={onRead}>
          {content}
        </Link>
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuItem className="cursor-pointer p-0 focus:bg-transparent" onSelect={onRead}>
      {content}
    </DropdownMenuItem>
  )
}

const LEVEL_BORDER: Record<NotificationLevel, string> = {
  info: 'border-l-muted-foreground/30',
  exito: 'border-l-success',
  aviso: 'border-l-warning',
  error: 'border-l-destructive',
}
