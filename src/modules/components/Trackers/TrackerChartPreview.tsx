import { useMemo, useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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

function CircularMetric({ metric }: { metric: Metric }) {
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (metric.value / 100) * circumference

  return (
    <div className='text-card-foreground flex-col flex items-center gap-2 rounded-lg border bg-card p-3'>
      <span className='text-xs font-bold'>{metric.label}</span>
      <div className='relative inline-flex'>
        <svg width='82' height='82' className='-rotate-90'>
          <circle
            cx='41'
            cy='41'
            r={radius}
            stroke='#e5e7eb'
            strokeWidth='6'
            fill='transparent'
          />
          <circle
            cx='41'
            cy='41'
            r={radius}
            stroke={metric.color}
            strokeWidth='6'
            fill='transparent'
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap='round'
          />
        </svg>
        <span className='absolute inset-0 flex items-center justify-center text-sm font-semibold'>
          {metric.value.toFixed(1)}%
        </span>
      </div>
    </div>
  )
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

  const metrics = useMemo<Metric[]>(
    () => [
      {
        label: 'PRONUNCIACIÓN',
        value: pronunciationPct,
        color: getMetricColor(pronunciationPct, 'PRONUNCIACIÓN'),
      },
      {
        label: 'FLUIDEZ',
        value: fluencyPct,
        color: getMetricColor(fluencyPct, 'FLUIDEZ'),
      },
      {
        label: 'IMPROVISACIÓN',
        value: improvisationPct,
        color: getMetricColor(improvisationPct, 'IMPROVISACIÓN'),
      },
    ],
    [fluencyPct, improvisationPct, pronunciationPct],
  )

  const handleDownload = async () => {
    if (isDownloading) return

    setDownloadError(null)
    setIsDownloading(true)

    const drawRoundedRect = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
      radius: number,
      fillStyle: string,
      strokeStyle?: string,
    ) => {
      const r = Math.max(0, Math.min(radius, width / 2, height / 2))
      context.beginPath()
      context.moveTo(x + r, y)
      context.lineTo(x + width - r, y)
      context.quadraticCurveTo(x + width, y, x + width, y + r)
      context.lineTo(x + width, y + height - r)
      context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
      context.lineTo(x + r, y + height)
      context.quadraticCurveTo(x, y + height, x, y + height - r)
      context.lineTo(x, y + r)
      context.quadraticCurveTo(x, y, x + r, y)
      context.closePath()
      context.fillStyle = fillStyle
      context.fill()
      if (strokeStyle) {
        context.strokeStyle = strokeStyle
        context.lineWidth = 1
        context.stroke()
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 720
    const context = canvas.getContext('2d')

    if (!context) {
      setDownloadError('No se pudo inicializar la descarga de la gráfica.')
      setIsDownloading(false)
      return
    }

    try {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)

      context.fillStyle = '#0f172a'
      context.font = '700 36px Nunito Sans, sans-serif'
      context.fillText('Gráfica de trackers', 56, 60)

      context.fillStyle = '#475569'
      context.font = '500 22px Nunito Sans, sans-serif'
      context.fillText(`${ownerName} · ${monthLabel}`, 56, 95)

      drawRoundedRect(context, 730, 34, 414, 52, 10, '#f8fafc', '#e2e8f0')
      context.fillStyle = '#64748b'
      context.font = '600 18px Nunito Sans, sans-serif'
      context.fillText('Pronunciación, Fluidez e Improvisación', 748, 68)

      const cardY = 132
      const cardWidth = 354
      const cardGap = 16
      const circleRadius = 48

      metrics.forEach((metric, index) => {
        const cardX = 56 + index * (cardWidth + cardGap)
        drawRoundedRect(
          context,
          cardX,
          cardY,
          cardWidth,
          180,
          14,
          '#ffffff',
          '#e2e8f0',
        )

        const centerX = cardX + 180
        const centerY = cardY + 100

        context.beginPath()
        context.arc(centerX, centerY, circleRadius, 0, Math.PI * 2)
        context.strokeStyle = '#e5e7eb'
        context.lineWidth = 10
        context.stroke()

        context.beginPath()
        context.arc(
          centerX,
          centerY,
          circleRadius,
          -Math.PI / 2,
          -Math.PI / 2 + (Math.PI * 2 * metric.value) / 100,
        )
        context.strokeStyle = metric.color
        context.lineWidth = 10
        context.lineCap = 'round'
        context.stroke()

        context.fillStyle = '#64748b'
        context.font = '900 18px Nunito Sans, sans-serif'
        context.fillText(metric.label, cardX + 30, cardY + 30)

        context.fillStyle = '#0f172a'
        context.font = '700 18px Nunito Sans, sans-serif'
        context.fillText(
          `${metric.value.toFixed(1)}%`,
          centerX - 30,
          centerY + 7,
        )
      })

      const chartX = 56
      const chartY = 352
      const chartWidth = 1088
      const chartHeight = 310
      drawRoundedRect(
        context,
        chartX,
        chartY,
        chartWidth,
        chartHeight,
        14,
        '#ffffff',
        '#e2e8f0',
      )

      const axisLeft = chartX + 70
      const axisTop = chartY + 30
      const axisWidth = chartWidth - 110
      const axisHeight = chartHeight - 85

      const ticks = [0, 25, 50, 75, 100]
      ticks.forEach((tick) => {
        const y = axisTop + axisHeight - (tick / 100) * axisHeight
        context.beginPath()
        context.moveTo(axisLeft, y)
        context.lineTo(axisLeft + axisWidth, y)
        context.strokeStyle = '#e2e8f0'
        context.lineWidth = 1
        context.stroke()

        context.fillStyle = '#64748b'
        context.font = '500 14px Nunito Sans, sans-serif'
        context.fillText(`${tick}%`, chartX + 18, y + 4)
      })

      const barWidth = 180
      const barGap =
        (axisWidth - barWidth * metrics.length) / (metrics.length + 1)
      metrics.forEach((metric, index) => {
        const x = axisLeft + barGap + index * (barWidth + barGap)
        const barHeight = (metric.value / 100) * axisHeight
        const y = axisTop + axisHeight - barHeight
        drawRoundedRect(context, x, y, barWidth, barHeight, 8, metric.color)

        context.fillStyle = '#0f172a'
        context.font = '700 16px Nunito Sans, sans-serif'
        context.fillText(`${metric.value.toFixed(1)}%`, x + 58, y - 10)

        context.fillStyle = '#475569'
        context.font = '600 14px Nunito Sans, sans-serif'
        context.fillText(metric.label, x + 28, axisTop + axisHeight + 32)
      })

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), 'image/png')
      })

      if (!blob) {
        throw new Error('DOWNLOAD_BLOB_ERROR')
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = downloadFileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('No se pudo descargar la gráfica. Intentalo de nuevo.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='rounded-xl border bg-white p-4 text-slate-800'>
        <div className='mb-4 flex items-start justify-between gap-3'>
          <div>
            <h3 className='font-serif text-xl font-semibold'>
              Gráfica de trackers
            </h3>
            <p className='text-sm text-slate-600'>
              {ownerName} · {monthLabel}
            </p>
          </div>
          <div className='rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500'>
            Pronunciación, Fluidez e Improvisación
          </div>
        </div>

        <div className='grid gap-3 md:grid-cols-3'>
          {metrics.map((metric) => (
            <CircularMetric key={metric.label} metric={metric} />
          ))}
        </div>

        <div className='mt-4 rounded-lg border bg-white p-3'>
          <div className='h-[280px] w-full'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={metrics}
                margin={{ top: 24, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray='3 3' vertical={false} />
                <XAxis dataKey='label' tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
                <Bar dataKey='value' radius={[5, 5, 0, 0]} maxBarSize={76}>
                  <LabelList
                    dataKey='value'
                    position='top'
                    formatter={(value) => `${Number(value).toFixed(1)}%`}
                  />
                  {metrics.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {showDownloadButton && (
        <div className='flex flex-col gap-2'>
          <div className='flex justify-end'>
            <Button
              type='button'
              onClick={() => void handleDownload()}
              disabled={isDownloading}
            >
              <DownloadIcon data-icon='inline-start' />
              {isDownloading ? 'Descargando...' : 'Descargar gráfica'}
            </Button>
          </div>
          {downloadError && (
            <p className='text-sm text-destructive'>{downloadError}</p>
          )}
        </div>
      )}
    </div>
  )
}
