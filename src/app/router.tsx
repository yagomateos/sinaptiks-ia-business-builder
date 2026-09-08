import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireOnboardedBusiness,
  RequireSuperAdmin,
} from './guards'

/* Auth screens load eagerly — they are the first paint for signed-out users. */
import { LoginPage } from '@/features/auth/login-page'
import { SignUpPage } from '@/features/auth/signup-page'
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page'

/* Everything behind the login is split out of the initial bundle. */
const CreateBusinessPage = lazy(() =>
  import('@/features/businesses/create-business-page').then((m) => ({ default: m.CreateBusinessPage })),
)
const OnboardingPage = lazy(() =>
  import('@/features/onboarding/onboarding-page').then((m) => ({ default: m.OnboardingPage })),
)
const SystemGenerationPage = lazy(() =>
  import('@/features/system/system-generation-page').then((m) => ({ default: m.SystemGenerationPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/dashboard-page').then((m) => ({ default: m.DashboardPage })),
)
const AutomationsPage = lazy(() =>
  import('@/features/automations/automations-page').then((m) => ({ default: m.AutomationsPage })),
)
const AutomationDetailPage = lazy(() =>
  import('@/features/automations/automation-detail-page').then((m) => ({
    default: m.AutomationDetailPage,
  })),
)
const AgentsPage = lazy(() =>
  import('@/features/agents/agents-page').then((m) => ({ default: m.AgentsPage })),
)
const AgentDetailPage = lazy(() =>
  import('@/features/agents/agent-detail-page').then((m) => ({ default: m.AgentDetailPage })),
)
const KnowledgePage = lazy(() =>
  import('@/features/knowledge/knowledge-page').then((m) => ({ default: m.KnowledgePage })),
)
const LeadsPage = lazy(() =>
  import('@/features/crm/leads-page').then((m) => ({ default: m.LeadsPage })),
)
const LeadDetailPage = lazy(() =>
  import('@/features/crm/lead-detail-page').then((m) => ({ default: m.LeadDetailPage })),
)
const ConversationsPage = lazy(() =>
  import('@/features/conversations/conversations-page').then((m) => ({
    default: m.ConversationsPage,
  })),
)
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/analytics-page').then((m) => ({ default: m.AnalyticsPage })),
)
const IntegrationsPage = lazy(() =>
  import('@/features/integrations/integrations-page').then((m) => ({ default: m.IntegrationsPage })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/settings-page').then((m) => ({ default: m.SettingsPage })),
)
const AdminPage = lazy(() =>
  import('@/features/admin/admin-page').then((m) => ({ default: m.AdminPage })),
)
const NotFoundPage = lazy(() =>
  import('@/features/misc/not-found-page').then((m) => ({ default: m.NotFoundPage })),
)

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },

  {
    path: '/entrar',
    element: (
      <RedirectIfAuthenticated>
        <LoginPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/registro',
    element: (
      <RedirectIfAuthenticated>
        <SignUpPage />
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/recuperar',
    element: (
      <RedirectIfAuthenticated>
        <ForgotPasswordPage />
      </RedirectIfAuthenticated>
    ),
  },

  {
    element: <RequireAuth />,
    children: [
      {
        path: '/nuevo-negocio',
        element: (
          <Lazy>
            <CreateBusinessPage />
          </Lazy>
        ),
      },
      {
        path: '/onboarding/:businessId',
        element: (
          <Lazy>
            <OnboardingPage />
          </Lazy>
        ),
      },
      {
        path: '/generando/:businessId',
        element: (
          <Lazy>
            <SystemGenerationPage />
          </Lazy>
        ),
      },

      {
        element: <RequireSuperAdmin />,
        children: [
          {
            path: '/admin',
            element: (
              <Lazy>
                <AdminPage />
              </Lazy>
            ),
          },
        ],
      },

      {
        element: <RequireOnboardedBusiness />,
        children: [
          {
            path: '/app',
            element: <AppShell />,
            children: [
              {
                index: true,
                element: (
                  <Lazy>
                    <DashboardPage />
                  </Lazy>
                ),
              },
              {
                path: 'automatizaciones',
                element: (
                  <Lazy>
                    <AutomationsPage />
                  </Lazy>
                ),
              },
              {
                path: 'automatizaciones/:automationId',
                element: (
                  <Lazy>
                    <AutomationDetailPage />
                  </Lazy>
                ),
              },
              {
                path: 'agentes',
                element: (
                  <Lazy>
                    <AgentsPage />
                  </Lazy>
                ),
              },
              {
                path: 'agentes/:agentId',
                element: (
                  <Lazy>
                    <AgentDetailPage />
                  </Lazy>
                ),
              },
              {
                path: 'conocimiento',
                element: (
                  <Lazy>
                    <KnowledgePage />
                  </Lazy>
                ),
              },
              {
                path: 'clientes',
                element: (
                  <Lazy>
                    <LeadsPage />
                  </Lazy>
                ),
              },
              {
                path: 'clientes/:leadId',
                element: (
                  <Lazy>
                    <LeadDetailPage />
                  </Lazy>
                ),
              },
              {
                path: 'conversaciones',
                element: (
                  <Lazy>
                    <ConversationsPage />
                  </Lazy>
                ),
              },
              {
                path: 'conversaciones/:conversationId',
                element: (
                  <Lazy>
                    <ConversationsPage />
                  </Lazy>
                ),
              },
              {
                path: 'resultados',
                element: (
                  <Lazy>
                    <AnalyticsPage />
                  </Lazy>
                ),
              },
              {
                path: 'canales',
                element: (
                  <Lazy>
                    <IntegrationsPage />
                  </Lazy>
                ),
              },
              {
                path: 'ajustes',
                element: (
                  <Lazy>
                    <SettingsPage />
                  </Lazy>
                ),
              },
            ],
          },
        ],
      },
    ],
  },

  {
    path: '*',
    element: (
      <Lazy>
        <NotFoundPage />
      </Lazy>
    ),
  },
])
