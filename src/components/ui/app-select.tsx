import { Children, Fragment, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

/**
 * Desplegable con el estilo de la app, que se usa igual que un <select> normal: mismas
 * <option> dentro y el mismo onChange (event.target.value). Así el menú que se abre ya no es
 * el del sistema (el gris de Windows), sino el de ICA.
 */

type OptionLike = { value: string; label: ReactNode; disabled: boolean }

// Radix no admite un valor vacío en las opciones: se cambia por este y se devuelve como ''.
const EMPTY = '__ica-empty__'

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean }

function collectOptions(children: ReactNode, out: OptionLike[] = []): OptionLike[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const element = child as ReactElement<OptionProps & { children?: ReactNode }>
    if (element.type === 'option') {
      const props = element.props
      out.push({
        value: props.value === undefined || props.value === null ? String(props.children ?? '') : String(props.value),
        label: props.children,
        disabled: Boolean(props.disabled),
      })
    } else if (element.type === Fragment || element.type === 'optgroup') {
      collectOptions(element.props.children, out)
    }
  })
  return out
}

export type AppSelectChangeEvent = { target: { value: string } }

export function AppSelect({
  value,
  onChange,
  children,
  disabled,
  id,
  className,
  style,
  'aria-label': ariaLabel,
}: {
  value?: string | number | null
  onChange?: (event: AppSelectChangeEvent) => void
  children?: ReactNode
  disabled?: boolean
  id?: string
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}) {
  const options = collectOptions(children)
  const current = value === undefined || value === null ? '' : String(value)
  const toRadix = (raw: string) => (raw === '' ? EMPTY : raw)
  const placeholder = options.find((option) => option.value === '')?.label

  return (
    <Select
      value={toRadix(current)}
      onValueChange={(next) => onChange?.({ target: { value: next === EMPTY ? '' : next } })}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn('h-11 w-full rounded-xl data-[size=default]:h-11', className)}
        style={style}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position='popper' className='max-h-72'>
        {options.map((option) => (
          <SelectItem key={option.value || EMPTY} value={toRadix(option.value)} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
