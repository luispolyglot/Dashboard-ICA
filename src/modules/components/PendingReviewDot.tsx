import { Volume2Icon } from 'lucide-react'

type PendingReviewDotProps = {
  title: string
  useIconSpeaker?: boolean
}

export function PendingReviewDot({
  title,
  useIconSpeaker = false,
}: PendingReviewDotProps) {
  if (useIconSpeaker) {
    return (
      <span
        className='relative inline-flex h-4 w-4 shrink-0 items-center justify-center'
        title={title}
        aria-label={title}
      >
        <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70' />
        <span className='relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100'>
          <Volume2Icon className='h-2.5 w-2.5 text-amber-600' />
        </span>
      </span>
    )
  }

  return (
    <span
      className='relative inline-flex h-2.5 w-2.5 shrink-0'
      title={title}
      aria-label={title}
    >
      <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70' />
      <span className='relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500' />
    </span>
  )
}
