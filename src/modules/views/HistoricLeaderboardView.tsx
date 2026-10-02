import { useEffect, useMemo, useState } from "react";
import { CalendarDaysIcon, TrophyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, IconTile, PageTitle, Panel, Pill, RowGroup } from "../game/ui";
import { RankBadge, UserInitial } from "../game/ranking";
import {
  fetchHistoricLeaderboardByMonth,
  fetchHistoricLeaderboardMonths,
  type HistoricLeaderboardEntry,
  type HistoricLeaderboardMonth,
} from "../services/historicLeaderboard";
import { t, uiLocale } from '@/i18n'

type HistoricLeaderboardRowWithRankLabel = {
  row: HistoricLeaderboardEntry;
  rank: number;
};

function monthLabel(periodStart: string): string {
  const date = new Date(`${periodStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return periodStart;

  const label = date.toLocaleDateString(uiLocale(), {
    month: "long",
    year: "numeric",
  });

  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

function dayLabel(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString(uiLocale(), { day: "numeric", month: "long" });
}

function buildRowsWithSharedRank(
  rows: HistoricLeaderboardEntry[],
): HistoricLeaderboardRowWithRankLabel[] {
  const result: HistoricLeaderboardRowWithRankLabel[] = [];
  let sharedRank = 0;
  let prevStreak: number | null = null;
  let prevPercent: number | null = null;

  rows.forEach((row, index) => {
    const currentStreak = row.icaStreakDays || 0;
    const currentPercent = Math.round(row.avgPercent || 0);
    const sameAsPrevious =
      index > 0 &&
      currentStreak === prevStreak &&
      currentPercent === prevPercent;

    if (!sameAsPrevious) {
      sharedRank = index + 1;
    }

    result.push({
      row,
      rank: sharedRank,
    });

    prevStreak = currentStreak;
    prevPercent = currentPercent;
  });

  return result;
}

export function HistoricLeaderboardView() {
  const [months, setMonths] = useState<HistoricLeaderboardMonth[]>([]);
const [selectedMonth, setSelectedMonth] = useState<string>("");
const [rows, setRows] = useState<HistoricLeaderboardEntry[]>([]);
const [loadingMonths, setLoadingMonths] = useState(true);
const [loadingRows, setLoadingRows] = useState(false);
const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoadingMonths(true);
      setError(null);

      try {
        const data = await fetchHistoricLeaderboardMonths(48);
        if (!active) return;
        setMonths(data);
        setSelectedMonth(data[0]?.periodStart || "");
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar el histórico del leaderboard.",
        );
      } finally {
        if (!active) return;
        setLoadingMonths(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedMonth) {
      setRows([]);
      return;
    }

    let active = true;

    const run = async () => {
      setLoadingRows(true);
      setError(null);

      try {
        const data = await fetchHistoricLeaderboardByMonth(selectedMonth, 500);
        if (!active) return;
        setRows(data);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar el mes seleccionado.",
        );
      } finally {
        if (!active) return;
        setLoadingRows(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [selectedMonth]);

  const selectedPeriod = useMemo(() => {
    return months.find((month) => month.periodStart === selectedMonth) || null;
  }, [months, selectedMonth]);
  const rowsWithSharedRank = useMemo(
    () => buildRowsWithSharedRank(rows),
    [rows],
  );

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-2 pb-8 lg:py-8">
      <PageTitle
        icon={
          <IconTile tone="gold" size={48}>
            <TrophyIcon className="size-6" strokeWidth={2.4} />
          </IconTile>
        }
        subtitle={t("Los rankings de los meses ya cerrados.")}
      >
        {t("Histórico del ranking")}
      </PageTitle>

      {loadingMonths && months.length === 0 ? (
        <div className="h-10 animate-pulse rounded-full bg-muted" aria-hidden="true" />
      ) : months.length > 0 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t("Mes")}>
          {months.map((month) => {
            const active = month.periodStart === selectedMonth;
            return (
              <button
                key={month.periodStart}
                type="button"
                onClick={() => setSelectedMonth(month.periodStart)}
                aria-pressed={active}
                className={cn(
                  "h-10 shrink-0 rounded-full border-2 px-4 text-sm font-extrabold whitespace-nowrap transition-colors",
                  active ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {monthLabel(month.periodStart)}
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedPeriod ? (
        <p className="m-0 flex items-center gap-2 text-xs font-bold text-muted-foreground">
          <CalendarDaysIcon className="size-4" strokeWidth={2.4} />
          {t("Del {from} al {to}", { from: dayLabel(selectedPeriod.periodStart), to: dayLabel(selectedPeriod.periodEnd) })}
          {rows.length > 0 ? ` · ${t("{n} personas", { n: rows.length })}` : ""}
        </p>
      ) : null}

      {error ? (
        <Panel tone="bad" className="text-sm font-bold">
          {error}
        </Panel>
      ) : null}

      {loadingMonths || loadingRows ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : months.length === 0 ? (
        <Panel>
          <EmptyState title={t("Aún no hay meses cerrados")} text={t("Cuando cierre el primer ranking, aparecerá aquí.")} />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState title={t("Nadie en este mes")} />
        </Panel>
      ) : (
        <RowGroup>
          {rowsWithSharedRank.map(({ row, rank }) => {
            const name = row.displayName || row.username || t("Usuario");
            return (
              <div key={`${row.periodStart}-${row.userId}`} className="flex items-center gap-3 py-3">
                <RankBadge rank={rank} />
                <UserInitial name={name} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">{name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Pill tone="fire">{t("{n} días de racha", { n: row.icaStreakDays })}</Pill>
                    <Pill tone="ok">{t("{n} % eficacia", { n: Math.round(row.avgPercent) })}</Pill>
                    <Pill tone="i">{t("{n} % repaso", { n: Math.round(row.reviewPercent) })}</Pill>
                    <Pill tone="c">{t("{n} % creación", { n: Math.round(row.creationPercent) })}</Pill>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-lg leading-none font-black tabular-nums">{row.score}</span>
                  <span className="text-[11px] font-bold text-muted-foreground">{t("puntos")}</span>
                </span>
              </div>
            );
          })}
        </RowGroup>
      )}
    </section>
  );
}
