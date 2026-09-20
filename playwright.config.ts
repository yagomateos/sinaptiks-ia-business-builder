import { defineConfig, devices } from '@playwright/test'

/**
 * Solo cubre flujos que no dependen de credenciales reales ni escriben en
 * el backend compartido: páginas públicas, validación en cliente y
 * redirecciones de rutas protegidas. El desarrollo local de este proyecto
 * apunta al mismo Supabase desplegado que producción (ver README) — un
 * signup o login real desde un test dejaría cuentas o filas de verdad en
 * esa base de datos cada vez que se ejecutara la suite, así que esos
 * flujos (con credenciales reales) quedan fuera a propósito.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
