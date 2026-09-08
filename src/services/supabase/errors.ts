import type { PostgrestError } from '@supabase/supabase-js'

/** Domain-level error with a message safe to show a non-technical user. */
export class AppError extends Error {
  readonly detail: unknown

  constructor(message: string, detail?: unknown) {
    super(message)
    this.name = 'AppError'
    this.detail = detail
  }
}

const POSTGREST_MESSAGES: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'No se puede completar: hay información relacionada.',
  '42501': 'No tienes permiso para hacer esto.',
  PGRST116: 'No hemos encontrado lo que buscabas.',
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu email antes de entrar.',
  user_already_exists: 'Ya existe una cuenta con este email.',
  email_exists: 'Ya existe una cuenta con este email.',
  weak_password: 'La contraseña es demasiado débil.',
  email_address_invalid: 'Ese email no es válido. Usa una dirección real.',
  over_email_send_rate_limit: 'Demasiados intentos. Espera un minuto.',
  over_request_rate_limit: 'Demasiados intentos. Espera un minuto.',
  signup_disabled: 'El registro está desactivado ahora mismo.',
  validation_failed: 'Revisa los datos que has introducido.',
}

/** Supabase returns some auth errors as English prose without a code. */
const AUTH_MESSAGE_PATTERNS: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email address .* is invalid/i, 'Ese email no es válido. Usa una dirección real.'],
  [/email not confirmed/i, 'Confirma tu email antes de entrar.'],
  [/already registered|already exists/i, 'Ya existe una cuenta con este email.'],
  [/password should be at least/i, 'La contraseña es demasiado corta.'],
  [/rate limit|too many requests/i, 'Demasiados intentos. Espera un minuto.'],
  [/failed to fetch|network/i, 'No hemos podido conectar. Revisa tu conexión.'],
]

export function toAppError(error: unknown, fallback: string): AppError {
  if (error instanceof AppError) return error

  if (isPostgrestError(error)) {
    return new AppError(POSTGREST_MESSAGES[error.code] ?? fallback, error)
  }

  if (isAuthError(error)) {
    const known = error.code ? AUTH_MESSAGES[error.code] : undefined
    if (known) return new AppError(known, error)

    const matched = AUTH_MESSAGE_PATTERNS.find(([pattern]) => pattern.test(error.message))
    if (matched) return new AppError(matched[1], error)

    return new AppError(error.message || fallback, error)
  }

  if (error instanceof Error) {
    return new AppError(fallback, error)
  }

  return new AppError(fallback, error)
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return typeof error === 'object' && error !== null && 'code' in error && 'details' in error
}

function isAuthError(error: unknown): error is { message: string; code?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  )
}

/** Unwraps a Supabase `{ data, error }` result or throws a user-safe error. */
export function unwrap<T>(
  result: { data: T | null; error: unknown },
  fallbackMessage: string,
): T {
  if (result.error) throw toAppError(result.error, fallbackMessage)
  if (result.data === null) throw new AppError(fallbackMessage)
  return result.data
}
