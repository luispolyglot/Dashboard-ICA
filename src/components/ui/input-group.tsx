import * as React from 'react'

import { cn } from '@/lib/utils'

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='input-group'
      className={cn(
        'flex h-8 w-full items-center rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot='input-group-input'
      className={cn(
        'h-full w-full min-w-0 border-0 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='input-group-addon'
      className={cn(
        'inline-flex h-full items-center border-l border-input px-2 text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput }
