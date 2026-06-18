import * as React from 'react'

import { cn } from '@/lib/utils'

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='field-group'
      className={cn('grid w-full gap-3', className)}
      {...props}
    />
  )
}

function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='field'
      className={cn('grid w-full gap-1.5', className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot='field-label'
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
    />
  )
}

export { Field, FieldGroup, FieldLabel }
