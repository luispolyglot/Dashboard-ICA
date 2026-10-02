import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import {
  CheckIcon,
  InfoIcon,
  RotateCcwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  TargetIcon,
} from "lucide-react";
import { CardsIcon } from "../game/icons";
import { IconTile, SectionLabel } from "../game/ui";
import type { ReviewPlayStyle } from "../review/playStyle";

type ReviewPlayStyleControlProps = {
  playStyle: ReviewPlayStyle;
  pendingOnly: boolean;
  pendingCount: number;
  confirmBeforeAnswer: boolean;
  onPlayStyleChange: (style: ReviewPlayStyle) => void;
  onPendingOnlyChange: (pendingOnly: boolean) => void;
  onConfirmBeforeAnswerChange: (confirmBeforeAnswer: boolean) => void;
  className?: string;
};

type InfoKey = "play-style" | "pending-only" | "confirm-before-answer";

/** Interruptor grande (el del sistema es muy pequeño para el dedo). */
function BigSwitch({
  id,
  checked,
  onChange,
  ariaLabel,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 transition-colors",
        checked ? "border-transparent bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 flex size-6 items-center justify-center rounded-full bg-white shadow-[0_2px_0_rgb(0_0_0/0.15)] transition-transform",
          checked && "translate-x-6",
        )}
      >
        {checked ? (
          <CheckIcon className="size-3.5 text-primary" strokeWidth={3.4} aria-hidden="true" />
        ) : null}
      </span>
    </button>
  );
}

/** Opción grande del tipo de partida (al elegirla se marca con el color de la fase). */
function StyleOption({
  selected,
  onSelect,
  icon,
  title,
  text,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "ica-press relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border-2 px-2 pt-3 pb-2.5 text-center transition-colors",
        selected
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-card hover:bg-muted dark:bg-transparent",
      )}
      style={{
        boxShadow: selected
          ? "0 3px 0 color-mix(in oklab, var(--primary) 45%, transparent)"
          : "0 3px 0 var(--border)",
      }}
    >
      {selected ? (
        <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-3.5" strokeWidth={3.4} aria-hidden="true" />
        </span>
      ) : null}
      {icon}
      <span className={cn("text-sm font-extrabold", selected && "text-primary")}>
        {title}
      </span>
      <span className="text-[11px] leading-tight font-bold text-muted-foreground">
        {text}
      </span>
    </button>
  );
}

function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={onClick}
      className="shrink-0 text-muted-foreground"
    >
      <InfoIcon className="size-4" strokeWidth={2.4} />
    </Button>
  );
}

function InfoBox({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-border bg-muted/40 p-3.5">
      {title ? <p className="m-0 mb-1 font-extrabold">{title}</p> : null}
      <div className="text-sm font-semibold text-muted-foreground">{children}</div>
    </div>
  );
}

/** Botón «Ajustes» de las flashcards y su ventana: forma de jugar, filtro y doble confirmación. */
export function ReviewPlayStyleControl({
  playStyle,
  pendingOnly,
  pendingCount,
  confirmBeforeAnswer,
  onPlayStyleChange,
  onPendingOnlyChange,
  onConfirmBeforeAnswerChange,
  className,
}: ReviewPlayStyleControlProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeInfo, setActiveInfo] = useState<InfoKey | null>(null);

  const checked = playStyle === "goal";
  const pendingOnlyLabel = pendingOnly
    ? pendingCount === 0
      ? t("Filtro activo: no tienes tarjetas no aprendidas o falladas.")
      : t("Filtro activo: practicas solo no aprendidas o falladas ({n}).", { n: pendingCount })
    : t("Practica SOLO con las tarjetas no aprendidas o falladas ({n}).", { n: pendingCount });

  const infoContent = {
    "play-style": {
      label: t("Modos de juego"),
      summary: t("Conoce la diferencia entre el modo clásico y el modo objetivo."),
      content: (
        <div className="space-y-2.5">
          <InfoBox title={t("Modo clásico")}>
            {t("Ronda de 10 flashcards. Termina cuando respondes la última tarjeta.")}
          </InfoBox>
          <InfoBox title={t("Modo objetivo")}>
            {t("Requiere 20 palabras ICA mínimas por modo. Usa todas tus tarjetas disponibles y termina al llegar a 10 respuestas correctas.")}
          </InfoBox>
        </div>
      ),
    },
    "pending-only": {
      label: t("Filtro de tarjetas pendientes"),
      summary: t("Aprende para qué sirve practicar solo no aprendidas o falladas."),
      content: (
        <InfoBox>
          {t("Cuando activas este filtro, la sesión usa únicamente tarjetas no aprendidas o falladas para enfocarte en lo que más necesitas reforzar.")}
        </InfoBox>
      ),
    },
    "confirm-before-answer": {
      label: t("Doble confirmación"),
      summary: t("Evita marcar una respuesta por error cuando tocas muy rápido."),
      content: (
        <InfoBox>
          {t("Al activar esta opción, al tocar")} <strong>{t("La sabía")}</strong>{" "}
          {t("o")} <strong>{t("No la sabía")}</strong>{" "}
          {t("se abre una confirmación final antes de guardar la respuesta.")}
        </InfoBox>
      ),
    },
  } as const;

  const activeInfoItem = activeInfo ? infoContent[activeInfo] : null;

  const handleOpenChange = (open: boolean) => {
    setIsSettingsOpen(open);

    if (!open) {
      setActiveInfo(null);
    }
  };

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Dialog open={isSettingsOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={t("Ajustes de flashcards")}
            className="gap-1.5"
          >
            <Settings2Icon className="size-4.5" strokeWidth={2.6} aria-hidden="true" />
            {t("Ajustes")}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {activeInfoItem ? activeInfoItem.label : t("Ajustes de flashcards")}
            </DialogTitle>
            <DialogDescription>
              {activeInfoItem
                ? activeInfoItem.summary
                : t("Elige cómo quieres repasar tus palabras.")}
            </DialogDescription>
          </DialogHeader>

          {activeInfoItem ? (
            activeInfoItem.content
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <SectionLabel
                  className="mb-1"
                  right={
                    <InfoButton
                      label={t("Información de modos de juego")}
                      onClick={() => setActiveInfo("play-style")}
                    />
                  }
                >
                  {t("Forma de jugar")}
                </SectionLabel>
                <div
                  id="review-play-style-goal"
                  role="radiogroup"
                  aria-label={t("Cambiar forma de jugar flashcards")}
                  className="grid grid-cols-2 gap-2.5"
                >
                  <StyleOption
                    selected={!checked}
                    onSelect={() => onPlayStyleChange("classic")}
                    icon={<CardsIcon size={34} />}
                    title={t("Modo clásico")}
                    text={t("Ronda de 10 tarjetas")}
                  />
                  <StyleOption
                    selected={checked}
                    onSelect={() => onPlayStyleChange("goal")}
                    icon={
                      <TargetIcon
                        className="size-8.5"
                        strokeWidth={2.4}
                        style={{ color: "var(--ica-a)" }}
                      />
                    }
                    title={t("Modo objetivo")}
                    text={t("Hasta 10 correctas")}
                  />
                </div>
              </div>

              <div className="flex flex-col divide-y-2 divide-border">
                <div className="flex items-center gap-3 py-3">
                  <IconTile tone="bad" size={44}>
                    <RotateCcwIcon className="size-5.5" strokeWidth={2.6} />
                  </IconTile>
                  <label htmlFor="review-pending-only" className="min-w-0 flex-1 cursor-pointer">
                    <span className="block font-extrabold">{t("Solo por aprender")}</span>
                    <span
                      className={cn(
                        "block text-xs font-semibold text-muted-foreground",
                        pendingOnly && "text-foreground",
                        pendingOnly &&
                          pendingCount === 0 &&
                          "text-[var(--ica-bad-ink)]",
                      )}
                    >
                      {pendingOnlyLabel}
                    </span>
                  </label>
                  <InfoButton
                    label={t("Información del filtro de tarjetas")}
                    onClick={() => setActiveInfo("pending-only")}
                  />
                  <BigSwitch
                    id="review-pending-only"
                    checked={pendingOnly}
                    onChange={onPendingOnlyChange}
                    ariaLabel={t("Filtrar por tarjetas no aprendidas o falladas")}
                  />
                </div>

                <div className="flex items-center gap-3 py-3">
                  <IconTile tone="primary" size={44}>
                    <ShieldCheckIcon className="size-5.5" strokeWidth={2.6} />
                  </IconTile>
                  <label htmlFor="review-confirm-answer" className="min-w-0 flex-1 cursor-pointer">
                    <span className="block font-extrabold">{t("Doble confirmación")}</span>
                    <span
                      className={cn(
                        "block text-xs font-semibold text-muted-foreground",
                        confirmBeforeAnswer && "text-foreground",
                      )}
                    >
                      {t("Te pregunta antes de guardar cada respuesta de la flashcard.")}
                    </span>
                  </label>
                  <InfoButton
                    label={t("Información de confirmación de respuesta")}
                    onClick={() => setActiveInfo("confirm-before-answer")}
                  />
                  <BigSwitch
                    id="review-confirm-answer"
                    checked={confirmBeforeAnswer}
                    onChange={onConfirmBeforeAnswerChange}
                    ariaLabel={t("Confirmar antes de guardar respuesta de flashcard")}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {activeInfoItem ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setActiveInfo(null)}
                >
                  {t("Volver")}
                </Button>
                <Button type="button" size="lg" onClick={() => setActiveInfo(null)}>
                  {t("Aceptar")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="xl"
                className="w-full"
                onClick={() => setIsSettingsOpen(false)}
              >
                {t("Listo")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
