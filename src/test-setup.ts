import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Sin esto, el DOM de un test de componente queda montado para el
// siguiente — un segundo `render()` en el mismo archivo encontraría los
// elementos del anterior duplicados (p. ej. dos botones con el mismo
// aria-label) en vez de solo los suyos.
afterEach(() => cleanup())
