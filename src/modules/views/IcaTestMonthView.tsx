import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarClockIcon,
  CheckIcon,
  LockIcon,
  RotateCcwIcon,
  SaveIcon,
  TimerIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, langName } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import confetti from "canvas-confetti";
import { useIcaTestRunner } from "../hooks/useIcaTestRunner";
import {
  buildIcaTestQuestions,
  buildIcaTestWordPool,
  finalizeIcaTestAttempt,
  getCurrentIcaTestMonthDate,
  getIcaTestByMonth,
  getIcaTestMonthLabel,
  ICA_TEST_MAX_WORDS_PER_ITEM,
  getIcaTestWindowStartDay,
  getIcaTestWordsUsed,
  ICA_TEST_MIN_MONTH_DATE,
  ICA_TEST_REQUIRED_WORDS,
  ICA_TEST_SECONDS_PER_QUESTION,
  ICA_TEST_TOTAL_QUESTIONS,
  isIcaTestWindowOpen,
  isIcaTestsFeatureAvailable,
  parseIcaTestMonthCode,
  persistIcaTestAnswer,
  startIcaTestAttempt,
} from "../services/icaTests";
import { IcaTestResultCard } from "../components/IcaTestResultCard";
import { IcaTestGlyph, IcaTestStateCard } from "../components/IcaTestParts";
import { TrophyIcon } from "../game/icons";
import { GameProgress, IconTile, Pill } from "../game/ui";
import { DASHBOARD_ROUTES, getIcaTestMonthRoute } from "../routes/paths";
import type {
  IcaTestAnswer,
  IcaTestQuestion,
  IcaTestRecord,
  Lexicard,
} from "../types";

type IcaTestMode = "official" | "redo";

type IcaTestMonthViewProps = {
  targetLang: string;
  nativeLang: string;
  cards: Lexicard[];
  monthCode: string;
  mode: IcaTestMode;
};

type PendingLeaveAction =
  | {
      kind: "path";
      to: string;
    }
  | {
      kind: "back";
    }
  | null;

const EMPTY_QUESTIONS: IcaTestQuestion[] = [];

function getScoreLiteral(
  score: number,
  total: number,
): { title: string; message: string } {
  if (total <= 0) {
    return {
      title: t("Resultado registrado"),
      message: t("Completaste el test ICA."),
    };
  }

  const ratio = score / total;
  if (ratio === 1) {
    return {
      title: t("Perfección total"),
      message: t("Clavaste las {total} respuestas. Nivel altísimo.", { total }),
    };
  }

  if (ratio >= 0.8) {
    return {
      title: t("Excelente resultado"),
      message: t("Muy sólido. Estás muy cerca de la puntuación perfecta."),
    };
  }

  if (ratio >= 0.6) {
    return {
      title: t("Buen avance"),
      message: t("Vas por buen camino. Reintentar puede consolidarte."),
    };
  }

  if (ratio >= 0.4) {
    return {
      title: t("Base construida"),
      message: t("Ya hay progreso. Refuerza vocabulario y vuelve a intentarlo."),
    };
  }

  return {
    title: t("Punto de partida"),
    message: t("Este resultado te marca exactamente qué reforzar."),
  };
}

function getOfficialBlockedMessage(test: IcaTestRecord): string {
  if (test.status === "completed") {
    return t("Puntuación guardada: {score}/{total}.", { score: test.score, total: test.totalQuestions });
  }

  return t("Este intento se cerró por salida/recarga y quedó fallido.");
}

type IcaTestErrorReviewItem = {
  questionNumber: number;
  promptNative: string;
  selectedOption: string;
  correctOption: string;
};

function buildIcaTestErrorReviewItems(
  questions: IcaTestQuestion[],
  answers: IcaTestAnswer[],
): IcaTestErrorReviewItem[] {
  return answers
    .filter((answer) => !answer.isCorrect)
    .map((answer) => {
      const question = questions[answer.questionIndex];
      const selectedOption =
        answer.selectedOptionIndex !== null &&
        question?.options[answer.selectedOptionIndex]
          ? question.options[answer.selectedOptionIndex]
          : t("Sin respuesta (tiempo agotado)");

      return {
        questionNumber: answer.questionIndex + 1,
        promptNative: question?.promptNative || "-",
        selectedOption,
        correctOption: question?.correctTarget || "-",
      };
    });
}

export function IcaTestMonthView({
  targetLang,
  nativeLang,
  cards,
  monthCode,
  mode,
}: IcaTestMonthViewProps) {
  const navigate = useNavigate();
  const [storedTest, setStoredTest] = useState<IcaTestRecord | null>(null);
  const [attempt, setAttempt] = useState<IcaTestRecord | null>(null);
  const [isLoadingStoredTest, setIsLoadingStoredTest] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errorReviewOpen, setErrorReviewOpen] = useState(false);
  const [errorReviewTitle, setErrorReviewTitle] = useState("");
  const [errorReviewItems, setErrorReviewItems] = useState<
    IcaTestErrorReviewItem[]
  >([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [perfectCardNode, setPerfectCardNode] = useState<HTMLDivElement | null>(
    null,
  );
  const allowNavigationRef = useRef(false);
  const attemptRef = useRef<IcaTestRecord | null>(null);
  const pendingLeaveRef = useRef<PendingLeaveAction>(null);
  const lastConfettiKeyRef = useRef<string | null>(null);

  const handlePerfectCardRef = useCallback((node: HTMLDivElement | null) => {
    setPerfectCardNode(node);
  }, []);

  const now = useMemo(() => new Date(), []);
  const windowStartDay = getIcaTestWindowStartDay();
  const featureAvailable = useMemo(
    () => isIcaTestsFeatureAvailable(now),
    [now],
  );
  const monthDate = useMemo(
    () => parseIcaTestMonthCode(monthCode),
    [monthCode],
  );
  const currentMonth = useMemo(() => getCurrentIcaTestMonthDate(now), [now]);
  const isWindowOpen = useMemo(() => isIcaTestWindowOpen(now), [now]);

  const launchCardConfetti = useCallback(() => {
    const card = perfectCardNode;

    if (!card) {
      confetti({
        particleCount: 80,
        spread: 170,
        startVelocity: 20,
        gravity: 1.05,
        ticks: 320,
        origin: { x: 0.5, y: 0.34 },
        zIndex: 1200,
        disableForReducedMotion: false,
      });
      return;
    }

    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const topY = rect.top + Math.max(28, rect.height * 0.22);
    let burstCount = 0;

    const burst = () => {
      const spreadOffset = (Math.random() - 0.5) * rect.width * 0.75;
      const originX = Math.max(
        0.08,
        Math.min(0.92, (centerX + spreadOffset) / window.innerWidth),
      );
      const originY = Math.max(0.02, Math.min(0.4, topY / window.innerHeight));

      confetti({
        particleCount: 44,
        spread: 190,
        startVelocity: 18,
        gravity: 1.08,
        decay: 0.92,
        angle: 90,
        ticks: 320,
        zIndex: 1200,
        disableForReducedMotion: false,
        origin: {
          x: originX,
          y: originY,
        },
      });
    };

    burst();
    const intervalId = window.setInterval(() => {
      burstCount += 1;
      burst();
      if (burstCount >= 8) {
        window.clearInterval(intervalId);
      }
    }, 230);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [perfectCardNode]);

  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);

  useEffect(() => {
    if (!monthDate) {
      setStoredTest(null);
      setAttempt(null);
      setIsLoadingStoredTest(false);
      setLoadError(t("Mes de test inválido."));
      return;
    }

    let active = true;
    setIsLoadingStoredTest(true);
    setLoadError(null);

    void getIcaTestByMonth(targetLang, nativeLang, monthDate, {
      autoFailIfRunning: mode === "official",
    })
      .then((test) => {
        if (!active) return;
        setStoredTest(test);
        setAttempt(null);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(t("No pudimos cargar el estado del test ICA."));
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingStoredTest(false);
      });

    return () => {
      active = false;
    };
  }, [mode, monthDate, nativeLang, targetLang]);

  const wordPool = useMemo(() => {
    if (!monthDate) return null;
    return buildIcaTestWordPool(cards, monthDate);
  }, [cards, monthDate]);

  const activeQuestions = useMemo(() => {
    if (mode === "redo") return storedTest?.questions ?? [];
    return attempt?.questions ?? [];
  }, [attempt?.questions, mode, storedTest?.questions]);

  const isOfficialBlockedByDate =
    mode === "official" && monthDate !== currentMonth;
  const isOfficialBlockedByWindow = mode === "official" && !isWindowOpen;
  const isOfficialBlockedByFeature =
    mode === "official" &&
    (!featureAvailable || (monthDate || "") < ICA_TEST_MIN_MONTH_DATE);
  const isOfficialBlockedByWords = mode === "official" && !wordPool?.eligible;

  const hasRunningOfficialAttempt =
    mode === "official" && attempt?.status === "running";

  const expectedRunnerQuestions =
    mode === "redo"
      ? Math.max(1, storedTest?.totalQuestions || activeQuestions.length)
      : ICA_TEST_TOTAL_QUESTIONS;

  const shouldStartRunner =
    !isLoadingStoredTest &&
    !loadError &&
    activeQuestions.length === expectedRunnerQuestions &&
    ((mode === "redo" && Boolean(storedTest)) || hasRunningOfficialAttempt);

  const runnerQuestions = useMemo(
    () => (shouldStartRunner ? activeQuestions : EMPTY_QUESTIONS),
    [activeQuestions, shouldStartRunner],
  );

  const failCurrentAttempt = async (reason: string): Promise<void> => {
    const currentAttempt = attemptRef.current;
    if (!currentAttempt || currentAttempt.status !== "running") return;

    setIsFinalizing(true);
    try {
      const failed = await finalizeIcaTestAttempt({
        attemptId: currentAttempt.id,
        status: "failed",
        score: currentAttempt.score,
        currentQuestionIndex: currentAttempt.currentQuestionIndex,
        failReason: reason,
      });
      setAttempt((previous) => {
        if (!previous || previous.id !== failed.id) return failed;
        return {
          ...failed,
          questions: previous.questions,
        };
      });
      setStoredTest(failed);
    } finally {
      setIsFinalizing(false);
    }
  };

  useEffect(() => {
    if (!hasRunningOfficialAttempt) {
      allowNavigationRef.current = false;
      pendingLeaveRef.current = null;
      setLeaveDialogOpen(false);
      return;
    }

    const onDocumentClickCapture = (event: MouseEvent): void => {
      if (allowNavigationRef.current || leaveDialogOpen) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;

      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest('[role="dialog"]')) return;

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let nextUrl: URL;
      try {
        nextUrl = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (nextUrl.origin !== window.location.origin) return;

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      if (nextPath === currentPath) return;

      event.preventDefault();
      event.stopPropagation();

      pendingLeaveRef.current = { kind: "path", to: nextPath };
      setLeaveDialogOpen(true);
    };

    document.addEventListener("click", onDocumentClickCapture, true);
    return () => {
      document.removeEventListener("click", onDocumentClickCapture, true);
    };
  }, [hasRunningOfficialAttempt, leaveDialogOpen]);

  useEffect(() => {
    if (!hasRunningOfficialAttempt) return;

    const markerState = { icaTestGuard: true, at: Date.now() };
    window.history.pushState(markerState, "", window.location.href);

    const onPopState = (): void => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false;
        return;
      }
      if (leaveDialogOpen) {
        window.history.pushState(markerState, "", window.location.href);
        return;
      }

      pendingLeaveRef.current = { kind: "back" };
      setLeaveDialogOpen(true);
      window.history.pushState(markerState, "", window.location.href);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [hasRunningOfficialAttempt, leaveDialogOpen]);

  useEffect(() => {
    if (!hasRunningOfficialAttempt) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [hasRunningOfficialAttempt]);

  const handleStartOfficialAttempt = async (): Promise<void> => {
    if (!monthDate || !wordPool?.eligible || isStarting) return;
    setSaveError(null);
    setIsStarting(true);

    try {
      const questions = buildIcaTestQuestions(wordPool.pool);
      if (questions.length !== ICA_TEST_TOTAL_QUESTIONS) {
        throw new Error(t("No pudimos generar las 12 preguntas del test ICA."));
      }

      const started = await startIcaTestAttempt({
        targetLang,
        nativeLang,
        testMonth: monthDate,
        questions,
      });
      setHasAcceptedDisclaimer(true);
      setAttempt(started);
      setStoredTest(null);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "ICA_TEST_ALREADY_STARTED"
      ) {
        setSaveError(
          t("Este test ya fue iniciado. Recarga para ver su estado final."),
        );
      } else if (error instanceof Error) {
        setSaveError(error.message);
      } else {
        setSaveError(t("No pudimos iniciar el test ICA."));
      }
    } finally {
      setIsStarting(false);
    }
  };

  const {
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    timeLeft,
    progressPercent,
    answers,
    score,
    isFinished,
    isAnswering,
    answerQuestion,
  } = useIcaTestRunner({
    questions: runnerQuestions,
    secondsPerQuestion: ICA_TEST_SECONDS_PER_QUESTION,
    onAnswer:
      mode === "official" && hasRunningOfficialAttempt
        ? async ({ answers, nextQuestionIndex, score: nextScore }) => {
            setSaveError(null);
            const currentAttempt = attemptRef.current;
            if (!currentAttempt || currentAttempt.status !== "running") return;

            const updated = await persistIcaTestAnswer({
              attemptId: currentAttempt.id,
              answers,
              currentQuestionIndex: nextQuestionIndex,
              score: nextScore,
            });
            setAttempt((previous) => {
              if (!previous || previous.id !== updated.id) return updated;
              return {
                ...updated,
                questions: previous.questions,
              };
            });
          }
        : undefined,
    onAnswerError: (error) => {
      if (
        error instanceof Error &&
        error.message === "ICA_TEST_ATTEMPT_NOT_RUNNING"
      ) {
        setSaveError(
          t("El intento ya no está en curso. Recarga para ver el estado final."),
        );
        return;
      }
      if (error instanceof Error && error.message) {
        setSaveError(t("No pudimos guardar tu respuesta: {error}", { error: error.message }));
        return;
      }
      setSaveError(
        t("No pudimos guardar tu respuesta. Reintenta; si persiste, recarga."),
      );
    },
    onFinish: async (answers) => {
      if (mode === "official") {
        const currentAttempt = attemptRef.current;
        if (!currentAttempt || currentAttempt.status !== "running") return;

        const nextScore = answers.reduce(
          (value, answer) => value + Number(answer.isCorrect),
          0,
        );

        setIsFinalizing(true);
        try {
          const completed = await finalizeIcaTestAttempt({
            attemptId: currentAttempt.id,
            status: "completed",
            score: nextScore,
            currentQuestionIndex: ICA_TEST_TOTAL_QUESTIONS,
          });
          setAttempt((previous) => {
            if (!previous || previous.id !== completed.id) return completed;
            return {
              ...completed,
              questions: previous.questions,
            };
          });
          setStoredTest(completed);
        } finally {
          setIsFinalizing(false);
        }
      }
    },
  });

  const finalOfficialScore =
    attempt?.status === "completed" ? attempt.score : null;
  const finalOfficialTotal =
    attempt?.status === "completed" ? attempt.totalQuestions : null;
  const isOfficialPerfect =
    finalOfficialScore !== null &&
    finalOfficialTotal !== null &&
    finalOfficialTotal > 0 &&
    finalOfficialScore === finalOfficialTotal;
  const isRedoPerfect =
    mode === "redo" &&
    isFinished &&
    totalQuestions > 0 &&
    score === totalQuestions;

  useEffect(() => {
    if (!isOfficialPerfect && !isRedoPerfect) return;

    const key = `${mode}:${monthCode}:${isOfficialPerfect ? finalOfficialScore : score}`;
    if (lastConfettiKeyRef.current === key) return;

    lastConfettiKeyRef.current = key;
    return launchCardConfetti();
  }, [
    finalOfficialScore,
    isOfficialPerfect,
    isRedoPerfect,
    isFinished,
    launchCardConfetti,
    mode,
    monthCode,
    score,
  ]);

  const openErrorReview = (
    title: string,
    questions: IcaTestQuestion[],
    answersList: IcaTestAnswer[],
  ): void => {
    const items = buildIcaTestErrorReviewItems(questions, answersList);
    if (items.length === 0) return;
    setErrorReviewTitle(title);
    setErrorReviewItems(items);
    setErrorReviewOpen(true);
  };

  const errorReviewDialog = (
    <Dialog open={errorReviewOpen} onOpenChange={setErrorReviewOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{errorReviewTitle || t("Detalle de errores")}</DialogTitle>
          <DialogDescription>
            {t("Lo que elegiste y la respuesta correcta de cada fallo.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[55vh] flex-col gap-2.5 overflow-y-auto pr-1">
          {errorReviewItems.map((item) => (
            <div
              key={`error-review-${item.questionNumber}-${item.correctOption}`}
              className="rounded-2xl border-2 border-border p-3.5"
            >
              <div className="mb-2 flex items-center gap-2">
                <Pill tone="neutral">{t("Pregunta {n}", { n: item.questionNumber })}</Pill>
              </div>
              <p className="m-0 text-lg leading-tight font-black">
                {item.promptNative}
              </p>
              <div className="mt-2.5 flex flex-col gap-1.5 text-sm font-bold">
                <p
                  className="m-0 flex items-start gap-2 rounded-xl px-2.5 py-1.5"
                  style={{
                    background: "var(--ica-bad-soft)",
                    color: "var(--ica-bad-ink)",
                  }}
                >
                  <XIcon
                    className="mt-0.5 size-4 shrink-0"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                  <span>{t("Elegiste: {option}", { option: item.selectedOption })}</span>
                </p>
                <p
                  className="m-0 flex items-start gap-2 rounded-xl px-2.5 py-1.5"
                  style={{
                    background: "var(--ica-ok-soft)",
                    color: "var(--ica-ok-ink)",
                  }}
                >
                  <CheckIcon
                    className="mt-0.5 size-4 shrink-0"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                  <span>{t("Correcta: {option}", { option: item.correctOption })}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );

  // Botón de "Ver errores" (se repite en los tres resultados)
  const errorsButton = (onClick: () => void) => (
    <Button
      type="button"
      variant="destructive"
      size="lg"
      className="w-full max-w-xs"
      onClick={onClick}
    >
      <XIcon data-icon="inline-start" className="size-5" strokeWidth={2.8} />
      {t("Ver errores")}
    </Button>
  );

  // Reintentar + aviso de que no cambia el resultado original
  const redoButton = (to: string, label = t("Reintentar")) => (
    <div className="flex w-full flex-col gap-1">
      <Button type="button" variant="outline" size="xl" className="w-full" asChild>
        <Link to={to}>
          <RotateCcwIcon data-icon="inline-start" className="size-5" strokeWidth={2.6} />
          {label}
        </Link>
      </Button>
      <p className="m-0 text-xs font-bold text-muted-foreground">
        {t("No afecta al resultado original")}
      </p>
    </div>
  );

  const backToTestsLink = (label = t("Volver a Tests ICA")) => (
    <Button type="button" variant="outline" size="lg" asChild>
      <Link to={DASHBOARD_ROUTES.testsIca}>{label}</Link>
    </Button>
  );

  if (!monthDate) {
    return (
      <IcaTestStateCard
        tone="bad"
        icon={<TriangleAlertIcon className="size-10" strokeWidth={2.4} />}
        title={t("Ruta inválida")}
        text={t("El formato esperado es MMYYYY.")}
      >
        {backToTestsLink()}
      </IcaTestStateCard>
    );
  }

  if (isLoadingStoredTest) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pt-2 pb-8 lg:py-8">
        <div className="h-44 animate-pulse rounded-3xl bg-muted/70" />
        <p className="m-0 text-center text-sm font-bold text-muted-foreground">
          {t("Cargando test ICA...")}
        </p>
      </section>
    );
  }

  if (loadError) {
    return (
      <IcaTestStateCard
        tone="bad"
        icon={<TriangleAlertIcon className="size-10" strokeWidth={2.4} />}
        title={t("No pudimos abrir este test")}
        text={loadError}
      >
        {backToTestsLink()}
      </IcaTestStateCard>
    );
  }

  if (mode === "redo" && !storedTest) {
    return (
      <IcaTestStateCard
        tone="c"
        icon={<IcaTestGlyph size={48} />}
        title={t("Este test no existe aún")}
        text={t("Solo puedes reintentar tests ICA que ya estén completados y guardados.")}
      >
        {backToTestsLink(t("Ver Tests ICA"))}
      </IcaTestStateCard>
    );
  }

  if (isOfficialBlockedByFeature) {
    return (
      <IcaTestStateCard
        icon={<LockIcon className="size-10" strokeWidth={2.4} />}
        title={t("Test no disponible")}
        text={t("Los Tests ICA oficiales comienzan en mayo de 2026.")}
      />
    );
  }

  if (isOfficialBlockedByDate) {
    return (
      <IcaTestStateCard
        icon={<LockIcon className="size-10" strokeWidth={2.4} />}
        title={t("Test bloqueado")}
        text={t("Solo puedes hacer el test del mes actual.")}
      >
        {backToTestsLink()}
      </IcaTestStateCard>
    );
  }

  if (isOfficialBlockedByWindow) {
    return (
      <IcaTestStateCard
        tone="i"
        icon={<CalendarClockIcon className="size-10" strokeWidth={2.4} />}
        title={t("Fuera de la ventana del mes")}
        text={t("El test oficial se abre entre los días {start} y 28 de cada mes.", { start: windowStartDay })}
      />
    );
  }

  if (mode === "official" && storedTest && storedTest.status !== "running") {
    const result = getScoreLiteral(storedTest.score, storedTest.totalQuestions);
    const title =
      storedTest.status === "completed"
        ? result.title
        : t("Intento oficial cerrado");
    const message =
      storedTest.status === "completed"
        ? result.message
        : t("Este intento se cerró por salida o recarga antes de completarlo.");

    return (
      <section className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pt-2 pb-8 lg:py-8">
        <div ref={handlePerfectCardRef} className="w-full">
          <IcaTestResultCard
            monthLabel={getIcaTestMonthLabel(monthDate)}
            title={title}
            score={storedTest.score}
            totalQuestions={storedTest.totalQuestions}
            message={message}
            leaderboardPoints={
              storedTest.status === "completed" ? storedTest.score / 10 : null
            }
            note={getOfficialBlockedMessage(storedTest)}
            errorReviewAction={
              storedTest.status === "completed" &&
              storedTest.score < storedTest.totalQuestions &&
              buildIcaTestErrorReviewItems(
                storedTest.questions,
                storedTest.answers,
              ).length > 0
                ? errorsButton(() =>
                    openErrorReview(
                      `${t("Errores")} · ${getIcaTestMonthLabel(monthDate)}`,
                      storedTest.questions,
                      storedTest.answers,
                    ),
                  )
                : null
            }
            actions={
              <div className="flex flex-col gap-3">
                <Button type="button" size="xl" variant="c" className="w-full" asChild>
                  <Link to={DASHBOARD_ROUTES.testsIca}>{t("Ver Tests ICA")}</Link>
                </Button>
                {redoButton(getIcaTestMonthRoute(storedTest.monthCode, true))}
              </div>
            }
          />
        </div>
        {errorReviewDialog}
      </section>
    );
  }

  if (isOfficialBlockedByWords && wordPool) {
    return (
      <IcaTestStateCard
        tone="gold"
        icon={<IcaTestGlyph size={48} />}
        title={t("No hay palabras suficientes")}
        text={t("Necesitas al menos {required} palabras ICA. Priorizamos frases de hasta {max} palabras y, si no alcanza, ampliamos el filtro automáticamente.", { required: ICA_TEST_REQUIRED_WORDS, max: ICA_TEST_MAX_WORDS_PER_ITEM })}
      >
        <div className="w-full max-w-sm">
          <div className="mb-1.5 flex items-baseline justify-between text-sm font-extrabold">
            <span>{t("Disponibles")}</span>
            <span className="tabular-nums" style={{ color: "var(--ica-gold-ink)" }}>
              {wordPool.availableWords}/{ICA_TEST_REQUIRED_WORDS}
            </span>
          </div>
          <GameProgress
            value={wordPool.availableWords / ICA_TEST_REQUIRED_WORDS}
            color="var(--ica-gold)"
            height={14}
          />
        </div>
        <div className="mt-2 grid w-full max-w-sm grid-cols-2 gap-2 text-left">
          {[
            { label: t("Mes actual"), value: wordPool.fromCurrentMonth },
            { label: t("Mes anterior"), value: wordPool.fromPreviousMonth },
            { label: t("Meses anteriores"), value: wordPool.fromOlderMonths },
            {
              label: t("Frases de más de {max} palabras", { max: ICA_TEST_MAX_WORDS_PER_ITEM }),
              value: wordPool.overWordLimit,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-muted px-3 py-2.5">
              <p className="m-0 text-2xl leading-none font-black tabular-nums">
                {item.value}
              </p>
              <p className="m-0 mt-1 text-xs font-bold text-muted-foreground">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </IcaTestStateCard>
    );
  }

  if (mode === "official" && !attempt) {
    const rules = [
      {
        key: "lock",
        tone: "bad" as const,
        icon: <LockIcon className="size-5" strokeWidth={2.6} />,
        text: t("No podrás salir del test sin terminarlo."),
      },
      {
        key: "save",
        tone: "i" as const,
        icon: <SaveIcon className="size-5" strokeWidth={2.6} />,
        text: t("Cada respuesta se guarda al momento."),
      },
      {
        key: "points",
        tone: "gold" as const,
        icon: <TrophyIcon size={24} />,
        text: t("Suma puntos al ranking del mes: cada acierto vale 0,1 puntos."),
      },
      {
        key: "timer",
        tone: "a" as const,
        icon: <TimerIcon className="size-5" strokeWidth={2.6} />,
        text: t("Tienes {n} segundos por pregunta. Si se acaba el tiempo, cuenta como fallo y pasas a la siguiente.", { n: ICA_TEST_SECONDS_PER_QUESTION }),
      },
    ];

    return (
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-2 pb-8 lg:py-8">
        <div className="ica-panel overflow-hidden">
          <div
            className="flex flex-col items-center gap-2 px-5 pt-6 pb-5 text-center"
            style={{ background: "var(--ica-c-soft)" }}
          >
            <span className="ica-bob">
              <IcaTestGlyph size={72} />
            </span>
            <p
              className="m-0 text-xs font-extrabold tracking-[0.08em] uppercase"
              style={{ color: "var(--ica-c-ink)" }}
            >
              {t("Antes de empezar")}
            </p>
            <h1
              className="m-0 font-display text-2xl leading-tight font-extrabold tracking-tight first-letter:uppercase"
              style={{ color: "var(--ica-c-ink)" }}
            >
              {t("Test ICA de {month}", { month: getIcaTestMonthLabel(monthDate) })}
            </h1>
            <p className="m-0 max-w-sm text-sm font-semibold text-muted-foreground">
              {t("Este intento oficial es único. Si sales, cierras o refrescas la página, perderás la posibilidad de hacerlo y quedará fallado.")}
            </p>
          </div>

          <div className="flex flex-col gap-4 px-5 pt-2 pb-5">
            <ul className="m-0 flex list-none flex-col divide-y-2 divide-border p-0">
              {rules.map((rule) => (
                <li key={rule.key} className="flex items-center gap-3 py-3">
                  <IconTile tone={rule.tone} size={42}>
                    {rule.icon}
                  </IconTile>
                  <span className="text-sm font-bold">{rule.text}</span>
                </li>
              ))}
            </ul>

            {saveError && (
              <p
                className="m-0 text-sm font-bold"
                style={{ color: "var(--ica-bad-ink)" }}
              >
                {saveError}
              </p>
            )}
            <Button
              type="button"
              size="xl"
              variant="c"
              className="w-full"
              onClick={() => void handleStartOfficialAttempt()}
              disabled={isStarting || isFinalizing}
            >
              {isStarting ? t("Iniciando...") : t("Entiendo y comenzar test oficial")}
            </Button>
            {!hasAcceptedDisclaimer && (
              <p className="m-0 text-center text-xs font-semibold text-muted-foreground">
                {t("Al iniciar aceptas las condiciones de bloqueo y cierre por salida.")}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (mode === "official" && attempt?.status === "failed") {
    return (
      <section className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pt-2 pb-8 lg:py-8">
        <div className="w-full">
          <IcaTestResultCard
            monthLabel={getIcaTestMonthLabel(monthDate)}
            title={t("Intento oficial cerrado")}
            score={attempt.score}
            totalQuestions={attempt.totalQuestions}
            message={t("Saliste o recargaste durante el test. Este mes ya no admite un nuevo intento oficial.")}
            note={getOfficialBlockedMessage(attempt)}
            actions={
              <div className="flex flex-col gap-3">
                <Button type="button" size="xl" variant="c" className="w-full" asChild>
                  <Link to={DASHBOARD_ROUTES.testsIca}>{t("Volver a Tests ICA")}</Link>
                </Button>
                {redoButton(getIcaTestMonthRoute(monthCode, true))}
              </div>
            }
          />
        </div>
      </section>
    );
  }

  if (mode === "official" && attempt?.status === "completed") {
    const result = getScoreLiteral(attempt.score, attempt.totalQuestions);

    return (
      <section className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pt-2 pb-8 lg:py-8">
        <div ref={handlePerfectCardRef} className="w-full">
          <IcaTestResultCard
            monthLabel={getIcaTestMonthLabel(monthDate)}
            title={result.title}
            score={attempt.score}
            totalQuestions={attempt.totalQuestions}
            message={result.message}
            leaderboardPoints={attempt.score / 10}
            note={t("Se usaron {n} palabras entre preguntas y opciones.", { n: getIcaTestWordsUsed(activeQuestions).length })}
            isSaving={isFinalizing}
            errorMessage={saveError}
            errorReviewAction={
              attempt.score < attempt.totalQuestions &&
              buildIcaTestErrorReviewItems(activeQuestions, attempt.answers)
                .length > 0
                ? errorsButton(() =>
                    openErrorReview(
                      `${t("Errores")} · ${getIcaTestMonthLabel(monthDate)}`,
                      activeQuestions,
                      attempt.answers,
                    ),
                  )
                : null
            }
            actions={
              <div className="flex flex-col gap-3">
                <Button type="button" size="xl" variant="c" className="w-full" asChild>
                  <Link to={DASHBOARD_ROUTES.testsIca}>{t("Volver a Tests ICA")}</Link>
                </Button>
                {redoButton(
                  getIcaTestMonthRoute(monthCode, true),
                  t("Reintentar otra vez"),
                )}
              </div>
            }
          />
        </div>
        {errorReviewDialog}
      </section>
    );
  }

  if (mode === "redo" && isFinished) {
    const result = getScoreLiteral(score, totalQuestions);

    return (
      <section className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pt-2 pb-8 lg:py-8">
        <div ref={handlePerfectCardRef} className="w-full">
          <IcaTestResultCard
            monthLabel={`${getIcaTestMonthLabel(monthDate)} · ${t("Reintento")}`}
            title={result.title}
            score={score}
            totalQuestions={totalQuestions}
            message={result.message}
            note={t("Este resultado no cambia el original.")}
            errorReviewAction={
              score < totalQuestions &&
              buildIcaTestErrorReviewItems(activeQuestions, answers).length >
                0
                ? errorsButton(() =>
                    openErrorReview(
                      `${t("Errores")} · ${getIcaTestMonthLabel(monthDate)} · ${t("Reintento")}`,
                      activeQuestions,
                      answers,
                    ),
                  )
                : null
            }
            actions={
              <Button type="button" size="xl" variant="c" className="w-full" asChild>
                <Link to={DASHBOARD_ROUTES.testsIca}>{t("Volver a Tests ICA")}</Link>
              </Button>
            }
          />
        </div>
        {errorReviewDialog}
      </section>
    );
  }

  if (!shouldStartRunner || !currentQuestion) {
    return (
      <IcaTestStateCard
        tone="bad"
        icon={<TriangleAlertIcon className="size-10" strokeWidth={2.4} />}
        title={t("No pudimos preparar el test")}
        text={t("Intenta recargar. Si sigue pasando, revisa que tengas palabras ICA válidas.")}
      />
    );
  }

  const handleCancelLeave = () => {
    pendingLeaveRef.current = null;
    setLeaveDialogOpen(false);
  };

  const handleConfirmLeave = () => {
    const pending = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    setLeaveDialogOpen(false);
    if (!pending) return;

    void failCurrentAttempt(
      pending.kind === "back" ? "navigation_back" : "navigation_exit",
    ).finally(() => {
      allowNavigationRef.current = true;
      if (pending.kind === "back") {
        window.history.back();
        return;
      }
      navigate(pending.to);
    });
  };

  const timerSeconds = Math.max(
    0,
    Math.min(ICA_TEST_SECONDS_PER_QUESTION, timeLeft),
  );
  const timerRadius = 18;
  const timerCenter = 22;
  const timerSegmentGapDeg = 7;
  const timerSegmentCount = ICA_TEST_SECONDS_PER_QUESTION;
  const timerSegmentAngle =
    (360 - timerSegmentCount * timerSegmentGapDeg) / timerSegmentCount;

  // Verde con tiempo, naranja a mitad y rojo al final
  const timerColor =
    timerSeconds >= 5
      ? "var(--ica-ok)"
      : timerSeconds >= 3
        ? "var(--ica-fire)"
        : "var(--ica-bad-strong)";
  const timerInk =
    timerSeconds >= 5
      ? "var(--ica-ok-ink)"
      : timerSeconds >= 3
        ? "var(--ica-fire-ink)"
        : "var(--ica-bad-ink)";

  const polarToCartesian = (angleDeg: number) => {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: timerCenter + timerRadius * Math.cos(angleRad),
      y: timerCenter + timerRadius * Math.sin(angleRad),
    };
  };

  const timerSegments = Array.from(
    { length: timerSegmentCount },
    (_, index) => {
      const startDeg =
        -90 +
        index * (timerSegmentAngle + timerSegmentGapDeg) +
        timerSegmentGapDeg / 2;
      const endDeg = startDeg + timerSegmentAngle;
      const start = polarToCartesian(startDeg);
      const end = polarToCartesian(endDeg);
      const active = index < timerSeconds;

      return {
        key: `timer-segment-${index}`,
        d: `M ${start.x} ${start.y} A ${timerRadius} ${timerRadius} 0 0 1 ${end.x} ${end.y}`,
        active,
      };
    },
  );

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-2 pb-8 lg:py-8">
      {/* Cabecera: tipo de test, mes y pregunta actual */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Pill tone={mode === "redo" ? "neutral" : "c"} solid={mode !== "redo"}>
            {mode === "redo" ? t("Reintentar test ICA") : t("Test ICA oficial")}
          </Pill>
          <p className="m-0 mt-1 truncate text-sm font-bold text-muted-foreground first-letter:uppercase">
            {getIcaTestMonthLabel(monthDate)}
          </p>
        </div>
        <p className="m-0 shrink-0 text-sm font-extrabold text-muted-foreground tabular-nums">
          {t("Pregunta")}{" "}
          <span className="text-lg font-black text-foreground">
            {currentQuestionIndex + 1}
          </span>{" "}
          {t("de {total}", { total: totalQuestions })}
        </p>
      </div>

      <GameProgress
        value={progressPercent / 100}
        color="var(--ica-c)"
        height={16}
        label={t("Progreso del test")}
      />

      {mode === "official" && (
        <p
          className="m-0 flex items-start gap-2 rounded-2xl px-3 py-2 text-xs font-bold"
          style={{
            background: "var(--ica-bad-soft)",
            color: "var(--ica-bad-ink)",
          }}
        >
          <TriangleAlertIcon
            className="mt-px size-4 shrink-0"
            strokeWidth={2.6}
            aria-hidden="true"
          />
          {t("No cierres ni recargues. Si sales del test oficial, el intento se marcará como fallido.")}
        </p>
      )}

      {saveError && (
        <p className="m-0 text-sm font-bold" style={{ color: "var(--ica-bad-ink)" }}>
          {saveError}
        </p>
      )}

      {/* La pregunta en grande con el reloj */}
      <div className="ica-panel flex items-center gap-4 px-5 py-6">
        <div className="min-w-0 flex-1">
          <p className="m-0 mb-1.5 text-sm font-bold text-muted-foreground">
            {t("Elige la equivalencia en {lang}:", { lang: langName(targetLang) })}
          </p>
          <p className="m-0 font-display text-3xl leading-tight font-extrabold tracking-tight break-words">
            {currentQuestion.promptNative}
          </p>
        </div>

        <div
          className="relative size-16 shrink-0"
          role="timer"
          aria-label={t("Quedan {n} segundos", { n: timeLeft })}
        >
          <svg className="size-16" viewBox="0 0 44 44" aria-hidden="true">
            {timerSegments.map((segment) => (
              <path
                key={segment.key}
                d={segment.d}
                fill="none"
                stroke={segment.active ? timerColor : "var(--muted)"}
                strokeWidth="5"
                strokeLinecap="round"
                style={{ transition: "stroke 200ms ease" }}
              />
            ))}
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-xl font-black tabular-nums"
            style={{ color: timerInk }}
          >
            {timeLeft}
          </span>
        </div>
      </div>

      {/* Respuestas: botones grandes con canto */}
      <div className="grid gap-3 sm:grid-cols-2">
        {currentQuestion.options.map((option, index) => (
          <button
            key={`${currentQuestion.promptLexicardId}-${option}`}
            type="button"
            onClick={() => answerQuestion(index, false)}
            disabled={isAnswering || isFinalizing}
            className="ica-press flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3 text-left text-lg leading-tight font-extrabold transition-colors hover:bg-muted/50 disabled:opacity-60 dark:bg-transparent"
            style={{ boxShadow: "0 4px 0 var(--border)" }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border-2 border-border text-sm font-black text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 break-words">{option}</span>
          </button>
        ))}
      </div>

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelLeave();
            return;
          }
          setLeaveDialogOpen(true);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            handleCancelLeave();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("¿Salir del test oficial?")}</DialogTitle>
            <DialogDescription>
              {t("Si sales del test ICA, perderás este intento oficial del mes y quedará marcado como fallido.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmLeave}
            >
              {t("Sí, salir y marcar fallido")}
            </Button>
            <Button type="button" variant="c" onClick={handleCancelLeave}>
              {t("Continuar test")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
