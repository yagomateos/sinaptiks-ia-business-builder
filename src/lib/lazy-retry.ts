/**
 * Recupera de un chunk desactualizado tras un despliegue.
 *
 * Cada build de Vite nombra sus archivos con un hash distinto. Si alguien
 * tiene la app abierta en el navegador cuando desplegamos, su `index.html`
 * sigue apuntando a los hashes de la build anterior — y esos archivos ya no
 * existen en el servidor. El resultado es una pantalla de error en inglés
 * («Failed to fetch dynamically imported module») que no significa nada para
 * quien la ve.
 *
 * La solución no es evitar el error, es recargar una vez: la nueva carga trae
 * el `index.html` actual, con los hashes correctos. Se guarda un aviso en
 * sessionStorage para no entrar en bucle si el fallo tiene otra causa.
 */
const RELOAD_FLAG = 'sinaptkis-chunk-reload'

export function lazyRetry<T>(factory: () => Promise<T>): () => Promise<T> {
  return () =>
    factory()
      .then((result) => {
        // Una carga que funciona confirma que los chunks están al día: se
        // rearma el aviso para que un fallo real más adelante pueda recargar.
        sessionStorage.removeItem(RELOAD_FLAG)
        return result
      })
      .catch((error: unknown) => {
        const alreadyRetried = sessionStorage.getItem(RELOAD_FLAG) === '1'

        if (!alreadyRetried && isChunkLoadError(error)) {
          sessionStorage.setItem(RELOAD_FLAG, '1')
          window.location.reload()
          // La recarga corta la ejecución; esta promesa nunca necesita resolver.
          return new Promise<T>(() => {})
        }

        throw error
      })
}

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Importing a module script failed')
  )
}
