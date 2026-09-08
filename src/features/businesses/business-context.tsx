import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  businessesRepository,
  type BusinessWithRole,
} from '@/services/repositories/businesses.repository'
import { useAuth } from '@/features/auth/auth-context'
import type { MemberRole } from '@/domain/types'

const STORAGE_KEY = 'sinaptkis.active-business'

interface BusinessContextValue {
  businesses: BusinessWithRole[]
  activeBusiness: BusinessWithRole | null
  role: MemberRole | null
  loading: boolean
  error: unknown
  setActiveBusinessId(id: string): void
  refresh(): Promise<void>
  /** True when the user can change settings, members and billing. */
  canManage: boolean
}

const BusinessContext = createContext<BusinessContextValue | null>(null)

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )

  const {
    data: businesses = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['businesses', user?.id],
    queryFn: () => businessesRepository.listForCurrentUser(),
    enabled: Boolean(user),
  })

  // Keep the selection valid: fall back to the first business the user has.
  useEffect(() => {
    if (businesses.length === 0) return
    const stillExists = businesses.some((b) => b.id === activeId)
    if (!stillExists) {
      const next = businesses[0].id
      setActiveId(next)
      localStorage.setItem(STORAGE_KEY, next)
    }
  }, [businesses, activeId])

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.id === activeId) ?? null,
    [businesses, activeId],
  )

  const value = useMemo<BusinessContextValue>(
    () => ({
      businesses,
      activeBusiness,
      role: activeBusiness?.role ?? null,
      loading: isLoading,
      error,
      canManage: activeBusiness?.role === 'owner' || activeBusiness?.role === 'admin',

      setActiveBusinessId(id) {
        setActiveId(id)
        localStorage.setItem(STORAGE_KEY, id)
        // Everything below is tenant-scoped — drop it so nothing leaks across.
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'businesses' })
      },

      async refresh() {
        await refetch()
      },
    }),
    [businesses, activeBusiness, isLoading, error, refetch, queryClient],
  )

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness(): BusinessContextValue {
  const context = useContext(BusinessContext)
  if (!context) throw new Error('useBusiness debe usarse dentro de BusinessProvider')
  return context
}

/** For screens that cannot render without a business. */
export function useActiveBusiness(): BusinessWithRole {
  const { activeBusiness } = useBusiness()
  if (!activeBusiness) throw new Error('No hay ningún negocio activo')
  return activeBusiness
}
