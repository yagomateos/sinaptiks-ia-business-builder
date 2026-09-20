import { assertEquals, assertInstanceOf } from 'jsr:@std/assert@1'
import { HttpError, type AuthContext } from './auth.ts'
import { assertRateLimit } from './rate-limit.ts'

function fakeCtx(rpcResult: { data?: boolean; error?: unknown }): AuthContext {
  return {
    userId: 'user-1',
    // deno-lint-ignore no-explicit-any
    db: { rpc: async () => rpcResult } as any,
  }
}

Deno.test('assertRateLimit: permitido -> no lanza', async () => {
  const ctx = fakeCtx({ data: true })
  await assertRateLimit(ctx, 'ai', 30, 60)
})

Deno.test('assertRateLimit: por encima del límite -> HttpError 429', async () => {
  const ctx = fakeCtx({ data: false })

  try {
    await assertRateLimit(ctx, 'ai', 30, 60)
    throw new Error('no debería haber resuelto')
  } catch (error) {
    assertInstanceOf(error, HttpError)
    assertEquals(error.status, 429)
  }
})

Deno.test('assertRateLimit: si la propia comprobación falla, deja pasar (fail-open)', async () => {
  const ctx = fakeCtx({ error: new Error('la función todavía no existe en este entorno') })
  // No debe lanzar: un fallo comprobando el límite no puede bloquear a un
  // usuario legítimo.
  await assertRateLimit(ctx, 'ai', 30, 60)
})
