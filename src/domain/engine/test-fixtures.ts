/** Shared minimal fixtures for domain engine tests. Not a test file itself. */
import type { BusinessProfile, Service } from '../types'

export function makeProfile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: 'p1',
    business_id: 'b1',
    business_name: 'Clínica Sonrisa',
    industry: 'clinica',
    description: 'Clínica dental en el centro de Madrid.',
    location: 'Madrid',
    website: null,
    ideal_customer: null,
    value_proposition: null,
    brand_voice: 'cercano',
    business_hours: [],
    contact_channels: ['telegram', 'web'],
    goals: [],
    faq: [],
    objections: [],
    policies: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 's1',
    business_id: 'b1',
    name: 'Implante dental',
    description: 'Sustitución de una pieza con implante de titanio.',
    price: 1200,
    currency: 'EUR',
    duration_minutes: 90,
    url: null,
    features: [],
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
