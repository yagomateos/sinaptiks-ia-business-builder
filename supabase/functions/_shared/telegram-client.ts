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

/**
 * `sendAudio`, no `sendVoice`: Telegram solo trata como "nota de voz" (la
 * burbuja redonda con forma de onda) un archivo .ogg en OPUS, y ElevenLabs
 * no genera ese formato — devuelve MP3. Con `sendAudio` el mensaje llega
 * como un archivo de audio real y reproducible, solo que con la burbuja de
 * adjunto normal en vez de la redonda. Preferible a fingir que es una nota
 * de voz cuando no lo es.
 */
export async function sendTelegramAudio(
  botToken: string,
  chatId: number | string,
  audio: Uint8Array,
): Promise<void> {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('audio', new Blob([audio.slice()], { type: 'audio/mpeg' }), 'respuesta.mp3')

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram sendAudio falló (${response.status}): ${body}`)
  }
}
