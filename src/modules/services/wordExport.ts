import type { Lexicard } from '../types'

export function formatWordsForExport(ownerName: string, cards: Lexicard[]): string {
  const title = `PALABRAS ICA [${ownerName}]`
  const lines = cards.map((card, index) => `${index + 1}. ${card.target} = ${card.native}`)
  return [title, '', ...lines].join('\n')
}

export async function copyWordsToClipboard(ownerName: string, cards: Lexicard[]): Promise<void> {
  const text = formatWordsForExport(ownerName, cards)
  await navigator.clipboard.writeText(text)
}

export async function downloadWordsAsDocx(ownerName: string, cards: Lexicard[]): Promise<void> {
  const { Document, Packer, Paragraph, TextRun } = await import('docx')

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `PALABRAS ICA [${ownerName}]`,
                bold: true,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          ...cards.map(
            (card, index) =>
              new Paragraph({
                text: `${index + 1}. ${card.target} = ${card.native}`,
              }),
          ),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `palabras-ica-${ownerName.toLowerCase().replace(/\s+/g, '-')}.docx`
  link.click()
  URL.revokeObjectURL(url)
}

export async function downloadWordsAsPdf(ownerName: string, cards: Lexicard[]): Promise<void> {
  const { jsPDF } = await import('jspdf')

  const scale = 2
  const pageWidthPx = Math.floor(794 * scale)
  const pageHeightPx = Math.floor(1123 * scale)
  const marginPx = Math.floor(48 * scale)
  const lineHeightPx = Math.floor(24 * scale)

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('No se pudo crear el contexto del PDF')
  }

  const fontFamily = '"Nunito Sans Variable", "Figtree Variable", system-ui, sans-serif'
  const bodyFont = `${Math.floor(16 * scale)}px ${fontFamily}`
  const titleFont = `700 ${Math.floor(28 * scale)}px ${fontFamily}`

  const maxTextWidth = pageWidthPx - marginPx * 2
  context.font = bodyFont

  const wrapLine = (text: string): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let current = ''

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word
      if (context.measureText(candidate).width <= maxTextWidth) {
        current = candidate
        return
      }

      if (current) lines.push(current)
      current = word
    })

    if (current) lines.push(current)
    return lines.length ? lines : ['']
  }

  const lines: string[] = []
  cards.forEach((card, index) => {
    const rawLine = `${index + 1}. ${card.target} = ${card.native}`
    lines.push(...wrapLine(rawLine))
  })

  const titleHeight = Math.floor(42 * scale)
  const maxBodyLinesPerPage = Math.floor(
    (pageHeightPx - marginPx * 2 - titleHeight) / lineHeightPx,
  )

  const pages: HTMLCanvasElement[] = []
  let cursor = 0
  while (cursor < lines.length || pages.length === 0) {
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = pageWidthPx
    pageCanvas.height = pageHeightPx
    const pageContext = pageCanvas.getContext('2d')
    if (!pageContext) break

    pageContext.fillStyle = '#ffffff'
    pageContext.fillRect(0, 0, pageWidthPx, pageHeightPx)
    pageContext.textBaseline = 'top'
    pageContext.fillStyle = '#111827'

    if (pages.length === 0) {
      pageContext.font = titleFont
      pageContext.fillText(`PALABRAS ICA [${ownerName}]`, marginPx, marginPx)
    }

    pageContext.font = bodyFont
    let y = marginPx + titleHeight
    for (let i = 0; i < maxBodyLinesPerPage && cursor < lines.length; i += 1) {
      pageContext.fillText(lines[cursor], marginPx, y)
      y += lineHeightPx
      cursor += 1
    }

    pages.push(pageCanvas)
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  pages.forEach((pageCanvas, index) => {
    if (index > 0) pdf.addPage()
    const imageData = pageCanvas.toDataURL('image/png')
    pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight)
  })

  pdf.save(`palabras-ica-${ownerName.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}
