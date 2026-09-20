// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LeadsPage } from './leads-page'
import type { Lead } from '@/domain/types'

const list = vi.fn()

vi.mock('@/services/repositories/leads.repository', () => ({
  leadsRepository: {
    list: (...args: unknown[]) => list(...args),
  },
}))

vi.mock('@/features/businesses/business-context', () => ({
  useBusiness: () => ({ activeBusiness: { id: 'biz-1' } }),
}))

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    business_id: 'biz-1',
    full_name: 'Ana García',
    email: 'ana@example.com',
    phone: '+34600000000',
    source: 'telegram',
    stage: 'nuevo',
    temperature: 'templado',
    notes: null,
    value_estimate: null,
    last_contacted_at: null,
    next_action: null,
    next_action_at: null,
    assigned_agent_id: null,
    potential_score: null,
    potential_label: null,
    scored_at: null,
    score_signals: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderLeadsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LeadsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LeadsPage', () => {
  beforeEach(() => {
    list.mockReset()
  })

  it('sin contactos, muestra el estado vacío en vez de una lista en blanco', async () => {
    list.mockResolvedValue([])
    renderLeadsPage()

    expect(await screen.findByText('Todavía no tienes contactos')).toBeInTheDocument()
  })

  it('con contactos, los renderiza en la vista de lista', async () => {
    list.mockResolvedValue([lead({ full_name: 'Ana García' }), lead({ id: 'lead-2', full_name: 'Luis Pérez' })])
    renderLeadsPage()

    expect(await screen.findByText('Ana García')).toBeInTheDocument()
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument()
  })

  it('escribir en el buscador pide al repositorio ese término de búsqueda', async () => {
    list.mockResolvedValue([lead()])
    const user = userEvent.setup()
    renderLeadsPage()

    await screen.findByText('Ana García')
    list.mockResolvedValue([]) // la siguiente búsqueda no encuentra nada

    await user.type(screen.getByPlaceholderText('Buscar por nombre, email o teléfono'), 'xyz')

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith('biz-1', { stage: 'todos', search: 'xyz' }, { limit: 200 }),
    )
  })
})
