import { drawRecapLogo, recapRoundRect } from '../monthlyRecap'

/**
 * The Wrapped ICA as one image to save or share (story size, 1080 × 1920), drawn by hand on a
 * canvas like the monthly recap, so it looks the same on every phone.
 */
export const WRAPPED_W = 1080
export const WRAPPED_H = 1920
const FONT = '"Nunito Sans", "Nunito", system-ui, sans-serif'

export type WrappedImageData = {
  year: number
  name: string
  language: string
  title: string
  stats: Array<{ value: string; label: string; color: string }>
  wordLabel: string
  word: string | null
  wordNative: string | null
  profileLabel: string
  profileName: string
  profileLetter: string
  profileColor: string
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

export function drawWrappedImage(context: CanvasRenderingContext2D, data: WrappedImageData): void {
  const bg = context.createLinearGradient(0, 0, WRAPPED_W, WRAPPED_H)
  bg.addColorStop(0, '#071f33')
  bg.addColorStop(0.45, '#0b4f70')
  bg.addColorStop(1, '#0a2238')
  context.fillStyle = bg
  context.fillRect(0, 0, WRAPPED_W, WRAPPED_H)

  // Soft glows with the colors of the method.
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = context.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = g
    context.fillRect(x - r, y - r, r * 2, r * 2)
  }
  glow(160, 260, 520, 'rgba(58,174,238,0.35)')
  glow(980, 900, 560, 'rgba(255,199,44,0.18)')
  glow(220, 1700, 600, 'rgba(162,89,240,0.22)')

  drawRecapLogo(context, WRAPPED_W / 2 - 120, 110, 0.8)

  context.textAlign = 'center'
  context.fillStyle = '#ffc72c'
  context.font = `900 44px ${FONT}`
  context.fillText(data.title.toUpperCase(), WRAPPED_W / 2, 400)
  context.fillStyle = '#ffffff'
  context.font = `900 230px ${FONT}`
  context.fillText(String(data.year), WRAPPED_W / 2, 610)
  context.fillStyle = 'rgba(255,255,255,0.85)'
  fitText(context, `${data.name} · ${data.language}`, 900, 48, 800)
  context.fillText(`${data.name} · ${data.language}`, WRAPPED_W / 2, 690)

  // Stats: two columns, three rows.
  const cardW = 450
  const cardH = 180
  const gap = 24
  const left = (WRAPPED_W - cardW * 2 - gap) / 2
  data.stats.slice(0, 6).forEach((stat, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = left + col * (cardW + gap)
    const y = 770 + row * (cardH + gap)
    context.fillStyle = 'rgba(255,255,255,0.09)'
    recapRoundRect(context, x, y, cardW, cardH, 36)
    context.fill()
    context.textAlign = 'left'
    context.fillStyle = stat.color
    fitText(context, stat.value, cardW - 70, 88)
    context.fillText(stat.value, x + 36, y + 102)
    context.fillStyle = 'rgba(255,255,255,0.82)'
    fitText(context, stat.label, cardW - 70, 36, 800)
    context.fillText(stat.label, x + 36, y + 150)
  })

  let y = 770 + 3 * (cardH + gap) + 30
  if (data.word) {
    context.textAlign = 'center'
    context.fillStyle = 'rgba(255,255,255,0.7)'
    context.font = `800 38px ${FONT}`
    context.fillText(data.wordLabel, WRAPPED_W / 2, y)
    context.fillStyle = '#ffc72c'
    const size = fitText(context, data.word, 920, 120)
    context.fillText(data.word, WRAPPED_W / 2, y + size + 10)
    if (data.wordNative) {
      context.fillStyle = 'rgba(255,255,255,0.75)'
      context.font = `700 40px ${FONT}`
      context.fillText(data.wordNative, WRAPPED_W / 2, y + size + 70)
    }
    y += size + 130
  }

  // Profile badge.
  context.textAlign = 'center'
  context.fillStyle = 'rgba(255,255,255,0.7)'
  context.font = `800 38px ${FONT}`
  context.fillText(data.profileLabel, WRAPPED_W / 2, y + 20)
  context.beginPath()
  context.arc(WRAPPED_W / 2 - 230, y + 95, 52, 0, Math.PI * 2)
  context.fillStyle = data.profileColor
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = `900 64px ${FONT}`
  context.fillText(data.profileLetter, WRAPPED_W / 2 - 230, y + 117)
  context.textAlign = 'left'
  fitText(context, data.profileName, 520, 72)
  context.fillText(data.profileName, WRAPPED_W / 2 - 160, y + 120)

  context.textAlign = 'center'
  context.fillStyle = 'rgba(255,255,255,0.6)'
  context.font = `800 34px ${FONT}`
  context.fillText(data.footer, WRAPPED_W / 2, WRAPPED_H - 70)
}
