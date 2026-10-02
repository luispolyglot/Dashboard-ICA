import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-transparent bg-clip-padding text-sm font-extrabold whitespace-nowrap transition-[background-color,color,box-shadow,transform,filter] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-[3px] active:not-aria-[haspopup]:shadow-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-edge)] hover:brightness-105",
        outline:
          "border-border bg-card shadow-[0_3px_0_var(--border)] hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-muted/60",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_3px_0_color-mix(in_oklab,var(--secondary)_78%,black)] hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-[var(--ica-bad-soft)] text-[var(--ica-bad-ink)] hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        /* Botones de juego: color lleno con canto inferior */
        success: "bg-[var(--ica-ok)] text-white shadow-[0_3px_0_var(--ica-ok-edge)] hover:brightness-105",
        danger: "bg-[var(--ica-bad-strong)] text-white shadow-[0_3px_0_var(--ica-bad-edge)] hover:brightness-105",
        i: "bg-[var(--ica-i)] text-white shadow-[0_3px_0_var(--ica-i-edge)] hover:brightness-105",
        c: "bg-[var(--ica-c)] text-white shadow-[0_3px_0_var(--ica-c-edge)] hover:brightness-105",
        a: "bg-[var(--ica-a)] text-white shadow-[0_3px_0_var(--ica-a-edge)] hover:brightness-105",
        gold: "bg-[var(--ica-gold)] text-[#4a3200] shadow-[0_3px_0_var(--ica-gold-edge)] hover:brightness-105",
        fire: "bg-[var(--ica-fire)] text-white shadow-[0_3px_0_var(--ica-fire-edge)] hover:brightness-105",
      },
      size: {
        default:
          "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[min(var(--radius-md),12px)] px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        /* Botón principal grande (el de "Comprobar", "Continuar"...) */
        xl: "h-13 gap-2 rounded-2xl px-6 text-base tracking-[0.02em]",
        icon: "size-10",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

Button.displayName = "Button"

export { Button, buttonVariants }
