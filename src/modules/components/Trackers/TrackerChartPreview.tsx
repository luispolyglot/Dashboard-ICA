import { t } from '@/i18n'
import { useEffect, useMemo, useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

type TrackerChartPreviewProps = {
  ownerName: string
  monthLabel: string
  pronunciationPct: number
  fluencyPct: number
  improvisationPct: number
  showDownloadButton?: boolean
  downloadFileName?: string
}

type Metric = {
  label: string
  value: number
  color: string
}

function getMetricColor(value: number, metricLabel: string): string {
  const safeValue = Math.max(0, Math.min(100, value))

  if (metricLabel === 'PRONUNCIACION') {
    if (safeValue < 50) return '#ef4444'
    if (safeValue <= 74) return '#f59e0b'
    if (safeValue <= 88) return '#facc15'
    return '#22c55e'
  }

  if (metricLabel === 'FLUIDEZ') {
    if (safeValue < 40) return '#ef4444'
    if (safeValue <= 55) return '#f59e0b'
    if (safeValue <= 65) return '#facc15'
    return '#22c55e'
  }

  if (safeValue < 10) return '#ef4444'
  if (safeValue <= 20) return '#f59e0b'
  if (safeValue <= 34) return '#facc15'
  return '#22c55e'
}

function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

const SIZE = 1080
const FONT = '"Nunito Sans", "Nunito", system-ui, sans-serif'

/** Dibuja la imagen del tracker (la misma que se ve y la que se descarga). */
function drawTrackerCard(
  context: CanvasRenderingContext2D,
  { ownerName, monthLabel, metrics }: { ownerName: string; monthLabel: string; metrics: Metric[] },
) {
  context.clearRect(0, 0, SIZE, SIZE)
  const bg = context.createLinearGradient(0, 0, SIZE, SIZE)
  bg.addColorStop(0, '#e8f0ff')
  bg.addColorStop(1, '#f5edff')
  context.fillStyle = bg
  context.fillRect(0, 0, SIZE, SIZE)

  // Tarjeta blanca con canto
  roundedRect(context, 60, 72, 960, 948, 64)
  context.fillStyle = '#d6deea'
  context.fill()
  roundedRect(context, 60, 60, 960, 948, 64)
  context.fillStyle = '#ffffff'
  context.fill()

  // Letras I·C·A
  const tiles: Array<[string, string, string]> = [
    // Los tres azules de I·C·A (mismos que --ica-i, --ica-c y --ica-a)
    ['I', '#3aaeee', '#0b84b5'],
    ['C', '#3b82f6', '#2563eb'],
    ['A', '#1e5fb4', '#163f80'],
  ]
  tiles.forEach(([letter, color, edge], index) => {
    const x = 130 + index * 84
    const y = 130 + (index === 1 ? 10 : 0)
    roundedRect(context, x, y + 8, 68, 68, 18)
    context.fillStyle = edge
    context.fill()
    roundedRect(context, x, y, 68, 68, 18)
    context.fillStyle = color
    context.fill()
    context.fillStyle = '#ffffff'
    context.font = `900 44px Georgia, "Times New Roman", serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(letter, x + 34, y + 37)
  })

  context.textAlign = 'right'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#94a3b8'
  context.font = `900 26px ${FONT}`
  context.fillText(t('TRACKER MENSUAL'), 950, 182)

  context.textAlign = 'left'
  context.fillStyle = '#0f172a'
  context.font = `900 76px ${FONT}`
  context.fillText(capitalizeFirst(monthLabel), 130, 330)
  context.fillStyle = '#64748b'
  context.font = `800 36px ${FONT}`
  context.fillText(ownerName, 130, 386)

  // Anillos
  metrics.forEach((metric, index) => {
    const cx = 250 + index * 290
    const cy = 600
    const radius = 108
    context.lineCap = 'round'
    context.lineWidth = 30
    context.beginPath()
    context.arc(cx, cy, radius, 0, Math.PI * 2)
    context.strokeStyle = '#eef2f7'
    context.stroke()
    const pct = Math.max(0, Math.min(100, metric.value))
    if (pct > 0) {
      context.beginPath()
      context.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100)
      context.strokeStyle = metric.color
      context.stroke()
    }
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#0f172a'
    context.font = `900 60px ${FONT}`
    context.fillText(`${Math.round(pct)}%`, cx, cy + 4)
    context.textBaseline = 'alphabetic'
    context.fillStyle = '#334155'
    context.font = `900 28px ${FONT}`
    context.fillText(t(metric.label), cx, cy + 180)
  })

  // Pie
  context.textAlign = 'center'
  context.fillStyle = '#94a3b8'
  context.font = `800 26px ${FONT}`
  context.fillText('icademy.app', SIZE / 2, 940)
}

export function TrackerChartPreview({
  ownerName,
  monthLabel,
  pronunciationPct,
  fluencyPct,
  improvisationPct,
  showDownloadButton = true,
  downloadFileName = 'tracker-mejora.png',
}: TrackerChartPreviewProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const metrics = useMemo<Metric[]>(
    () => [
      { label: 'PRONUNCIACIÓN', value: pronunciationPct, color: getMetricColor(pronunciationPct, 'PRONUNCIACION') },
      { label: 'FLUIDEZ', value: fluencyPct, color: getMetricColor(fluencyPct, 'FLUIDEZ') },
      { label: 'IMPROVISACIÓN', value: improvisationPct, color: getMetricColor(improvisationPct, 'IMPROVISACION') },
    ],
    [fluencyPct, improvisationPct, pronunciationPct],
  )

  const render = (): HTMLCanvasElement | null => {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const context = canvas.getContext('2d')
    if (!context) return null
    drawTrackerCard(context, { ownerName, monthLabel, metrics })
    return canvas
  }

  // La vista previa es la misma imagen que se descarga.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const canvas = render()
        setPreviewUrl(canvas ? canvas.toDataURL('image/png') : null)
      } catch {
        setPreviewUrl(null)
      }
    }, 120)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerName, monthLabel, metrics])

  const handleDownload = async () => {
    if (isDownloading) return
    setDownloadError(null)
    setIsDownloading(true)
    try {
      const canvas = render()
      if (!canvas) throw new Error('NO_CANVAS')
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), 'image/png'))
      if (!blob) throw new Error('DOWNLOAD_BLOB_ERROR')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = downloadFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError(t('No se pudo descargar la gráfica. Inténtalo de nuevo.'))
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className='flex flex-col gap-3'>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={t('Tu tracker de {month}', { month: monthLabel })}
          className='aspect-square w-full rounded-2xl'
        />
      ) : (
        <div className='aspect-square w-full animate-pulse rounded-2xl bg-muted' aria-hidden='true' />
      )}

      {showDownloadButton ? (
        <>
          <Button
            type='button'
            variant='outline'
            className='h-12 w-full rounded-2xl text-base font-extrabold'
            onClick={() => void handleDownload()}
            disabled={isDownloading}
          >
            <DownloadIcon className='size-5' strokeWidth={2.6} aria-hidden='true' />
            {isDownloading ? t('Descargando...') : t('Descargar imagen')}
          </Button>
          {downloadError ? <p className='m-0 text-sm font-bold text-destructive'>{downloadError}</p> : null}
        </>
      ) : null}
    </div>
  )
}
