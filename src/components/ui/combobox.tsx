import { useMemo, useState } from 'react'
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type ComboboxOption = {
  value: string
  label: string
  keywords?: string
}

type ComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  disabled?: boolean
}

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = 'Selecciona una opción',
  searchPlaceholder = 'Buscar...',
  emptyLabel = 'Sin resultados',
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value],
  )

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return options

    return options.filter((option) => {
      const text = `${option.label} ${option.keywords || ''}`.toLowerCase()
      return text.includes(normalized)
    })
  }, [options, query])

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          type='button'
          variant='outline'
          className='h-10 w-full justify-between font-normal'
          disabled={disabled}
        >
          <span className='truncate text-left'>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDownIcon className='h-4 w-4 opacity-60' />
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align='start'
          className='z-50 w-[var(--radix-popover-trigger-width)] rounded-lg border bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10'
        >
          <div className='flex flex-col gap-2'>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />

            <div className='max-h-64 overflow-y-auto'>
              {filteredOptions.length === 0 ? (
                <p className='px-2 py-2 text-sm text-muted-foreground'>{emptyLabel}</p>
              ) : (
                <div className='flex flex-col gap-1'>
                  {filteredOptions.map((option) => {
                    const isSelected = option.value === value

                    return (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => {
                          onValueChange(option.value)
                          setOpen(false)
                          setQuery('')
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                          isSelected ? 'bg-accent/70 text-accent-foreground' : '',
                        )}
                      >
                        <span className='truncate'>{option.label}</span>
                        {isSelected && <CheckIcon className='h-4 w-4' />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
