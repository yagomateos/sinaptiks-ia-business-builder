import {
  BarChart3,
  BookOpen,
  Bot,
  LayoutDashboard,
  MessageSquare,
  Plug,
  Settings,
  Users,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown in the sidebar tooltip / mobile subtitle. */
  hint: string
}

export interface NavSection {
  label: string | null
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      {
        to: '/app',
        label: 'Inicio',
        icon: LayoutDashboard,
        hint: 'El estado de tu sistema de un vistazo',
      },
    ],
  },
  {
    label: 'Tu sistema',
    items: [
      {
        to: '/app/automatizaciones',
        label: 'Automatizaciones',
        icon: Workflow,
        hint: 'Tareas que se hacen solas',
      },
      {
        to: '/app/agentes',
        label: 'Agentes IA',
        icon: Bot,
        hint: 'Quién atiende a tus clientes',
      },
      {
        to: '/app/conocimiento',
        label: 'Conocimiento',
        icon: BookOpen,
        hint: 'Lo que tus agentes saben de ti',
      },
    ],
  },
  {
    label: 'Tus clientes',
    items: [
      {
        to: '/app/clientes',
        label: 'Clientes',
        icon: Users,
        hint: 'Contactos y oportunidades',
      },
      {
        to: '/app/conversaciones',
        label: 'Conversaciones',
        icon: MessageSquare,
        hint: 'Todos tus mensajes en un sitio',
      },
    ],
  },
  {
    label: 'Gestión',
    items: [
      {
        to: '/app/resultados',
        label: 'Resultados',
        icon: BarChart3,
        hint: 'Qué está funcionando',
      },
      {
        to: '/app/canales',
        label: 'Canales',
        icon: Plug,
        hint: 'Dónde te escriben tus clientes',
      },
      {
        to: '/app/ajustes',
        label: 'Ajustes',
        icon: Settings,
        hint: 'Tu negocio y tu equipo',
      },
    ],
  },
]
