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

  // Un nodo por acción, encadenados. Cada uno reporta a la app qué hizo, y
  // todos leen del disparador original — no de lo que devolvió el paso
  // anterior — para que ningún paso se quede sin el nombre, el teléfono o el
  // mensaje que llegaron al principio.
  automation.actions.forEach((action, index) => {
    const node = buildActionNode(automation, action, index, callbackUrl, callbackSecret, trigger.name)
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
  triggerNodeName: string,
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

  const isLastStep = index === automation.actions.length - 1

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
      specifyHeaders: 'keypair',
      // La colección interna se llama `parameters` (plural). En singular n8n
      // no da error: acepta el nodo y lo guarda sin cabeceras, con lo que la
      // llamada de vuelta acaba rechazada por falta del secreto.
      headerParameters: {
        parameters: [{ name: 'x-sinaptkis-secret', value: callbackSecret }],
      },
      sendBody: true,
      specifyBody: 'json',
      // Todo el campo tiene que ser una expresión (prefijo `=`) para que n8n
      // evalúe el `{{ }}` de dentro. Un `{{ }}` suelto dentro de un JSON fijo
      // viaja como texto literal.
      jsonBody: buildCallbackBody(automation, action, index, isLastStep, triggerNodeName),
      options: { timeout: 15000 },
    },
  }
}

/**
 * Cuerpo de la llamada de vuelta: JSON literal salvo `payload`, que trae lo
 * que entregó el disparador (el mensaje entrante, el lead, lo que sea).
 *
 * `payload` lee siempre del nodo disparador por su nombre — nunca de `$json`
 * a secas. `$json` es la salida del nodo inmediatamente anterior, así que en
 * el segundo paso de una cadena sería la respuesta HTTP del primer callback,
 * no el mensaje original. Referenciar el disparador por nombre hace que
 * "payload" signifique siempre lo mismo, sin importar en qué paso esté.
 */
function buildCallbackBody(
  automation: AutomationRecord,
  action: AutomationAction,
  index: number,
  isLastStep: boolean,
  triggerNodeName: string,
): string {
  const triggerRef = `$('${triggerNodeName}')`
  const fields = [
    `"automationId":${JSON.stringify(automation.id)}`,
    `"businessId":${JSON.stringify(automation.business_id)}`,
    `"actionType":${JSON.stringify(action.type)}`,
    `"actionConfig":${JSON.stringify(action.config ?? {})}`,
    `"stepIndex":${index}`,
    `"isLastStep":${isLastStep}`,
    // El nodo webhook no entrega el cuerpo tal cual: lo envuelve junto a las
    // cabeceras y la query en `body`. Los disparadores programados no tienen
    // `body`, así que se cae al propio objeto.
    `"payload":{{ JSON.stringify(${triggerRef}.item.json.body || ${triggerRef}.item.json) }}`,
  ]

  return `={${fields.join(',')}}`
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
