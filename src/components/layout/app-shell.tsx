import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Building2,
  Check,
  ChevronsUpDown,
  LogOut,
  Menu,
  Plus,
  Shield,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/auth-context'
import { useBusiness } from '@/features/businesses/business-context'
import { INDUSTRY_LABELS } from '@/domain/vocabulary'
import { cn, initials } from '@/lib/utils'
import { NAV_SECTIONS } from './nav-items'
import { Wordmark } from './logo'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="lg:pl-64">
        <MobileTopBar onOpenMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-5 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between px-5">
          <Wordmark />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="px-3 pb-2">
          <BusinessSwitcher />
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section, index) => (
            <div key={section.label ?? index}>
              {section.label && (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/app'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <UserMenu />
      </aside>
    </>
  )
}

function BusinessSwitcher() {
  const { businesses, activeBusiness, setActiveBusinessId } = useBusiness()
  const navigate = useNavigate()

  if (!activeBusiness) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-secondary">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight">{activeBusiness.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {INDUSTRY_LABELS[activeBusiness.industry]}
            </p>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[232px]">
        <DropdownMenuLabel>Tus negocios</DropdownMenuLabel>
        {businesses.map((business) => (
          <DropdownMenuItem
            key={business.id}
            onSelect={() => setActiveBusinessId(business.id)}
            className="justify-between"
          >
            <span className="truncate">{business.name}</span>
            {business.id === activeBusiness.id && <Check className="h-4 w-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/nuevo-negocio')}>
          <Plus />
          Añadir otro negocio
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()

  const name = profile?.full_name ?? user?.email ?? ''
  const isSuperAdmin = profile?.platform_role === 'super_admin'

  return (
    <div className="border-t p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary">
            <Avatar className="h-7 w-7">
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">{name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
            </div>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" side="top" className="w-[232px]">
          {isSuperAdmin && (
            <>
              <DropdownMenuItem onSelect={() => navigate('/admin')}>
                <Shield />
                Administración
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            destructive
            onSelect={async () => {
              await signOut()
              navigate('/entrar')
            }}
          >
            <LogOut />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function MobileTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:hidden">
      <Button variant="ghost" size="icon" onClick={onOpenMenu}>
        <Menu />
      </Button>
      <Wordmark />
    </div>
  )
}
