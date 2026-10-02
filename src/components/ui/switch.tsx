import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot='switch'
      className={cn(
        'peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[state=checked]:bg-[var(--ica-ok)] data-[state=unchecked]:bg-[var(--border-strong)]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot='switch-thumb'
        className={cn(
          'block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] ring-0 transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-1',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
