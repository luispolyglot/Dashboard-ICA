import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchPregunticaTokenSummary } from "../services/preguntica";

type ModalPayload = {
  storageKey: string;
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
  const monthLabel = monthDate.toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthName = monthDate.toLocaleDateString("es-ES", {
    month: "long",
    timeZone: "UTC",
  });
  const monthYear = monthDate.toLocaleDateString("es-ES", {
    year: "numeric",
    timeZone: "UTC",
  });
  const closeDate = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 28),
  );
  const closeDateLabel = closeDate.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    storageKey: `preguntica_tokens_modal_fichas_de_${monthName}_${monthYear}`,
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

        const alreadyDismissed =
          window.localStorage.getItem(nextPayload.storageKey) === "1";
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
      new Intl.NumberFormat("es-ES", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
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
          <DialogTitle>Fichas del cierre mensual</DialogTitle>
          <DialogDescription>
            El leaderboard de {payload.monthLabel} cerró el{" "}
            {payload.closeDateLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-xl border border-amber-300/45 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Ganaste {tokensFormatter.format(payload.earnedTokens)} fichas por el
            cierre mensual.
          </p>
          <p className="text-sm text-muted-foreground">
            Total disponible ahora:{" "}
            {tokensFormatter.format(payload.totalTokens)} fichas.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              markDismissed();
              setOpen(false);
            }}
          >
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
