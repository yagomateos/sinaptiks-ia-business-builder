/**
 * Extrae texto plano de un PDF o un .docx, en el propio navegador — nada se
 * sube a ningún sitio para procesarlo. Las dos librerías son pesadas
 * (sobre todo pdf.js), así que se cargan con import() solo cuando de verdad
 * hace falta, en vez de ir en el bundle principal de la app.
 */

export async function extractPdfText(file: File): Promise<string> {
  const [pdfjsLib, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url').then((m) => m.default),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(text)
  }

  return pages.join('\n\n').replace(/[ \t]+/g, ' ').trim()
}

export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value.trim()
}
