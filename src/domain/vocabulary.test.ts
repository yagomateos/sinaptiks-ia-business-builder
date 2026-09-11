import { describe, expect, it } from 'vitest'
import { isAutomationTriggerConnected } from './vocabulary'
import type { AutomationAction } from './types'

function action(type: AutomationAction['type']): AutomationAction {
  return { type, description: '', config: {} }
}

describe('isAutomationTriggerConnected', () => {
  it('is connected for mensaje_entrante with no intent filter', () => {
    expect(isAutomationTriggerConnected({ type: 'mensaje_entrante', config: {} }, [])).toBe(true)
  })

  it('is connected for mensaje_entrante filtered only by channel', () => {
    expect(
      isAutomationTriggerConnected({ type: 'mensaje_entrante', config: { channels: 'all' } }, []),
    ).toBe(true)
  })

  it('is connected for mensaje_entrante with intent "escalado"', () => {
    expect(
      isAutomationTriggerConnected({ type: 'mensaje_entrante', config: { intent: 'escalado' } }, []),
    ).toBe(true)
  })

  it('is connected for mensaje_entrante with intent "reserva" or "faq" — the classifier drives these now', () => {
    expect(
      isAutomationTriggerConnected({ type: 'mensaje_entrante', config: { intent: 'reserva' } }, []),
    ).toBe(true)
    expect(
      isAutomationTriggerConnected({ type: 'mensaje_entrante', config: { intent: 'faq' } }, []),
    ).toBe(true)
  })

  // El pipeline ya responde directamente a cada mensaje — disparar también
  // responder_ia por la automatización duplicaría esa respuesta. Debe
  // coincidir con la exclusión real en
  // supabase/functions/_shared/conversation-pipeline.ts.
  it('is not connected when the automation includes a responder_ia step, even without intent', () => {
    expect(
      isAutomationTriggerConnected({ type: 'mensaje_entrante', config: {} }, [
        action('responder_ia'),
        action('actualizar_lead'),
      ]),
    ).toBe(false)
  })

  it('is connected for cambio_estado without delay_hours', () => {
    expect(
      isAutomationTriggerConnected({ type: 'cambio_estado', config: { to: 'cualificado' } }, []),
    ).toBe(true)
  })

  it('is not connected for cambio_estado with delay_hours — no dispatch infra for delay yet', () => {
    expect(
      isAutomationTriggerConnected(
        { type: 'cambio_estado', config: { to: 'cliente', delay_hours: 24 } },
        [],
      ),
    ).toBe(false)
  })

  it('is not connected for cambio_estado with a responder_ia step — no real message to reply to', () => {
    expect(
      isAutomationTriggerConnected({ type: 'cambio_estado', config: { to: 'contactado' } }, [
        action('responder_ia'),
      ]),
    ).toBe(false)
  })

  it('is connected for programado — n8n fires its own native schedule node', () => {
    expect(isAutomationTriggerConnected({ type: 'programado', config: {} }, [])).toBe(true)
  })

  it('is connected for inactividad — the automation-inactivity-scan cron fires it', () => {
    expect(isAutomationTriggerConnected({ type: 'inactividad', config: { hours: 24 } }, [])).toBe(
      true,
    )
  })

  it('is not connected for programado or inactividad with a responder_ia step', () => {
    expect(
      isAutomationTriggerConnected({ type: 'programado', config: {} }, [action('responder_ia')]),
    ).toBe(false)
    expect(
      isAutomationTriggerConnected({ type: 'inactividad', config: { hours: 24 } }, [
        action('responder_ia'),
      ]),
    ).toBe(false)
  })
})
