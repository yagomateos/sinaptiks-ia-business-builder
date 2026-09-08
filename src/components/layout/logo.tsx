import { cn } from '@/lib/utils'

/**
 * Sinaptkis mark: three nodes joined by two links — a synapse.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={cn('h-6 w-6', className)} aria-hidden="true">
      <path
        d="M7 9.5 L14 14 L21 18.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M7 18.5 L14 14 L21 9.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="14" cy="14" r="4" fill="currentColor" />
      <circle cx="6.5" cy="9.5" r="2.5" fill="currentColor" opacity="0.75" />
      <circle cx="6.5" cy="18.5" r="2.5" fill="currentColor" opacity="0.75" />
      <circle cx="21.5" cy="9.5" r="2.5" fill="currentColor" opacity="0.75" />
      <circle cx="21.5" cy="18.5" r="2.5" fill="currentColor" opacity="0.75" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Logo className="h-6 w-6 text-primary" />
      <span className="text-[15px] font-semibold tracking-tight">Sinaptkis</span>
    </div>
  )
}
