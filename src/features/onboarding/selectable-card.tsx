import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectableCardProps {
  label: string
  description?: string
  icon?: LucideIcon
  selected: boolean
  onToggle(): void
}

export function SelectableCard({
  label,
  description,
  icon: Icon,
  selected,
  onToggle,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'group relative flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all',
        selected
          ? 'border-primary bg-accent/60 ring-1 ring-primary'
          : 'hover:border-primary/40 hover:bg-secondary/60',
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 transition-colors',
            selected ? 'text-primary' : 'text-muted-foreground',
          )}
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>

      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {selected && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
      </span>
    </button>
  )
}
