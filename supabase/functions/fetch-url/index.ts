/**
 * Edge Function `fetch-url` — descarga y limpia el texto de una página web
 * para el Conocimiento del negocio.
 *
 * Vivía como una promesa vacía en el frontend ("leeremos el contenido cuando
 * conectes la base de conocimiento") sin nada que la cumpliera: un documento
 * tipo URL se quedaba en "Sin procesar" para siempre. El navegador no es el
 * sitio adecuado para hacer este fetch (CORS lo bloquea en la mayoría de
 * webs, y traer contenido arbitrario de terceros es mejor hacerlo donde se
 * pueda controlar qué destinos se permiten).
 */
import { assertBusinessAccess, authenticate, CORS_HEADERS, errorResponse, HttpError, json } from '../_shared/auth.ts'

const MAX_CONTENT_LENGTH = 20_000
const FETCH_TIMEOUT_MS = 10_000

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido')

    const ctx = await authenticate(request)
    const body = await request.json()
    const { businessId, url } = (body ?? {}) as { businessId?: string; url?: string }

    if (!businessId) throw new HttpError(400, 'Falta el negocio')
    if (!url?.trim()) throw new HttpError(400, 'Falta la dirección')

    await assertBusinessAccess(ctx, businessId)

    const target = parseAndGuardUrl(url.trim())
    const html = await fetchWithTimeout(target)
    const content = htmlToText(html).slice(0, MAX_CONTENT_LENGTH)

    if (!content.trim()) {
      throw new HttpError(422, 'Esa página no tiene texto legible que extraer')
    }

    return json({ content })
  } catch (error) {
    return errorResponse(error)
  }
})

/**
 * Solo http/https y solo hosts públicos. Sin esto, alguien podría pedirle a
 * este endpoint que llame a `http://localhost` o a una IP privada de la red
 * donde corre la función — un SSRF clásico disfrazado de "añadir una web".
 */
function parseAndGuardUrl(raw: string): URL {
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    throw new HttpError(400, 'Esa dirección no es válida')
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new HttpError(400, 'Solo se admiten direcciones http o https')
  }

  const host = target.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    isPrivateIp(host)
  ) {
    throw new HttpError(400, 'Esa dirección no es accesible')
  }

  return target
}

function isPrivateIp(host: string): boolean {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  // IPv6 loopback / link-local / unique-local.
  return host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')
}

async function fetchWithTimeout(url: URL): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'SinaptkisBot/1.0 (+https://sinaptkis.io)' },
    })

    if (!response.ok) {
      throw new HttpError(502, `La página respondió con un error (${response.status})`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new HttpError(422, 'Esa dirección no es una página web con texto')
    }

    return await response.text()
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, 'La página ha tardado demasiado en responder')
    }
    throw new HttpError(502, 'No se ha podido acceder a esa dirección')
  } finally {
    clearTimeout(timeout)
  }
}

/** Extracción de texto sin dependencias: fuera lo que no se lee, colapsar espacios. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}
