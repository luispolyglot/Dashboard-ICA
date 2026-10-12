import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeftIcon,
  CrownIcon,
  DumbbellIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GamePage, Panel, tone } from "../game/ui";
import {
  fetchMyCoachingDashboard,
  fetchMyCoachingV2SessionBoard,
  submitCoachingV2FocusExerciseAttempt,
  type CoachingV2SessionBoard,
} from "../services/coaching";
import { getCoachingPersonalizedSessionRoute } from "../routes/paths";
import { normalizeExercisePayload } from "./coachingV2ExerciseLogic";
import { invalidateHomeCoachingCache } from "../components/CoachingHomeCard";
import {
  CoachingFocusExerciseRunner,
  type CoachingFocusExerciseResult,
} from "./CoachingFocusExerciseRunner";
import { t } from "@/i18n";

type CoachingV2ExerciseViewProps = {
  sessionId: string;
  periodNumber: number;
  focusId: string;
  targetLang?: string;
};

export function CoachingV2ExerciseView({
  sessionId,
  periodNumber,
  focusId,
  targetLang,
}: CoachingV2ExerciseViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<CoachingV2SessionBoard | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const memberships = await fetchMyCoachingDashboard(targetLang);
      const allowed = memberships.some(
        (item) => item.id === sessionId && item.programVersion === "v2",
      );
      if (!allowed) {
        setError(t("No tienes acceso a este ejercicio."));
        setBoard(null);
        return;
      }

      const boardData = await fetchMyCoachingV2SessionBoard({
        sessionId,
        periodNumber,
      });
      setBoard(boardData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("No se pudo cargar el ejercicio del foco."),
      );
    } finally {
      setLoading(false);
    }
  }, [periodNumber, sessionId, targetLang]);

  useEffect(() => {
    void loadData();
  }, [focusId, loadData]);

  const focus = useMemo(
    () =>
      board?.focuses.find(
        (item) => item.id === focusId && item.periodNumber === periodNumber,
      ) || null,
    [board?.focuses, focusId, periodNumber],
  );

  const exercise = useMemo(
    () =>
      board?.focusExercises.find((item) => item.focusId === focusId) || null,
    [board?.focusExercises, focusId],
  );

  useEffect(() => {
    if (!exercise) return;
    if (exercise.status !== "pending" && exercise.status !== "generating")
      return;
    const timer = window.setInterval(() => {
      void loadData();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [exercise, loadData]);

  const data = useMemo(
    () => normalizeExercisePayload(exercise?.exercise || null),
    [exercise?.exercise],
  );

  const handleComplete = useCallback(
    async (result: CoachingFocusExerciseResult) => {
      const saved = await submitCoachingV2FocusExerciseAttempt({
        sessionId,
        periodNumber,
        focusId,
        ...result,
      });
      invalidateHomeCoachingCache();
      return saved.phaseTrainedUpdated
        ? t("¡Superado! El foco pasa a Entrenado y tu coach ya ve tus respuestas.")
        : t("Entregado. Tu coach ya ve tus respuestas.");
    },
    [focusId, periodNumber, sessionId],
  );


  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
      <Link to={getCoachingPersonalizedSessionRoute(sessionId)}>
        <ChevronLeftIcon strokeWidth={2.8} aria-hidden="true" />
        {t("Tu coaching")}
      </Link>
    </Button>
  );

  // Same navy and gold as the coaching card on Home (Luis, 6 Oct: the exercise looked like the old app).
  const header = (
    <header className="coaching-hero relative overflow-hidden rounded-[28px] px-5 py-5 text-white lg:px-6">
      <span
        className="coaching-hero-glow pointer-events-none absolute -top-20 -right-16 size-64 rounded-full"
        aria-hidden="true"
      />
      <div className="relative flex items-start gap-4">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: "var(--ica-gold)", boxShadow: "0 4px 0 var(--ica-gold-edge)" }}
        >
          <DumbbellIcon className="size-7" strokeWidth={2.6} style={{ color: "#4a3200" }} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="m-0 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-black tracking-[0.14em] uppercase"
            style={{ color: "var(--ica-gold)" }}
          >
            <CrownIcon className="size-3" strokeWidth={2.8} aria-hidden="true" />
            {t("Entrenamiento de foco")}
          </p>
          <h1 className="m-0 mt-2 font-display text-2xl leading-tight font-black tracking-tight lg:text-3xl">
            {focus?.focusTitle || t("Ejercicio de foco")}
          </h1>
          <p className="m-0 mt-1 text-sm font-semibold text-white/75">
            {t("Fase Entrenado: tres bloques, unos cinco minutos.")}
            {data?.nivel ? ` · ${t("Nivel {level}", { level: data.nivel })}` : ""}
          </p>
        </div>
      </div>
    </header>
  );

  const notice = (
    icon: ReactNode,
    text: string,
    toneName: "neutral" | "bad",
    action?: ReactNode,
  ) => (
    <Panel tone={toneName === "bad" ? "bad" : undefined} className="flex items-center gap-3">
      <span className="flex shrink-0 items-center" style={{ color: tone(toneName).ink }}>
        {icon}
      </span>
      <p className="m-0 min-w-0 flex-1 text-sm font-bold" style={{ color: tone(toneName).ink }}>
        {text}
      </p>
      {action}
    </Panel>
  );

  const reloadButton = (
    <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} aria-label={t("Recargar")}>
      <RefreshCwIcon className="size-4" strokeWidth={2.6} aria-hidden="true" />
      {t("Recargar")}
    </Button>
  );

  if (loading && !board) {
    return (
      <GamePage className="max-w-2xl">
        {backLink}
        <div className="coaching-hero h-32 animate-pulse rounded-[28px]" aria-hidden="true" />
        <div className="ica-panel h-48 animate-pulse" aria-hidden="true" />
        <p className="sr-only">{t("Cargando ejercicio...")}</p>
      </GamePage>
    );
  }

  return (
    <GamePage className="max-w-2xl">
      {backLink}
      {header}

      {error ? (
        notice(<TriangleAlertIcon className="size-6" strokeWidth={2.6} aria-hidden="true" />, error, "bad", reloadButton)
      ) : !focus ? (
        notice(<TriangleAlertIcon className="size-6" strokeWidth={2.6} aria-hidden="true" />, t("No se encontro el foco solicitado."), "neutral")
      ) : !exercise ? (
        notice(<TriangleAlertIcon className="size-6" strokeWidth={2.6} aria-hidden="true" />, t("No hay ejercicio asociado a este foco."), "neutral")
      ) : exercise.status === "error" ? (
        notice(
          <TriangleAlertIcon className="size-6" strokeWidth={2.6} aria-hidden="true" />,
          exercise.error || t("No se pudo generar este ejercicio."),
          "bad",
          reloadButton,
        )
      ) : exercise.status === "pending" || exercise.status === "generating" ? (
        notice(
          <LoaderCircleIcon className="size-6 animate-spin" strokeWidth={2.6} aria-hidden="true" />,
          t("El contenido todavía se está preparando. Esta vista se actualiza automáticamente."),
          "neutral",
        )
      ) : !data ? (
        notice(
          <TriangleAlertIcon className="size-6" strokeWidth={2.6} aria-hidden="true" />,
          t("El ejercicio generado no tiene el formato esperado. Recarga o avisa a soporte."),
          "bad",
          reloadButton,
        )
      ) : (
        <CoachingFocusExerciseRunner data={data} onComplete={handleComplete} />
      )}
    </GamePage>
  );
}
