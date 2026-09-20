/**
 * Límite de uso por usuario para operaciones que cuestan dinero de verdad
 * (Claude/OpenAI/embeddings) — sin esto, cualquier cuenta autenticada podía
 * llamar a `ai/generate-reply` o a la ingesta de conocimiento sin límite,
 * con claves de pago reales detrás.
 *
 * Respaldado por una función de Postgres (`check_rate_limit`, migración
 * `rate_limit_counters`) en vez de un servicio externo — no hay ninguna
 * cola ni caché en este proyecto todavía, y añadir una solo para esto sería
 * más infraestructura de la que el problema justifica.
 */
import { HttpError, type AuthContext } from './auth.ts'

export async function assertRateLimit(
  ctx: AuthContext,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { data: allowed, error } = await ctx.db.rpc('check_rate_limit', {
    p_key: `${scope}:${ctx.userId}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    // Un fallo comprobando el límite (la función no existe todavía en un
    // entorno sin migrar, un corte puntual...) no debe bloquear a un
    // usuario legítimo — se registra y se deja pasar.
    console.error('No se pudo comprobar el límite de uso', error)
    return
  }

  if (!allowed) {
    throw new HttpError(
      429,
      'Has hecho demasiadas peticiones seguidas. Espera un minuto e inténtalo de nuevo.',
    )
  }
}
