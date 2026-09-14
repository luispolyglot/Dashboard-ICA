import { useEffect, useMemo, useState } from "react";
import { CalendarClockIcon, InfoIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/auth/AuthContext";
import useBreakpoints from "@/modules/hooks/useBreakpoints";
import {
  getPregunticaMaxPoints,
  useLeaderboardScoringWindow,
} from "@/modules/hooks/useLeaderboardScoringWindow";
import type { LeaderboardEntry } from "../types";
import {
  fetchTotalIcademers,
  fetchMonthlySnapshotLeaderboard,
  fetchMonthlyStreakLeaderboard,
} from "../services/leaderboard";
import { LISTENING_METRICS_CHANGED_EVENT } from "../services/creationMetricsSync";
import { getIcaTestWindowStartDay } from "../services/icaTests";

const HISTORY_START_MONTH = "2026-05-01";
const FOCUS_TOP_LIMIT = 30;
const VISIBLE_LIMIT = 33;

type MonthOption = {
  value: string;
  label: string;
};

type VisibleLeaderboardRow = {
  row: LeaderboardEntry;
  sharedRank: number;
  rankLabel: string;
};

type LeaderboardPrizeRank = 1 | 2 | 3;

type LeaderboardPrize = {
  borderClassName: string;
  rewards: string[];
};

type ScoreBreakdown = {
  userName: string;
  monthlyPoints: number;
  monthlyMaxPoints: number;
  icaTestPoints: number;
  icaTestMaxPoints: number;
  listeningPoints: number;
  listeningMaxPoints: number;
  pregunticaPoints: number;
  pregunticaMaxPoints: number;
  instagramPoints: number;
  instagramMaxPoints: number;
  includeIcaTest: boolean;
  totalPoints: number;
  totalMaxPoints: number;
  isCurrentUser: boolean;
};

const MAX_MONTHLY_POINTS = 10;
const MAX_LISTENING_POINTS_PER_DAY = 0.1;
const MAX_ICA_TEST_POINTS = 1.2;
const MAX_INSTAGRAM_POINTS_PER_DAY = 0.5;
const REFERENCE_MAX_POINTS = 36;

const LEADERBOARD_PRIZES: Record<LeaderboardPrizeRank, LeaderboardPrize> = {
  1: {
    borderClassName: "border-2 border-amber-400/80",
    rewards: [
      "👨🏻‍🏫 Clase 1 a 1 de 1 hora con Luis",
      "💲 1 mes gratis en ICADEMY",
      "🎖️ Insignia oficial de ICAwards",
      "🎯 1 ticket coaching privado con Luis",
    ],
  },
  2: {
    borderClassName: "border-2 border-slate-300/90",
    rewards: [
      "👨🏻‍🏫 Clase 1 a 1 de 30 minutos con Luis",
      "💲 50% de reembolso en membresía mensual",
      "🎯 1 ticket coaching privado con Luis",
    ],
  },
  3: {
    borderClassName: "border-2 border-amber-700/70",
    rewards: ["🪙 3 fichas canjeables para preguntICA"],
  },
};

function getPrizeHeading(rank: LeaderboardPrizeRank): string {
  const medal = rankBadge(rank);
  return `${medal} El icademer que termine top ${rank} el día 28 del mes ganará:`;
}

function toUtcMonthStart(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function toLocalMonthStart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
}

function formatMonthLabel(isoMonthStart: string): string {
  const date = parseIsoDate(isoMonthStart);
  const label = date.toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

function buildMonthOptions(currentMonthStart: string): MonthOption[] {
  const start = parseIsoDate(HISTORY_START_MONTH);
  const end = parseIsoDate(currentMonthStart);
  const options: MonthOption[] = [];

  const cursor = new Date(end);
  while (cursor >= start) {
    const value = toUtcMonthStart(cursor);
    options.push({ value, label: formatMonthLabel(value) });
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  return options;
}

function pickVisibleRows(
  rows: LeaderboardEntry[],
  currentUserId: string | undefined,
): LeaderboardEntry[] {
  const topRows = rows.slice(0, VISIBLE_LIMIT);
  if (!currentUserId) return topRows;

  const currentUserRow = rows.find((row) => row.user_id === currentUserId);
  const alreadyVisible = topRows.some((row) => row.user_id === currentUserId);
  if (!currentUserRow || alreadyVisible) return topRows;

  return [...topRows, currentUserRow];
}

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function toComparablePercent(value: number | undefined): number {
  return Math.round(value || 0);
}

function toComparablePoints(value: number | string | undefined | null): number {
  return Math.round(toSafeNumber(value, 0) * 10);
}

function buildVisibleRowsWithSharedRank(
  rows: LeaderboardEntry[],
): VisibleLeaderboardRow[] {
  const result: VisibleLeaderboardRow[] = [];
  let sharedRank = 0;
  let prevStreak: number | null = null;
  let prevPercent: number | null = null;
  let prevPoints: number | null = null;

  rows.forEach((row, index) => {
    const currentStreak = row.ica_streak_days || 0;
    const currentPercent = toComparablePercent(row.avg_percent);
    const currentPoints = toComparablePoints(row.total_points);
    const sameAsPrevious =
      index > 0 &&
      currentStreak === prevStreak &&
      currentPercent === prevPercent &&
      currentPoints === prevPoints;

    if (!sameAsPrevious) {
      sharedRank = index + 1;
    }

    result.push({
      row,
      sharedRank,
      rankLabel: rankBadge(sharedRank),
    });

    prevStreak = currentStreak;
    prevPercent = currentPercent;
    prevPoints = currentPoints;
  });

  return result;
}

function closeAtUtcForMonth(isoMonthStart: string): Date {
  const date = parseIsoDate(isoMonthStart);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 29, 12, 0, 0),
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0m";

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function trailingRankOpacityClass(position: number): string {
  if (position === FOCUS_TOP_LIMIT + 1) return "opacity-70";
  if (position === FOCUS_TOP_LIMIT + 2) return "opacity-50";
  if (position === FOCUS_TOP_LIMIT + 3) return "opacity-30";
  return "";
}

function toSafeNumber(
  value: number | string | null | undefined,
  fallback = 0,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getMonthlyPercentPoints(row: LeaderboardEntry): number {
  return Math.round(toSafeNumber(row.avg_percent)) * 0.1;
}

function getIcaTestPoints(row: LeaderboardEntry): number {
  if (row.ica_test_points === null || row.ica_test_points === undefined)
    return 0;
  return toSafeNumber(row.ica_test_points);
}

function getListeningPoints(row: LeaderboardEntry): number {
  if (row.listening_points === null || row.listening_points === undefined)
    return 0;
  return toSafeNumber(row.listening_points);
}

function getPregunticaPoints(row: LeaderboardEntry): number {
  if (row.preguntica_points === null || row.preguntica_points === undefined)
    return 0;
  return toSafeNumber(row.preguntica_points);
}

function getInstagramPoints(row: LeaderboardEntry): number {
  if (row.instagram_points === null || row.instagram_points === undefined)
    return 0;
  return toSafeNumber(row.instagram_points);
}

function getDisplayedTotalPoints(
  row: LeaderboardEntry,
  includeIcaTest: boolean,
): number {
  const totalFromApi = toSafeNumber(row.total_points);
  if (totalFromApi > 0) return totalFromApi;

  const monthlyPoints = getMonthlyPercentPoints(row);
  const listeningPoints = getListeningPoints(row);
  const pregunticaPoints = getPregunticaPoints(row);
  const instagramPoints = getInstagramPoints(row);
  return includeIcaTest
    ? monthlyPoints +
        listeningPoints +
        getIcaTestPoints(row) +
        pregunticaPoints +
        instagramPoints
    : monthlyPoints + listeningPoints + pregunticaPoints + instagramPoints;
}

function getStreakCellClass(row: LeaderboardEntry): string {
  const streak = row.ica_streak_days || 0;
  const frozen = Boolean(row.is_creation_streak_frozen);
  if (frozen) return "[filter:hue-rotate(165deg)_saturate(1.25)] animate-pulse";
  return streak > 0 ? "" : "grayscale";
}

function getStreakLabel(row: LeaderboardEntry): string {
  const streak = row.ica_streak_days || 0;
  return `🔥 ${streak}`;
}

function buildScoreBreakdown(
  row: LeaderboardEntry,
  includeIcaTest: boolean,
  isCurrentUser: boolean,
  scoringDayCap: number,
): ScoreBreakdown {
  const monthlyPoints = getMonthlyPercentPoints(row);
  const icaTestPoints = includeIcaTest ? getIcaTestPoints(row) : 0;
  const listeningPoints = getListeningPoints(row);
  const pregunticaPoints = getPregunticaPoints(row);
  const instagramPoints = getInstagramPoints(row);
  const listeningMaxPoints = scoringDayCap * MAX_LISTENING_POINTS_PER_DAY;
  const pregunticaMaxPoints = getPregunticaMaxPoints(
    scoringDayCap,
    pregunticaPoints,
  );
  const instagramMaxPoints = scoringDayCap * MAX_INSTAGRAM_POINTS_PER_DAY;
  const totalPoints = getDisplayedTotalPoints(row, includeIcaTest);
  const totalMaxPoints =
    MAX_MONTHLY_POINTS +
    listeningMaxPoints +
    pregunticaMaxPoints +
    instagramMaxPoints +
    (includeIcaTest ? MAX_ICA_TEST_POINTS : 0);

  return {
    userName: row.display_name || row.username || "Usuario",
    monthlyPoints,
    monthlyMaxPoints: MAX_MONTHLY_POINTS,
    icaTestPoints,
    icaTestMaxPoints: MAX_ICA_TEST_POINTS,
    listeningPoints,
    listeningMaxPoints,
    pregunticaPoints,
    pregunticaMaxPoints,
    instagramPoints,
    instagramMaxPoints,
    includeIcaTest,
    totalPoints,
    totalMaxPoints,
    isCurrentUser,
  };
}

const pointsFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatPoints(value: number): string {
  return pointsFormatter.format(value);
}

function formatAppliedPercent(value: number, maxValue: number): string {
  if (maxValue <= 0) return "0%";
  const rawPercent = (value / maxValue) * 100;
  const safePercent = Number.isFinite(rawPercent) ? Math.max(rawPercent, 0) : 0;
  return `${Math.round(safePercent)}%`;
}

function isPerfectScore(value: number, maxValue: number): boolean {
  if (maxValue <= 0) return false;
  return value >= maxValue - 0.001;
}

function renderGoldScore(value: number, maxValue: number) {
  if (!isPerfectScore(value, maxValue)) {
    return <span className="text-amber-500">{formatPoints(value)}</span>;
  }

  return (
    <span className="relative inline-flex items-center justify-center px-1">
      <span className="glow-breathe pointer-events-none absolute inset-0 rounded-full bg-amber-300/45 blur-[6px]" />
      <span className="score-scale-pop relative font-extrabold text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.9)]">
        {formatPoints(value)}
      </span>
    </span>
  );
}

export function LeaderboardView() {
  const { user } = useAuth();
  const { isMd } = useBreakpoints();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const currentMonthStart = useMemo(() => toLocalMonthStart(new Date()), []);
  const monthOptions = useMemo(
    () => buildMonthOptions(currentMonthStart),
    [currentMonthStart],
  );

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStart);
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [totalIcademers, setTotalIcademers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBreakdownInfoOpen, setIsBreakdownInfoOpen] = useState(false);
  const [selectedScoreBreakdown, setSelectedScoreBreakdown] =
    useState<ScoreBreakdown | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedPrizeRank, setSelectedPrizeRank] =
    useState<LeaderboardPrizeRank | null>(null);

  const isCurrentMonth = selectedMonth === currentMonthStart;
  const closeAt = useMemo(
    () => closeAtUtcForMonth(selectedMonth),
    [selectedMonth],
  );
  const remainingMs = closeAt.getTime() - nowMs;
  const leaderboardClosed = remainingMs <= 0;
  const icaTestWindowStartDay = getIcaTestWindowStartDay();
  const { currentDay, scoringDayCap } = useLeaderboardScoringWindow({
    selectedMonth,
    currentMonthStart,
    nowMs,
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onListeningMetricsChanged = () => {
      setRefreshTick((value) => value + 1);
    };

    window.addEventListener(
      LISTENING_METRICS_CHANGED_EVENT,
      onListeningMetricsChanged,
    );

    return () => {
      window.removeEventListener(
        LISTENING_METRICS_CHANGED_EVENT,
        onListeningMetricsChanged,
      );
    };
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const [data, total] = await Promise.all([
          isCurrentMonth
            ? fetchMonthlyStreakLeaderboard(250)
            : fetchMonthlySnapshotLeaderboard(selectedMonth, VISIBLE_LIMIT),
          fetchTotalIcademers(),
        ]);

        if (!active) return;
        setRows(data);
        setTotalIcademers(total);
      } catch {
        if (!active) return;
        setError("No se pudo cargar el leaderboard.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [isCurrentMonth, refreshTick, selectedMonth]);

  const visibleRows = useMemo(
    () => pickVisibleRows(rows, user?.id),
    [rows, user?.id],
  );
  const rowsWithSharedRank = useMemo(
    () => buildVisibleRowsWithSharedRank(visibleRows),
    [visibleRows],
  );
  const topWindowRows = useMemo(
    () => rowsWithSharedRank.slice(0, VISIBLE_LIMIT),
    [rowsWithSharedRank],
  );
  const extraRows = useMemo(
    () => rowsWithSharedRank.slice(VISIBLE_LIMIT),
    [rowsWithSharedRank],
  );
  const missingPlaceholderCount = Math.max(
    VISIBLE_LIMIT - topWindowRows.length,
    0,
  );
  const placeholderRanks = useMemo(
    () =>
      Array.from(
        { length: missingPlaceholderCount },
        (_, index) => topWindowRows.length + index + 1,
      ),
    [missingPlaceholderCount, topWindowRows.length],
  );
  const hasSnapshotIcaPoints = useMemo(
    () =>
      rows.some(
        (row) =>
          row.ica_test_points !== null && row.ica_test_points !== undefined,
      ),
    [rows],
  );
  const showIcaTestColumn =
    (isCurrentMonth && currentDay >= icaTestWindowStartDay) ||
    (!isCurrentMonth && hasSnapshotIcaPoints);
  const desktopTableColumnCount = showIcaTestColumn ? 6 : 5;
  const tableColumnCount = isMd ? desktopTableColumnCount : 4;
  const includeIcaTestInScoreExplanation =
    (isCurrentMonth && currentDay >= icaTestWindowStartDay) ||
    (!isCurrentMonth && hasSnapshotIcaPoints);
  const currentUserRow = useMemo(
    () => rows.find((row) => row.user_id === user?.id),
    [rows, user?.id],
  );

  const openScoreBreakdown = (row: LeaderboardEntry) => {
    setIsBreakdownInfoOpen(false);
    setSelectedScoreBreakdown(
      buildScoreBreakdown(
        row,
        includeIcaTestInScoreExplanation,
        row.user_id === user?.id,
        scoringDayCap,
      ),
    );
  };

  useEffect(() => {
    if (!selectedScoreBreakdown?.isCurrentUser) return;
    if (!currentUserRow) return;

    setSelectedScoreBreakdown(
      buildScoreBreakdown(
        currentUserRow,
        includeIcaTestInScoreExplanation,
        true,
        scoringDayCap,
      ),
    );
  }, [
    currentUserRow,
    includeIcaTestInScoreExplanation,
    scoringDayCap,
    selectedMonth,
    selectedScoreBreakdown?.isCurrentUser,
  ]);

  return (
    <section className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-5 py-8">
      <div className="mb-6">
        <h2 className="mb-1 font-serif text-3xl font-bold">Leaderboard</h2>
        <p className="text-sm text-muted-foreground">
          Ranking mensual de progreso con corte oficial del 1 al 28.
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex flex-row flex-wrap gap-2 items-center">
                <p className="flex gap-1 items-center">
                  <TrophyIcon className="h-4 w-4" />
                  Clasificación mensual
                </p>
                <p className="text-sm">
                  TOP {FOCUS_TOP_LIMIT} de {totalIcademers ?? "..."} icademers
                </p>
              </div>
            </CardTitle>

            <div className="w-full max-w-72 space-y-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona mes" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClockIcon className="h-4 w-4" />
                {isCurrentMonth && !leaderboardClosed
                  ? `Cierra en ${formatCountdown(remainingMs)} (UTC-12).`
                  : "Este leaderboard ya cerró."}
              </p>
            </div>
          </div>

          <blockquote className="border-l-2 border-amber-400/80 pl-2 text-xs italic text-muted-foreground">
            La puntuación total máxima mensual es de {REFERENCE_MAX_POINTS}{" "}
            puntos.
          </blockquote>

          <div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                if (!currentUserRow) return;
                openScoreBreakdown(currentUserRow);
              }}
              disabled={!currentUserRow || loading || Boolean(error)}
            >
              Mi puntuación 🏅
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Cargando leaderboard...
            </p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : rowsWithSharedRank.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isCurrentMonth
                ? "Todavía no hay datos disponibles para este período."
                : `Se están calculando los resultados de ${formatMonthLabel(selectedMonth)}. En el transcurso del día estarán disponibles.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full lg:min-w-160 table-fixed text-left text-sm">
                <thead className="table w-full table-fixed">
                  <tr className="border-b text-muted-foreground">
                    <th className="w-[12%] lg:w-[8%] px-1 pb-2 font-medium">
                      Rank
                    </th>
                    <th className="w-[12%] lg:w-[8%] px-1 pb-2 font-medium">
                      🔥
                    </th>
                    <th className="w-auto pb-2 font-medium">Nombre</th>
                    {showIcaTestColumn && (
                      <th className="hidden md:table-cell w-[14%] pb-2 font-medium">
                        ICA Test
                      </th>
                    )}
                    <th className="hidden md:table-cell w-[18%] pb-2 font-medium">
                      % de eficacia
                    </th>
                    <th className="w-[16%] pb-2 font-medium">
                      Puntuación total
                    </th>
                  </tr>
                </thead>
                <tbody className="block lg:max-h-[50dvh] lg:overflow-y-auto">
                  {topWindowRows.map(
                    ({ row, rankLabel, sharedRank }, index) => (
                      <tr
                        key={`${row.user_id}-${row.rank}-${selectedMonth}`}
                        className={`table w-full table-fixed border-b align-middle ${trailingRankOpacityClass(index + 1)} ${
                          row.user_id === user?.id ? "bg-emerald-500/10" : ""
                        }`}
                      >
                        <td className="w-[12%] lg:w-[8%] px-1 py-2">
                          {sharedRank <= 3 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto p-0 text-base leading-none hover:bg-transparent"
                              onClick={() =>
                                setSelectedPrizeRank(
                                  sharedRank as LeaderboardPrizeRank,
                                )
                              }
                              aria-label={`Ver premio del puesto ${sharedRank}`}
                            >
                              {rankLabel}
                            </Button>
                          ) : (
                            rankLabel
                          )}
                        </td>
                        <td
                          className={`w-[12%] lg:w-[8%] px-1 py-2 ${getStreakCellClass(row)}`}
                        >
                          {getStreakLabel(row)}
                        </td>
                        <td className="w-auto py-2 flex flex-row gap-3 items-center pr-2">
                          <p className="truncate font-medium">
                            {row.display_name || row.username || "Usuario"}
                          </p>
                          {row.user_id === user?.id && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              (Tú)
                            </p>
                          )}
                        </td>
                        {showIcaTestColumn && (
                          <td className="hidden md:table-cell w-[14%] py-2 font-medium">
                            {row.ica_test_points === null ||
                            row.ica_test_points === undefined
                              ? "-"
                              : toSafeNumber(row.ica_test_points).toFixed(1)}
                          </td>
                        )}
                        <td className="hidden md:table-cell w-[18%] py-2 font-medium">
                          {Math.round(row.avg_percent || 0)}%
                        </td>
                        <td className="w-[16%] py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto p-0 text-sm font-bold md:font-medium"
                            onClick={() => openScoreBreakdown(row)}
                            aria-label="Ver cómo se calculó esta puntuación total"
                          >
                            {getDisplayedTotalPoints(
                              row,
                              includeIcaTestInScoreExplanation,
                            ).toFixed(1)}
                          </Button>
                        </td>
                      </tr>
                    ),
                  )}

                  {placeholderRanks.map((rank) => (
                    <tr
                      key={`placeholder-rank-${rank}-${selectedMonth}`}
                      className={`table w-full table-fixed border-b align-middle ${trailingRankOpacityClass(rank)}`}
                    >
                      <td className="w-[12%] lg:w-[8%] px-1 py-2">#{rank}</td>
                      <td className="w-[12%] lg:w-[8%] px-1 py-2 text-muted-foreground">
                        -
                      </td>
                      <td className="w-auto py-2 pr-2 text-muted-foreground">
                        -
                      </td>
                      {showIcaTestColumn && (
                        <td className="hidden md:table-cell w-[14%] py-2 text-muted-foreground">
                          -
                        </td>
                      )}
                      <td className="hidden md:table-cell w-[18%] py-2 text-muted-foreground">
                        -
                      </td>
                      <td className="w-[16%] py-2 text-muted-foreground">-</td>
                    </tr>
                  ))}

                  <tr className="table w-full table-fixed align-middle opacity-40">
                    <td
                      colSpan={tableColumnCount}
                      className="py-2 text-center text-lg tracking-[0.6em] text-muted-foreground"
                    >
                      ...
                    </td>
                  </tr>

                  {extraRows.map(({ row, rankLabel, sharedRank }) => (
                    <tr
                      key={`${row.user_id}-${row.rank}-${selectedMonth}-extra`}
                      className={`table w-full table-fixed border-b align-middle last:border-b-0 ${
                        row.user_id === user?.id ? "bg-emerald-500/10" : ""
                      }`}
                    >
                      <td className="w-[12%] lg:w-[8%] px-1 py-2">
                        {sharedRank <= 3 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto p-0 text-base leading-none hover:bg-transparent"
                            onClick={() =>
                              setSelectedPrizeRank(
                                sharedRank as LeaderboardPrizeRank,
                              )
                            }
                            aria-label={`Ver premio del puesto ${sharedRank}`}
                          >
                            {rankLabel}
                          </Button>
                        ) : (
                          rankLabel
                        )}
                      </td>
                      <td
                        className={`w-[12%] lg:w-[8%] px-1 py-2 ${getStreakCellClass(row)}`}
                      >
                        {getStreakLabel(row)}
                      </td>
                      <td className="w-auto py-2 flex flex-row gap-3 items-center pr-2">
                        <p className="truncate font-medium">
                          {row.display_name || row.username || "Usuario"}
                        </p>
                        {row.user_id === user?.id && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            (Tú)
                          </p>
                        )}
                      </td>
                      {showIcaTestColumn && (
                        <td className="hidden md:table-cell w-[14%] py-2 font-medium">
                          {row.ica_test_points === null ||
                          row.ica_test_points === undefined
                            ? "-"
                            : toSafeNumber(row.ica_test_points).toFixed(1)}
                        </td>
                      )}
                      <td className="hidden md:table-cell w-[18%] py-2 font-medium">
                        {Math.round(row.avg_percent || 0)}%
                      </td>
                      <td className="w-[16%] py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto p-0 text-sm font-bold md:font-medium"
                          onClick={() => openScoreBreakdown(row)}
                          aria-label="Ver cómo se calculó esta puntuación total"
                        >
                          {getDisplayedTotalPoints(
                            row,
                            includeIcaTestInScoreExplanation,
                          ).toFixed(1)}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedScoreBreakdown)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedScoreBreakdown(null);
            setIsBreakdownInfoOpen(false);
          }
        }}
      >
        <DialogContent
          className={
            selectedScoreBreakdown?.isCurrentUser
              ? "border-2 border-emerald-400/70"
              : undefined
          }
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Detalle de puntuación</DialogTitle>
          </DialogHeader>

          {selectedScoreBreakdown ? (
            <div className="space-y-3 text-foreground">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-base">
                    <strong>{selectedScoreBreakdown.userName}</strong>{" "}
                    {renderGoldScore(
                      selectedScoreBreakdown.totalPoints,
                      selectedScoreBreakdown.totalMaxPoints,
                    )}{" "}
                    / {formatPoints(selectedScoreBreakdown.totalMaxPoints)}
                  </p>
                </div>
              </div>

              <p>
                📊{" "}
                {renderGoldScore(
                  selectedScoreBreakdown.monthlyPoints,
                  selectedScoreBreakdown.monthlyMaxPoints,
                )}{" "}
                / {formatPoints(selectedScoreBreakdown.monthlyMaxPoints)}
                {selectedScoreBreakdown.isCurrentUser
                  ? ` - ${formatAppliedPercent(selectedScoreBreakdown.monthlyPoints, selectedScoreBreakdown.monthlyMaxPoints)} de acción aplicada`
                  : ""}
              </p>
              {isBreakdownInfoOpen && (
                <p className="text-xs text-yellow-700 dark:text-yellow-300 -mt-2">
                  Promedio mensual de rachas ICA y flashcards, del día 1 al día
                  28. (Máximo 10 puntos)
                </p>
              )}

              <p>
                🎧{" "}
                {renderGoldScore(
                  selectedScoreBreakdown.listeningPoints,
                  selectedScoreBreakdown.listeningMaxPoints,
                )}{" "}
                / {formatPoints(selectedScoreBreakdown.listeningMaxPoints)}
                {selectedScoreBreakdown.isCurrentUser
                  ? ` - ${formatAppliedPercent(selectedScoreBreakdown.listeningPoints, selectedScoreBreakdown.listeningMaxPoints)} de acción aplicada`
                  : ""}
              </p>
              {isBreakdownInfoOpen && (
                <p className="text-xs text-yellow-700 dark:text-yellow-300 -mt-2">
                  Solo suma 0,1 puntos cuando llegas a 10 minutos escuchados en
                  el día. (Máximo 2,8 puntos)
                </p>
              )}

              <p>
                📸{" "}
                {renderGoldScore(
                  selectedScoreBreakdown.instagramPoints,
                  selectedScoreBreakdown.instagramMaxPoints,
                )}{" "}
                / {formatPoints(selectedScoreBreakdown.instagramMaxPoints)}
                {selectedScoreBreakdown.isCurrentUser
                  ? ` - ${formatAppliedPercent(selectedScoreBreakdown.instagramPoints, selectedScoreBreakdown.instagramMaxPoints)} de acción aplicada`
                  : ""}
              </p>
              {isBreakdownInfoOpen && (
                <p className="text-xs text-yellow-700 dark:text-yellow-300 -mt-2">
                  Instagram Track suma 0,5 por cada día cumplido del 1 al 28.
                  (Máximo 14 puntos)
                </p>
              )}

              <p>
                🗣️{" "}
                {renderGoldScore(
                  selectedScoreBreakdown.pregunticaPoints,
                  selectedScoreBreakdown.pregunticaMaxPoints,
                )}{" "}
                / {formatPoints(selectedScoreBreakdown.pregunticaMaxPoints)}
                {selectedScoreBreakdown.isCurrentUser
                  ? ` - ${formatAppliedPercent(selectedScoreBreakdown.pregunticaPoints, selectedScoreBreakdown.pregunticaMaxPoints)} de acción aplicada`
                  : ""}
              </p>
              {isBreakdownInfoOpen && (
                <p className="text-xs text-yellow-700 dark:text-yellow-300 -mt-2">
                  PreguntICA semanal completada suma 2 puntos por semana.
                  (Máximo 8 puntos)
                </p>
              )}

              <p>
                📝{" "}
                {selectedScoreBreakdown.includeIcaTest ? (
                  <>
                    {renderGoldScore(
                      selectedScoreBreakdown.icaTestPoints,
                      selectedScoreBreakdown.icaTestMaxPoints,
                    )}{" "}
                    / {formatPoints(selectedScoreBreakdown.icaTestMaxPoints)}
                  </>
                ) : (
                  <>
                    <span className="text-amber-500">-</span>/
                    {formatPoints(selectedScoreBreakdown.icaTestMaxPoints)}
                  </>
                )}
                {selectedScoreBreakdown.isCurrentUser &&
                selectedScoreBreakdown.includeIcaTest
                  ? ` - ${formatAppliedPercent(selectedScoreBreakdown.icaTestPoints, selectedScoreBreakdown.icaTestMaxPoints)} de acción aplicada`
                  : ""}
              </p>
              {isBreakdownInfoOpen && (
                <p className="text-xs text-yellow-700 dark:text-yellow-300 -mt-2">
                  {selectedScoreBreakdown.includeIcaTest
                    ? `Cada respuesta correcta del ICA Test suma 0,1 puntos. Del día ${icaTestWindowStartDay} al 28 del mes. (Máximo 1,2 puntos)`
                    : `ICA Test disponible del día ${icaTestWindowStartDay} al 28 del mes. (Máximo 1,2 puntos)`}
                </p>
              )}

              <Separator className="my-2" />

              <div className="flex items-center justify-between gap-3">
                <p>
                  🧾 <strong>Total:</strong>{" "}
                  {renderGoldScore(
                    selectedScoreBreakdown.totalPoints,
                    selectedScoreBreakdown.totalMaxPoints,
                  )}
                  {selectedScoreBreakdown.isCurrentUser
                    ? ` - ${formatAppliedPercent(selectedScoreBreakdown.totalPoints, selectedScoreBreakdown.totalMaxPoints)} de eficacia aplicada`
                    : ""}
                </p>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={
                    isBreakdownInfoOpen
                      ? "border-yellow-500 bg-yellow-100 text-yellow-700 ring-1 ring-yellow-500 dark:border-yellow-400 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-400"
                      : "border-yellow-500/60 text-yellow-700 hover:bg-yellow-100 hover:text-yellow-700 dark:border-yellow-400/70 dark:text-yellow-300 dark:hover:bg-yellow-500/10 dark:hover:text-yellow-200"
                  }
                  aria-pressed={isBreakdownInfoOpen}
                  onClick={() => setIsBreakdownInfoOpen((prev) => !prev)}
                >
                  <InfoIcon className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedPrizeRank !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPrizeRank(null);
        }}
      >
        <DialogContent
          className={`sm:max-w-md ${
            selectedPrizeRank
              ? LEADERBOARD_PRIZES[selectedPrizeRank].borderClassName
              : ""
          }`}
        >
          {selectedPrizeRank ? (
            <>
              <DialogHeader className="pr-7">
                <DialogTitle className="leading-[1.4] tracking-[0.01em]">
                  {getPrizeHeading(selectedPrizeRank)}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Detalle de premios para los puestos del leaderboard mensual.
                </DialogDescription>
              </DialogHeader>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {LEADERBOARD_PRIZES[selectedPrizeRank].rewards.map((reward) => (
                  <li key={reward}>{reward}</li>
                ))}
              </ul>
              <Separator />
              <DialogFooter className="-mx-0 -mb-0 rounded-b-none border-0 bg-transparent p-0">
                <Button
                  type="button"
                  onClick={() => setSelectedPrizeRank(null)}
                >
                  Aceptar
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
