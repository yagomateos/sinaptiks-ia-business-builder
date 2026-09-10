import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cn,
  firstName,
  formatCurrency,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelative,
  greeting,
  initials,
} from './utils'

describe('cn', () => {
  it('merges class lists and lets the later Tailwind class win a conflict', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })
})

describe('formatCurrency', () => {
  it('renders an em dash for null', () => {
    expect(formatCurrency(null)).toBe('—')
  })

  it('drops decimals for a whole number', () => {
    expect(formatCurrency(1200)).not.toContain(',00')
  })

  it('keeps decimals for a non-whole number', () => {
    expect(formatCurrency(19.9)).toContain('9')
  })
})

describe('formatNumber / formatPercent', () => {
  it('formats a number with Spanish grouping', () => {
    expect(formatNumber(12345)).toBe('12.345')
  })

  it('appends a percent sign', () => {
    expect(formatPercent(42)).toContain('%')
    expect(formatPercent(42)).toContain('42')
  })
})

describe('formatDuration', () => {
  it('shows minutes under an hour', () => {
    expect(formatDuration(45)).toBe('45 min')
  })

  it('shows hours under a day', () => {
    expect(formatDuration(180)).toBe('3 h')
  })

  it('shows days beyond that', () => {
    expect(formatDuration(60 * 24 * 3)).toBe('3 días')
  })
})

describe('initials', () => {
  it('takes the first letter of up to two words', () => {
    expect(initials('María López')).toBe('ML')
  })

  it('handles a single name', () => {
    expect(initials('María')).toBe('M')
  })

  it('falls back to a question mark for empty input', () => {
    expect(initials(null)).toBe('?')
    expect(initials(undefined)).toBe('?')
    expect(initials('')).toBe('?')
  })

  it('ignores a third or later word', () => {
    expect(initials('Ana Belén García Ruiz')).toBe('AB')
  })
})

describe('firstName', () => {
  it('returns just the first word', () => {
    expect(firstName('María López García')).toBe('María')
  })

  it('returns an empty string for missing input', () => {
    expect(firstName(null)).toBe('')
    expect(firstName(undefined)).toBe('')
  })
})

describe('formatRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders an em dash for null', () => {
    expect(formatRelative(null)).toBe('—')
  })

  it('says "ahora mismo" for less than a minute ago', () => {
    expect(formatRelative(new Date('2026-06-15T11:59:40Z').toISOString())).toBe('ahora mismo')
  })

  it('shows minutes under an hour', () => {
    expect(formatRelative(new Date('2026-06-15T11:45:00Z').toISOString())).toBe('hace 15 min')
  })

  it('shows hours under a day', () => {
    expect(formatRelative(new Date('2026-06-15T09:00:00Z').toISOString())).toBe('hace 3 h')
  })

  it('shows days for anything under a month, with correct singular/plural', () => {
    expect(formatRelative(new Date('2026-06-14T12:00:00Z').toISOString())).toBe('hace 1 día')
    expect(formatRelative(new Date('2026-06-12T12:00:00Z').toISOString())).toBe('hace 3 días')
  })
})

describe('greeting', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('greets according to the hour of day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T08:00:00'))
    expect(greeting()).toBe('Buenos días')

    vi.setSystemTime(new Date('2026-06-15T16:00:00'))
    expect(greeting()).toBe('Buenas tardes')

    vi.setSystemTime(new Date('2026-06-15T23:00:00'))
    expect(greeting()).toBe('Buenas noches')
  })
})
