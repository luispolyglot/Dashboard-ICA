import type { ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type IcaTestResultCardProps = {
  monthLabel: string
  title: string
  score: number
  totalQuestions: number
  message: string
  note: string
  className?: string
  isSaving?: boolean
  errorMessage?: string | null
  actions: ReactNode
}

export function IcaTestResultCard({
  monthLabel,
  title,
  score,
  totalQuestions,
  message,
  note,
  className,
  isSaving = false,
  errorMessage = null,
  actions,
}: IcaTestResultCardProps) {
  return (
    <Card
      className={`w-full border-primary/20 bg-linear-to-br from-primary/10 via-card to-background shadow-[0_20px_70px_-45px_rgba(0,0,0,0.45)] ${className || ''}`}
    >
      <CardHeader className='text-center'>
        <CardDescription className='capitalize'>{monthLabel}</CardDescription>
        <CardTitle className='text-2xl'>{title}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4 text-center'>
        <p className='text-6xl font-black tracking-tight'>
          {score}
          <span className='text-2xl text-muted-foreground'>/{totalQuestions}</span>
        </p>
        <p className='text-sm text-muted-foreground'>{message}</p>
        <p className='text-xs text-muted-foreground'>{note}</p>
        {isSaving && (
          <p className='text-sm text-muted-foreground'>Guardando resultado...</p>
        )}
        {errorMessage && <p className='text-sm text-destructive'>{errorMessage}</p>}
        {actions}
      </CardContent>
    </Card>
  )
}
