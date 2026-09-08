import {
  AtSign,
  Camera,
  Globe,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ThumbsUp,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BRAND_VOICES,
  BUSINESS_GOALS,
  CONTACT_CHANNELS,
  INDUSTRIES,
  type BrandVoice,
  type BusinessGoal,
  type ContactChannel,
  type Industry,
} from '@/domain/types'
import {
  BRAND_VOICE_DESCRIPTIONS,
  BRAND_VOICE_LABELS,
  CHANNEL_LABELS,
  GOAL_DESCRIPTIONS,
  GOAL_LABELS,
  INDUSTRY_LABELS,
} from '@/domain/vocabulary'
import { SelectableCard } from './selectable-card'
import { emptyService, type OnboardingDraft, type ServiceInput } from './types'

interface StepProps {
  draft: OnboardingDraft
  update(patch: Partial<OnboardingDraft>): void
}

/* ------------------------------------------------------------------ Step 1 */

export function StepBusiness({ draft, update }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="industry">Sector</Label>
        <Select
          value={draft.industry}
          onValueChange={(value) => update({ industry: value as Industry })}
        >
          <SelectTrigger id="industry">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((key) => (
              <SelectItem key={key} value={key}>
                {INDUSTRY_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="city">Ciudad</Label>
          <Input id="city" value={draft.city} onChange={(e) => update({ city: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">País</Label>
          <Input
            id="country"
            value={draft.country}
            onChange={(e) => update({ country: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="website">
          Web <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id="website"
          type="url"
          value={draft.website}
          onChange={(e) => update({ website: e.target.value })}
          placeholder="https://tunegocio.com"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Step 2 */

export function StepDescription({ draft, update }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="description">Cuéntanos qué hace tu empresa</Label>
        <Textarea
          id="description"
          rows={7}
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Somos una clínica dental en Madrid. Hacemos implantes, ortodoncia invisible y estética dental. Llevamos 12 años y nos diferencia el trato cercano y que damos presupuesto cerrado desde la primera visita."
        />
        <p className="text-xs text-muted-foreground">
          Esto es lo que tus agentes usarán para presentarte.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="valueProposition">
          ¿Qué te diferencia? <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          id="valueProposition"
          rows={3}
          value={draft.valueProposition}
          onChange={(e) => update({ valueProposition: e.target.value })}
          placeholder="Presupuesto cerrado sin sorpresas y cita en menos de 48 horas."
        />
      </div>

      <div className="space-y-2">
        <Label>¿Cómo quieres que suene tu negocio?</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {BRAND_VOICES.map((voice: BrandVoice) => (
            <SelectableCard
              key={voice}
              label={BRAND_VOICE_LABELS[voice]}
              description={BRAND_VOICE_DESCRIPTIONS[voice]}
              selected={draft.brandVoice === voice}
              onToggle={() => update({ brandVoice: voice })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Step 3 */

export function StepIdealCustomer({ draft, update }: StepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="idealCustomer">Describe a tu cliente ideal</Label>
        <Textarea
          id="idealCustomer"
          rows={7}
          value={draft.idealCustomer}
          onChange={(e) => update({ idealCustomer: e.target.value })}
          placeholder="Personas de 30 a 60 años de Madrid centro que buscan una solución definitiva y valoran más la calidad y la confianza que el precio más bajo."
        />
      </div>

      <Card className="bg-secondary/40 p-4">
        <p className="text-xs font-medium">Piensa en:</p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>• Qué problema tienen antes de encontrarte</li>
          <li>• Qué les preocupa al decidir</li>
          <li>• Qué tipo de cliente prefieres evitar</li>
        </ul>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ Step 4 */

export function StepServices({ draft, update }: StepProps) {
  function updateService(key: string, patch: Partial<ServiceInput>) {
    update({
      services: draft.services.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    })
  }

  function removeService(key: string) {
    update({ services: draft.services.filter((s) => s.key !== key) })
  }

  return (
    <div className="space-y-4">
      {draft.services.map((service, index) => (
        <Card key={service.key} className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Servicio {index + 1}
            </p>
            {draft.services.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeService(service.key)}
                aria-label="Quitar servicio"
              >
                <Trash2 className="text-muted-foreground" />
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`service-name-${service.key}`}>Nombre</Label>
              <Input
                id={`service-name-${service.key}`}
                value={service.name}
                onChange={(e) => updateService(service.key, { name: e.target.value })}
                placeholder="Implante dental"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`service-desc-${service.key}`}>Descripción</Label>
              <Textarea
                id={`service-desc-${service.key}`}
                rows={2}
                value={service.description}
                onChange={(e) => updateService(service.key, { description: e.target.value })}
                placeholder="Sustitución de una pieza dental con implante de titanio y corona de porcelana."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`service-price-${service.key}`}>Precio (€)</Label>
                <Input
                  id={`service-price-${service.key}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={service.price}
                  onChange={(e) => updateService(service.key, { price: e.target.value })}
                  placeholder="1200"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`service-duration-${service.key}`}>Duración (min)</Label>
                <Input
                  id={`service-duration-${service.key}`}
                  type="number"
                  min="0"
                  value={service.durationMinutes}
                  onChange={(e) => updateService(service.key, { durationMinutes: e.target.value })}
                  placeholder="60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`service-features-${service.key}`}>
                Qué incluye{' '}
                <span className="font-normal text-muted-foreground">(separa con comas)</span>
              </Label>
              <Input
                id={`service-features-${service.key}`}
                value={service.features}
                onChange={(e) => updateService(service.key, { features: e.target.value })}
                placeholder="Primera visita, radiografía, garantía 10 años"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`service-url-${service.key}`}>
                Enlace <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id={`service-url-${service.key}`}
                type="url"
                value={service.url}
                onChange={(e) => updateService(service.key, { url: e.target.value })}
                placeholder="https://tunegocio.com/implantes"
              />
            </div>
          </div>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => update({ services: [...draft.services, emptyService()] })}
      >
        <Plus />
        Añadir otro servicio
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ Step 5 */

export function StepGoals({ draft, update }: StepProps) {
  function toggle(goal: BusinessGoal) {
    update({
      goals: draft.goals.includes(goal)
        ? draft.goals.filter((g) => g !== goal)
        : [...draft.goals, goal],
    })
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {BUSINESS_GOALS.map((goal) => (
        <SelectableCard
          key={goal}
          label={GOAL_LABELS[goal]}
          description={GOAL_DESCRIPTIONS[goal]}
          selected={draft.goals.includes(goal)}
          onToggle={() => toggle(goal)}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ Step 6 */

const CHANNEL_ICONS: Record<ContactChannel, LucideIcon> = {
  whatsapp: MessageCircle,
  web: Globe,
  instagram: Camera,
  facebook: ThumbsUp,
  email: AtSign,
  telefono: Phone,
  google_business: MapPin,
}

export function StepChannels({ draft, update }: StepProps) {
  function toggle(channel: ContactChannel) {
    update({
      channels: draft.channels.includes(channel)
        ? draft.channels.filter((c) => c !== channel)
        : [...draft.channels, channel],
    })
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CONTACT_CHANNELS.map((channel) => (
        <SelectableCard
          key={channel}
          label={CHANNEL_LABELS[channel]}
          icon={CHANNEL_ICONS[channel]}
          selected={draft.channels.includes(channel)}
          onToggle={() => toggle(channel)}
        />
      ))}
    </div>
  )
}
