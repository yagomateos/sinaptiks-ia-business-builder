import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    // Los tests de dominio (.test.ts) no necesitan DOM y se quedan en
    // 'node', más rápido. Los de componentes (.test.tsx) sí lo necesitan:
    // cada uno declara `// @vitest-environment jsdom` en su primera línea
    // en vez de cambiar el entorno global — así los cientos de tests de
    // lógica pura no pagan el coste de un DOM simulado.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
