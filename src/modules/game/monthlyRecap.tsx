import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { DownloadIcon, Share2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthContext'
import { useDashboardContext } from '../context/DashboardContext'
import { DASHBOARD_ROUTES } from '../routes/paths'
import { ICA_LETTERS_PATH } from './icaLogoPath'
import { fetchMonthlySnapshotLeaderboard, fetchMonthlyStreakLeaderboard } from '../services/leaderboard'
import { fetchMyMonthlyAnalytics, type MonthlyAnalyticsKpis } from '../services/myAnalytics'
import { closedMonthEfficacy, monthEfficacy, rowTotalPoints } from './rankingMath'
import { gameSfx } from './sfx'
import { t, uiLocale } from '@/i18n'

// RESUMEN DEL MES: todo lo que has conseguido en el mes, en grande.
// Sale solo una vez al mes, el día 28 (cuando cierra el ranking), y se puede volver
// a abrir desde Estadísticas.

const RANKING_HISTORY_START = '2026-05-01'
const OPEN_EVENT = 'ica:open-monthly-recap'
const SHOWN_PREFIX = 'ica-monthly-recap-shown-v1:'
export const RECAP_DAY = 28

const monthNameFormatter = new Intl.DateTimeFormat(uiLocale(), { month: 'long' })
const pointsFormatter = new Intl.NumberFormat(uiLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function localMonthStart(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function monthLabel(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number)
  return monthNameFormatter.format(new Date(year, (month || 1) - 1, 1))
}

export type MonthSummary = {
  kpis: MonthlyAnalyticsKpis | null
  cycleDays: number
  flashDays: number
  rank: number | null
  points: number | null
  efficacy: number | null
  /** First-try correct answers in the daily challenge (days 1 to 28): the ranking tie-break. */
  dailyGameCorrect: number | null
  loading: boolean
  error: string | null
}

/** Datos reales de un mes: actividad, días de ciclo ICA y tu fila del ranking. */
export function useMonthSummary(monthStart: string | null, refreshKey = 0): MonthSummary {
  const { user } = useAuth()
  const { config, creationDays, completedDays } = useDashboardContext()
  const [state, setState] = useState<Omit<MonthSummary, 'cycleDays' | 'flashDays'>>({
    kpis: null,
    rank: null,
    points: null,
    efficacy: null,
    dailyGameCorrect: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!monthStart || !user?.id || !config) return
    let active = true
    const [year, month] = monthStart.split('-').map(Number)
    const monthCode = `${String(month).padStart(2, '0')}${year}`
    const isCurrent = monthStart === localMonthStart()
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const rankingPromise = (async () => {
      if (monthStart < RANKING_HISTORY_START) return null
      try {
        const rows = isCurrent
          ? await fetchMonthlyStreakLeaderboard(250)
          : await fetchMonthlySnapshotLeaderboard(monthStart, 400)
        const index = rows.findIndex((row) => row.user_id === user.id)
        if (index < 0) return null
        const row = rows[index]
        const dayCap = isCurrent ? Math.min(new Date().getDate(), RECAP_DAY) : RECAP_DAY
        return {
          rank: row.rank || index + 1,
          points: rowTotalPoints(row),
          efficacy: isCurrent ? monthEfficacy(row, dayCap, monthStart) : closedMonthEfficacy(row, monthStart),
          dailyGameCorrect: row.daily_game_correct ?? null,
        }
      } catch {
        return null
      }
    })()

    void Promise.all([
      fetchMyMonthlyAnalytics(monthCode, user.id, config.targetLang, config.nativeLang),
      rankingPromise,
    ])
      .then(([kpis, ranking]) => {
        if (!active) return
        setState({
          kpis,
          rank: ranking?.rank ?? null,
          points: ranking?.points ?? null,
          efficacy: ranking?.efficacy ?? null,
          dailyGameCorrect: ranking?.dailyGameCorrect ?? null,
          loading: false,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : t('No se pudo cargar el mes.'),
        }))
      })
    return () => {
      active = false
    }
  }, [config, monthStart, refreshKey, user?.id])

  const prefix = monthStart ? monthStart.slice(0, 7) : ''
  return {
    ...state,
    cycleDays: prefix ? creationDays.filter((day) => day.startsWith(prefix)).length : 0,
    flashDays: prefix ? completedDays.filter((day) => day.startsWith(prefix)).length : 0,
  }
}

/** Abre el resumen de un mes (por ejemplo, desde Estadísticas). */
export function openMonthlyRecap(monthStart: string): void {
  window.dispatchEvent(new CustomEvent<string>(OPEN_EVENT, { detail: monthStart }))
}

// ---------------------------------------------------------------------------
// La imagen del recap (la misma que se ve y la que se descarga para compartir)
// ---------------------------------------------------------------------------

const RECAP_W = 1080
const RECAP_H = 1350
const RECAP_FONT = '"Nunito Sans", "Nunito", system-ui, sans-serif'
const FLAME_OUTER =
  'M12 1.8c.7 3.3-1.1 5.1-2.7 6.8-1.6 1.7-3.1 3.5-3.1 6.4 0 3.9 2.6 7.2 5.8 7.2s5.8-3.3 5.8-7.2c0-2.7-1.2-4.5-2.4-5.9-.3 1.4-1.1 2.3-2.1 2.7.5-3.4-.2-7-1.3-10z'
const FLAME_INNER =
  'M12 12.2c-1.7 1.5-2.7 2.8-2.7 4.5 0 1.9 1.2 3.4 2.7 3.4s2.7-1.5 2.7-3.4c0-1.3-.6-2.3-1.4-3-.2.7-.6 1.2-1.1 1.4.2-1.1-.1-2.1-.2-2.9z'

type RecapStat = { value: string; label: string; color: string }

/** Dibuja el logo ICA (marco, birrete y letras, como IcaLogo) en blanco. Mide 300 × 210 por `scale`. */
export function drawRecapLogo(context: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  context.save()
  context.translate(x, y)
  context.scale(scale, scale)
  context.strokeStyle = '#ffffff'
  context.fillStyle = '#ffffff'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = 12
  context.stroke(new Path2D('M44 186 Q14 183 14 152 L14 78 Q14 50 42 50 L258 50 Q286 50 286 78 L286 152 Q286 183 256 186'))
  context.save()
  context.translate(150, 30)
  context.fill(new Path2D('M-34 6 L-34 28 Q0 44 34 28 L34 6 L0 18 Z'))
  const board = new Path2D('M0 -26 L58 -4 L0 18 L-58 -4 Z')
  context.lineWidth = 5
  context.strokeStyle = '#0b5577'
  context.stroke(board)
  context.fill(board)
  context.strokeStyle = '#ffffff'
  context.lineWidth = 4
  context.stroke(new Path2D('M44 0 L44 26'))
  context.beginPath()
  context.roundRect(38, 24, 12, 16, 5)
  context.fill()
  context.restore()
  context.fill(new Path2D(ICA_LETTERS_PATH))
  context.restore()
}

export function recapRoundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + w, y, x + w, y + h, r)
  context.arcTo(x + w, y + h, x, y + h, r)
  context.arcTo(x, y + h, x, y, r)
  context.arcTo(x, y, x + w, y, r)
  context.closePath()
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function drawRecap(
  context: CanvasRenderingContext2D,
  data: { month: string; name: string; cycleDays: number; stats: RecapStat[]; ranking: RecapStat[] },
) {
  const bg = context.createLinearGradient(0, 0, RECAP_W, RECAP_H)
  // Azules de la marca ICA (antes, morados con los colores antiguos de I, C y A).
  bg.addColorStop(0, '#0a3a55')
  bg.addColorStop(0.55, '#0b5577')
  bg.addColorStop(1, '#136a8c')
  context.fillStyle = bg
  context.fillRect(0, 0, RECAP_W, RECAP_H)

  // Luces de fondo
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = context.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = g
    context.fillRect(x - r, y - r, r * 2, r * 2)
  }
  glow(920, 160, 420, 'rgba(135,222,249,0.3)')
  glow(120, 1200, 460, 'rgba(63,193,236,0.25)')

  // El logo ICA (el mismo de la cabecera), en blanco.
  drawRecapLogo(context, 80, 58, 0.58)
  context.textAlign = 'right'
  context.textBaseline = 'alphabetic'
  context.fillStyle = 'rgba(255,255,255,0.6)'
  context.font = `900 30px ${RECAP_FONT}`
  context.fillText(t('RECAP DEL MES'), RECAP_W - 80, 132)

  // Título
  context.textAlign = 'left'
  context.fillStyle = '#ffffff'
  context.font = `900 112px ${RECAP_FONT}`
  context.fillText(capitalize(data.month), 80, 300)
  context.fillStyle = '#bfe9f8'
  context.font = `800 40px ${RECAP_FONT}`
  context.fillText(data.name, 80, 372)

  // Bloque de la racha
  const flameBg = context.createLinearGradient(80, 410, 1000, 640)
  flameBg.addColorStop(0, '#ff7a1a')
  flameBg.addColorStop(1, '#ffb21a')
  recapRoundRect(context, 80, 410, 920, 230, 44)
  context.fillStyle = flameBg
  context.fill()
  context.save()
  context.translate(110, 425)
  context.scale(8.4, 8.4)
  context.fillStyle = '#ffe08a'
  context.fill(new Path2D(FLAME_OUTER))
  context.fillStyle = '#fff6d6'
  context.fill(new Path2D(FLAME_INNER))
  context.restore()
  context.fillStyle = '#ffffff'
  context.font = `900 150px ${RECAP_FONT}`
  context.fillText(String(data.cycleDays), 340, 575)
  context.font = `900 34px ${RECAP_FONT}`
  context.fillStyle = 'rgba(255,255,255,0.95)'
  context.fillText(data.cycleDays === 1 ? t('día con el ciclo') : t('días con el ciclo'), 560, 520)
  context.fillText(t('I·C·A completo'), 560, 566)

  // Estadísticas (3 × 2)
  const statW = 293
  const statH = 170
  data.stats.forEach((stat, index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const x = 80 + col * (statW + 20)
    const y = 680 + row * (statH + 20)
    recapRoundRect(context, x, y, statW, statH, 32)
    context.fillStyle = 'rgba(255,255,255,0.09)'
    context.fill()
    context.textAlign = 'center'
    context.fillStyle = stat.color
    context.font = `900 72px ${RECAP_FONT}`
    context.fillText(stat.value, x + statW / 2, y + 92)
    context.fillStyle = 'rgba(226,232,240,0.85)'
    let labelSize = 26
    context.font = `800 ${labelSize}px ${RECAP_FONT}`
    while (labelSize > 16 && context.measureText(stat.label).width > statW - 28) {
      labelSize -= 1
      context.font = `800 ${labelSize}px ${RECAP_FONT}`
    }
    context.fillText(stat.label, x + statW / 2, y + 138)
  })

  // Ranking
  // Con los colores del anuncio del Coaching ICA (azul, morado y fucsia, con un brillo
  // rosa en la esquina), elegidos por Luis el 2 oct.
  recapRoundRect(context, 80, 1070, 920, 170, 36)
  const rankingBg = context.createLinearGradient(80, 1070, 1000, 1240)
  rankingBg.addColorStop(0, '#1d4ed8')
  rankingBg.addColorStop(0.6, '#6d28d9')
  rankingBg.addColorStop(1, '#9d174d')
  context.fillStyle = rankingBg
  context.fill()
  context.save()
  context.clip()
  const rankingGlow = context.createRadialGradient(1000, 1070, 0, 1000, 1070, 520)
  rankingGlow.addColorStop(0, 'rgba(236,72,153,0.45)')
  rankingGlow.addColorStop(1, 'rgba(236,72,153,0)')
  context.fillStyle = rankingGlow
  context.fillRect(80, 1070, 920, 170)
  context.restore()
  data.ranking.forEach((stat, index) => {
    const cx = 80 + 920 / 6 + index * (920 / 3)
    context.textAlign = 'center'
    context.fillStyle = '#ffd34d'
    context.font = `900 64px ${RECAP_FONT}`
    context.fillText(stat.value, cx, 1160)
    context.fillStyle = 'rgba(255,236,179,0.88)'
    context.font = `800 26px ${RECAP_FONT}`
    context.fillText(stat.label, cx, 1204)
  })

  context.textAlign = 'center'
  context.fillStyle = 'rgba(255,255,255,0.5)'
  context.font = `800 28px ${RECAP_FONT}`
  context.fillText('icademy.app', RECAP_W / 2, 1300)
}

function RecapSheet({ monthStart, onClose }: { monthStart: string; onClose: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const summary = useMonthSummary(monthStart)
  const name = monthLabel(monthStart)
  const k = summary.kpis
  const dash = summary.loading ? '…' : '–'
  const displayName: string = user?.user_metadata?.display_name || user?.email?.split('@')[0] || t('Usuario')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  const stats: RecapStat[] = [
    { value: k ? String(k.wordsAdded) : dash, label: t('palabras ICA'), color: '#87def9' },
    { value: k ? String(k.phrasesCreated) : dash, label: t('frases creadas'), color: '#bfe9f8' },
    { value: k ? String(k.masterNotesClosed) : dash, label: t('notas maestras'), color: '#ffd978' },
    { value: k ? String(k.flashcardsCorrect) : dash, label: t('flashcards acertadas'), color: '#67e8f9' },
    { value: k ? String(k.masterNotesListenedMinutes) : dash, label: t('minutos escuchando'), color: '#bfe9f8' },
    { value: String(summary.flashDays), label: t('días de flashcards'), color: '#67e8f9' },
  ]
  const ranking: RecapStat[] = [
    { value: summary.rank !== null ? `${summary.rank}.º` : dash, label: t('en el ranking'), color: '' },
    { value: summary.points !== null ? pointsFormatter.format(summary.points) : dash, label: t('puntos'), color: '' },
    { value: summary.efficacy !== null ? `${summary.efficacy} %` : dash, label: t('de eficacia'), color: '' },
  ]

  const renderCanvas = (): HTMLCanvasElement | null => {
    const canvas = document.createElement('canvas')
    canvas.width = RECAP_W
    canvas.height = RECAP_H
    const context = canvas.getContext('2d')
    if (!context) return null
    drawRecap(context, { month: name, name: displayName, cycleDays: summary.cycleDays, stats, ranking })
    return canvas
  }

  const fileName = `recap-${monthStart.slice(0, 7)}.png`
  // La imagen se prepara en cuanto hay datos (también como archivo): así, al tocar «Guardar»,
  // el móvil abre su menú al instante (en el iPhone, si se espera, no deja compartir).
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [saveHelp, setSaveHelp] = useState(false)
  const drawKey = JSON.stringify([name, displayName, summary.cycleDays, stats.map((s) => s.value), ranking.map((s) => s.value)])
  useEffect(() => {
    if (summary.loading) return
    try {
      const canvas = renderCanvas()
      if (!canvas) {
        setImageUrl(null)
        return
      }
      setImageUrl(canvas.toDataURL('image/png'))
      canvas.toBlob((blob) => {
        setImageFile(blob ? new File([blob], fileName, { type: 'image/png' }) : null)
      }, 'image/png')
    } catch {
      setImageUrl(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, summary.loading])

  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const canShareFile = Boolean(imageFile && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [imageFile] }))

  const download = () => {
    if (!imageUrl) return
    const link = document.createElement('a')
    link.href = imageUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  // En el móvil: el menú de compartir del teléfono («Guardar imagen», Instagram, WhatsApp…).
  // En el ordenador: se descarga el archivo.
  const save = () => {
    if (canShareFile && imageFile) {
      setSharing(true)
      navigator
        .share({ files: [imageFile], title: t('Mi recap de {name}', { name }) })
        .catch((error: unknown) => {
          // Si se cancela, no pasa nada; si falla de verdad, se explica cómo guardarla a mano.
          if (!(error instanceof DOMException && error.name === 'AbortError')) setSaveHelp(true)
        })
        .finally(() => setSharing(false))
      return
    }
    if (isTouch) {
      setSaveHelp(true)
      return
    }
    download()
  }

  return (
    <div
      className='fixed inset-0 z-[110] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center'
      role='dialog'
      aria-modal='true'
      aria-label={t('Recap de {name}', { name })}
      onClick={(event) => {
        // Tocar fuera (arriba) también cierra.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className='ica-sheet-up max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-background px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl sm:rounded-[28px]'>
        <div className='mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30 sm:hidden' aria-hidden='true' />
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={t('Tu recap de {name}', { name })}
            className='ica-pop w-full rounded-3xl shadow-[0_10px_30px_-10px_rgb(0_0_0/0.5)]'
            style={{ aspectRatio: `${RECAP_W} / ${RECAP_H}` }}
          />
        ) : (
          <div className='w-full animate-pulse rounded-3xl bg-muted' style={{ aspectRatio: `${RECAP_W} / ${RECAP_H}` }} aria-hidden='true' />
        )}

        <div className='mt-4 flex flex-col gap-2'>
          <Button type='button' size='xl' variant='gold' className='w-full' onClick={save} disabled={!imageUrl || sharing}>
            {isTouch ? (
              <Share2Icon className='size-5' strokeWidth={2.6} aria-hidden='true' />
            ) : (
              <DownloadIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
            )}
            {isTouch ? t('Guardar o compartir') : t('Descargar imagen')}
          </Button>
          {isTouch || saveHelp ? (
            <p
              className='m-0 rounded-2xl px-3 py-2 text-center text-xs font-bold'
              style={saveHelp ? { background: 'var(--ica-gold-soft)', color: 'var(--ica-gold-ink)' } : { color: 'var(--muted-foreground)' }}
            >
              {saveHelp
                ? t('Tu móvil no deja guardarla desde aquí. Mantén pulsada la imagen y elige «Guardar imagen», o haz una captura de pantalla.')
                : t('Si no se guarda, mantén pulsada la imagen o haz una captura de pantalla.')}
            </p>
          ) : null}
          <div className='grid grid-cols-2 gap-2'>
            <Button
              type='button'
              variant='outline'
              className='h-11 rounded-2xl font-extrabold'
              onClick={() => {
                onClose()
                navigate(DASHBOARD_ROUTES.myAnalytics)
              }}
            >
              {t('Estadísticas')}
            </Button>
            <Button type='button' className='h-11 rounded-2xl font-extrabold' onClick={onClose}>
              {t('¡A por el siguiente!')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Se monta una vez en la app: abre el resumen del mes el día 28 (una sola vez por mes)
 * y cuando alguien lo pide desde Estadísticas.
 */
export function MonthlyRecapHost() {
  const { user } = useAuth()
  const [monthStart, setMonthStart] = useState<string | null>(null)

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail) setMonthStart(detail)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const now = new Date()
    if (now.getDate() < RECAP_DAY) return
    const current = localMonthStart(now)
    const key = `${SHOWN_PREFIX}${user.id}:${current.slice(0, 7)}`
    try {
      if (window.localStorage.getItem(key)) return
    } catch {
      return
    }
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, '1')
      } catch {
        // Sin almacenamiento: se podría volver a ver; no pasa nada.
      }
      setMonthStart(current)
      gameSfx.celebrate()
      try {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          void confetti({ particleCount: 90, spread: 80, origin: { y: 0.3 }, zIndex: 120 })
        }
      } catch {
        // Sin confeti no pasa nada.
      }
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [user?.id])

  if (!monthStart) return null
  return <RecapSheet monthStart={monthStart} onClose={() => setMonthStart(null)} />
}
