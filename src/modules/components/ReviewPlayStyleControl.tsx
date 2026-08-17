import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { InfoIcon } from "lucide-react";
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
  const [activeInfo, setActiveInfo] = useState<
    "play-style" | "pending-only" | "confirm-before-answer" | null
  >(null);

  const checked = playStyle === "goal";
  const playStyleLabel = checked
    ? "Modo objetivo (10 correctas)"
    : "Modo clásico (10 tarjetas)";
  const pendingOnlyLabel = pendingOnly
    ? pendingCount === 0
      ? "Filtro activo: no tienes tarjetas no aprendidas o falladas."
      : `Filtro activo: practicar solo no aprendidas o falladas (${pendingCount}).`
    : "Practicar SOLO con las tarjetas no aprendidas o falladas";

  const infoContent = {
    "play-style": {
      label: "Modos de juego",
      summary: "Conoce la diferencia entre el modo clásico y el modo objetivo.",
      content: (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-1 font-semibold">Modo clásico</p>
            <p className="text-muted-foreground">
              Ronda de 10 flashcards. Termina cuando respondes la última
              tarjeta.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-1 font-semibold">Modo objetivo</p>
            <p className="text-muted-foreground">
              Requiere 20 palabras ICA mínimas por modo. Usa todas tus
              tarjetas disponibles y termina al llegar a 10 respuestas
              correctas.
            </p>
          </div>
        </div>
      ),
    },
    "pending-only": {
      label: "Filtro de tarjetas pendientes",
      summary: "Aprende para qué sirve practicar solo no aprendidas o falladas.",
      content: (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Cuando activas este filtro, la sesión usa únicamente tarjetas no
          aprendidas o falladas para enfocarte en lo que más necesitas
          reforzar.
        </div>
      ),
    },
    "confirm-before-answer": {
      label: "Doble confirmación",
      summary: "Evita marcar una respuesta por error cuando tocas muy rápido.",
      content: (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Al activar esta opción, al tocar <strong>La sabía</strong> o{" "}
          <strong>No la sabía</strong> se abre una confirmación final antes de
          guardar la respuesta.
        </div>
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
            size="sm"
            aria-label="Ajustes de flashcards"
          >
            ⚙️ Ajustes
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Ajustes de flashcards</DialogTitle>
            <DialogDescription>
              {activeInfoItem
                ? activeInfoItem.summary
                : "Configura tus opciones de práctica y revisa la info de cada una."}
            </DialogDescription>
          </DialogHeader>

          {activeInfoItem ? (
            activeInfoItem.content
          ) : (
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2">
                <Label
                  htmlFor="review-play-style-goal"
                  className="text-[11px] font-semibold text-muted-foreground"
                >
                  {playStyleLabel}
                </Label>
                <Switch
                  id="review-play-style-goal"
                  checked={checked}
                  onCheckedChange={(nextChecked) =>
                    onPlayStyleChange(nextChecked ? "goal" : "classic")
                  }
                  aria-label="Cambiar forma de jugar flashcards"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Información de modos de juego"
                  onClick={() => setActiveInfo("play-style")}
                >
                  <InfoIcon className="size-4 text-muted-foreground" />
                </Button>
              </div>

              <div className="inline-flex w-auto items-center gap-2 p-1.5 text-left text-[11px] font-medium text-muted-foreground">
                <input
                  id="review-pending-only"
                  type="checkbox"
                  checked={pendingOnly}
                  onChange={(event) => onPendingOnlyChange(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  aria-label="Filtrar por tarjetas no aprendidas o falladas"
                />
                <label
                  htmlFor="review-pending-only"
                  className={cn(
                    "cursor-pointer",
                    pendingOnly && "text-foreground",
                    pendingOnly &&
                      pendingCount === 0 &&
                      "text-red-600 dark:text-red-300",
                  )}
                >
                  {pendingOnlyLabel}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Información del filtro de tarjetas"
                  onClick={() => setActiveInfo("pending-only")}
                >
                  <InfoIcon className="size-4 text-muted-foreground" />
                </Button>
              </div>

              <div className="inline-flex items-center gap-2 p-1.5 text-[11px] font-medium text-muted-foreground">
                <input
                  id="review-confirm-answer"
                  type="checkbox"
                  checked={confirmBeforeAnswer}
                  onChange={(event) =>
                    onConfirmBeforeAnswerChange(event.target.checked)
                  }
                  className="h-4 w-4 accent-primary"
                  aria-label="Confirmar antes de guardar respuesta de flashcard"
                />
                <label
                  htmlFor="review-confirm-answer"
                  className={cn(
                    "cursor-pointer",
                    confirmBeforeAnswer && "text-foreground",
                  )}
                >
                  Doble confirmación de respuesta de la flashcard
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Información de confirmación de respuesta"
                  onClick={() => setActiveInfo("confirm-before-answer")}
                >
                  <InfoIcon className="size-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            {activeInfoItem ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveInfo(null)}
                >
                  Volver
                </Button>
                <Button type="button" onClick={() => setActiveInfo(null)}>
                  Aceptar
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => setIsSettingsOpen(false)}>
                Cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
