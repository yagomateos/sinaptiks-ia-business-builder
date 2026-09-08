import { Badge } from '@/components/ui/badge'
import { AUTOMATION_STATUS_LABELS } from '@/domain/vocabulary'
import type { AutomationStatus } from '@/domain/types'

const VARIANTS: Record<AutomationStatus, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  borrador: 'outline',
  preparada: 'secondary',
  activa: 'success',
  pausada: 'warning',
  error: 'destructive',
}

export function AutomationStatusBadge({ status }: { status: AutomationStatus }) {
  return <Badge variant={VARIANTS[status]}>{AUTOMATION_STATUS_LABELS[status]}</Badge>
}
