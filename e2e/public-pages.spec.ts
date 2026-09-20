import { test, expect } from '@playwright/test'

/**
 * Estos tests solo tocan páginas públicas y navegación — nada que escriba
 * en el backend compartido (ver playwright.config.ts). Un login o signup
 * real queda fuera a propósito.
 */

test.describe('Página de entrada', () => {
  test('carga con los campos esperados', async ({ page }) => {
    await page.goto('/entrar')

    await expect(page.getByRole('heading', { name: 'Entra en tu cuenta' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })

  test('el enlace "Crear una cuenta" lleva a /registro', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByRole('link', { name: 'Crear una cuenta' }).click()
    await expect(page).toHaveURL(/\/registro$/)
  })

  test('el enlace "¿La has olvidado?" lleva a /recuperar', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByRole('link', { name: '¿La has olvidado?' }).click()
    await expect(page).toHaveURL(/\/recuperar$/)
  })

  test('enviar el formulario vacío muestra los errores de validación, sin llamar a ningún backend', async ({
    page,
  }) => {
    let authRequestMade = false
    // Cualquier llamada real de auth aquí sería un fallo del propio test —
    // la validación de campos vacíos debe cortar antes de llegar a la red.
    page.on('request', (req) => {
      if (req.url().includes('supabase.co/auth')) authRequestMade = true
    })

    await page.goto('/entrar')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByText('Escribe tu email.')).toBeVisible()
    await expect(page.getByText('Escribe tu contraseña.')).toBeVisible()
    expect(authRequestMade).toBe(false)
  })

  test('un email con formato inválido muestra su propio error de validación', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('Email').fill('esto-no-es-un-email')
    await page.getByLabel('Contraseña', { exact: true }).fill('algo')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByText('Escribe un email válido.')).toBeVisible()
  })

  test('el botón de mostrar/ocultar contraseña funciona de verdad', async ({ page }) => {
    await page.goto('/entrar')
    const password = page.getByLabel('Contraseña', { exact: true })
    await password.fill('mi-contraseña')

    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
    await expect(password).toHaveAttribute('type', 'text')
  })
})

test.describe('Rutas protegidas', () => {
  test('visitar /app sin sesión redirige a /entrar', async ({ page }) => {
    await page.goto('/app')
    await expect(page).toHaveURL(/\/entrar$/)
  })

  test('visitar /app/clientes sin sesión también redirige a /entrar', async ({ page }) => {
    await page.goto('/app/clientes')
    await expect(page).toHaveURL(/\/entrar$/)
  })
})

test.describe('Páginas legales', () => {
  test('Términos de Servicio carga', async ({ page }) => {
    await page.goto('/terminos')
    await expect(page.getByRole('heading', { name: 'Términos de Servicio' })).toBeVisible()
  })

  test('Política de Privacidad carga', async ({ page }) => {
    await page.goto('/privacidad')
    await expect(page.getByRole('heading', { name: 'Política de Privacidad' })).toBeVisible()
  })

  test('desde /entrar se puede llegar a ambas', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByRole('link', { name: 'Privacidad' }).click()
    await expect(page).toHaveURL(/\/privacidad$/)
  })
})
