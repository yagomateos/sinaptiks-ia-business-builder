import type {
  BrandVoice,
  BusinessGoal,
  ContactChannel,
  Industry,
} from '@/domain/types'

export interface ServiceInput {
  /** Local key for list rendering; not persisted. */
  key: string
  name: string
  description: string
  price: string
  durationMinutes: string
  url: string
  features: string
}

export interface OnboardingDraft {
  name: string
  industry: Industry
  website: string
  city: string
  country: string
  description: string
  idealCustomer: string
  valueProposition: string
  brandVoice: BrandVoice
  services: ServiceInput[]
  goals: BusinessGoal[]
  channels: ContactChannel[]
}

export function emptyService(): ServiceInput {
  return {
    key: crypto.randomUUID(),
    name: '',
    description: '',
    price: '',
    durationMinutes: '',
    url: '',
    features: '',
  }
}

export const STEP_COUNT = 6

export interface StepDefinition {
  title: string
  subtitle: string
}

export const STEPS: StepDefinition[] = [
  {
    title: '¿Cómo se llama tu negocio?',
    subtitle: 'Confirma los datos básicos. Los usaremos en todo lo que generemos.',
  },
  {
    title: '¿Qué hace tu empresa?',
    subtitle:
      'Explícalo como se lo contarías a un cliente. Cuanto más concreto, mejor responderán tus agentes.',
  },
  {
    title: '¿Quién es tu cliente ideal?',
    subtitle: 'Saber a quién te diriges nos permite filtrar mejor y perder menos tiempo.',
  },
  {
    title: '¿Qué vendes?',
    subtitle: 'Añade tus servicios con sus precios. Es lo que tus agentes responderán cuando pregunten.',
  },
  {
    title: '¿Qué quieres conseguir?',
    subtitle: 'Elige todo lo que te interese. Diseñaremos tu sistema alrededor de esto.',
  },
  {
    title: '¿Dónde contactan contigo?',
    subtitle: 'Marca los canales que usas hoy. Podrás añadir más en cualquier momento.',
  },
]
