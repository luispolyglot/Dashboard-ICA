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

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 50
  let y = 60

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.text(`PALABRAS ICA [${ownerName}]`, left, y)
  y += 28

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(12)

  cards.forEach((card, index) => {
    const line = `${index + 1}. ${card.target} = ${card.native}`
    const wrapped = pdf.splitTextToSize(line, 500)

    if (y > 780) {
      pdf.addPage()
      y = 60
    }

    pdf.text(wrapped, left, y)
    y += wrapped.length * 16
  })

  pdf.save(`palabras-ica-${ownerName.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}
