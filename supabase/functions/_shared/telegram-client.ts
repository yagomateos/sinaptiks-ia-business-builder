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
  title = 'Mensaje de voz',
): Promise<void> {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  // `title`/`performer` son lo que Telegram muestra en el reproductor — sin
  // ellos, enseña el nombre de archivo tal cual ("respuesta.mp3"), que es
  // justo lo que se quería evitar.
  form.append('title', title)
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

/**
 * Descarga una nota de voz que el cliente mandó (getFile + descarga del
 * archivo real) — dos peticiones porque así funciona la API de Telegram:
 * primero resuelve el `file_id` a una ruta, luego se descarga de un host
 * distinto (`api.telegram.org/file/...`, no `/bot.../file/...`).
 */
export async function downloadTelegramFile(botToken: string, fileId: string): Promise<Uint8Array> {
  const fileInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
  if (!fileInfoResponse.ok) {
    throw new Error(`Telegram getFile falló (${fileInfoResponse.status}): ${await fileInfoResponse.text()}`)
  }

  const fileInfo = (await fileInfoResponse.json()) as { result?: { file_path?: string } }
  const filePath = fileInfo.result?.file_path
  if (!filePath) throw new Error('Telegram getFile no devolvió una ruta de archivo')

  const fileResponse = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`)
  if (!fileResponse.ok) {
    throw new Error(`Descarga del archivo de Telegram falló (${fileResponse.status})`)
  }

  return new Uint8Array(await fileResponse.arrayBuffer())
}
