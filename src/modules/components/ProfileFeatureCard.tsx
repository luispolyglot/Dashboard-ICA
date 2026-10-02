import { isValidElement } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile, type Tone } from "../game/ui";

type ProfileFeatureTone = "default" | "coaching" | "admin" | "superAdmin";

type ProfileFeatureCardProps = {
  title: ReactNode;
  /** Icono de lucide o un icono propio ya pintado (FichaIcon, TrophyIcon...). */
  icon: LucideIcon | ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headerRight?: ReactNode;
  onMainAction?: () => void;
  tone?: ProfileFeatureTone;
  /** Color del cuadrado del icono (si no, sale del `tone`). */
  iconTone?: Tone;
  className?: string;
};

// Color del icono según el tipo de tarjeta
const TONE_TO_GAME: Record<ProfileFeatureTone, Tone> = {
  default: "primary",
  coaching: "i",
  admin: "gold",
  superAdmin: "bad",
};

/** Tarjeta de juego del perfil: icono grande de color, título redondo y texto corto. */
export function ProfileFeatureCard({
  title,
  icon,
  description,
  actions,
  headerRight,
  onMainAction,
  tone = "default",
  iconTone,
  className,
}: ProfileFeatureCardProps) {
  const isInteractive = typeof onMainAction === "function";
  const Icon = !isValidElement(icon) && icon ? (icon as LucideIcon) : null;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isInteractive) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onMainAction?.();
  };

  return (
    <div
      onClick={onMainAction}
      onKeyDown={handleKeyDown}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      className={cn(
        "ica-panel relative flex min-h-[152px] w-full flex-col items-start gap-1.5 p-4 text-left",
        isInteractive &&
          "ica-press cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <IconTile tone={iconTone ?? TONE_TO_GAME[tone]} size={48}>
        {Icon ? <Icon className="size-6" strokeWidth={2.5} aria-hidden="true" /> : (icon as ReactNode)}
      </IconTile>
      {headerRight && (
        <div className="absolute top-3 right-3" onClick={(event) => event.stopPropagation()}>
          {headerRight}
        </div>
      )}
      <h3 className="m-0 mt-1 font-display text-lg leading-tight font-extrabold tracking-tight">
        {title}
      </h3>
      {description && (
        <div className="text-xs leading-snug font-semibold text-muted-foreground">{description}</div>
      )}

      {actions && (
        <div
          className="mt-auto flex w-full flex-wrap gap-2 pt-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
