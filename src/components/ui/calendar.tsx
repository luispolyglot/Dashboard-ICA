import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { enUS } from 'date-fns/locale'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale = enUS,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={locale}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        root: 'w-fit px-2',
        months: 'flex flex-col gap-1 sm:flex-row',
        month_grid: 'w-full border-collapse',
        month_caption: 'relative flex items-center justify-center pt-1',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'absolute left-1 size-7 bg-transparent p-0 opacity-80 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'absolute right-1 size-7 bg-transparent p-0 opacity-80 hover:opacity-100',
        ),
        weekday:
          'w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground',
        day: 'h-9 w-9 p-0 text-center text-sm',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
        ),
        selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  )
}

export { Calendar }
