/**
 * Cliente mínimo de la API de Telegram. Compartido entre telegram-webhook
 * (responder al mensaje real) y n8n-callback (mandar recordatorios desde una
 * automatización) — antes solo vivía dentro del webhook.
 */
export async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram sendMessage falló (${response.status}): ${body}`)
  }
}
