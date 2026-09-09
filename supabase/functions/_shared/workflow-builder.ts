/**
 * Traduce una automatización del dominio a un workflow de n8n.
 *
 * Esta es la pieza que hace que el usuario no tenga que saber qué es n8n: él
 * elige "Responder automáticamente" y aquí se construye el grafo de nodos.
 *
 * Forma del grafo:
 *
 *   [Disparador]  →  [Preparar contexto]  →  [Acción 1] → [Acción 2] → ...
 *
 * Las acciones no hablan con WhatsApp ni con el calendario todavía: llaman de
 * vuelta a nuestra Edge Function, que es quien tiene permiso para escribir en
 * la base de datos y quien registrará cada ejecución. Cuando se conecten los
 * canales reales, solo cambia el nodo de acción — el disparador y el registro
 * siguen igual.
 */

export interface AutomationTrigger {
  type: string
  description: string
  config: Record<string, unknown>
}

export interface AutomationAction {
  type: string
  description: string
  config: Record<string, unknown>
}

export interface AutomationRecord {
  id: string
  business_id: string
  name: string
  description: string | null
  category: string
  trigger: AutomationTrigger
  actions: AutomationAction[]
}

interface N8nNode {
  id: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, unknown>
}

interface N8nWorkflowDefinition {
  name: string
  nodes: N8nNode[]
  connections: Record<string, { main: { node: string; type: 'main'; index: number }[][] }>
  settings: Record<string, unknown>
}

/** Ruta del webhook: estable y única por automatización. */
export function webhookPathFor(automation: { id: string }): string {
  return `sinaptkis/${automation.id}`
}

export function buildWorkflow(
  automation: AutomationRecord,
  callbackUrl: string,
  callbackSecret: string,
): N8nWorkflowDefinition {
  const nodes: N8nNode[] = []
  const order: string[] = []

  const trigger = buildTriggerNode(automation)
  nodes.push(trigger)
  order.push(trigger.name)

  // Un nodo por acción, encadenados. Cada uno reporta a la app qué hizo.
  automation.actions.forEach((action, index) => {
    const node = buildActionNode(automation, action, index, callbackUrl, callbackSecret)
    nodes.push(node)
    order.push(node.name)
  })

  return {
    name: `[Sinaptkis] ${automation.name}`,
    nodes,
    connections: buildConnections(order),
    settings: { executionOrder: 'v1' },
  }
}

/* ------------------------------------------------------------------ */
/* Disparadores                                                        */
/* ------------------------------------------------------------------ */

function buildTriggerNode(automation: AutomationRecord): N8nNode {
  const { type, config } = automation.trigger

  if (type === 'programado') {
    return {
      id: 'trigger',
      name: 'Cuando toque',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [scheduleInterval(config)] } },
    }
  }

  // Todo lo demás lo dispara la app llamando al webhook: mensaje entrante,
  // lead nuevo, cambio de estado, inactividad detectada o prueba manual.
  return {
    id: 'trigger',
    name: 'Cuando ocurra',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 0],
    parameters: {
      httpMethod: 'POST',
      path: webhookPathFor(automation),
      responseMode: 'onReceived',
      options: {},
    },
  }
}

function scheduleInterval(config: Record<string, unknown>): Record<string, unknown> {
  const cron = String(config.cron ?? 'daily')
  const hour = Number(config.hour ?? 9)

  if (cron === 'weekly') return { field: 'weeks', triggerAtDay: [1], triggerAtHour: hour }
  if (cron === 'biweekly') return { field: 'weeks', triggerAtDay: [1], triggerAtHour: hour }
  if (cron === 'monthly') return { field: 'months', triggerAtDayOfMonth: 1, triggerAtHour: hour }

  return { field: 'days', triggerAtHour: hour }
}

/* ------------------------------------------------------------------ */
/* Acciones                                                            */
/* ------------------------------------------------------------------ */

function buildActionNode(
  automation: AutomationRecord,
  action: AutomationAction,
  index: number,
  callbackUrl: string,
  callbackSecret: string,
): N8nNode {
  // "esperar" es la única acción que n8n resuelve por sí mismo.
  if (action.type === 'esperar') {
    return {
      id: `action_${index}`,
      name: `${index + 1}. ${action.description}`,
      type: 'n8n-nodes-base.wait',
      typeVersion: 1.1,
      position: [(index + 1) * 260, 0],
      parameters: { amount: Number(action.config.hours ?? 24), unit: 'hours' },
    }
  }

  return {
    id: `action_${index}`,
    name: `${index + 1}. ${action.description}`,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [(index + 1) * 260, 0],
    parameters: {
      method: 'POST',
      url: callbackUrl,
      sendHeaders: true,
      headerParameters: {
        parameter: [{ name: 'x-sinaptkis-secret', value: callbackSecret }],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: JSON.stringify({
        automationId: automation.id,
        businessId: automation.business_id,
        actionType: action.type,
        actionConfig: action.config,
        stepIndex: index,
        isLastStep: index === automation.actions.length - 1,
        // Lo que trajo el disparador, para que la acción tenga contexto.
        payload: '={{ $json }}',
      }),
      options: { timeout: 15000 },
    },
  }
}

/* ------------------------------------------------------------------ */

function buildConnections(order: string[]) {
  const connections: Record<
    string,
    { main: { node: string; type: 'main'; index: number }[][] }
  > = {}

  for (let i = 0; i < order.length - 1; i++) {
    connections[order[i]] = {
      main: [[{ node: order[i + 1], type: 'main', index: 0 }]],
    }
  }

  return connections
}
