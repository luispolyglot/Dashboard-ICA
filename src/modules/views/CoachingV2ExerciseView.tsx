import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchMyCoachingDashboard,
  fetchMyCoachingV2SessionBoard,
  submitCoachingV2FocusExerciseAttempt,
  type CoachingV2FocusExercise,
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

function getExerciseStatusLabel(
  status: CoachingV2FocusExercise["status"],
): string {
  if (status === "ready") return t("Listo");
  if (status === "generating") return t("Generando");
  if (status === "error") return t("Error");
  return t("Pendiente");
}

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


  if (loading) {
    return (
      <section className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 py-8">
        <p className="text-sm text-muted-foreground">{t("Cargando ejercicio...")}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="mb-1 font-display tracking-tight text-3xl font-extrabold">
            {t("Ejercicio de foco")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("Fase Entrenado: tres bloques, unos cinco minutos.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" type="button">
            <Link to={getCoachingPersonalizedSessionRoute(sessionId)}>{t("Volver")}</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadData()}
          >
            <RefreshCwIcon className="h-4 w-4" />
            {t("Recargar")}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !focus ? (
        <p className="text-sm text-muted-foreground">
          {t("No se encontro el foco solicitado.")}
        </p>
      ) : !exercise ? (
        <p className="text-sm text-muted-foreground">
          {t("No hay ejercicio asociado a este foco.")}
        </p>
      ) : (
        <Card className="border-primary/20 bg-card shadow-sm">
          <CardHeader className="border-b border-primary/10">
            <CardTitle>{focus.focusTitle}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("Estado: {status}", { status: getExerciseStatusLabel(exercise.status) })}
            </p>
            {data && (
              <p className="text-xs text-muted-foreground">
                {t("{slot} · fase {phase} · nivel {level}", { slot: data.focoSlot, phase: t(data.fase), level: data.nivel })}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {exercise.status === "error" && (
              <p className="text-sm text-destructive">
                {exercise.error || t("No se pudo generar este ejercicio.")}
              </p>
            )}

            {(exercise.status === "pending" ||
              exercise.status === "generating") && (
              <p className="text-sm text-muted-foreground">
                {t("El contenido todavía se está preparando. Esta vista se actualiza automáticamente.")}
              </p>
            )}

            {exercise.status === "ready" && !data && (
              <p className="text-sm text-destructive">
                {t("El ejercicio generado no tiene el formato esperado. Recarga o avisa a soporte.")}
              </p>
            )}

            {exercise.status === "ready" && data && (
              <CoachingFocusExerciseRunner
                data={data}
                onComplete={handleComplete}
              />
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
