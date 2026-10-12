import { cn } from '@/lib/utils'
import { ICA_LETTERS_PATH } from './icaLogoPath'

// LOGO DE ICA: el logo oficial de ICADEMY sin «DEMY». Marco redondeado abierto por abajo,
// birrete encima y «ICA» en letra redonda y gruesa (dibujada, sin depender de la fuente). Toma el azul de la marca (--ica-logo:
// azul oscuro en modo claro y celeste en modo oscuro), o el color que se le pase.

/** Logo «ICA». `size` es el alto aproximado de las letras en píxeles. */
export function IcaLogo({
  size = 28,
  className,
  title = 'ICA',
  color = 'var(--ica-logo)',
}: {
  size?: number
  className?: string
  title?: string
  color?: string
}) {
  // El dibujo mide 300 × 210; las letras ocupan unos 80 de alto.
  const scale = size / 80
  const width = 300 * scale
  const height = 210 * scale
  // Con el logo pequeño, el marco y el birrete necesitan trazo más gordo para verse.
  const stroke = size < 36 ? 16 : 11
  return (
    <svg
      viewBox='0 0 300 210'
      width={width}
      height={height}
      className={cn('shrink-0', className)}
      role='img'
      aria-label={title}
      style={{ color }}
    >
      <path
        d='M44 186 Q14 183 14 152 L14 78 Q14 50 42 50 L258 50 Q286 50 286 78 L286 152 Q286 183 256 186'
        fill='none'
        stroke='currentColor'
        strokeWidth={stroke}
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <g transform='translate(150 30)'>
        <path d='M-34 6 L-34 28 Q0 44 34 28 L34 6 L0 18 Z' fill='currentColor' />
        <path d='M0 -26 L58 -4 L0 18 L-58 -4 Z' fill='currentColor' stroke='var(--background)' strokeWidth='5' strokeLinejoin='round' />
        <path d='M44 0 L44 26' stroke='currentColor' strokeWidth='4' strokeLinecap='round' />
        <rect x='38' y='24' width='12' height='16' rx='5' fill='currentColor' />
      </g>
      <path d={ICA_LETTERS_PATH} fill='currentColor' />
    </svg>
  )
}
