import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  hint?: string
  to?: string
  tone?: 'default' | 'success' | 'warning' | 'destructive'
}

const TONE_CLASSES = {
  default: 'bg-secondary text-muted-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
} as const

export function StatCard({ label, value, icon: Icon, hint, to, tone = 'default' }: StatCardProps) {
  const content = (
    <Card
      className={cn(
        'p-5 transition-colors',
        to && 'hover:border-primary/40 hover:bg-accent/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE_CLASSES[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  )

  return to ? <Link to={to}>{content}</Link> : content
}
