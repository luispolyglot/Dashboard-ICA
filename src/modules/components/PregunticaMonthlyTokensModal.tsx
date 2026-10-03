import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { t, tn, uiLocale } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchPregunticaTokenSummary } from "../services/preguntica";
import { FichaIcon, TrophyIcon } from "../game/icons";
import { IconTile } from "../game/ui";

type ModalPayload = {
  storageKey: string;
  legacyStorageKey: string;
  monthLabel: string;
  closeDateLabel: string;
  earnedTokens: number;
  totalTokens: number;
};

const DAY_WINDOW = new Set([1, 29, 30, 31]);

function isWindowOpen(date: Date): boolean {
  return DAY_WINDOW.has(date.getDate());
}

function parseReferenceMonth(referenceMonth: string | null): Date | null {
  if (!referenceMonth) return null;

  if (/^\d{4}-\d{2}$/.test(referenceMonth)) {
    const [year, month] = referenceMonth.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }

  const date = new Date(referenceMonth);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function buildModalPayload(input: {
  monthDate: Date;
  earnedTokens: number;
  totalTokens: number;
}): ModalPayload {
  const { monthDate, earnedTokens, totalTokens } = input;
  const monthLabel = monthDate.toLocaleDateString(uiLocale(), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const closeDate = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 28),
  );
  const closeDateLabel = closeDate.toLocaleDateString(uiLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // La clave no depende del idioma de la app (antes, al cambiar a inglés, volvía a salir).
  const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    storageKey: `preguntica_tokens_modal_v2_${monthKey}`,
    legacyStorageKey: `preguntica_tokens_modal_fichas_de_${monthDate.toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" })}_${monthDate.getUTCFullYear()}`,
    monthLabel,
    closeDateLabel,
    earnedTokens,
    totalTokens,
  };
}

export function PregunticaMonthlyTokensModal() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ModalPayload | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isWindowOpen(new Date())) return;

    let active = true;

    const load = async () => {
      try {
        const summary = await fetchPregunticaTokenSummary();
        if (!active) return;

        const monthDate = parseReferenceMonth(summary.lastMonthlyEarnMonth);
        if (!monthDate || summary.lastMonthlyEarnTokens === null) return;

        const nextPayload = buildModalPayload({
          monthDate,
          earnedTokens: Number(summary.lastMonthlyEarnTokens || 0),
          totalTokens: Number(summary.balance || 0),
        });

        // Si no has ganado ninguna ICA Coin entera, no hace falta avisar.
        if (Math.floor(nextPayload.earnedTokens) < 1) return;

        const alreadyDismissed =
          window.localStorage.getItem(nextPayload.storageKey) === "1" ||
          window.localStorage.getItem(nextPayload.legacyStorageKey) === "1";
        if (alreadyDismissed) return;

        setPayload(nextPayload);
        setOpen(true);
      } catch {
        setOpen(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const tokensFormatter = useMemo(
    () =>
      new Intl.NumberFormat(uiLocale(), {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [],
  );

  const markDismissed = () => {
    if (!payload) return;
    window.localStorage.setItem(payload.storageKey, "1");
  };

  if (!payload) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          markDismissed();
        }
        setOpen(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconTile tone="gold" size={48}>
              <TrophyIcon size={30} />
            </IconTile>
            <DialogTitle>{t("ICA Coins del ranking del mes")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("El leaderboard de {month} cerró el {date}.", { month: payload.monthLabel, date: payload.closeDateLabel })}
          </DialogDescription>
        </DialogHeader>

        {(() => {
          // Monedas enteras ganadas de verdad: lo que sobra se guarda para la siguiente.
          const after = Math.max(0, Math.floor(payload.totalTokens + 1e-9));
          const before = Math.max(0, Math.floor(payload.totalTokens - payload.earnedTokens + 1e-9));
          const gained = Math.max(0, after - before);
          return (
            <>
              <div
                className="flex items-center gap-4 rounded-3xl px-5 py-4"
                style={{ background: "var(--ica-gold-soft)" }}
              >
                <FichaIcon size={60} />
                <div className="min-w-0">
                  <p
                    className="m-0 text-xs font-extrabold tracking-[0.08em] uppercase"
                    style={{ color: "var(--ica-gold-ink)" }}
                  >
                    {t("Ganaste")}
                  </p>
                  <p
                    className="m-0 text-5xl leading-none font-black tabular-nums"
                    style={{ color: "var(--ica-gold-ink)" }}
                  >
                    +{tokensFormatter.format(gained)}
                  </p>
                  <p
                    className="m-0 mt-1 text-sm font-extrabold"
                    style={{ color: "var(--ica-gold-ink)" }}
                  >
                    {tn(gained, "ICA Coin por el ranking del mes", "ICA Coins por el ranking del mes")}
                  </p>
                </div>
              </div>
              <p className="m-0 text-sm font-semibold text-muted-foreground">
                {t("1 ICA Coin por cada 10 puntos; lo que sobra se guarda para la siguiente.")}{" "}
                {t("Tienes")}{" "}
                <span className="font-extrabold text-foreground">
                  {t("{n} ICA Coins", { n: tokensFormatter.format(after) })}
                </span>
                .
              </p>
            </>
          );
        })()}

        <DialogFooter>
          <Button
            type="button"
            variant="gold"
            size="lg"
            onClick={() => {
              markDismissed();
              setOpen(false);
            }}
          >
            {t("Entendido")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
