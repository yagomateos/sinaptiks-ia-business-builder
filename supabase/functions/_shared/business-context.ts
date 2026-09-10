/**
 * Describe un negocio en texto plano para dárselo a un modelo como contexto.
 * Duplica a propósito una parte pequeña del vocabulario de `src/domain`: las
 * Edge Functions corren en Deno y no comparten bundler con el frontend, así
 * que importar `src/` directamente es frágil. Es preferible este duplicado
 * mínimo a un import entre proyectos que puede romperse en el despliegue.
 */

interface BusinessProfileLike {
  business_name: string
  industry: string
  description: string | null
  location: string | null
  ideal_customer: string | null
  value_proposition: string | null
  brand_voice: string
  goals: string[]
  policies: string | null
}

interface ServiceLike {
  name: string
  description: string | null
  price: number | null
  currency: string
  duration_minutes: number | null
}

export function describeBusiness(profile: BusinessProfileLike, services: ServiceLike[]): string {
  const lines = [
    `Negocio: ${profile.business_name}`,
    `Sector: ${profile.industry}`,
    profile.description ? `Qué hace: ${profile.description}` : null,
    profile.location ? `Ubicación: ${profile.location}` : null,
    profile.ideal_customer ? `Cliente ideal: ${profile.ideal_customer}` : null,
    profile.value_proposition ? `Propuesta de valor: ${profile.value_proposition}` : null,
    `Tono de marca: ${profile.brand_voice}`,
    profile.goals?.length ? `Objetivos del negocio: ${profile.goals.join(', ')}` : null,
    profile.policies ? `Condiciones y políticas: ${profile.policies}` : null,
  ].filter(Boolean)

  if (services?.length) {
    lines.push('Servicios:')
    for (const s of services) {
      const price = s.price != null ? `${s.price} ${s.currency}` : 'sin precio publicado'
      const duration = s.duration_minutes ? `, ${s.duration_minutes} min` : ''
      lines.push(`- ${s.name}: ${s.description ?? 'sin descripción'} (${price}${duration})`)
    }
  }

  return lines.join('\n')
}

export const AGENT_TYPE_INFO: Record<string, { label: string; objective: string }> = {
  recepcionista: {
    label: 'Recepcionista IA',
    objective: 'Atender el primer contacto, resolver dudas iniciales y dirigir al siguiente paso.',
  },
  comercial: {
    label: 'Agente Comercial',
    objective: 'Entender la necesidad del interesado y llevarlo hasta la cita o la venta.',
  },
  seguimiento: {
    label: 'Agente de Seguimiento',
    objective: 'Retomar conversaciones a medias y recuperar contactos que se enfriaron.',
  },
  soporte: {
    label: 'Agente de Soporte',
    objective: 'Resolver dudas e incidencias de clientes actuales, escalando cuando haga falta.',
  },
}
