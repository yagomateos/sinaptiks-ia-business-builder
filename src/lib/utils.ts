import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | null, currency = 'EUR'): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-ES').format(value)
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value)}%`
}

export function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(value),
  )
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatRelative(value: string | null): string {
  if (!value) return '—'

  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diffMs / 60000)

  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`

  const days = Math.round(hours / 24)
  if (days < 30) return `hace ${days} ${days === 1 ? 'día' : 'días'}`

  return formatDate(value)
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)} h`
  return `${Math.round(hours / 24)} días`
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return 'Buenas noches'
  if (hour < 14) return 'Buenos días'
  if (hour < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  return fullName.trim().split(/\s+/)[0] ?? ''
}
