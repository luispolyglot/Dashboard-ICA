import { drawRecapLogo, recapRoundRect } from '../monthlyRecap'

/**
 * The result of the Repaso as one image to save or share in ICADEMY (story size, 1080 × 1920),
 * drawn by hand on a canvas like the monthly recap and the Wrapped, so it looks the same on every phone.
 */
export const REVIEW_IMAGE_W = 1080
export const REVIEW_IMAGE_H = 1920
const FONT = '"Nunito Sans", "Nunito", system-ui, sans-serif'

export type ReviewImageData = {
  /** «Repaso de octubre» */
  title: string
  name: string
  language: string
  rememberedOfTen: number
  /** «Recuerdo» */
  lead: string
  /** «de cada 10 de mis palabras ICA» */
  caption: string
  rounds: Array<{ label: string; value: string; share: number; color: string }>
  /** «Comparte tu logro en ICADEMY» */
  cta: string
  footer: string
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = 900): number {
  let current = size
  context.font = `${weight} ${current}px ${FONT}`
  while (context.measureText(text).width > maxWidth && current > 28) {
    current -= 4
    context.font = `${weight} ${current}px ${FONT}`
  }
  return current
}

export function drawReviewImage(context: CanvasRenderingContext2D, data: ReviewImageData): void {
  const W = REVIEW_IMAGE_W
  const H = REVIEW_IMAGE_H
  const bg = context.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#071f33')
  bg.addColorStop(0.45, '#0b4f70')
  bg.addColorStop(1, '#0a2238')
  context.fillStyle = bg
  context.fillRect(0, 0, W, H)

  const glow = (x: number, y: number, r: number, color: string) => {
    const g = context.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = g
    context.fillRect(x - r, y - r, r * 2, r * 2)
  }
  glow(180, 300, 520, 'rgba(58,174,238,0.35)')
  glow(960, 980, 560, 'rgba(255,199,44,0.2)')
  glow(220, 1640, 600, 'rgba(59,130,246,0.25)')

  drawRecapLogo(context, W / 2 - 120, 110, 0.8)

  context.textAlign = 'center'
  context.fillStyle = '#ffc72c'
  fitText(context, data.title.toUpperCase(), 940, 50)
  context.fillText(data.title.toUpperCase(), W / 2, 420)
  context.fillStyle = 'rgba(255,255,255,0.85)'
  const who = data.name ? `${data.name} · ${data.language}` : data.language
  fitText(context, who, 900, 46, 800)
  context.fillText(who, W / 2, 490)

  // «Recuerdo  9  de cada 10 …»
  context.fillStyle = 'rgba(255,255,255,0.8)'
  context.font = `800 54px ${FONT}`
  context.fillText(data.lead, W / 2, 650)
  context.fillStyle = '#ffffff'
  context.font = `900 400px ${FONT}`
  context.fillText(String(data.rememberedOfTen), W / 2, 1000)
  context.fillStyle = 'rgba(255,255,255,0.9)'
  fitText(context, data.caption, 900, 54, 800)
  context.fillText(data.caption, W / 2, 1090)

  // Ten dots: as many lit as words remembered.
  const dot = 40
  const gap = 24
  const rowW = 10 * dot + 9 * gap
  const startX = (W - rowW) / 2 + dot / 2
  for (let index = 0; index < 10; index += 1) {
    context.beginPath()
    context.arc(startX + index * (dot + gap), 1170, dot / 2, 0, Math.PI * 2)
    context.fillStyle = index < data.rememberedOfTen ? '#ffc72c' : 'rgba(255,255,255,0.18)'
    context.fill()
  }

  // One bar per round.
  const cardX = 90
  const cardW = W - cardX * 2
  data.rounds.slice(0, 3).forEach((round, index) => {
    const y = 1290 + index * 150
    context.fillStyle = 'rgba(255,255,255,0.09)'
    recapRoundRect(context, cardX, y, cardW, 124, 36)
    context.fill()
    context.textAlign = 'left'
    context.fillStyle = 'rgba(255,255,255,0.92)'
    context.font = `800 40px ${FONT}`
    context.fillText(round.label, cardX + 40, y + 56)
    context.textAlign = 'right'
    context.fillStyle = round.color
    context.font = `900 46px ${FONT}`
    context.fillText(round.value, cardX + cardW - 40, y + 60)
    const barX = cardX + 40
    const barW = cardW - 80
    context.fillStyle = 'rgba(255,255,255,0.14)'
    recapRoundRect(context, barX, y + 82, barW, 16, 8)
    context.fill()
    if (round.share > 0) {
      context.fillStyle = round.color
      recapRoundRect(context, barX, y + 82, Math.max(16, barW * Math.min(1, round.share)), 16, 8)
      context.fill()
    }
  })

  context.textAlign = 'center'
  context.fillStyle = '#ffc72c'
  context.font = `900 46px ${FONT}`
  context.fillText(data.cta, W / 2, 1790)
  context.fillStyle = 'rgba(255,255,255,0.7)'
  context.font = `800 38px ${FONT}`
  context.fillText(data.footer, W / 2, 1855)
}
