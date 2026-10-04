// MEDALLAS DE ICADEMY (insignias)
// Adaptado del documento "Sistema de logros · ICAdemy" (v4) de Luis:
// mismo dibujo vectorial, 5 rangos (bronce → plata → oro → rubí → diamante)
// y 6 categorías. Genera el SVG de cada medalla como texto.
// Después del diamante viene la fase LEYENDA (Luis, 3 oct): metal violeta noche, aro y laurel de
// oro, 5 gemas, rayos dorados y 1, 2 o 3 estrellas encima del aro (Leyenda I, II y III).

import { t as translate } from '@/i18n'

export type MedalTier = 'bronce' | 'plata' | 'oro' | 'rubi' | 'diamante' | 'leyenda1' | 'leyenda2' | 'leyenda3'
export type MedalCategory = 'rachaICA' | 'rachaFlash' | 'ranking' | 'eficacia' | 'vocab' | 'desafios'

const CX = 80
const CY = 88
const R = 48
const DISC = 39

const rad = (degrees: number) => (degrees * Math.PI) / 180
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  cx + r * Math.cos(rad(deg)),
  cy + r * Math.sin(rad(deg)),
]
const f = (n: number) => Math.round(n * 100) / 100

function starPoints(cx: number, cy: number, ro: number, ri: number, n = 5, rot = -90): string {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i += 1) {
    const r = i % 2 === 0 ? ro : ri
    const [x, y] = polar(cx, cy, r, rot + (i * 180) / n)
    pts.push(`${f(x)},${f(y)}`)
  }
  return pts.join(' ')
}

function diamond(cx: number, cy: number, s: number): string {
  return `${f(cx)},${f(cy - s)} ${f(cx + s)},${f(cy)} ${f(cx)},${f(cy + s)} ${f(cx - s)},${f(cy)}`
}

type TierStyle = {
  metal: string
  ring: string
  studs: boolean
  laurel: boolean
  laurelStroke?: string
  gems: number
  gem?: 'rubi'
  glow: 'none' | 'soft' | 'strong'
  sparkle: boolean
  sunburst: boolean
  name: string
}

export const TIERS: Record<MedalTier, TierStyle> = {
  bronce: { metal: 'gm-cobre', ring: '#e0a05a', studs: false, laurel: false, gems: 0, glow: 'none', sparkle: false, sunburst: false, name: 'Bronce' },
  plata: { metal: 'gm-plata', ring: '#e8edf2', studs: true, laurel: false, gems: 0, glow: 'soft', sparkle: false, sunburst: false, name: 'Plata' },
  oro: { metal: 'gm-oro', ring: '#ffe38a', studs: true, laurel: true, laurelStroke: '#7a4e14', gems: 0, glow: 'soft', sparkle: false, sunburst: false, name: 'Oro' },
  rubi: { metal: 'gm-rubi', ring: '#ffb3bd', studs: true, laurel: true, laurelStroke: '#7a1420', gems: 3, gem: 'rubi', glow: 'strong', sparkle: true, sunburst: false, name: 'Rubí' },
  diamante: { metal: 'gm-diamante', ring: '#d6fbff', studs: true, laurel: true, laurelStroke: '#2b6b7a', gems: 3, glow: 'strong', sparkle: true, sunburst: true, name: 'Diamante' },
  leyenda1: { metal: 'gm-leyenda', ring: '#ffd84a', studs: true, laurel: true, laurelStroke: '#5a3a00', gems: 5, glow: 'strong', sparkle: true, sunburst: true, name: 'Leyenda I' },
  leyenda2: { metal: 'gm-leyenda', ring: '#ffd84a', studs: true, laurel: true, laurelStroke: '#5a3a00', gems: 5, glow: 'strong', sparkle: true, sunburst: true, name: 'Leyenda II' },
  leyenda3: { metal: 'gm-leyenda', ring: '#ffd84a', studs: true, laurel: true, laurelStroke: '#5a3a00', gems: 5, glow: 'strong', sparkle: true, sunburst: true, name: 'Leyenda III' },
}

/** Los 5 rangos de siempre y, después, las tres Leyendas. */
export const TIER_ORDER: MedalTier[] = ['bronce', 'plata', 'oro', 'rubi', 'diamante', 'leyenda1', 'leyenda2', 'leyenda3']
/** Solo los 5 rangos de antes de la Leyenda. */
export const BASE_TIERS: MedalTier[] = ['bronce', 'plata', 'oro', 'rubi', 'diamante']
export const LEGEND_TIERS: MedalTier[] = ['leyenda1', 'leyenda2', 'leyenda3']

/** ¿Es una de las tres Leyendas? */
export function isLegend(tier: MedalTier): boolean {
  return tier === 'leyenda1' || tier === 'leyenda2' || tier === 'leyenda3'
}

/** Estrellas de la Leyenda (0 en los demás rangos). */
export function legendStars(tier: MedalTier): number {
  return tier === 'leyenda1' ? 1 : tier === 'leyenda2' ? 2 : tier === 'leyenda3' ? 3 : 0
}

/** Nombre del rango para mostrar ("Bronce" → "Bronze" si la interfaz va en inglés). */
export function tierName(tier: MedalTier): string {
  return translate(TIERS[tier].name)
}

// Textos de cintas y pies de medalla con número ("7 DÍAS", "50 palabras"…): se guardan en
// español en el catálogo y se traducen al pintar.
const MEDAL_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/^(\d+) DÍAS$/, '{n} DÍAS'],
  [/^(\d+) días$/, '{n} días'],
  [/^(\d+) % de eficacia$/, '{n} % de eficacia'],
  [/^(\d+) palabras$/, '{n} palabras'],
  [/^(\d+) ganados$/, '{n} ganados'],
  [/^(\d+) meses al 100 %$/, '{n} meses al 100 %'],
]

/** Traduce el texto de la cinta o el pie de una medalla al pintarlo. */
export function medalText(text: string): string {
  for (const [pattern, key] of MEDAL_TEXT_PATTERNS) {
    const match = pattern.exec(text)
    if (match) return translate(key, { n: match[1] })
  }
  return translate(text)
}

function studs(): string {
  let s = ''
  for (let i = 0; i < 20; i += 1) {
    const [x, y] = polar(CX, CY, R - 3.2, (i * 360) / 20)
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="1.5" fill="#fff" opacity="0.45"/>`
  }
  return s
}

function laurel(metalId: string, stroke = '#7a4e14'): string {
  const fill = `url(#${metalId})`
  const branch = (from: number, to: number, step: number) => {
    let g = ''
    for (let a = from; step > 0 ? a <= to : a >= to; a += step) {
      const [x, y] = polar(CX, CY, R + 8, a)
      g += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="7" ry="3.2" fill="${fill}" stroke="${stroke}" stroke-width="0.6" transform="rotate(${f(a + 92)} ${f(x)} ${f(y)})"/>`
    }
    return g
  }
  const [bx, by] = polar(CX, CY, R + 8, 90)
  return `<g opacity="0.95">${branch(98, 170, 12)}${branch(82, 10, -12)}<circle cx="${f(bx)}" cy="${f(by)}" r="3" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/></g>`
}

function gemsRing(count: number, kind?: 'rubi'): string {
  const spots = count === 5 ? [162, 18, 126, 54, 90] : count === 3 ? [152, 28, 90] : count === 2 ? [152, 28] : []
  const colors = kind === 'rubi' ? ['#ff3b5c', '#ff6d84', '#e02347'] : count === 5 ? ['#ff3b5c', '#ff3b5c', '#5db8ff', '#5db8ff', '#7dffc4'] : ['#ff5d73', '#5db8ff', '#7dffc4']
  return spots
    .map((a, i) => {
      const [x, y] = polar(CX, CY, R - 0.5, a)
      return `<polygon points="${diamond(x, y, 4.2)}" fill="${colors[count === 5 ? i : i % 3]}" stroke="#fff" stroke-width="0.7" opacity="0.95"/><polygon points="${diamond(x, y - 0.6, 2.1)}" fill="#fff" opacity="0.6"/>`
    })
    .join('')
}

function sparkles(): string {
  const pts: Array<[number, number, number]> = [[120, 50, 5], [42, 62, 4], [122, 112, 3.5], [40, 118, 3]]
  return pts
    .map(([x, y, s]) => `<path d="M${x} ${y - s} L${x + s * 0.32} ${y - s * 0.32} L${x + s} ${y} L${x + s * 0.32} ${y + s * 0.32} L${x} ${y + s} L${x - s * 0.32} ${y + s * 0.32} L${x - s} ${y} L${x - s * 0.32} ${y - s * 0.32} Z" fill="#fff" opacity="0.9"/>`)
    .join('')
}

function sunburst(gold = false): string {
  let rays = ''
  const n = 28
  for (let i = 0; i < n; i += 1) {
    const a = (i * 360) / n
    const long = i % 2 === 0
    const rout = long ? R + (gold ? 40 : 34) : R + (gold ? 24 : 20)
    const [x1, y1] = polar(CX, CY, R + 4, a - 2.4)
    const [x2, y2] = polar(CX, CY, R + 4, a + 2.4)
    const [xt, yt] = polar(CX, CY, rout, a)
    rays += `<polygon points="${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(xt)},${f(yt)}" fill="url(#${gold ? 'g-legend-rays' : 'g-holo'})" opacity="${long ? (gold ? 0.75 : 0.55) : gold ? 0.45 : 0.32}"/>`
  }
  return `<g class="ica-sunburst">${rays}</g>`
}

const EMBLEM = {
  // Las dos rachas usan la misma llama que la app (FlameIcon): naranja la ICA y azul la de
  // flashcards (con una tarjeta detrás para distinguirla también sin color).
  fuego: () => `
    <g transform="translate(47.6 53.6) scale(2.7)">
      <path d="M12 1.8c.7 3.3-1.1 5.1-2.7 6.8-1.6 1.7-3.1 3.5-3.1 6.4 0 3.9 2.6 7.2 5.8 7.2s5.8-3.3 5.8-7.2c0-2.7-1.2-4.5-2.4-5.9-.3 1.4-1.1 2.3-2.1 2.7.5-3.4-.2-7-1.3-10z" fill="url(#e-fuego)" stroke="#7a2b0a" stroke-width="0.45" stroke-linejoin="round"/>
      <path d="M12 12.2c-1.7 1.5-2.7 2.8-2.7 4.5 0 1.9 1.2 3.4 2.7 3.4s2.7-1.5 2.7-3.4c0-1.3-.6-2.3-1.4-3-.2.7-.6 1.2-1.1 1.4.2-1.1-.1-2.1-.2-2.9z" fill="#fff3c4" opacity="0.9"/>
    </g>`,
  tarjeta: () => `
    <g transform="rotate(-10 66 100)">
      <rect x="50" y="86" width="34" height="26" rx="5" fill="url(#e-card)" stroke="#1d4ed8" stroke-width="1.3"/>
      <line x1="56" y1="96" x2="76" y2="96" stroke="#1d4ed8" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="56" y1="103" x2="71" y2="103" stroke="#3b82f6" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>
    </g>
    <g transform="translate(57.4 54) scale(2.45)">
      <path d="M12 1.8c.7 3.3-1.1 5.1-2.7 6.8-1.6 1.7-3.1 3.5-3.1 6.4 0 3.9 2.6 7.2 5.8 7.2s5.8-3.3 5.8-7.2c0-2.7-1.2-4.5-2.4-5.9-.3 1.4-1.1 2.3-2.1 2.7.5-3.4-.2-7-1.3-10z" fill="url(#e-flash)" stroke="#1e3a8a" stroke-width="0.5" stroke-linejoin="round"/>
      <path d="M12 12.2c-1.7 1.5-2.7 2.8-2.7 4.5 0 1.9 1.2 3.4 2.7 3.4s2.7-1.5 2.7-3.4c0-1.3-.6-2.3-1.4-3-.2.7-.6 1.2-1.1 1.4.2-1.1-.1-2.1-.2-2.9z" fill="#e0f2ff" opacity="0.92"/>
    </g>`,
  // Libro «cute» de la app (BookGlyph) en blanco y beige (Luis: nada de verde, colores suaves).
  libro: () => `
    <g transform="translate(51.2 59.5) scale(2.4)">
      <path d="M12 6.4C9.7 4.8 6.5 4.3 2.6 4.7v13.6c3.9-.4 7.1.1 9.4 1.7z" fill="#FFF8EC"/>
      <path d="M12 6.4c2.3-1.6 5.5-2.1 9.4-1.7v13.6c-3.9-.4-7.1.1-9.4 1.7z" fill="#EBD5B0"/>
      <path d="M12 6.4V20" stroke="#B88A55" stroke-width="1.3" stroke-linecap="round"/>
      <g stroke="#C9A06A" stroke-width="1.5" stroke-linecap="round">
        <path d="M14.4 9.3c1.5-.6 3-.8 4.6-.7"/>
        <path d="M14.4 12.4c1.5-.6 3-.8 4.6-.7" opacity="0.75"/>
      </g>
      <g stroke="#D9BE96" stroke-width="1.5" stroke-linecap="round">
        <path d="M9.6 9.3c-1.5-.6-3-.8-4.6-.7"/>
        <path d="M9.6 12.4c-1.5-.6-3-.8-4.6-.7"/>
      </g>
    </g>`,
  diana: () => `
    <circle cx="80" cy="88" r="22" fill="#ffffff" stroke="#9aa7b0" stroke-width="1.2"/>
    <circle cx="80" cy="88" r="15.5" fill="#12303b"/>
    <circle cx="80" cy="88" r="9.5" fill="#ffffff"/>
    <circle cx="80" cy="88" r="4" fill="#ef4444"/>
    <line x1="52" y1="116" x2="80" y2="88" stroke="#5c3a1a" stroke-width="4.6" stroke-linecap="round"/>
    <line x1="52" y1="116" x2="80" y2="88" stroke="#8b5a2b" stroke-width="2.6" stroke-linecap="round"/>
    <polygon points="80,88 76.8,97.6 70.4,91.2" fill="#ffffff" stroke="#9aa7b0" stroke-width="0.8" stroke-linejoin="round"/>
    <path d="M50 119 L56 111.5 M50 119 L57.5 116" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>`,
  // Las espadas «cute» de Desafíos ICA (SwordsIcon de la app), siempre del mismo color.
  espadas: () => {
    const sword = `
      <path d="M12 1.6 14 4.3v9.5h-4V4.3z" fill="#E2E8F0" stroke="#94A3B8" stroke-width="0.8" stroke-linejoin="round"/>
      <path d="M12 3v10.6" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round"/>
      <rect x="7.6" y="13.5" width="8.8" height="2.2" rx="1.1" fill="#FFC72C" stroke="#D99A00" stroke-width="0.6"/>
      <rect x="11" y="15.6" width="2" height="4.2" rx="0.6" fill="#8E4717"/>
      <circle cx="12" cy="20.6" r="1.5" fill="#FFC72C" stroke="#D99A00" stroke-width="0.6"/>`
    return `<g transform="translate(51.2 59.5) scale(2.4)">
      <g transform="translate(12 12) scale(0.92) rotate(-42) translate(-12 -12)">${sword}</g>
      <g transform="translate(12 12) scale(0.92) rotate(42) translate(-12 -12)">${sword}</g>
    </g>`
  },
  // La copa de la app (TrophyIcon), siempre dorada y sin estrella: las estrellas son de la Leyenda.
  copa: () => `
    <g transform="translate(52.4 64.6) scale(2.3)">
      <path d="M6.2 5.4H4.1a1 1 0 0 0-1 1.1c.25 2.3 1.6 3.8 3.7 4.2" fill="none" stroke="#E0A500" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M17.8 5.4h2.1a1 1 0 0 1 1 1.1c-.25 2.3-1.6 3.8-3.7 4.2" fill="none" stroke="#E0A500" stroke-width="1.9" stroke-linecap="round"/>
      <rect x="10.5" y="12.5" width="3" height="4.4" fill="#E0A500"/>
      <rect x="7.2" y="16.2" width="9.6" height="2.6" rx="1.1" fill="#E0A500"/>
      <rect x="6.2" y="18.4" width="11.6" height="3.4" rx="1.3" fill="#B7791F"/>
      <path d="M5.8 2.6h12.4v5a6.2 6.2 0 0 1-12.4 0z" fill="#FFC72C"/>
      <path d="M8.3 4.4v3a3.6 3.6 0 0 0 1.6 3" fill="none" stroke="#FFF1B8" stroke-width="1.5" stroke-linecap="round"/>
    </g>`,
}

/** Estrellas de la Leyenda encima del aro (1, 2 o 3), separadas entre sí. */
function ringStars(n: number): string {
  const angles = n === 1 ? [-90] : n === 2 ? [-106, -74] : [-122, -90, -58]
  return angles
    .map((a, index) => {
      const [x, y] = polar(CX, CY, R, a)
      return `<g class="ica-legend-star" data-star="${index}"><polygon points="${starPoints(x, y, 10.5, 4.6)}" fill="url(#g-crown)" stroke="#5a3a00" stroke-width="1.6" stroke-linejoin="round"/><polygon points="${starPoints(x, y - 1, 4.5, 2)}" fill="#fff" opacity="0.5"/></g>`
    })
    .join('')
}

const CATEGORY_STYLE: Record<MedalCategory, { disc: string; accent: string; ribbonGrad: string; ribbonDark: string }> = {
  rachaICA: { disc: 'gd-ica', accent: '#f97316', ribbonGrad: 'rb-ica', ribbonDark: '#7c2d12' },
  rachaFlash: { disc: 'gd-flash', accent: '#6366f1', ribbonGrad: 'rb-flash', ribbonDark: '#312e81' },
  vocab: { disc: 'gd-vocab', accent: '#10b981', ribbonGrad: 'rb-vocab', ribbonDark: '#064e3b' },
  desafios: { disc: 'gd-desafio', accent: '#f59e0b', ribbonGrad: 'rb-desafio', ribbonDark: '#7c2d12' },
  eficacia: { disc: 'gd-eficacia', accent: '#14b8a6', ribbonGrad: 'rb-eficacia', ribbonDark: '#0f766e' },
  ranking: { disc: 'gd-rank', accent: '#d4af37', ribbonGrad: 'rb-rank', ribbonDark: '#3f2d12' },
}

function emblemFor(category: MedalCategory): string {
  switch (category) {
    case 'rachaICA':
      return EMBLEM.fuego()
    case 'rachaFlash':
      return EMBLEM.tarjeta()
    case 'vocab':
      return EMBLEM.libro()
    case 'desafios':
      return EMBLEM.espadas()
    case 'eficacia':
      return EMBLEM.diana()
    case 'ranking':
      return EMBLEM.copa()
  }
}

/** Brillo animado de los dos rangos más altos (siempre, también en las que aún no tienes). */
function shine(tier: MedalTier): string {
  const dur = tier === 'diamante' ? '2.6s' : '3.4s'
  const stars: Array<[number, number, number, string]> =
    tier === 'diamante'
      ? [[118, 44, 7, '0s'], [36, 70, 5.5, '0.7s'], [126, 118, 5, '1.3s'], [52, 128, 4, '1.9s']]
      : [[118, 46, 6, '0.2s'], [40, 116, 5, '1.2s']]
  const star = (x: number, y: number, r: number) =>
    `M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`
  return `<g class="ica-medal-shine">
    <g clip-path="url(#clip-medal)">
      <g transform="skewX(-22)">
        <rect x="-70" y="30" width="30" height="120" fill="url(#g-shine)">
          <animate attributeName="x" values="-70;-70;190" keyTimes="0;0.5;1" dur="${dur}" repeatCount="indefinite"/>
        </rect>
      </g>
    </g>
    ${stars
      .map(
        ([x, y, r, begin]) => `<path d="${star(x, y, r)}" fill="#ffffff" opacity="0">
      <animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="${begin}" repeatCount="indefinite"/>
    </path>`,
      )
      .join('')}
  </g>`
}

/** SVG completo de una medalla (viewBox 160 × 190). */
export function buildMedalSvg(
  category: MedalCategory,
  tier: MedalTier,
  ribbon: string,
  label: string,
  compact = false,
): string {
  const t = TIERS[tier]
  const c = CATEGORY_STYLE[category]
  const glowR = t.glow === 'strong' ? 13 : t.glow === 'soft' ? 8 : 0
  const glowOp = t.glow === 'strong' ? 0.6 : 0.32
  // Versión compacta (para filas del ranking): sin cinta debajo; el texto va dentro de la medalla.
  const viewBox = compact ? '18 26 124 124' : '0 0 160 190'
  let svg = `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" style="width:100%;height:auto;display:block;overflow:visible">`
  const legend = isLegend(tier)
  if (t.sunburst) svg += sunburst(legend)
  if (glowR) svg += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${legend ? '#ffcf3a' : c.accent}" opacity="${legend ? 0.75 : glowOp}" filter="url(#f-glow)"/>`
  if (t.laurel) svg += laurel(legend ? 'gm-oro' : t.metal, t.laurelStroke)
  svg += `<g filter="url(#f-shadow)">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${t.metal})" stroke="#00000066" stroke-width="1.5"/>
    <circle cx="${CX}" cy="${CY}" r="${R - 2}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.35"/>
    <circle cx="${CX}" cy="${CY}" r="${DISC}" fill="url(#${c.disc})" stroke="#00000055" stroke-width="1.2"/>
    <circle cx="${CX}" cy="${CY}" r="${DISC}" fill="none" stroke="${t.ring}" stroke-width="1" opacity="0.5"/>
  </g>`
  svg += `<ellipse cx="${CX}" cy="${CY - R + 12}" rx="26" ry="9" fill="#ffffff" opacity="0.18"/>`
  if (t.studs) svg += studs()
  svg += `<g clip-path="url(#clip-disc)">${emblemFor(category)}</g>`
  if (t.gems) svg += gemsRing(t.gems, t.gem)
  if (t.sparkle) svg += sparkles()
  // Rubí y diamante brillan: un destello cruza la medalla y aparecen estrellitas.
  if (tier === 'rubi' || tier === 'diamante' || legend) svg += shine(legend ? 'diamante' : tier)
  if (legend) svg += ringStars(legendStars(tier))
  if (compact) {
    svg += `
    <g filter="url(#f-shadow)">
      <rect x="26" y="106" width="108" height="30" rx="15" fill="url(#${c.ribbonGrad})" stroke="#00000066" stroke-width="1"/>
    </g>
    <text x="80" y="121.5" text-anchor="middle" dominant-baseline="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="20" fill="#fff8ef" textLength="${Math.min(98, medalText(ribbon).length * 13)}" lengthAdjust="spacingAndGlyphs">${medalText(ribbon)}</text>
  </svg>`
    return svg
  }
  svg += `
    <g filter="url(#f-shadow)">
      <polygon points="30,130 12,137 22,144 12,151 30,155" fill="${c.ribbonDark}" stroke="#00000055" stroke-width="0.8"/>
      <polygon points="130,130 148,137 138,144 148,151 130,155" fill="${c.ribbonDark}" stroke="#00000055" stroke-width="0.8"/>
      <rect x="27" y="128" width="106" height="29" rx="6" fill="url(#${c.ribbonGrad})" stroke="#00000055" stroke-width="1"/>
      <rect x="27" y="131" width="106" height="7" rx="4" fill="#ffffff" opacity="0.22"/>
    </g>
    <text x="80" y="143.5" text-anchor="middle" dominant-baseline="middle" font-family="Cinzel, Georgia, serif" font-weight="700" letter-spacing="0.5" font-size="15" fill="#fff8ef">${medalText(ribbon)}</text>
  </svg>`
  return svg
}

/** Degradados y filtros que usan todas las medallas. Se pinta una vez por pantalla. */
export const MEDAL_DEFS_SVG = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="gm-cobre" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4c48a"/><stop offset=".45" stop-color="#c67c3e"/><stop offset="1" stop-color="#7c4a1e"/></linearGradient>
  <linearGradient id="gm-plata" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#cbd3db"/><stop offset="1" stop-color="#838d99"/></linearGradient>
  <linearGradient id="gm-oro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".45" stop-color="#f2c230"/><stop offset="1" stop-color="#a9760a"/></linearGradient>
  <linearGradient id="gm-leyenda" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b7bff"/><stop offset=".45" stop-color="#3b1f8f"/><stop offset="1" stop-color="#140a3a"/></linearGradient>
  <linearGradient id="g-legend-rays" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#ffc72c"/><stop offset="1" stop-color="#b07cff"/></linearGradient>
  <linearGradient id="gm-diamante" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2ffff"/><stop offset=".4" stop-color="#a8ecf7"/><stop offset="1" stop-color="#4fb4cf"/></linearGradient>
  <linearGradient id="gm-rubi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd3d9"/><stop offset=".42" stop-color="#e0324f"/><stop offset="1" stop-color="#8c0f24"/></linearGradient>
  <radialGradient id="gd-ica" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#3a1e13"/><stop offset="1" stop-color="#150c08"/></radialGradient>
  <radialGradient id="gd-flash" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#1b2748"/><stop offset="1" stop-color="#0c1120"/></radialGradient>
  <radialGradient id="gd-rank" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#2a2213"/><stop offset="1" stop-color="#12100a"/></radialGradient>
  <radialGradient id="gd-vocab" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#123324"/><stop offset="1" stop-color="#0a1610"/></radialGradient>
  <radialGradient id="gd-desafio" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#33200f"/><stop offset="1" stop-color="#160c07"/></radialGradient>
  <radialGradient id="gd-eficacia" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#0e3a37"/><stop offset="1" stop-color="#071a19"/></radialGradient>
  <linearGradient id="rb-ica" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#ea580c"/></linearGradient>
  <linearGradient id="rb-flash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#4f46e5"/></linearGradient>
  <linearGradient id="rb-rank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4af37"/><stop offset="1" stop-color="#a67c1a"/></linearGradient>
  <linearGradient id="rb-vocab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#059669"/></linearGradient>
  <linearGradient id="rb-desafio" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient>
  <linearGradient id="rb-eficacia" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0d9488"/></linearGradient>
  <linearGradient id="e-fuego" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset=".5" stop-color="#fb7c1e"/><stop offset="1" stop-color="#ea580c"/></linearGradient>
  <linearGradient id="e-card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef2ff"/><stop offset="1" stop-color="#c7d2fe"/></linearGradient>
  <linearGradient id="e-flash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3ff"/><stop offset=".45" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
  <linearGradient id="e-spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5f3fc"/><stop offset="1" stop-color="#6366f1"/></linearGradient>
  <linearGradient id="e-page" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecfdf5"/><stop offset="1" stop-color="#a7f3d0"/></linearGradient>
  <linearGradient id="g-crown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f0c020"/><stop offset="1" stop-color="#b8860b"/></linearGradient>
  <linearGradient id="g-holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6ec4"/><stop offset=".3" stop-color="#ffd36b"/><stop offset=".6" stop-color="#7cf5c0"/><stop offset="1" stop-color="#c08bff"/></linearGradient>
  <filter id="f-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000" flood-opacity="0.5"/></filter>
  <filter id="f-glow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="5"/></filter>
  <clipPath id="clip-disc"><circle cx="80" cy="88" r="38"/></clipPath>
  <clipPath id="clip-medal"><circle cx="80" cy="88" r="48"/></clipPath>
  <linearGradient id="g-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0.75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
</defs></svg>`
