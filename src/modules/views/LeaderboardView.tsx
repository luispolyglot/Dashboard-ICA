import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AwardIcon,
  BadgePercentIcon,
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  GiftIcon,
  GraduationCapIcon,
  HeadphonesIcon,
  InfoIcon,
  MicIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthContext";
import {
  getPregunticaMaxPoints,
  useLeaderboardScoringWindow,
} from "@/modules/hooks/useLeaderboardScoringWindow";
import type { LeaderboardEntry } from "../types";
import {
  fetchMonthlySnapshotLeaderboard,
  fetchMonthlyStreakLeaderboard,
  peekMonthlySnapshotLeaderboard,
  peekMonthlyStreakLeaderboard,
} from "../services/leaderboard";
import { LISTENING_METRICS_CHANGED_EVENT } from "../services/creationMetricsSync";
import { getIcaTestWindowStartDay } from "../services/icaTests";
import { parseFeaturedBadge, useFeaturedBadge } from "../game/featuredBadge";
import { useMyFlags } from "../game/languageFlag";
import { MedalDefs } from "../game/Medal";
import { FichaIcon, FlameIcon, TargetGlyph, TrophyIcon } from "../game/icons";
import { LeaderboardRow, MyRankCard, Podium, RankingFadeOut, rankingFadeOpacity } from "../game/ranking";
import { IcademerProfileDialog, type IcademerSummary } from "../game/IcademerProfile";
import { IconTile, RowGroup, tone, type Tone } from "../game/ui";
import { t, tn, uiLocale } from '@/i18n'

const HISTORY_START_MONTH = "2026-05-01";
const FOCUS_TOP_LIMIT = 30;

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
  rewards: Array<{ icon: ReactNode; text: string }>;
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

function PrizeIcon({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-xl"
      style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
    >
      <Icon className="size-4.5" strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}

const LEADERBOARD_PRIZES: Record<LeaderboardPrizeRank, LeaderboardPrize> = {
  1: {
    borderClassName: "border-2 border-amber-400/80",
    rewards: [
      { icon: <PrizeIcon icon={GraduationCapIcon} color="var(--ica-i)" />, text: "Clase 1 a 1 de 1 hora con Luis" },
      { icon: <PrizeIcon icon={GiftIcon} color="var(--ica-ok)" />, text: "1 mes gratis en ICADEMY" },
      { icon: <PrizeIcon icon={AwardIcon} color="var(--ica-gold-edge)" />, text: "Insignia oficial de ICAwards" },
      { icon: <TargetGlyph size={30} />, text: "1 ticket coaching privado con Luis" },
    ],
  },
  2: {
    borderClassName: "border-2 border-slate-300/90",
    rewards: [
      { icon: <PrizeIcon icon={GraduationCapIcon} color="var(--ica-i)" />, text: "Clase 1 a 1 de 30 minutos con Luis" },
      { icon: <PrizeIcon icon={BadgePercentIcon} color="var(--ica-ok)" />, text: "50% de reembolso en membresía mensual" },
      { icon: <TargetGlyph size={30} />, text: "1 ticket coaching privado con Luis" },
    ],
  },
  3: {
    borderClassName: "border-2 border-amber-700/70",
    rewards: [{ icon: <FichaIcon size={30} />, text: "3 ICA Coins para canjear" }],
  },
};

const PRIZE_COLORS: Record<LeaderboardPrizeRank, [string, string, string]> = {
  1: ["#ffd34d", "#d99a00", "#5a3b00"],
  2: ["#dfe6ee", "#a3afbd", "#33475b"],
  3: ["#efc39a", "#b9814f", "#5a3310"],
};

function getPrizeHeading(rank: LeaderboardPrizeRank): string {
  return t('El icademer que termine top {rank} el día 28 del mes ganará:', { rank });
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
  const label = date.toLocaleDateString(uiLocale(), {
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

function rankBadge(rank: number): string {
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
  let prevDailyGame: number | null = null;

  rows.forEach((row, index) => {
    const currentStreak = row.ica_streak_days || 0;
    const currentPercent = toComparablePercent(row.avg_percent);
    const currentPoints = toComparablePoints(row.total_points);
    const currentDailyGame = row.daily_game_correct ?? null;
    const sameAsPrevious =
      index > 0 &&
      currentStreak === prevStreak &&
      currentPercent === prevPercent &&
      currentPoints === prevPoints &&
      currentDailyGame === prevDailyGame;

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
    prevDailyGame = currentDailyGame;
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

const pointsFormatter = new Intl.NumberFormat(uiLocale(), {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatPoints(value: number): string {
  return pointsFormatter.format(value);
}

function formatAppliedPercent(value: number, maxValue: number): string {
  if (maxValue <= 0) return "0%";
  const rawPercent = (value / maxValue) * 100;
  // Nadie puede pasar del 100 %.
  const safePercent = Number.isFinite(rawPercent) ? Math.min(100, Math.max(rawPercent, 0)) : 0;
  return `${Math.round(safePercent)}%`;
}

function isPerfectScore(value: number, maxValue: number): boolean {
  if (maxValue <= 0) return false;
  return value >= maxValue - 0.001;
}

/** «¿Y si hay empate?»: how ties in points are decided (Luis, 4 Oct). */
function TiebreakDialog({
  open,
  onOpenChange,
  myCorrect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myCorrect: number | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center gap-3 text-center">
          <IconTile tone="gold" solid size={56}>
            <TargetGlyph size={30} />
          </IconTile>
          <DialogTitle className="font-display text-xl font-black tracking-tight">
            {t('¿Y si hay empate?')}
          </DialogTitle>
          <DialogDescription className="m-0 text-sm font-semibold">
            {t('Si dos o más icademers tienen los mismos puntos, gana quien más aciertos tenga en el reto del día, del día 1 al 28.')}
          </DialogDescription>
          <p className="m-0 text-xs font-semibold text-muted-foreground">
            {t('Solo cuenta la primera partida de cada día: repetirla no suma.')}
          </p>
          {myCorrect !== null ? (
            <p
              className="m-0 w-full rounded-2xl px-4 py-2.5 text-sm font-extrabold"
              style={{ background: "var(--ica-gold-soft)", color: "var(--ica-gold-ink)" }}
            >
              {tn(myCorrect, 'Llevas {n} acierto este mes', 'Llevas {n} aciertos este mes')}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Detalle de puntos con el estilo de la app: cada apartado con su barra y cómo se gana. */
function ScoreBreakdownContent({
  breakdown,
  icaTestWindowStartDay,
}: {
  breakdown: ScoreBreakdown;
  icaTestWindowStartDay: number;
}) {
  const items: Array<{
    key: string;
    icon: LucideIcon | typeof FlameGlyph;
    tone: Tone;
    title: string;
    text: string;
    value: number | null;
    max: number;
  }> = [
    {
      key: "monthly",
      icon: FlameGlyph,
      tone: "fire",
      title: t("Rachas del mes"),
      text: t("Media de tus rachas ICA y de flashcards, del día 1 al 28."),
      value: breakdown.monthlyPoints,
      max: breakdown.monthlyMaxPoints,
    },
    {
      key: "instagram",
      icon: CameraIcon,
      tone: "a",
      title: t("Track Instagram"),
      text: t("0,5 por cada día con post, del 1 al 28."),
      value: breakdown.instagramPoints,
      max: breakdown.instagramMaxPoints,
    },
    {
      key: "preguntica",
      icon: MicIcon,
      tone: "c",
      title: t("PreguntICA"),
      text: t("2 por cada semana completada."),
      value: breakdown.pregunticaPoints,
      max: breakdown.pregunticaMaxPoints,
    },
    {
      key: "listening",
      icon: HeadphonesIcon,
      tone: "i",
      title: t("Escucha"),
      text: t("0,1 cada día que escuchas 10 minutos de notas maestras."),
      value: breakdown.listeningPoints,
      max: breakdown.listeningMaxPoints,
    },
    {
      key: "icaTest",
      icon: ClipboardCheckIcon,
      tone: "gold",
      title: t("Test ICA"),
      text: breakdown.includeIcaTest
        ? t("0,1 por cada respuesta correcta.")
        : t("Se abre el día {day}.", { day: icaTestWindowStartDay }),
      value: breakdown.includeIcaTest ? breakdown.icaTestPoints : null,
      max: breakdown.icaTestMaxPoints,
    },
  ];
  // Lo conseguido nunca puede pasar del máximo.
  for (const item of items) {
    if (item.value !== null) item.value = Math.min(item.value, item.max);
  }
  const efficacy = formatAppliedPercent(breakdown.totalPoints, breakdown.totalMaxPoints);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-full text-2xl font-black"
          style={
            breakdown.isCurrentUser
              ? { background: "var(--ica-me)", color: "#fff", boxShadow: "0 3px 0 var(--ica-me-edge)" }
              : { background: "var(--muted)", border: "2px solid var(--border)" }
          }
          aria-hidden="true"
        >
          {breakdown.userName.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate pr-6 text-xl">
            {breakdown.isCurrentUser ? t("Tu puntuación") : breakdown.userName}
          </DialogTitle>
          <DialogDescription className="m-0 text-xs font-bold">
            {t("{n} de eficacia", { n: efficacy })}
          </DialogDescription>
        </div>
      </div>

      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{ background: "var(--ica-gold-soft)" }}
      >
        <TrophyIcon size={34} />
        <span className="flex-1 text-sm font-extrabold" style={{ color: "var(--ica-gold-ink)" }}>
          {t("Total del mes")}
        </span>
        <span className="text-2xl font-black tabular-nums" style={{ color: "var(--ica-gold-ink)" }}>
          {formatPoints(Math.min(breakdown.totalPoints, breakdown.totalMaxPoints))}
          <span className="text-sm font-extrabold opacity-70"> / {formatPoints(breakdown.totalMaxPoints)}</span>
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const colors = tone(item.tone);
          const pct = item.value === null || item.max <= 0 ? 0 : Math.min(1, item.value / item.max);
          const perfect = item.value !== null && isPerfectScore(item.value, item.max);
          const Icon = item.icon;
          return (
            <div key={item.key} className="flex items-start gap-3">
              <IconTile tone={item.tone} size={40}>
                <Icon className="size-5" strokeWidth={2.4} aria-hidden="true" />
              </IconTile>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-extrabold">{item.title}</span>
                  <span className="shrink-0 text-sm font-black tabular-nums" style={{ color: perfect ? "var(--ica-gold-ink)" : colors.ink }}>
                    <span>{item.value === null ? "–" : formatPoints(item.value)}</span>
                    <span className="font-bold text-muted-foreground"> / {formatPoints(item.max)}</span>
                  </span>
                </div>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct * 100)}%`, background: perfect ? "var(--ica-gold)" : colors.solid }}
                  />
                </span>
                <span className="mt-1 block text-xs font-semibold text-muted-foreground">{item.text}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** La llama de la app con la forma de un icono de lucide (para la lista de puntos). */
function FlameGlyph({ className }: { className?: string }) {
  return <FlameIcon size={20} className={className} />;
}

export function LeaderboardView() {
  const { user } = useAuth();
  const { badge: myBadge } = useFeaturedBadge(user?.id);
  const { shown: myFlag } = useMyFlags(user?.id);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const currentMonthStart = useMemo(() => toLocalMonthStart(new Date()), []);
  const monthOptions = useMemo(
    () => buildMonthOptions(currentMonthStart),
    [currentMonthStart],
  );

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStart);
  // Lo último que se cargó sale al momento; la versión nueva llega por detrás.
  const [fetchedRows, setRows] = useState<LeaderboardEntry[]>(() => peekMonthlyStreakLeaderboard(250) ?? []);
const [loading, setLoading] = useState(() => peekMonthlyStreakLeaderboard(250) === undefined);
const [error, setError] = useState<string | null>(null);
const [selectedScoreBreakdown, setSelectedScoreBreakdown] = useState<ScoreBreakdown | null>(null);
const [refreshTick, setRefreshTick] = useState(0);
const [selectedPrizeRank, setSelectedPrizeRank] = useState<LeaderboardPrizeRank | null>(null);
const [tiebreakOpen, setTiebreakOpen] = useState(false);
  const rows = fetchedRows;

  const isCurrentMonth = selectedMonth === currentMonthStart;
  const monthIndex = monthOptions.findIndex((month) => month.value === selectedMonth);
  const olderMonth = monthIndex >= 0 ? monthOptions[monthIndex + 1]?.value ?? null : null;
  const newerMonth = monthIndex > 0 ? monthOptions[monthIndex - 1].value : null;
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
      const cached = isCurrentMonth
        ? peekMonthlyStreakLeaderboard(250)
        : peekMonthlySnapshotLeaderboard(selectedMonth, 250);
      if (cached) {
        setRows(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = isCurrentMonth
          ? await fetchMonthlyStreakLeaderboard(250)
          : await fetchMonthlySnapshotLeaderboard(selectedMonth, 250);

        if (!active) return;
        setRows(data);
      } catch {
        if (!active) return;
        setError(t("No se pudo cargar el leaderboard."));
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

  const rowsWithSharedRank = useMemo(
    () => buildVisibleRowsWithSharedRank(rows),
    [rows],
  );
  // Arriba, el podio (los 3 primeros); debajo, del 4.º al 30.º; y después, la cola que se difumina.
  const topRows = useMemo(
    () => rowsWithSharedRank.slice(0, FOCUS_TOP_LIMIT),
    [rowsWithSharedRank],
  );
  const podiumRows = topRows.slice(0, 3);
  const listRows = topRows.slice(3);
  const myRankRow = useMemo(
    () => rowsWithSharedRank.find(({ row }) => row.user_id === user?.id) ?? null,
    [rowsWithSharedRank, user?.id],
  );
  const hasSnapshotIcaPoints = useMemo(
    () =>
      rows.some(
        (row) =>
          row.ica_test_points !== null && row.ica_test_points !== undefined,
      ),
    [rows],
  );
  const includeIcaTestInScoreExplanation =
    (isCurrentMonth && currentDay >= icaTestWindowStartDay) ||
    (!isCurrentMonth && hasSnapshotIcaPoints);
  const currentUserRow = useMemo(
    () => rows.find((row) => row.user_id === user?.id),
    [rows, user?.id],
  );

  // Tie-break hint (Luis, 5 Oct): only the people tied on points with you (you included)
  // show their first-try correct answers in the daily challenge.
  const tiedWithMe = useMemo(() => {
    if (!currentUserRow) return new Set<string>();
    const mine = toComparablePoints(currentUserRow.total_points);
    const tied = rows.filter((row) => toComparablePoints(row.total_points) === mine);
    return new Set(tied.length > 1 ? tied.map((row) => row.user_id) : []);
  }, [rows, currentUserRow]);
  const tieCorrectFor = (row: LeaderboardEntry): number | null =>
    tiedWithMe.has(row.user_id) && row.daily_game_correct !== null && row.daily_game_correct !== undefined
      ? Math.max(0, row.daily_game_correct)
      : null;

  const openScoreBreakdown = (row: LeaderboardEntry) => {
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

  const rowDetail = (row: LeaderboardEntry) => {
    const breakdown = buildScoreBreakdown(
      row,
      includeIcaTestInScoreExplanation,
      false,
      scoringDayCap,
    );
    return (
      <span className="inline-flex items-center gap-1">
        <FlameIcon size={13} tone={(row.ica_streak_days || 0) > 0 ? "fire" : "off"} />
        {row.ica_streak_days || 0} ·{" "}
        {t('{n} eficacia', { n: formatAppliedPercent(breakdown.totalPoints, breakdown.totalMaxPoints) })}
      </span>
    );
  };

  // Perfil de un icademer: sale al momento con lo que ya sabe el ranking y carga el resto.
  const [profileSummary, setProfileSummary] = useState<IcademerSummary | null>(null);
  const openProfile = (row: LeaderboardEntry) => {
    setProfileSummary({
      userId: row.user_id,
      name: row.display_name || row.username || "Usuario",
      badge: row.user_id === user?.id ? myBadge : parseFeaturedBadge(row.featured_badge),
      flag: row.user_id === user?.id ? myFlag : row.display_flag ?? null,
    });
  };

  const renderRow = ({ row, sharedRank }: VisibleLeaderboardRow) => {
    const isMe = row.user_id === user?.id;
    return (
      <LeaderboardRow
        key={`${row.user_id}-${row.rank}-${selectedMonth}`}
        rank={sharedRank}
        name={row.display_name || row.username || "Usuario"}
        points={getDisplayedTotalPoints(row, includeIcaTestInScoreExplanation)}
        isMe={isMe}
        detail={rowDetail(row)}
        badge={isMe ? myBadge : parseFeaturedBadge(row.featured_badge)}
        flag={isMe ? myFlag : row.display_flag ?? null}
        onRankClick={
          sharedRank <= 3
            ? () => setSelectedPrizeRank(sharedRank as LeaderboardPrizeRank)
            : undefined
        }
        onPointsClick={() => openScoreBreakdown(row)}
        onProfileClick={() => openProfile(row)}
        tieCorrect={tieCorrectFor(row)}
      />
    );
  };

  return (
    <section className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 pt-2 pb-28 lg:py-8">
      <MedalDefs />
      <h1 className="m-0 font-display tracking-tight text-2xl font-extrabold lg:text-3xl">
        {t('Ranking del mes')}
      </h1>

      {/* Mes: ‹ Septiembre de 2026 › (como en Estadísticas) */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => olderMonth && setSelectedMonth(olderMonth)}
          disabled={!olderMonth}
          className="flex size-10 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:bg-muted disabled:opacity-30"
          aria-label={t('Mes anterior')}
        >
          <ChevronLeftIcon className="size-5" strokeWidth={2.6} />
        </button>
        <p className="m-0 text-lg font-extrabold" aria-live="polite">
          {formatMonthLabel(selectedMonth)}
        </p>
        <button
          type="button"
          onClick={() => newerMonth && setSelectedMonth(newerMonth)}
          disabled={!newerMonth}
          className="flex size-10 items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:bg-muted disabled:opacity-30"
          aria-label={t('Mes siguiente')}
        >
          <ChevronRightIcon className="size-5" strokeWidth={2.6} />
        </button>
      </div>

      {/* Estado del ranking */}
      <div
        className="mt-3 flex items-center gap-3 rounded-3xl px-4 py-3"
        style={{
          background:
            isCurrentMonth && !leaderboardClosed ? "var(--ica-gold-soft)" : "var(--muted)",
        }}
      >
        <TrophyIcon size={42} />
        <div className="min-w-0 flex-1">
          <p
            className="m-0 text-base font-extrabold"
            style={{
              color:
                isCurrentMonth && !leaderboardClosed ? "var(--ica-gold-ink)" : "var(--foreground)",
            }}
          >
            {isCurrentMonth && !leaderboardClosed
              ? t('Se cierra en {n}', { n: formatCountdown(remainingMs) })
              : "Ranking cerrado"}
          </p>
          <p className="m-0 text-xs font-semibold text-muted-foreground">
            {isCurrentMonth && !leaderboardClosed
              ? t("Del día 1 al 28")
              : t("Resultados finales del día 28")}
            {" · "}
            {t('máx. {max} pts', { max: REFERENCE_MAX_POINTS })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTiebreakOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-xs font-extrabold transition-colors hover:bg-background/60"
          style={{ borderColor: "var(--ica-gold-edge)", color: "var(--ica-gold-ink)" }}
        >
          <InfoIcon className="size-4" strokeWidth={2.8} aria-hidden="true" />
          {t('¿Empate?')}
        </button>
      </div>
      <TiebreakDialog
        open={tiebreakOpen}
        onOpenChange={setTiebreakOpen}
        myCorrect={myRankRow?.row.daily_game_correct ?? null}
      />

      {/* Tu puesto: siempre arriba y en azul */}
      {!loading && !error && myRankRow ? (
        <div className="sticky top-0 z-20 -mx-4 mt-3 bg-background/95 px-4 pt-1 pb-2 backdrop-blur">
          <MyRankCard
            rank={myRankRow.sharedRank}
            name={myRankRow.row.display_name || myRankRow.row.username || "Usuario"}
            points={getDisplayedTotalPoints(myRankRow.row, includeIcaTestInScoreExplanation)}
            onOpen={() => openScoreBreakdown(myRankRow.row)}
            tieCorrect={tieCorrectFor(myRankRow.row)}
          />
        </div>
      ) : null}

      <div className="mt-3">
        {loading ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            <div className="h-48 animate-pulse rounded-3xl bg-muted" />
            <div className="h-12 animate-pulse rounded-2xl bg-muted" />
            <div className="h-12 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : error ? (
          <p className="text-sm font-bold text-destructive">{error}</p>
        ) : rowsWithSharedRank.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isCurrentMonth
              ? t("Todavía no hay datos disponibles para este período.")
              : t('Se están calculando los resultados de {n}. En el transcurso del día estarán disponibles.', { n: formatMonthLabel(selectedMonth) })}
          </p>
        ) : (
          <>
            <Podium
              entries={podiumRows.map(({ row, sharedRank }) => ({
                key: `${row.user_id}-${selectedMonth}`,
                rank: sharedRank,
                name: row.display_name || row.username || "Usuario",
                points: getDisplayedTotalPoints(row, includeIcaTestInScoreExplanation),
                isMe: row.user_id === user?.id,
                badge: row.user_id === user?.id ? myBadge : parseFeaturedBadge(row.featured_badge),
                flag: row.user_id === user?.id ? myFlag : row.display_flag ?? null,
                onOpen: () => openScoreBreakdown(row),
                onProfile: () => openProfile(row),
                onPrize: () => setSelectedPrizeRank(Math.min(3, sharedRank) as LeaderboardPrizeRank),
                tieCorrect: tieCorrectFor(row),
              }))}
            />
            <div className="ica-group mt-0 flex flex-col gap-0.5 py-1.5">
              {listRows.map((item, index) => {
                // Si hay más gente después del 30, los últimos puestos se van difuminando.
                const opacity = rows.length > FOCUS_TOP_LIMIT ? rankingFadeOpacity(index + 3, FOCUS_TOP_LIMIT) : 1;
                if (opacity >= 1 || item.row.user_id === user?.id) return renderRow(item);
                return (
                  <div key={`fade-${item.row.user_id}-${selectedMonth}`} style={{ opacity }}>
                    {renderRow(item)}
                  </div>
                );
              })}
              <RankingFadeOut remaining={Math.max(0, rows.length - FOCUS_TOP_LIMIT)} />
            </div>
          </>
        )}
      </div>

      {/* Perfil de un icademer (al tocar su inicial o su nombre) */}
      {profileSummary ? (
        <IcademerProfileDialog summary={profileSummary} onClose={() => setProfileSummary(null)} />
      ) : null}

      {/* Detalle de puntos (tuyo o de otra persona) */}
      <Dialog
        open={Boolean(selectedScoreBreakdown)}
        onOpenChange={(open) => {
          if (!open) setSelectedScoreBreakdown(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {selectedScoreBreakdown ? (
            <ScoreBreakdownContent
              breakdown={selectedScoreBreakdown}
              icaTestWindowStartDay={icaTestWindowStartDay}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedPrizeRank !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPrizeRank(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {selectedPrizeRank ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2 pt-1 text-center">
                <span
                  className="ica-badge-reveal flex size-20 items-center justify-center rounded-full font-display text-4xl font-black"
                  style={{
                    background: PRIZE_COLORS[selectedPrizeRank][0],
                    color: PRIZE_COLORS[selectedPrizeRank][2],
                    boxShadow: `0 5px 0 ${PRIZE_COLORS[selectedPrizeRank][1]}`,
                  }}
                >
                  {selectedPrizeRank}
                </span>
                <DialogTitle className="pr-0 text-2xl">
                  {t("Premio del puesto {rank}", { rank: selectedPrizeRank })}
                </DialogTitle>
                <DialogDescription className="m-0 text-sm font-semibold">
                  {getPrizeHeading(selectedPrizeRank)}
                </DialogDescription>
              </div>
              <RowGroup>
                {LEADERBOARD_PRIZES[selectedPrizeRank].rewards.map((reward) => (
                  <div key={reward.text} className="flex items-center gap-3 py-2.5">
                    {reward.icon}
                    <span className="text-sm font-extrabold">{t(reward.text)}</span>
                  </div>
                ))}
              </RowGroup>
              <Button type="button" size="xl" className="w-full" onClick={() => setSelectedPrizeRank(null)}>
                {t("¡A por ello!")}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
