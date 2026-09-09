import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PotentialLabel } from '@/domain/types'

export const POTENTIAL_LABELS_ES: Record<PotentialLabel, string> = {
  descartado: 'Descartado',
  frio: 'Poco potencial',
  templado: 'Potencial medio',
  caliente: 'Buen potencial',
  muy_caliente: 'Máxima prioridad',
}

const VARIANTS: Record<PotentialLabel, 'outline' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
  descartado: 'outline',
  frio: 'secondary',
  templado: 'warning',
  caliente: 'success',
  muy_caliente: 'success',
}

export function PotentialBadge({
  label,
  score,
}: {
  label: PotentialLabel
  score?: number | null
}) {
  return (
    <Badge variant={VARIANTS[label]} className={cn(label === 'muy_caliente' && 'font-semibold')}>
      {POTENTIAL_LABELS_ES[label]}
      {score !== null && score !== undefined && (
        <span className="tabular-nums opacity-70">· {score}</span>
      )}
    </Badge>
  )
}

/** Barra 0–100 para ver el potencial de un vistazo. */
export function PotentialBar({ score }: { score: number }) {
  const tone =
    score >= 75 ? 'bg-success' : score >= 55 ? 'bg-success/70' : score >= 35 ? 'bg-warning' : 'bg-muted-foreground/40'

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn('h-full rounded-full transition-all duration-500', tone)}
        style={{ width: `${Math.max(score, 2)}%` }}
      />
    </div>
  )
}
