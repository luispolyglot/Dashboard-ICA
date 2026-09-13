import type { ReactNode } from "react";
import type { KeyboardEvent } from "react";
import { ArrowRightIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ProfileFeatureTone = "default" | "coaching" | "admin" | "superAdmin";

type ProfileFeatureCardProps = {
  title: ReactNode;
  icon: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
  headerRight?: ReactNode;
  onMainAction?: () => void;
  tone?: ProfileFeatureTone;
  className?: string;
};

const toneClasses: Record<ProfileFeatureTone, string> = {
  default:
    "border-border/70 bg-card text-card-foreground hover:border-primary/35 hover:bg-accent/35",
  coaching:
    "border-sky-300/65 bg-sky-50/70 text-sky-950 hover:border-sky-500/65 hover:bg-sky-100/70 dark:border-sky-700/60 dark:bg-sky-950/35 dark:text-sky-100 dark:hover:border-sky-500/70 dark:hover:bg-sky-900/45",
  admin:
    "border-amber-300/70 bg-amber-50/80 text-amber-950 hover:border-amber-500/75 hover:bg-amber-100/80 dark:border-amber-700/60 dark:bg-amber-950/35 dark:text-amber-100 dark:hover:border-amber-500/70 dark:hover:bg-amber-900/45",
  superAdmin:
    "border-rose-300/70 bg-rose-50/80 text-rose-950 hover:border-rose-500/75 hover:bg-rose-100/80 dark:border-rose-700/65 dark:bg-rose-950/35 dark:text-rose-100 dark:hover:border-rose-500/70 dark:hover:bg-rose-900/45",
};

export function ProfileFeatureCard({
  title,
  icon: Icon,
  description,
  actions,
  headerRight,
  onMainAction,
  tone = "default",
  className,
}: ProfileFeatureCardProps) {
  const isInteractive = typeof onMainAction === "function";

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isInteractive) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onMainAction?.();
  };

  return (
    <Card
      onClick={onMainAction}
      onKeyDown={handleKeyDown}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      className={cn(
        "relative flex aspect-square min-h-44 w-[calc(50%-0.5rem)] min-w-[9.5rem] flex-col overflow-hidden rounded-2xl border shadow-sm transition-colors md:w-[13.5rem] lg:w-[14.5rem]",
        isInteractive &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        toneClasses[tone],
        className,
      )}
    >
      <CardContent className="flex h-full flex-col p-3 pt-0 sm:p-4 sm:pt-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] sm:text-sm">
            {title}
          </h3>
          {headerRight && (
            <div onClick={(event) => event.stopPropagation()}>{headerRight}</div>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-background/85 text-foreground shadow-sm dark:bg-background/50">
            <Icon className="size-6" aria-hidden="true" />
          </div>
          {description && (
            <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
          )}
        </div>

        {actions && (
          <div
            className="mt-3 flex flex-wrap justify-center gap-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        )}

        {isInteractive && (
          <div className="pointer-events-none absolute bottom-2 right-2 text-muted-foreground/80 sm:bottom-2.5 sm:right-2.5">
            <ArrowRightIcon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
