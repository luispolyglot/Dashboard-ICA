import { AppSelect } from "@/components/ui/app-select"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRightIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  CirclePlusIcon,
  DownloadIcon,
  EyeIcon,
  LinkIcon,
  ListChecksIcon,
  Loader2Icon,
  LockIcon,
  LockOpenIcon,
  MessageCircleIcon,
  PencilIcon,
  PlayCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  UserIcon,
  VideoIcon,
  VideoOffIcon,
  CrownIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  activateCoachingV2Period,
  closeCoachingV2Period,
  deleteCoachingV2Focus,
  fetchCoachingV2SessionBoard,
  fetchMyCoachingV2SessionBoard,
  regenerateCoachingV2FocusExercise,
  upsertCoachingV2FocusExerciseExternalUrl,
  submitCoachingV2StudentClassReport,
  toggleCoachingV2FocusPhase,
  upsertCoachingV2Focus,
  upsertCoachingV2ClassCoachGuidelines,
  upsertCoachingV2PeriodReport,
  uploadCoachingClassReportImage,
  deleteCoachingClassReportImage,
  type CoachingV2ClassSlot,
  type CoachingV2Focus,
  type CoachingV2SessionBoard,
} from "../services/coaching";
import { getCoachingV2ExerciseRoute } from "../routes/paths";
import { normalizeExercisePayload } from "./coachingV2ExerciseLogic";
import { CoachingFocusExerciseRunner } from "./CoachingFocusExerciseRunner";
import {
  toDateAndTimeFromIso,
  toIsoFromDateAndTime,
} from "./coachingClassResources";
import { t, tn, langName, uiLocale } from "@/i18n";
import { IconTile } from "../game/ui";
import { TargetGlyph } from "../game/icons";
import { ContentLoading } from "@/components/ui/loading-state";
import { buildWeekRings, isTaskAnswered } from "../game/coachingRings";
import { gameSfx } from "../game/sfx";
import { CoachingWeekRingsStrip } from "../components/coaching/CoachingWeekRings";
import { CoachTaskAudioFeedback, StudentTaskAudio } from "../components/coaching/CoachingTaskAudio";
import type { CoachingTaskAudioAnswer } from "../services/coaching";
import { PendingReviewDot } from "../components/PendingReviewDot";

type CoachingV3SessionBoardProps = {
  sessionId: string;
  mode: "coach" | "student";
  targetLang: string;
  userId?: string;
  coachDisplayName?: string | null;
  fetchAsStudent?: boolean;
  onSelectedPeriodChange?: (period: number) => void;
  coachExtraContent?: ReactNode;
  /** Coach: weeks with homework audios still waiting for feedback (from the server). */
  pendingAudioPeriods?: number[];
};

const PHASE_LABELS = [
  "Explicado",
  "Entrenado",
  "Entendido",
  "Dominado",
] as const;
const DEFAULT_CLASS_TASKS = [
  "3 palabras nuevas aprendidas que usarás en tu próxima clase",
  "Frase que no entendiste hasta ver la grabación",
  "Transcribe la 1ª frase del min 30 sin usar los subtítulos",
] as const;
const PHASE_KEYS = [
  "phaseExplained",
  "phaseTrained",
  "phaseUnderstoodExplained",
  "phaseUsed",
] as const;

const PHASE_INFO: Array<{
  key: (typeof PHASE_KEYS)[number];
  label: string;
  description: string;
}> = [
  {
    key: "phaseExplained",
    label: "Explicado",
    description:
      "Tu coach te lo ha explicado en clase. Sabes que es y para que sirve.",
  },
  {
    key: "phaseTrained",
    label: "Entrenado",
    description:
      "Lo has practicado en un ejercicio dirigido. Todavía piensas antes de usarlo.",
  },
  {
    key: "phaseUnderstoodExplained",
    label: "Entendido",
    description: "El estudiante le explica al coach el foco gramatical.",
  },
  {
    key: "phaseUsed",
    label: "Dominado",
    description:
      "Te sale sola. Tu coach te lanza una pregunta en clase y sale bien.",
  },
];

function focusProgress(focus: CoachingV2Focus): number {
  return [
    focus.phaseExplained,
    focus.phaseTrained,
    focus.phaseUnderstoodExplained,
    focus.phaseUsed,
  ].filter(Boolean).length;
}

function isCompleted(focus: CoachingV2Focus): boolean {
  return focusProgress(focus) === 4;
}

function getSuggestedPhaseIndex(focus: CoachingV2Focus): number {
  if (!focus.phaseExplained) return 0;
  if (!focus.phaseTrained) return 1;
  if (!focus.phaseUnderstoodExplained) return 2;
  if (!focus.phaseUsed) return 3;
  return 3;
}

function canTogglePhase(
  focus: CoachingV2Focus,
  phase: (typeof PHASE_KEYS)[number],
): boolean {
  const phaseIndex = PHASE_KEYS.indexOf(phase);
  if (phaseIndex < 0) return false;
  const values = PHASE_KEYS.map((key) => Boolean(focus[key]));
  const checked = values[phaseIndex];
  const nextChecked = !checked;
  const allPrevDone = values.slice(0, phaseIndex).every(Boolean);
  const anyNextDone = values.slice(phaseIndex + 1).some(Boolean);
  if (nextChecked && !allPrevDone) return false;
  if (!nextChecked && anyNextDone) return false;
  return true;
}

/* Estado del ejercicio de Entrenado, tal y como lo ve el coach. */
type TrainingState = "missing" | "generating" | "stuck" | "ready" | "error";

// Si lleva más de 6 minutos "generando", la función se cortó: se ofrece reintentar.
const GENERATION_STUCK_MS = 6 * 60 * 1000;

function getTrainingState(
  exercise: CoachingV2SessionBoard["focusExercises"][number] | undefined,
): TrainingState {
  if (!exercise) return "missing";
  if (exercise.status === "ready") return "ready";
  if (exercise.status === "error") return "error";
  const updated = new Date(exercise.updatedAt).getTime();
  if (Number.isFinite(updated) && Date.now() - updated > GENERATION_STUCK_MS) {
    return "stuck";
  }
  return "generating";
}

function formatShortDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString(uiLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AggregatedTask = {
  index: number;
  classIndex: 1 | 2;
  title: string;
  prompt: string;
  done: boolean;
};

export function CoachingV3SessionBoard({
  sessionId,
  mode,
  targetLang,
  userId,
  coachDisplayName,
  fetchAsStudent,
  onSelectedPeriodChange,
  coachExtraContent,
  pendingAudioPeriods,
}: CoachingV3SessionBoardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<CoachingV2SessionBoard | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(1);
  // Coach: weeks with homework audios still waiting for feedback (Luis, 9 Oct). The week on
  // screen is read from the board itself, so it updates as soon as the coach answers.
  const audioWaitingPeriods = useMemo(() => {
    if (mode !== "coach" || !board) return [] as number[];
    const periods = new Set(pendingAudioPeriods || []);
    const waitingHere = board.classes.some(
      (classRow) =>
        classRow.periodNumber === selectedPeriod &&
        (classRow.audioAnswers || []).some((answer) => !answer.feedbackAt),
    );
    if (waitingHere) periods.add(selectedPeriod);
    else periods.delete(selectedPeriod);
    return [...periods].sort((a, b) => a - b);
  }, [mode, board, pendingAudioPeriods, selectedPeriod]);
  const [openFocusComment, setOpenFocusComment] = useState<string | null>(null);
  const [savingReport, setSavingReport] = useState(false);
  const [reportDraftImageFile, setReportDraftImageFile] = useState<File | null>(
    null,
  );
  const [removeReportImage, setRemoveReportImage] = useState(false);
  const [reportImagePreviewUrl, setReportImagePreviewUrl] = useState<
    string | null
  >(null);
  const [focusModalOpen, setFocusModalOpen] = useState(false);
  const [editingFocusId, setEditingFocusId] = useState<string | null>(null);
  const [focusDraftTitle, setFocusDraftTitle] = useState("");
  const [focusDraftComment, setFocusDraftComment] = useState("");
  const [savingFocus, setSavingFocus] = useState(false);
  const [deletingFocus, setDeletingFocus] = useState(false);
  const [previewFocusId, setPreviewFocusId] = useState<string | null>(null);
  const [confirmRegenerateFocusId, setConfirmRegenerateFocusId] = useState<
    string | null
  >(null);
  const [externalLinkOpenByFocusId, setExternalLinkOpenByFocusId] = useState<
    Record<string, boolean>
  >({});
  const [classEditOpenByKey, setClassEditOpenByKey] = useState<
    Record<string, boolean>
  >({});
  const [classDrafts, setClassDrafts] = useState<
    Record<
      string,
      {
        classRole: string;
        assignedCoachUserId: string;
        scheduledDate: string;
        scheduledTime: string;
        loomUrl: string;
        coachGuideline1: string;
        coachGuideline2: string;
        coachGuideline3: string;
        response1: string;
        response2: string;
        response3: string;
        taskAudio: [boolean, boolean, boolean];
      }
    >
  >({});
  const [savingClassKey, setSavingClassKey] = useState<string | null>(null);
  // Week whose ring was just completed here: it pops once with a sound.
  const [sealedPopPeriod, setSealedPopPeriod] = useState<number | null>(null);
  const lastRingRef = useRef<{ period: number; complete: boolean } | null>(null);
  const [savingPeriodAction, setSavingPeriodAction] = useState(false);
  const [openReviewFocusId, setOpenReviewFocusId] = useState<string | null>(
    null,
  );
  const [selectedFocusPhase, setSelectedFocusPhase] = useState<
    Record<string, number>
  >({});
  const [regeneratingFocusId, setRegeneratingFocusId] = useState<string | null>(
    null,
  );
  const [
    savingExternalTrainingUrlFocusId,
    setSavingExternalTrainingUrlFocusId,
  ] = useState<string | null>(null);
  const [
    externalTrainingUrlDraftByFocusId,
    setExternalTrainingUrlDraftByFocusId,
  ] = useState<Record<string, string>>({});
  const reportSectionRef = useRef<HTMLDivElement | null>(null);
  const focusSectionRef = useRef<HTMLElement | null>(null);
  const classesSectionRef = useRef<HTMLElement | null>(null);

  function getEmbeddableVideoUrl(value: string | null): string | null {
    if (!value) return null;
    if (/loom\.com/i.test(value)) {
      return value.replace("/share/", "/embed/").replace("/shared/", "/embed/");
    }
    return null;
  }

  const loadBoard = useCallback(
    async (period?: number, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const useMemberBoard = mode === "student" && (fetchAsStudent ?? true);
        const data = useMemberBoard
          ? await fetchMyCoachingV2SessionBoard({
              sessionId,
              ...(typeof period === "number" ? { periodNumber: period } : {}),
            })
          : await fetchCoachingV2SessionBoard({
              sessionId,
              ...(typeof period === "number" ? { periodNumber: period } : {}),
            });
        setBoard(data);
        setSelectedPeriod(data.periodNumber);
        onSelectedPeriodChange?.(data.periodNumber);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("No se pudo cargar el tablero."),
        );
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [fetchAsStudent, mode, onSelectedPeriodChange, sessionId],
  );

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!board) return;
    setReportDraftImageFile(null);
    setRemoveReportImage(false);
  }, [board?.periodReport?.id, board?.periodReport?.updatedAt, selectedPeriod]);

  useEffect(() => {
    if (!board) return;
    const nextDrafts: Record<
      string,
      {
        classRole: string;
        assignedCoachUserId: string;
        scheduledDate: string;
        scheduledTime: string;
        loomUrl: string;
        coachGuideline1: string;
        coachGuideline2: string;
        coachGuideline3: string;
        response1: string;
        response2: string;
        response3: string;
        taskAudio: [boolean, boolean, boolean];
      }
    > = {};
    for (const classRow of board.classes) {
      if (classRow.periodNumber !== selectedPeriod) continue;
      const key = `${classRow.periodNumber}-${classRow.classIndex}`;
      const scheduled = toDateAndTimeFromIso(classRow.scheduledAt);
      const defaultTitle = `Clase ${classRow.classIndex}`;
      nextDrafts[key] = {
        classRole:
          classRow.title && classRow.title.trim() !== defaultTitle
            ? classRow.title
            : "",
        assignedCoachUserId: classRow.assignedByCoachUserId || "",
        scheduledDate: scheduled.date,
        scheduledTime: scheduled.time,
        loomUrl: classRow.loomUrl || "",
        coachGuideline1: classRow.coachGuideline1 || DEFAULT_CLASS_TASKS[0],
        coachGuideline2: classRow.coachGuideline2 || DEFAULT_CLASS_TASKS[1],
        coachGuideline3: classRow.coachGuideline3 || DEFAULT_CLASS_TASKS[2],
        response1: classRow.studentGuidelineResponse1 || "",
        response2: classRow.studentGuidelineResponse2 || "",
        response3: classRow.studentGuidelineResponse3 || "",
        // Same default as a new class: task 3 is answered with an audio.
        taskAudio: classRow.taskAudio || [false, false, true],
      };
    }
    setClassDrafts(nextDrafts);
  }, [board, selectedPeriod]);

  const durationPeriods = board?.session.durationPeriods || 10;
  const selectedFocuses = (board?.focuses || []).filter(
    (focus) => focus.periodNumber === selectedPeriod && !focus.archivedAt,
  );
  const activeFocuses = selectedFocuses.filter((focus) => !isCompleted(focus));
  const focusSlots: Array<CoachingV2Focus | null> = [
    ...activeFocuses.slice(0, 3),
    ...Array(Math.max(0, 3 - activeFocuses.length)).fill(null),
  ];
  const allCompletedUntilSelected = (board?.focuses || []).filter(
    (focus) =>
      !focus.archivedAt &&
      focus.periodNumber <= selectedPeriod &&
      isCompleted(focus),
  );

  useEffect(() => {
    if (!selectedFocuses.length) return;
    setSelectedFocusPhase((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const focus of selectedFocuses) {
        if (typeof next[focus.id] === "number") continue;
        next[focus.id] = getSuggestedPhaseIndex(focus);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectedFocuses]);

  const selectedClasses = (board?.classes || [])
    .filter((item) => item.periodNumber === selectedPeriod)
    .sort((a, b) => a.classIndex - b.classIndex);

  const aggregatedTasks: AggregatedTask[] = selectedClasses.flatMap(
    (classRow) => {
      const rows = [
        {
          title: classRow.coachGuideline1 || DEFAULT_CLASS_TASKS[0],
          prompt: classRow.studentGuidelineResponse1 || "",
        },
        {
          title: classRow.coachGuideline2 || DEFAULT_CLASS_TASKS[1],
          prompt: classRow.studentGuidelineResponse2 || "",
        },
        {
          title: classRow.coachGuideline3 || DEFAULT_CLASS_TASKS[2],
          prompt: classRow.studentGuidelineResponse3 || "",
        },
      ];

      return rows.map((row, idx) => ({
        index: classRow.classIndex === 1 ? idx + 1 : idx + 4,
        classIndex: classRow.classIndex,
        title: row.title,
        prompt: row.prompt,
        // Audio tasks count once the audio is sent (Luis, 6 Oct).
        done: isTaskAnswered(classRow, (idx + 1) as 1 | 2 | 3),
      }));
    },
  );

  const completedTasks = aggregatedTasks.filter((task) => task.done).length;
  const reportStatus =
    completedTasks < 6
      ? "blocked"
      : board?.periodReport
        ? "available"
        : "preparing";
  const reportUnlocked = completedTasks >= 6;

  const selectedExercises = (board?.focusExercises || []).filter(
    (row) => row.periodNumber === selectedPeriod,
  );
  const focusExerciseByFocusId = new Map(
    (board?.focusExercises || []).map((row) => [row.focusId, row]),
  );
  const selectedAttempts = (board?.focusExerciseAttempts || []).filter(
    (row) => row.periodNumber === selectedPeriod,
  );
  const exerciseByFocusId = new Map(
    selectedExercises.map((row) => [row.focusId, row]),
  );
  // Los intentos llegan del más nuevo al más antiguo: nos quedamos con el último de cada foco.
  const attemptByFocusId = new Map<string, (typeof selectedAttempts)[number]>();
  const attemptCountByFocusId = new Map<string, number>();
  for (const row of selectedAttempts) {
    if (!attemptByFocusId.has(row.focusId)) attemptByFocusId.set(row.focusId, row);
    attemptCountByFocusId.set(
      row.focusId,
      (attemptCountByFocusId.get(row.focusId) || 0) + 1,
    );
  }
  const periodActivationByNumber = new Map(
    (board?.periodActivations || []).map((row) => [row.periodNumber, row]),
  );
  const activatedPeriods = new Set(
    (board?.periodActivations || []).map((row) => row.periodNumber),
  );
  const selectedPeriodActivation = periodActivationByNumber.get(selectedPeriod);
  const isSelectedPeriodClosed = Boolean(selectedPeriodActivation?.endedAt);
  const canEditSelectedPeriod = !isSelectedPeriodClosed;
  const currentActivePeriod = board?.periodState.currentActivePeriod || null;
  // The coach can open the next week before activating it to prepare it (focuses, classes,
  // tasks, report); the student does not see it until it is activated (Luis, 6 Oct).
  const preparablePeriod = mode === "coach" ? board?.periodState.nextPeriodEligible || null : null;
  const canOpenPeriod = (period: number) => activatedPeriods.has(period) || period === preparablePeriod;
  const isPreparingSelectedPeriod = mode === "coach" && !selectedPeriodActivation;
  // One ring per week: the 6 tasks fill it (Luis, 6 Oct).
  const weekRings = buildWeekRings({
    classes: board?.classes || [],
    durationPeriods,
    activatedPeriods,
    closedPeriods: new Set(
      (board?.periodActivations || []).filter((row) => row.endedAt).map((row) => row.periodNumber),
    ),
  });
  const selectedRing = weekRings.find((ring) => ring.period === selectedPeriod) || null;
  const selectedRingComplete = Boolean(selectedRing?.complete);
  useEffect(() => {
    const previous = lastRingRef.current;
    lastRingRef.current = { period: selectedPeriod, complete: selectedRingComplete };
    if (!previous || previous.period !== selectedPeriod || previous.complete || !selectedRingComplete) return;
    setSealedPopPeriod(selectedPeriod);
    if (mode === "student") gameSfx.celebrate();
    const timer = window.setTimeout(() => setSealedPopPeriod(null), 900);
    return () => window.clearTimeout(timer);
  }, [mode, selectedPeriod, selectedRingComplete]);
  const canAddFocus = activeFocuses.length < 3;
  const titleRecorrido =
    mode === "coach" ? t("Recorrido del alumno") : t("Tu recorrido");
  const titleClases = mode === "coach" ? t("Clases del alumno") : t("Tus clases");
  const classesSubtitle =
    mode === "coach"
      ? t("Grabaciones, tareas y seguimiento del alumno por semana.")
      : t("Las grabaciones se quedan contigo para siempre.");
  const classJoinUrl = board?.session.classJoinUrl?.trim() || "";
  const hasClassLink = Boolean(classJoinUrl);
  const assignedCoachNameInSelectedPeriod = selectedClasses
    .map((classRow) => {
      if (!classRow.assignedByCoachUserId) return null;
      return (
        board?.coachers?.classAssignedCoachDisplayNameByClassIndex?.[
          String(classRow.classIndex)
        ] || null
      );
    })
    .find((name) => Boolean(name)) || null;
  const secondaryCoachDisplayName =
    (mode === "student"
      ? assignedCoachNameInSelectedPeriod
      : board?.coachers?.selectedCoachDisplayName) ||
    board?.coachers?.selectedCoachDisplayName ||
    coachDisplayName ||
    null;
  const isSecondaryCoachPrimary =
    secondaryCoachDisplayName?.trim().toLowerCase() === "luis";
  const coachLineLabel = isSecondaryCoachPrimary
    ? "Luis"
    : secondaryCoachDisplayName
      ? t("Luis y {coach}", { coach: secondaryCoachDisplayName })
      : "Luis";
  const nowTs = Date.now();
  const isScheduledLiveNow =
    hasClassLink &&
    selectedClasses.some((classRow) => {
      if (!classRow.scheduledAt) return false;
      if (classRow.classIndex !== 1 && classRow.classIndex !== 2) return false;
      const scheduledTs = new Date(classRow.scheduledAt).getTime();
      if (!Number.isFinite(scheduledTs)) return false;
      const offset = 15 * 60 * 1000;
      return nowTs >= scheduledTs - offset && nowTs <= scheduledTs + offset;
    });
  const classLinkState: "no-link" | "with-link" | "live" = !hasClassLink
    ? "no-link"
    : isScheduledLiveNow
      ? "live"
      : "with-link";
  const nextPendingTask = aggregatedTasks.find((task) => !task.done) || null;
  const pendingTaskLabels = aggregatedTasks
    .filter((task) => !task.done)
    .map((task) => t(task.title).toLowerCase());
  const openReviewAttempt = openReviewFocusId
    ? attemptByFocusId.get(openReviewFocusId) || null
    : null;

  useEffect(() => {
    if (!selectedExercises.length) return;
    const hasGenerating = selectedExercises.some(
      (row) => row.status === "pending" || row.status === "generating",
    );
    if (!hasGenerating) return;

    const timer = window.setInterval(() => {
      void loadBoard(selectedPeriod, { silent: true });
    }, 8000);

    return () => window.clearInterval(timer);
  }, [loadBoard, selectedExercises, selectedPeriod]);

  const handleSavePeriodReport = async () => {
    if (!board || !userId) return;
    if (isSelectedPeriodClosed) {
      toast.error(t("La semana está cerrada. Ya no se puede editar."));
      return;
    }
    setSavingReport(true);
    try {
      let nextImagePath = board.periodReport?.reportImagePath || null;
      if (reportDraftImageFile) {
        const previousImagePath = board.periodReport?.reportImagePath || null;
        nextImagePath = await uploadCoachingClassReportImage({
          file: reportDraftImageFile,
          userId,
          targetLang,
          weekKey: `P${String(selectedPeriod).padStart(2, "0")}`,
        });
        if (previousImagePath && previousImagePath !== nextImagePath) {
          await deleteCoachingClassReportImage(previousImagePath);
        }
      } else if (removeReportImage) {
        if (board.periodReport?.reportImagePath) {
          await deleteCoachingClassReportImage(
            board.periodReport.reportImagePath,
          );
        }
        nextImagePath = null;
      }

      const saved = await upsertCoachingV2PeriodReport({
        sessionId,
        periodNumber: selectedPeriod,
        periodReportText: null,
        periodReportImagePath: nextImagePath,
      });

      setBoard((prev) =>
        prev
          ? {
              ...prev,
              periodReport: saved,
            }
          : prev,
      );
      setReportDraftImageFile(null);
      setRemoveReportImage(false);
      toast.success(t("Reporte del periodo guardado."));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("No se pudo guardar el reporte."),
      );
    } finally {
      setSavingReport(false);
    }
  };

  const openCreateFocus = () => {
    setEditingFocusId(null);
    setFocusDraftTitle("");
    setFocusDraftComment("");
    setFocusModalOpen(true);
  };

  const openEditFocus = (focus: CoachingV2Focus) => {
    setEditingFocusId(focus.id);
    setFocusDraftTitle(focus.focusTitle);
    setFocusDraftComment(focus.focusComment || "");
    setFocusModalOpen(true);
  };

  /* Crear o editar un foco. Al crearlo (o cambiarle el título) el servidor
     genera solo el ejercicio de Entrenado: aquí lo marcamos como "generando". */
  const handleSaveFocus = async () => {
    if (!focusDraftTitle.trim()) return;
    if (isSelectedPeriodClosed) {
      toast.error(t("La semana está cerrada. Ya no se puede editar."));
      return;
    }
    const editingFocus = editingFocusId
      ? (board?.focuses || []).find((row) => row.id === editingFocusId) || null
      : null;
    const titleChanged =
      !editingFocus ||
      editingFocus.focusTitle.trim().toLowerCase() !==
        focusDraftTitle.trim().toLowerCase();

    setSavingFocus(true);
    try {
      const saved = await upsertCoachingV2Focus({
        sessionId,
        periodNumber: editingFocus?.periodNumber ?? selectedPeriod,
        ...(editingFocus ? { focusId: editingFocus.id } : {}),
        focusTitle: focusDraftTitle.trim(),
        focusComment: focusDraftComment.trim() || null,
      });
      if (!saved) throw new Error(t("No se pudo guardar el foco."));
      setBoard((prev) => {
        if (!prev) return prev;
        const focuses = editingFocus
          ? prev.focuses.map((row) => (row.id === saved.id ? saved : row))
          : [...prev.focuses, saved];
        const focusExercises = titleChanged
          ? [
              ...prev.focusExercises.filter((row) => row.focusId !== saved.id),
              {
                focusId: saved.id,
                periodNumber: saved.periodNumber,
                status: "pending" as const,
                exercise: null,
                error: null,
                generatedAt: null,
                externalTrainingUrl:
                  prev.focusExercises.find((row) => row.focusId === saved.id)
                    ?.externalTrainingUrl || null,
                updatedAt: new Date().toISOString(),
              },
            ]
          : prev.focusExercises;
        return { ...prev, focuses, focusExercises };
      });
      setFocusDraftTitle("");
      setFocusDraftComment("");
      setEditingFocusId(null);
      setFocusModalOpen(false);
      toast.success(
        titleChanged
          ? t("Foco guardado. Preparando el ejercicio de Entrenado (≈1 min)...")
          : t("Foco guardado."),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("No se pudo guardar el foco."),
      );
    } finally {
      setSavingFocus(false);
    }
  };

  const handleDeleteFocus = async () => {
    if (!editingFocusId) return;
    setDeletingFocus(true);
    try {
      await deleteCoachingV2Focus({ sessionId, focusId: editingFocusId });
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              focuses: prev.focuses.filter((row) => row.id !== editingFocusId),
            }
          : prev,
      );
      setFocusModalOpen(false);
      setEditingFocusId(null);
      toast.success(t("Foco eliminado."));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("No se pudo eliminar el foco."),
      );
    } finally {
      setDeletingFocus(false);
    }
  };

  const handleSaveClass = async (
    classIndex: 1 | 2,
    draft: {
      classRole: string;
      assignedCoachUserId: string;
      scheduledDate: string;
      scheduledTime: string;
      loomUrl: string;
      coachGuideline1: string;
      coachGuideline2: string;
      coachGuideline3: string;
      response1: string;
      response2: string;
      response3: string;
      taskAudio: [boolean, boolean, boolean];
    },
    classRow: CoachingV2ClassSlot | null,
  ) => {
    if (isSelectedPeriodClosed) {
      toast.error(t("La semana está cerrada. Ya no se puede editar."));
      return;
    }
    const key = `${selectedPeriod}-${classIndex}`;
    setSavingClassKey(key);
    try {
      const updatedClass = await upsertCoachingV2ClassCoachGuidelines({
        sessionId,
        periodNumber: selectedPeriod,
        classIndex,
        title: draft.classRole.trim() || null,
        assignedByCoachUserId: draft.assignedCoachUserId || null,
        loomUrl: draft.loomUrl.trim() || null,
        report: classRow?.report || null,
        reportImagePath: classRow?.reportImagePath || null,
        scheduledAt:
          toIsoFromDateAndTime(draft.scheduledDate, draft.scheduledTime) ||
          null,
        coachGuideline1: draft.coachGuideline1.trim() || null,
        coachGuideline2: draft.coachGuideline2.trim() || null,
        coachGuideline3: draft.coachGuideline3.trim() || null,
        taskAudio: draft.taskAudio,
      });
      if (updatedClass) {
        setBoard((prev) =>
          prev
            ? {
                ...prev,
                classes: prev.classes
                  .filter(
                    (row) =>
                      !(
                        row.periodNumber === updatedClass.periodNumber &&
                        row.classIndex === updatedClass.classIndex
                      ),
                  )
                  .concat({
                    ...updatedClass,
                    audioAnswers:
                      updatedClass.audioAnswers ??
                      prev.classes.find(
                        (row) =>
                          row.periodNumber === updatedClass.periodNumber &&
                          row.classIndex === updatedClass.classIndex,
                      )?.audioAnswers,
                  })
                  .sort(
                    (a, b) =>
                      a.periodNumber - b.periodNumber ||
                      a.classIndex - b.classIndex,
                  ),
              }
            : prev,
        );
      }
      toast.success(t("Clase {n} actualizada.", { n: classIndex }));
      // A server without audio tasks (an older coaching-center) saves the class but drops the
      // audio choice and sends no taskAudio back: say so instead of pretending it was saved.
      if (updatedClass && !updatedClass.taskAudio && draft.taskAudio.some(Boolean)) {
        toast.warning(
          t("La respuesta en audio no se ha guardado: el servidor todavía no tiene esta función. Funcionará cuando se suba la nueva versión."),
          { duration: 10000 },
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("No se pudo guardar la clase."),
      );
    } finally {
      setSavingClassKey(null);
    }
  };

  // Puts a sent audio (or the coach's feedback) into the board without reloading it.
  const applyTaskAudioAnswer = (
    periodNumber: number,
    classIndex: 1 | 2,
    answer: CoachingTaskAudioAnswer,
    studentCompletedAt?: string | null,
  ) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            classes: prev.classes.map((row) =>
              row.periodNumber === periodNumber && row.classIndex === classIndex
                ? {
                    ...row,
                    ...(studentCompletedAt !== undefined ? { studentCompletedAt } : {}),
                    audioAnswers: [
                      ...(row.audioAnswers || []).filter((item) => item.taskIndex !== answer.taskIndex),
                      answer,
                    ].sort((a, b) => a.taskIndex - b.taskIndex),
                  }
                : row,
            ),
          }
        : prev,
    );
  };

  const handleSaveStudentTask = async (
    classIndex: 1 | 2,
    draft: {
      response1: string;
      response2: string;
      response3: string;
    },
    responseIndex: 1 | 2 | 3,
  ) => {
    if (isSelectedPeriodClosed) {
      toast.error(t("La semana está cerrada. Ya no se puede editar."));
      return;
    }
    const key = `${selectedPeriod}-${classIndex}`;
    setSavingClassKey(`${key}-r${responseIndex}`);
    try {
      const updatedClass = await submitCoachingV2StudentClassReport({
        sessionId,
        periodNumber: selectedPeriod,
        classIndex,
        guidelineResponse1: draft.response1.trim() || null,
        guidelineResponse2: draft.response2.trim() || null,
        guidelineResponse3: draft.response3.trim() || null,
      });
      if (updatedClass) {
        setBoard((prev) =>
          prev
            ? {
                ...prev,
                classes: prev.classes
                  .filter(
                    (row) =>
                      !(
                        row.periodNumber === updatedClass.periodNumber &&
                        row.classIndex === updatedClass.classIndex
                      ),
                  )
                  .concat({
                    ...updatedClass,
                    audioAnswers:
                      updatedClass.audioAnswers ??
                      prev.classes.find(
                        (row) =>
                          row.periodNumber === updatedClass.periodNumber &&
                          row.classIndex === updatedClass.classIndex,
                      )?.audioAnswers,
                  })
                  .sort(
                    (a, b) =>
                      a.periodNumber - b.periodNumber ||
                      a.classIndex - b.classIndex,
                  ),
              }
            : prev,
        );
      }
      toast.success(t("Tarea {n} guardada.", { n: responseIndex }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("No se pudo guardar la tarea."),
      );
    } finally {
      setSavingClassKey(null);
    }
  };

  const handleActivateNextWeek = async () => {
    setSavingPeriodAction(true);
    try {
      await activateCoachingV2Period({ sessionId });
      toast.success(t("Semana activada correctamente."));
      await loadBoard(undefined, { silent: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("No se pudo activar la semana."),
      );
    } finally {
      setSavingPeriodAction(false);
    }
  };

  const handleCloseCurrentWeek = async () => {
    setSavingPeriodAction(true);
    try {
      const closedPeriod = currentActivePeriod;
      await closeCoachingV2Period({ sessionId });
      toast.success(t("Semana cerrada correctamente."));
      // Straight to the next week, ready to be prepared before activating it.
      const nextPeriod = closedPeriod ? closedPeriod + 1 : null;
      await loadBoard(nextPeriod && nextPeriod <= durationPeriods ? nextPeriod : undefined, { silent: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("No se pudo cerrar la semana."),
      );
    } finally {
      setSavingPeriodAction(false);
    }
  };

  const handleToggleFocus = async (
    focus: CoachingV2Focus,
    phase:
      | "phaseExplained"
      | "phaseTrained"
      | "phaseUnderstoodExplained"
      | "phaseUsed",
  ) => {
    if (isSelectedPeriodClosed) {
      toast.error(t("La semana está cerrada. Ya no se puede editar."));
      return;
    }
    const phaseIndex = PHASE_KEYS.indexOf(phase);
    if (phaseIndex < 0) return;

    const values = PHASE_KEYS.map((key) => Boolean(focus[key]));
    const checked = values[phaseIndex];
    const nextChecked = !checked;
    const allPrevDone = values.slice(0, phaseIndex).every(Boolean);
    const anyNextDone = values.slice(phaseIndex + 1).some(Boolean);

    if (nextChecked && !allPrevDone) return;
    if (!nextChecked && anyNextDone) return;

    try {
      const updated = await toggleCoachingV2FocusPhase({
        sessionId,
        focusId: focus.id,
        phase,
        checked: nextChecked,
      });
      if (!updated) return;
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              focuses: prev.focuses.map((row) =>
                row.id === updated.id ? updated : row,
              ),
            }
          : prev,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("No se pudo actualizar foco."),
      );
    }
  };

  const handleRegenerateTraining = async (focus: CoachingV2Focus) => {
    if (isSelectedPeriodClosed) {
      toast.error(t("La semana está cerrada. Ya no se puede editar."));
      return;
    }
    setRegeneratingFocusId(focus.id);
    try {
      await regenerateCoachingV2FocusExercise({
        sessionId,
        focusId: focus.id,
      });

      setBoard((prev) => {
        if (!prev) return prev;
        const nextExercises = [...prev.focusExercises];
        const idx = nextExercises.findIndex((row) => row.focusId === focus.id);
        if (idx >= 0) {
          nextExercises[idx] = {
            ...nextExercises[idx],
            status: "generating",
            exercise: null,
            error: null,
            generatedAt: null,
            updatedAt: new Date().toISOString(),
          };
        } else {
          nextExercises.push({
            focusId: focus.id,
            periodNumber: focus.periodNumber,
            status: "generating",
            exercise: null,
            error: null,
            generatedAt: null,
            externalTrainingUrl:
              externalTrainingUrlDraftByFocusId[focus.id]?.trim() || null,
            updatedAt: new Date().toISOString(),
          });
        }
        return {
          ...prev,
          focusExercises: nextExercises,
        };
      });

      toast.success(t("Generando el ejercicio (≈1 min)..."));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("No se pudo regenerar el entrenamiento."),
      );
    } finally {
      setRegeneratingFocusId(null);
    }
  };

  const handleSaveExternalTrainingUrl = async (focus: CoachingV2Focus) => {
    if (isSelectedPeriodClosed) {
      toast.error(t("La semana está cerrada. Ya no se puede editar."));
      return;
    }

    const draftValue =
      externalTrainingUrlDraftByFocusId[focus.id] ||
      exerciseByFocusId.get(focus.id)?.externalTrainingUrl ||
      "";

    setSavingExternalTrainingUrlFocusId(focus.id);
    try {
      const saved = await upsertCoachingV2FocusExerciseExternalUrl({
        sessionId,
        focusId: focus.id,
        externalTrainingUrl: draftValue.trim() || null,
      });

      setBoard((prev) => {
        if (!prev) return prev;
        if (!saved) return prev;
        const nextExercises = [...prev.focusExercises];
        const idx = nextExercises.findIndex((row) => row.focusId === focus.id);
        if (idx >= 0) {
          nextExercises[idx] = {
            ...nextExercises[idx],
            ...saved,
          };
        } else {
          nextExercises.push(saved);
        }
        return {
          ...prev,
          focusExercises: nextExercises,
        };
      });

      setExternalTrainingUrlDraftByFocusId((prev) => ({
        ...prev,
        [focus.id]: saved?.externalTrainingUrl || "",
      }));

      toast.success(
        draftValue.trim()
          ? t("Link externo guardado.")
          : t("Link externo eliminado."),
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("No se pudo guardar el link externo."),
      );
    } finally {
      setSavingExternalTrainingUrlFocusId(null);
    }
  };

  const scrollToRef = (ref: { current: HTMLElement | null }) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* "Te toca": lo que le falta al coach en la semana seleccionada, en orden. */
  type CoachTodo = {
    key: string;
    label: string;
    action: string;
    onClick: () => void;
    tone?: "warn";
  };
  const coachTodos: CoachTodo[] = [];
  if (mode === "coach" && board && !isSelectedPeriodClosed) {
    if (
      !board.periodState.currentActivePeriod &&
      board.periodState.nextPeriodEligible
    ) {
      coachTodos.push({
        key: "activate",
        label: t("La semana {n} está sin activar", { n: board.periodState.nextPeriodEligible }),
        action: t("Activar"),
        onClick: () => void handleActivateNextWeek(),
      });
    }
    const freeSlots = Math.max(0, 3 - activeFocuses.length);
    if (freeSlots > 0) {
      coachTodos.push({
        key: "add-focus",
        label:
          freeSlots === 3
            ? t("Esta semana no tiene focos")
            : tn(freeSlots, "Tienes {n} hueco de foco libre", "Tienes {n} huecos de foco libres"),
        action: t("Añadir foco"),
        onClick: openCreateFocus,
      });
    }
    for (const focus of activeFocuses) {
      const state = getTrainingState(exerciseByFocusId.get(focus.id));
      if (state === "error" || state === "stuck" || state === "missing") {
        coachTodos.push({
          key: `exercise-${focus.id}`,
          label: t("El ejercicio de «{focus}» no está listo", { focus: focus.focusTitle }),
          action: t("Ver"),
          tone: "warn",
          onClick: () => scrollToRef(focusSectionRef),
        });
      } else if (!focus.phaseExplained) {
        coachTodos.push({
          key: `explain-${focus.id}`,
          label: t("¿Ya explicaste «{focus}»? Márcalo como Explicado", { focus: focus.focusTitle }),
          action: t("Ir"),
          onClick: () => scrollToRef(focusSectionRef),
        });
      }
    }
    for (const slot of [1, 2] as const) {
      const classRow =
        selectedClasses.find((row) => row.classIndex === slot) || null;
      const editKey = `${selectedPeriod}-${slot}`;
      const openClass = () => {
        setClassEditOpenByKey((prev) => ({ ...prev, [editKey]: true }));
        scrollToRef(classesSectionRef);
      };
      if (!classRow?.scheduledAt) {
        coachTodos.push({
          key: `schedule-${slot}`,
          label: t("La clase {n} no tiene fecha", { n: slot }),
          action: t("Poner fecha"),
          onClick: openClass,
        });
      } else if (
        !classRow.loomUrl &&
        new Date(classRow.scheduledAt).getTime() < Date.now()
      ) {
        coachTodos.push({
          key: `loom-${slot}`,
          label: t("Falta la grabación de la clase {n}", { n: slot }),
          action: t("Subir"),
          onClick: openClass,
        });
      }
    }
    if (reportStatus === "preparing") {
      coachTodos.push({
        key: "report",
        label: t("El alumno ha hecho las 6 tareas: falta su reporte"),
        action: t("Subir reporte"),
        onClick: () => scrollToRef(reportSectionRef),
      });
    }
  }

  const handleScrollToReport = () => {
    reportSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  if (loading) {
    return (
      <ContentLoading label={t("Cargando coaching...")} />
    );
  }

  if (!board) {
    return (
      <p className="text-sm text-muted-foreground">{t("Sin datos de coaching.")}</p>
    );
  }

  return (
    <section className="coaching-premium mx-auto w-full max-w-6xl">
      <div style={{ color: "var(--v3-text)" }}>
        {/* Cabecera premium: idioma, semana, coaches, clase y el recorrido de 12 semanas */}
        <header className="coaching-hero relative overflow-hidden rounded-[32px] px-5 pt-6 pb-5 text-white md:px-8 md:pt-8 md:pb-7">
          <span className="coaching-hero-glow pointer-events-none absolute -top-24 -right-16 size-72 rounded-full" aria-hidden="true" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="m-0 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black tracking-[0.14em] uppercase" style={{ color: "var(--ica-gold)" }}>
                <CrownIcon className="size-3.5" strokeWidth={2.8} aria-hidden="true" />
                Coaching ICA
              </p>
              <h1 className="m-0 mt-3 font-display text-4xl leading-none font-black tracking-tight md:text-6xl">
                {langName(board.session.targetLang || targetLang)}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-black" style={{ background: "var(--ica-gold)", color: "#4a3200" }}>
                  {board.session.level}
                </span>
                <span className="text-sm font-bold text-white/80">
                  {t("Semana {n} de {total}", { n: selectedPeriod, total: durationPeriods })}
                </span>
                <span className="text-sm font-bold text-white/50">·</span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-white/80">
                  <span className="flex -space-x-1.5">
                    <span className="flex size-6 items-center justify-center rounded-full border-2 border-[#1b2450] text-[11px] font-black" style={{ background: "var(--ica-i)" }}>L</span>
                    {!isSecondaryCoachPrimary && secondaryCoachDisplayName ? (
                      <span className="flex size-6 items-center justify-center rounded-full border-2 border-[#1b2450] text-[11px] font-black" style={{ background: "var(--ica-c)" }}>
                        {secondaryCoachDisplayName.slice(0, 1).toUpperCase()}
                      </span>
                    ) : null}
                  </span>
                  {coachLineLabel}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Anillo de semanas */}
              <span className="relative hidden size-20 md:inline-flex" aria-hidden="true">
                <svg viewBox="0 0 80 80" className="size-20 -rotate-90">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="8" />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="var(--ica-gold)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(Math.min(selectedPeriod, durationPeriods) / durationPeriods) * 213.6} 213.6`}
                  />
                </svg>
                <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="text-xl font-black">{selectedPeriod}</span>
                  <span className="text-[10px] font-bold text-white/60">/{durationPeriods}</span>
                </span>
              </span>
            </div>
          </div>

          {/* Clase: enlace bien visible */}
          <div className="relative mt-5">
            {hasClassLink ? (
              <a
                href={classJoinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`ica-press inline-flex h-12 items-center gap-2.5 rounded-2xl px-5 text-base font-black ${classLinkState === "live" ? "animate-pulse" : ""}`}
                style={
                  classLinkState === "live"
                    ? { background: "#ef4444", color: "#fff", boxShadow: "0 4px 0 #b91c1c" }
                    : { background: "var(--ica-gold)", color: "#4a3200", boxShadow: "0 4px 0 var(--ica-gold-edge)" }
                }
              >
                <VideoIcon className="size-5" strokeWidth={2.6} aria-hidden="true" />
                {classLinkState === "live" ? t("Clase en vivo ahora") : t("Link a tu clase")}
              </a>
            ) : (
              <span className="inline-flex h-12 items-center gap-2.5 rounded-2xl bg-white/10 px-5 text-base font-bold text-white/60">
                <VideoOffIcon className="size-5" strokeWidth={2.4} aria-hidden="true" />
                {t("Sin link para tu clase")}
              </span>
            )}
          </div>

          {audioWaitingPeriods.length > 0 ? (
            <div
              className="relative mt-5 flex flex-wrap items-center gap-2.5 rounded-2xl px-4 py-3"
              style={{ background: "color-mix(in oklab, var(--ica-gold) 18%, transparent)", border: "2px solid var(--ica-gold)" }}
            >
              <PendingReviewDot useIconSpeaker title={t("Audios de tareas esperando tu feedback")} />
              <span className="text-sm font-black" style={{ color: "var(--ica-gold)" }}>
                {t("Audios de tareas esperando tu feedback")}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {audioWaitingPeriods.map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => void loadBoard(period)}
                    disabled={period === selectedPeriod}
                    className="animate-pulse rounded-full px-2.5 py-0.5 text-xs font-black disabled:animate-none"
                    style={{ background: "var(--ica-gold)", color: "#4a3200" }}
                  >
                    {period === selectedPeriod ? t("Semana {n} (aquí)", { n: period }) : t("Semana {n}", { n: period })}
                  </button>
                ))}
              </span>
            </div>
          ) : null}

          {/* Recorrido: una casilla por semana */}
          <div className="relative mt-6">
            <div className="mb-2 flex items-center justify-between text-xs font-extrabold text-white/70">
              <span className="tracking-[0.1em] uppercase">{titleRecorrido}</span>
              <span>{tn(Math.max(0, durationPeriods - selectedPeriod), "Queda {n} semana", "Quedan {n} semanas")}</span>
            </div>
            <CoachingWeekRingsStrip
              rings={weekRings}
              selectedPeriod={selectedPeriod}
              preparablePeriod={preparablePeriod}
              canOpen={canOpenPeriod}
              onOpen={(period) => void loadBoard(period)}
              popPeriod={sealedPopPeriod}
            />
            {selectedRing?.complete ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-sm font-black" style={{ color: "var(--ica-gold)" }}>
                  {mode === "coach"
                    ? t("Semana {n} sellada · el alumno hizo las 6 tareas", { n: selectedPeriod })
                    : board.periodReport
                      ? t("Semana {n} sellada · tu reporte se ha abierto", { n: selectedPeriod })
                      : t("Semana {n} sellada · tu coach está preparando tu reporte", { n: selectedPeriod })}
                </p>
                {mode === "student" && board.periodReport ? (
                  <button
                    type="button"
                    onClick={handleScrollToReport}
                    className="ica-press rounded-2xl px-4 py-2 text-sm font-black"
                    style={{ background: "var(--ica-gold)", color: "#4a3200", boxShadow: "0 4px 0 var(--ica-gold-edge)" }}
                  >
                    {t("Ver mi reporte")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {isSelectedPeriodClosed ? (
              <p className="m-0 mt-3 text-xs font-bold" style={{ color: "var(--ica-gold)" }}>
                {t("Semana cerrada: solo lectura para alumno y coach.")}
              </p>
            ) : isPreparingSelectedPeriod ? (
              <p className="m-0 mt-3 rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold" style={{ color: "var(--ica-gold)" }}>
                {t("Estás preparando la Semana {n}: pon los focos, las clases, las tareas y el reporte. El alumno no verá nada hasta que la actives.", { n: selectedPeriod })}
              </p>
            ) : preparablePeriod && !currentActivePeriod ? (
              <p className="m-0 mt-3 text-xs font-bold text-white/70">
                {t("Toca la Semana {n} para prepararla antes de activarla.", { n: preparablePeriod })}
              </p>
            ) : null}
          </div>
        </header>

        {mode === "coach" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl font-extrabold"
              onClick={() => void handleActivateNextWeek()}
              disabled={savingPeriodAction || !board.periodState.nextPeriodEligible}
            >
              {savingPeriodAction
                ? t("Activando...")
                : board.periodState.nextPeriodEligible
                  ? t("Activar Semana {n}", { n: board.periodState.nextPeriodEligible })
                  : t("Activar siguiente semana")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-2xl font-extrabold"
              onClick={() => void handleCloseCurrentWeek()}
              disabled={savingPeriodAction || !board.periodState.currentActivePeriod}
            >
              {savingPeriodAction ? t("Cerrando...") : t("Cerrar semana activa")}
            </Button>
          </div>
        )}

        {mode === "coach" && !isSelectedPeriodClosed ? (
          <section
            className="mt-5 rounded-3xl border-2 p-4"
            style={{
              borderColor:
                "color-mix(in oklab, var(--v3-cyan) 35%, var(--v3-line) 65%)",
              background:
                "color-mix(in oklab, var(--v3-cyan) 6%, var(--v3-card) 94%)",
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <ListChecksIcon
                className="size-4"
                style={{ color: "var(--v3-cyan)" }}
              />
              <p className="text-sm font-semibold">
                {t("Te toca · semana {n}", { n: selectedPeriod })}
              </p>
            </div>
            {coachTodos.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--v3-muted)" }}>
                {t("Todo al día. ✓")}
              </p>
            ) : (
              <ul className="grid gap-1.5 md:grid-cols-2">
                {coachTodos.map((todo) => (
                  <li key={todo.key}>
                    <button
                      type="button"
                      onClick={todo.onClick}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition hover:-translate-y-0.5"
                      style={{
                        borderColor:
                          todo.tone === "warn"
                            ? "color-mix(in oklab, #f59e0b 45%, var(--v3-line) 55%)"
                            : "var(--v3-line)",
                        background: "var(--v3-card)",
                      }}
                    >
                      <span className="flex items-center gap-2">
                        {todo.tone === "warn" ? (
                          <AlertTriangleIcon className="size-3.5 shrink-0 text-amber-500" />
                        ) : (
                          <span
                            className="inline-block size-1.5 shrink-0 rounded-full"
                            style={{ background: "var(--v3-cyan)" }}
                          />
                        )}
                        {todo.label}
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium"
                        style={{ color: "var(--v3-cyan)" }}
                      >
                        {todo.action}
                        <ArrowRightIcon className="size-3" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section ref={focusSectionRef} className="mt-10 scroll-mt-4">
          <div className="mb-4 flex items-center gap-3">
            <IconTile tone="gold" size={44}>
              <TargetGlyph size={28} />
            </IconTile>
            <div className="min-w-0">
              <h2 className="m-0 text-2xl leading-tight md:text-[28px]">
                {t("Los tres focos")}
              </h2>
              <p className="m-0 text-sm font-semibold" style={{ color: "var(--v3-muted)" }}>
                {t("Un foco nuevo se abre cuando uno llega a dominado.")}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {focusSlots.map((focus, idx) => {
              if (!focus) {
                return (
                  <Card
                    key={`focus-slot-${idx}`}
                    className={`rounded-2xl border border-dashed p-4 ${mode === "coach" && canAddFocus && canEditSelectedPeriod ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md" : ""}`}
                    style={{
                      borderColor: "var(--v3-line)",
                      background:
                        "color-mix(in oklab, var(--v3-card) 55%, transparent)",
                    }}
                    onClick={() => {
                      if (
                        mode === "coach" &&
                        canAddFocus &&
                        canEditSelectedPeriod
                      )
                        openCreateFocus();
                    }}
                  >
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      {t("Hueco libre")}
                    </p>
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      {mode === "coach"
                        ? t("Escribe un foco gramatical y la IA prepara sola su ejercicio de Entrenado.")
                        : t("Se abre un foco nuevo cuando uno de los otros llegue a dominado.")}
                    </p>
                    {mode === "coach" && canAddFocus && (
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3"
                        disabled={!canEditSelectedPeriod}
                        onClick={(event) => {
                          event.stopPropagation();
                          openCreateFocus();
                        }}
                      >
                        <CirclePlusIcon className="size-4" /> {t("Añadir foco")}
                      </Button>
                    )}
                  </Card>
                );
              }

              const progress = focusProgress(focus);
              const currentPhaseIdx =
                progress > 0 ? Math.max(0, Math.min(3, progress - 1)) : null;
              const suggestedPhaseIdx = getSuggestedPhaseIndex(focus);
              const hasManualPhaseSelection =
                typeof selectedFocusPhase[focus.id] === "number";
              const selectedPhaseIdx = hasManualPhaseSelection
                ? selectedFocusPhase[focus.id]
                : suggestedPhaseIdx;
              const selectedPhaseInfo =
                PHASE_INFO[selectedPhaseIdx] || PHASE_INFO[suggestedPhaseIdx];
              const focusExercise = exerciseByFocusId.get(focus.id);
              const focusAttempt = attemptByFocusId.get(focus.id);
              const trainedPhaseSelected =
                selectedPhaseInfo.key === "phaseTrained";
              const canUseTrainedActions =
                trainedPhaseSelected && focus.phaseExplained;
              const trainButtonLabel = focusAttempt ? t("Reintentar") : t("Entrenar");
              const trainReady = focusExercise?.status === "ready";
              const trainPreparing =
                focusExercise?.status === "pending" ||
                focusExercise?.status === "generating";
              const externalTrainingUrl =
                focusExercise?.externalTrainingUrl?.trim() || "";
              const hasExternalTraining = Boolean(externalTrainingUrl);
              const canTrainNow = trainReady || hasExternalTraining;
              const externalDraftValue =
                externalTrainingUrlDraftByFocusId[focus.id] ??
                externalTrainingUrl;

              if (mode === "coach") {
                const trainingState = getTrainingState(focusExercise);
                const nextPhaseIdx = PHASE_KEYS.findIndex((key) => !focus[key]);
                const nextPhaseLabel =
                  nextPhaseIdx >= 0 ? t(PHASE_LABELS[nextPhaseIdx]) : null;
                const nextPhaseHint =
                  nextPhaseIdx === 0
                      ? t("Cuando se lo expliques en clase, marca «Explicado»: así se le abre el ejercicio.")
                      : nextPhaseIdx === 1
                       ? t("Se marca automáticamente al superar el ejercicio. Solo si falla la generación y hay un enlace externo podrás marcarlo manualmente.")
                      : nextPhaseIdx === 2
                        ? t("Marca «Entendido» cuando el alumno te lo explique a ti.")
                        : nextPhaseIdx === 3
                          ? t("Marca «Dominado» cuando le salga solo en clase.")
                          : t("Foco dominado. Deja el hueco libre para uno nuevo.");
                const linkOpen =
                  externalLinkOpenByFocusId[focus.id] ?? hasExternalTraining;

                return (
                  <Card
                    key={focus.id}
                    className="rounded-2xl border p-4"
                    style={{
                      borderColor: "var(--v3-line)",
                      background: "var(--v3-card)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-xs"
                        style={{ color: "var(--v3-muted)" }}
                      >
                        {t("Foco {n} · desde semana {week}", { n: idx + 1, week: focus.periodNumber })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">
                          {progress}/4
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-7 rounded-full"
                          aria-label={t("Nota del foco")}
                          onClick={() => setOpenFocusComment(focus.id)}
                        >
                          <MessageCircleIcon className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-7 rounded-full"
                          aria-label={t("Editar foco")}
                          disabled={!canEditSelectedPeriod}
                          onClick={() => openEditFocus(focus)}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold leading-tight">
                      {focus.focusTitle}
                    </h3>

                    {/* Fases: un clic marca o desmarca. Solo se puede tocar la siguiente o la última hecha. */}
                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                      {PHASE_KEYS.map((phaseKey, phaseIdx) => {
                        const done = Boolean(focus[phaseKey]);
                        const hasExternalFallback =
                          focusExercise?.status === "error" &&
                          Boolean(focusExercise.externalTrainingUrl?.trim());
                        const canManuallySetTrained =
                          phaseKey !== "phaseTrained" || done || hasExternalFallback;
                        const clickable =
                          canEditSelectedPeriod &&
                          canTogglePhase(focus, phaseKey) &&
                          canManuallySetTrained;
                        const isNext = phaseIdx === nextPhaseIdx;
                        return (
                          <button
                            key={`${focus.id}-${phaseKey}`}
                            type="button"
                            disabled={!clickable}
                            onClick={() =>
                              void handleToggleFocus(focus, phaseKey)
                            }
                            aria-label={
                              done
                                ? clickable
                                  ? t("Desmarcar {phase}", { phase: t(PHASE_LABELS[phaseIdx]) })
                                  : t(PHASE_LABELS[phaseIdx])
                                : clickable
                                  ? phaseKey === "phaseTrained" && hasExternalFallback
                                    ? t("Marcar Entrenado con enlace externo")
                                    : t("Marcar {phase}", { phase: t(PHASE_LABELS[phaseIdx]) })
                                  : phaseKey === "phaseTrained" && !done
                                    ? t("Se marca al superar el ejercicio; para marcarlo manualmente, debe fallar la generación y haber un enlace externo")
                                  : t("Primero marca la fase anterior")
                            }
                            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition disabled:cursor-not-allowed ${clickable ? "hover:-translate-y-0.5" : ""} ${isNext && clickable ? "animate-pulse" : ""}`}
                            style={{
                              borderColor: done
                                ? "var(--v3-cyan)"
                                : isNext && clickable
                                  ? "color-mix(in oklab, var(--v3-cyan) 60%, var(--v3-line) 40%)"
                                  : "var(--v3-line)",
                              background: done
                                ? "color-mix(in oklab, var(--v3-cyan) 18%, transparent 82%)"
                                : "transparent",
                              color: done
                                ? "var(--v3-text)"
                                : clickable
                                  ? "var(--v3-text)"
                                  : "var(--v3-muted)",
                              opacity: !done && !clickable ? 0.6 : 1,
                            }}
                          >
                            <span
                              className="inline-flex size-5 items-center justify-center rounded-full border"
                              style={{
                                borderColor: done
                                  ? "var(--v3-cyan)"
                                  : "var(--v3-line)",
                                background: done
                                  ? "var(--v3-cyan)"
                                  : "transparent",
                                color: done ? "#031522" : "var(--v3-muted)",
                              }}
                            >
                              {done ? (
                                <CheckIcon className="size-3" />
                              ) : (
                                phaseIdx + 1
                              )}
                            </span>
                            {t(PHASE_LABELS[phaseIdx])}
                          </button>
                        );
                      })}
                    </div>
                    <p
                      className="mt-2 text-xs leading-relaxed"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      {nextPhaseLabel ? (
                        <b style={{ color: "var(--v3-text)" }}>
                          {t("Siguiente: {phase}.", { phase: nextPhaseLabel })}{" "}
                        </b>
                      ) : null}
                      {nextPhaseHint}
                    </p>

                    {/* Ejercicio de Entrenado: se genera solo al crear el foco */}
                    <div
                      className="mt-3 rounded-xl border p-3"
                      style={{
                        borderColor:
                          trainingState === "error" || trainingState === "stuck"
                            ? "color-mix(in oklab, #ef4444 45%, var(--v3-line) 55%)"
                            : trainingState === "ready"
                              ? "color-mix(in oklab, var(--v3-cyan) 45%, var(--v3-line) 55%)"
                              : "var(--v3-line)",
                      }}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {trainingState === "ready" ? (
                          <CheckIcon
                            className="size-4"
                            style={{ color: "var(--v3-cyan)" }}
                          />
                        ) : trainingState === "generating" ? (
                          <Loader2Icon
                            className="size-4 animate-spin"
                            style={{ color: "var(--v3-cyan)" }}
                          />
                        ) : (
                          <AlertTriangleIcon className="size-4 text-amber-500" />
                        )}
                        <span>
                          {trainingState === "ready"
                            ? t("Ejercicio listo")
                            : trainingState === "generating"
                              ? t("Preparando el ejercicio…")
                              : trainingState === "stuck"
                                ? t("El ejercicio se ha quedado atascado")
                                : trainingState === "error"
                                  ? t("No se pudo generar el ejercicio")
                                  : t("Sin ejercicio todavía")}
                        </span>
                      </div>
                      <p
                        className="mt-1 text-xs leading-relaxed"
                        style={{ color: "var(--v3-muted)" }}
                      >
                        {trainingState === "ready"
                          ? focus.phaseExplained
                            ? t("El alumno ya lo tiene en Entrenado.")
                            : t("Se le abrirá al alumno cuando marques «Explicado».")
                          : trainingState === "generating"
                            ? t("La IA lo está creando con tu plantilla (≈1 min). Puedes seguir trabajando.")
                            : t("Vuelve a generarlo: no tienes que hacer nada más.")}
                      </p>
                      {focusAttempt ? (
                        <p className="mt-1 text-xs">
                          {(attemptCountByFocusId.get(focus.id) || 1) > 1
                            ? t("Último de {n} intentos:", { n: attemptCountByFocusId.get(focus.id) || 0 }) + " "
                            : t("Entregado:") + " "}
                          <b>
                            {focusAttempt.scoreCorrect}/{focusAttempt.scoreTotal}
                          </b>{" "}
                          ·{" "}
                          {focusAttempt.passed ? t("superado") : t("no superado")}
                          {formatShortDateTime(focusAttempt.submittedAt)
                            ? ` · ${formatShortDateTime(focusAttempt.submittedAt)}`
                            : ""}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {trainingState === "ready" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setPreviewFocusId(focus.id)}
                          >
                            <EyeIcon className="size-3.5" /> {t("Ver ejercicio")}
                          </Button>
                        ) : null}
                        {focusAttempt ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setOpenReviewFocusId(focus.id)}
                          >
                            <ListChecksIcon className="size-3.5" /> {t("Ver respuestas")}
                          </Button>
                        ) : null}
                        {trainingState !== "generating" ? (
                          <Button
                            size="sm"
                            variant={
                              trainingState === "ready" ? "ghost" : "default"
                            }
                            className="h-8"
                            disabled={
                              regeneratingFocusId === focus.id ||
                              !canEditSelectedPeriod
                            }
                            onClick={() => {
                              if (trainingState === "ready") {
                                setConfirmRegenerateFocusId(focus.id);
                                return;
                              }
                              void handleRegenerateTraining(focus);
                            }}
                          >
                            <RefreshCwIcon className="size-3.5" />
                            {trainingState === "ready"
                              ? t("Rehacer")
                              : trainingState === "missing"
                                ? t("Generar")
                                : t("Reintentar")}
                          </Button>
                        ) : null}
                      </div>
                      {trainingState === "error" && focusExercise?.error ? (
                        <details className="mt-2 text-[11px]" style={{ color: "var(--v3-muted)" }}>
                          <summary className="cursor-pointer">{t("Detalle técnico")}</summary>
                          <p className="mt-1 break-words">{focusExercise.error}</p>
                        </details>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className="mt-2 inline-flex items-center gap-1 text-xs"
                      style={{ color: "var(--v3-muted)" }}
                      onClick={() =>
                        setExternalLinkOpenByFocusId((prev) => ({
                          ...prev,
                          [focus.id]: !linkOpen,
                        }))
                      }
                    >
                      <LinkIcon className="size-3" />
                      {hasExternalTraining
                        ? t("Link externo guardado")
                        : t("Añadir link externo (opcional)")}
                      <ChevronDownIcon
                        className={`size-3 transition ${linkOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {linkOpen ? (
                      <div className="mt-2 flex gap-2">
                        <Input
                          value={externalDraftValue}
                          onChange={(event) =>
                            setExternalTrainingUrlDraftByFocusId((prev) => ({
                              ...prev,
                              [focus.id]: event.target.value,
                            }))
                          }
                          disabled={!canEditSelectedPeriod}
                          placeholder={t("https://… (se usa si no hay ejercicio)")}
                          className="h-8"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={
                            !canEditSelectedPeriod ||
                            savingExternalTrainingUrlFocusId === focus.id
                          }
                          onClick={() =>
                            void handleSaveExternalTrainingUrl(focus)
                          }
                        >
                          {savingExternalTrainingUrlFocusId === focus.id
                            ? "…"
                            : t("Guardar")}
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                );
              }

              return (
                <Card
                  key={focus.id}
                  className="rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                  style={{
                    borderColor: "var(--v3-line)",
                    background: "var(--v3-card)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      {t("Abierto en semana {n}", { n: focus.periodNumber })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {progress}/4
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-6 rounded-full"
                        onClick={() => setOpenFocusComment(focus.id)}
                      >
                        <MessageCircleIcon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold leading-tight">
                    {focus.focusTitle}
                  </h3>

                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    {PHASE_LABELS.map((phaseLabel, phaseIdx) => {
                      const done = phaseIdx < progress;
                      const isCurrent =
                        currentPhaseIdx !== null && phaseIdx === currentPhaseIdx;
                      const isSelected = phaseIdx === selectedPhaseIdx;
                      const isManuallySelected =
                        hasManualPhaseSelection && isSelected;
                      return (
                        <button
                          key={`${focus.id}-${phaseLabel}`}
                          type="button"
                          className="rounded px-0.5 text-left"
                          onClick={() =>
                            setSelectedFocusPhase((prev) => ({
                              ...prev,
                              [focus.id]: phaseIdx,
                            }))
                          }
                        >
                          <span
                            className="block h-1.5 rounded-full"
                            style={{
                              background:
                                done || isManuallySelected
                                  ? "var(--v3-cyan)"
                                  : "color-mix(in oklab, var(--v3-line) 88%, black 12%)",
                              boxShadow: isManuallySelected
                                ? "0 0 0 3px color-mix(in oklab, var(--v3-cyan) 22%, transparent 78%)"
                                : "none",
                            }}
                          />
                          <span
                            className="mt-1 block text-[10px]"
                            style={{
                              color: isManuallySelected
                                ? "var(--v3-cyan)"
                                : isCurrent
                                  ? "var(--v3-text)"
                                  : "var(--v3-muted)",
                              fontWeight: isManuallySelected || isCurrent ? 600 : 400,
                            }}
                          >
                            {t(phaseLabel)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <p
                    className="mt-3 min-h-14 text-xs leading-relaxed"
                    style={{ color: "var(--v3-muted)" }}
                  >
                    <b style={{ color: "var(--v3-text)" }}>
                      {t(selectedPhaseInfo.label)}.
                    </b>{" "}
                    {t(selectedPhaseInfo.description)}
                  </p>

                  {mode === "student" && canUseTrainedActions && (
                    <>
                      {canTrainNow ? (
                        <Button
                          size="sm"
                          variant={focusAttempt ? "outline" : "default"}
                          className="mt-4 w-full"
                          disabled={!canEditSelectedPeriod}
                          onClick={() => {
                            if (!canEditSelectedPeriod) return;
                            if (trainReady) {
                              navigate(
                                getCoachingV2ExerciseRoute(
                                  sessionId,
                                  selectedPeriod,
                                  focus.id,
                                ),
                              );
                              return;
                            }

                            if (externalTrainingUrl) {
                              window.open(
                                externalTrainingUrl,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }
                          }}
                        >
                          {trainButtonLabel}
                        </Button>
                      ) : (
                        <p
                          className="mt-4 text-center text-xs"
                          style={{ color: "var(--v3-muted)" }}
                        >
                          {trainPreparing
                            ? t("Tu entrenamiento se está preparando.")
                            : t("Tu entrenamiento aún no está disponible. Tu coach lo está preparando.")}
                        </p>
                      )}
                    </>
                  )}

                </Card>
              );
            })}
          </div>

          {allCompletedUntilSelected.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs" style={{ color: "var(--v3-muted)" }}>
                {t("Ya dominados:")}
              </span>
              {allCompletedUntilSelected.map((focus) => (
                (() => {
                  const focusExercise = focusExerciseByFocusId.get(focus.id);
                  const externalTrainingUrl =
                    focusExercise?.externalTrainingUrl?.trim() || "";
                  const trainingHref =
                    focusExercise?.status === "ready"
                      ? getCoachingV2ExerciseRoute(
                          sessionId,
                          focus.periodNumber,
                          focus.id,
                        )
                      : externalTrainingUrl || null;
                  const trainingIsExternal =
                    focusExercise?.status !== "ready" &&
                    Boolean(externalTrainingUrl);

                  const badgeClassName =
                    "rounded-full border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";

                  // Sin entrenamiento: el foco se muestra, pero no se puede abrir.
                  if (!trainingHref) {
                    return (
                      <Badge
                        key={`done-${focus.id}`}
                        variant="outline"
                        className={badgeClassName}
                      >
                        <SparklesIcon className="mr-1 size-3" /> {focus.focusTitle}
                      </Badge>
                    );
                  }

                  // Con entrenamiento: todo el foco es el enlace (antes había un «(entrenamiento)» aparte).
                  return (
                    <Badge
                      key={`done-${focus.id}`}
                      asChild
                      variant="outline"
                      className={`${badgeClassName} cursor-pointer transition-colors hover:border-amber-500/70 hover:bg-amber-500/20`}
                    >
                      <a
                        href={trainingHref}
                        target={trainingIsExternal ? "_blank" : undefined}
                        rel={trainingIsExternal ? "noopener noreferrer" : undefined}
                        aria-label={t("Ver el entrenamiento de «{focus}»", { focus: focus.focusTitle })}
                        onClick={(event) => {
                          if (trainingIsExternal) return;
                          event.preventDefault();
                          navigate(trainingHref);
                        }}
                      >
                        <SparklesIcon className="mr-1 size-3" /> {focus.focusTitle}
                        <ArrowUpRightIcon className="ml-0.5 size-3 opacity-70" aria-hidden="true" />
                      </a>
                    </Badge>
                  );
                })()
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center gap-3">
            <IconTile tone="i" size={44}>
              <ListChecksIcon className="size-6" strokeWidth={2.4} aria-hidden="true" />
            </IconTile>
            <div className="min-w-0">
              <h2 className="m-0 text-2xl leading-tight md:text-[28px]">
                {t("Tareas semanales")}
              </h2>
              <p className="m-0 text-sm font-semibold" style={{ color: "var(--v3-muted)" }}>
                {t("Seis tareas entre las dos clases. Al completarlas se abre tu reporte.")}
              </p>
            </div>
          </div>

          <Card
            className="rounded-3xl border p-5"
            style={{
              borderColor: "var(--v3-line)",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--v3-cyan) 12%, var(--v3-card) 88%), var(--v3-card))",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("Semana {n}", { n: selectedPeriod })}</p>
                <p className="text-xs" style={{ color: "var(--v3-muted)" }}>
                  {t("Tres tareas por clase. Una sola cuenta.")}
                </p>
              </div>
              <p className="text-sm">
                <b className="text-4xl font-bold leading-none">
                  {completedTasks}
                </b>{" "}
                {t("de 6 tareas")}
              </p>
            </div>

            <div className="relative mt-2">
              <div
                className="absolute top-5 h-1 rounded-full"
                style={{
                  left: "7.14%",
                  right: "21.43%",
                  background:
                    "color-mix(in oklab, var(--v3-line) 85%, black 15%)",
                }}
              />
              <div
                className="absolute left-[7.14%] top-5 h-1 rounded-full transition-all"
                style={{
                  width: `${Math.min(71.43, Math.max(0, (completedTasks / 6) * 71.43))}%`,
                  background: "var(--v3-cyan)",
                }}
              />
              <div className="relative grid grid-cols-7 items-start gap-2">
                {Array.from({ length: 6 }, (_, idx) => {
                  const task = aggregatedTasks.find(
                    (item) => item.index === idx + 1,
                  );
                  const done = Boolean(task?.done);
                  return (
                    <div
                      key={`spine-${idx + 1}`}
                      className="flex flex-col items-center gap-2 text-xs"
                    >
                      <span
                        className="inline-flex size-11 items-center justify-center rounded-full border text-sm font-semibold"
                        style={{
                          borderColor: done
                            ? "var(--v3-cyan)"
                            : "color-mix(in oklab, var(--v3-line) 85%, black 15%)",
                          background: done
                            ? "var(--v3-cyan)"
                            : "color-mix(in oklab, var(--v3-card) 90%, black 10%)",
                          color: done ? "#031522" : "var(--v3-muted)",
                        }}
                      >
                        {done ? <CheckIcon className="size-5" /> : idx + 1}
                      </span>
                      <span style={{ color: "var(--v3-muted)" }}>
                        {t("Clase {n}", { n: idx < 3 ? 1 : 2 })}
                      </span>
                    </div>
                  );
                })}

                <div className="flex flex-col items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleScrollToReport}
                    disabled={!reportUnlocked}
                    className="inline-flex size-12 items-center justify-center rounded-full border border-dashed transition disabled:cursor-not-allowed"
                    style={{
                      borderColor: reportUnlocked
                        ? "var(--v3-gold)"
                        : "color-mix(in oklab, var(--v3-line) 72%, black 28%)",
                      background: reportUnlocked
                        ? "color-mix(in oklab, var(--v3-gold) 15%, transparent 85%)"
                        : "color-mix(in oklab, var(--v3-card) 90%, black 10%)",
                      color: reportUnlocked
                        ? "var(--v3-gold)"
                        : "var(--v3-muted)",
                    }}
                  >
                    {reportUnlocked ? (
                      <LockOpenIcon className="size-5" />
                    ) : (
                      <LockIcon className="size-5" />
                    )}
                  </button>
                  <span style={{ color: "var(--v3-muted)" }}>{t("Reporte")}</span>
                </div>
              </div>
            </div>

            <div
              className="mt-5 border-t pt-4"
              style={{ borderColor: "var(--v3-line)" }}
            >
              <p className="text-sm" style={{ color: "var(--v3-muted)" }}>
                <LockIcon className="mr-2 inline size-4 align-text-bottom" />
                {t("Siguiente:")}{" "}
                <b style={{ color: "var(--v3-text)" }}>
                  {nextPendingTask ? t(nextPendingTask.title) : t("Todas las tareas completas")}
                </b>
                {nextPendingTask
                  ? t(", de la clase {n}.", { n: nextPendingTask.classIndex })
                  : "."}
              </p>
            </div>
          </Card>
        </section>

        <section ref={classesSectionRef} className="mt-10 scroll-mt-4">
          <div className="mb-4 flex items-center gap-3">
            <IconTile tone="a" size={44}>
              <VideoIcon className="size-6" strokeWidth={2.4} aria-hidden="true" />
            </IconTile>
            <div className="min-w-0">
              <h2 className="m-0 text-2xl leading-tight md:text-[28px]">
                {titleClases}
              </h2>
              <p className="m-0 text-sm font-semibold" style={{ color: "var(--v3-muted)" }}>
                {classesSubtitle}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[1, 2].map((slot) => {
              const classRow =
                selectedClasses.find((row) => row.classIndex === slot) || null;
              const classRoleLabel =
                classRow?.title && classRow.title.trim() !== `Clase ${slot}`
                  ? classRow.title.trim()
                  : "";

              const classCoachName = classRow?.assignedByCoachUserId
                ? board.coachers?.classAssignedCoachDisplayNameByClassIndex?.[
                    String(slot)
                  ] || null
                : null;

              const classTasks = aggregatedTasks.filter(
                (task) => task.classIndex === slot,
              );
              const key = `${selectedPeriod}-${slot}`;
              const fallbackScheduled = toDateAndTimeFromIso(
                classRow?.scheduledAt || null,
              );
              const draft = classDrafts[key] || {
                classRole: classRoleLabel,
                assignedCoachUserId: classRow?.assignedByCoachUserId || "",
                scheduledDate: fallbackScheduled.date,
                scheduledTime: fallbackScheduled.time,
                loomUrl: classRow?.loomUrl || "",
                coachGuideline1:
                  classRow?.coachGuideline1 || DEFAULT_CLASS_TASKS[0],
                coachGuideline2:
                  classRow?.coachGuideline2 || DEFAULT_CLASS_TASKS[1],
                coachGuideline3:
                  classRow?.coachGuideline3 || DEFAULT_CLASS_TASKS[2],
                response1: classRow?.studentGuidelineResponse1 || "",
                response2: classRow?.studentGuidelineResponse2 || "",
                response3: classRow?.studentGuidelineResponse3 || "",
                // New classes: task 3 is answered with an audio by default (Luis, 6 Oct).
                taskAudio: classRow?.taskAudio || [false, false, true],
              };
              const embedUrl = getEmbeddableVideoUrl(classRow?.loomUrl || null);
              const classEditOpen = Boolean(classEditOpenByKey[key]);

              return (
                <Card
                  key={`class-${slot}`}
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: "var(--v3-line)",
                    background: "var(--v3-card)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{t("Clase {n}", { n: slot })}</h3>
                      {classRoleLabel ? (
                        <p
                          className="text-xs"
                          style={{ color: "var(--v3-muted)" }}
                        >
                          {classRoleLabel}
                        </p>
                      ) : null}
                    </div>
                    {mode === "student" && classCoachName ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      >
                        {classCoachName}
                      </Badge>
                    ) : null}
                  </div>

                  {embedUrl ? (
                    <div
                      className="mt-3 overflow-hidden rounded-xl border"
                      style={{ borderColor: "var(--v3-line)" }}
                    >
                      <iframe
                        src={embedUrl}
                        title={t("Clase {n} semana {week}", { n: slot, week: selectedPeriod })}
                        className="aspect-video w-full"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div
                      className="relative mt-3 flex aspect-video items-center justify-center rounded-xl border text-sm"
                      style={{
                        borderColor: "var(--v3-line)",
                        background:
                          "radial-gradient(55% 60% at 35% 35%, color-mix(in oklab, var(--v3-cyan) 20%, transparent 80%), transparent), color-mix(in oklab, var(--v3-card) 90%, black 10%)",
                        color: "var(--v3-muted)",
                      }}
                    >
                      <span className="mr-3 inline-flex size-14 items-center justify-center rounded-full bg-white/95 text-slate-900">
                        <PlayCircleIcon className="size-7" />
                      </span>
                      {classRow?.loomUrl
                        ? t("Abrir grabación en Loom")
                        : t("Grabación pendiente")}
                    </div>
                  )}

                  {mode === "student" ? (
                    <Accordion type="single" collapsible className="mt-4">
                      {classTasks.map((task) => {
                        const localIndex = task.index - (slot === 1 ? 0 : 3);
                        const responseKey =
                          localIndex === 1
                            ? "response1"
                            : localIndex === 2
                              ? "response2"
                              : "response3";
                        const guidelineValue =
                          localIndex === 1
                            ? draft.coachGuideline1
                            : localIndex === 2
                              ? draft.coachGuideline2
                              : draft.coachGuideline3;
                        const isAssigned = Boolean(guidelineValue.trim());
                        const responseValue = draft[responseKey];
                        const isDone = task.done;
                        return (
                          <AccordionItem
                            key={`task-acc-${slot}-${task.index}`}
                            value={`task-${slot}-${task.index}`}
                          >
                            <AccordionTrigger
                              className="hover:no-underline disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={!isAssigned}
                            >
                              <div className="flex w-full items-start gap-3 text-left">
                                <span
                                  className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${isDone ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 text-muted-foreground"}`}
                                >
                                  {isDone ? (
                                    <CheckIcon className="size-3.5" />
                                  ) : (
                                    task.index
                                  )}
                                </span>
                                <div>
                                  <p className="text-base font-semibold leading-tight">
                                    {isAssigned
                                      ? t(task.title)
                                      : t("Pendiente de asignar")}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {isAssigned
                                      ? isDone
                                        ? classRow?.audioAnswers?.find((item) => item.taskIndex === localIndex)?.feedbackAt
                                          ? t("Hecha · tu coach te ha respondido")
                                          : t("Hecha")
                                        : classRow?.taskAudio?.[localIndex - 1]
                                          ? t("Por completar · en audio")
                                          : t("Por completar")
                                      : t("Pendiente de asignar por tu coach")}
                                  </p>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              {isAssigned && classRow?.taskAudio?.[localIndex - 1] && !responseValue.trim() ? (
                                <StudentTaskAudio
                                  target={{
                                    sessionId,
                                    periodNumber: selectedPeriod,
                                    classIndex: slot as 1 | 2,
                                    taskIndex: localIndex as 1 | 2 | 3,
                                  }}
                                  answer={
                                    classRow.audioAnswers?.find((item) => item.taskIndex === localIndex) || null
                                  }
                                  canEdit={canEditSelectedPeriod}
                                  onSent={(answer, studentCompletedAt) =>
                                    applyTaskAudioAnswer(selectedPeriod, slot as 1 | 2, answer, studentCompletedAt)
                                  }
                                />
                              ) : isAssigned ? (
                                <>
                                  <Textarea
                                    value={responseValue}
                                    onChange={(event) =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          [responseKey]: event.target.value,
                                        },
                                      }))
                                    }
                                    rows={3}
                                    placeholder={t("Escribe tu respuesta...")}
                                    disabled={!canEditSelectedPeriod}
                                  />
                                  <div className="mt-2 flex items-center gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() =>
                                        void handleSaveStudentTask(
                                          slot as 1 | 2,
                                          {
                                            response1: draft.response1,
                                            response2: draft.response2,
                                            response3: draft.response3,
                                          },
                                          localIndex as 1 | 2 | 3,
                                        )
                                      }
                                      disabled={
                                        !canEditSelectedPeriod ||
                                        savingClassKey ===
                                          `${key}-r${localIndex}` ||
                                        !responseValue.trim()
                                      }
                                    >
                                      {savingClassKey ===
                                      `${key}-r${localIndex}`
                                        ? t("Guardando...")
                                        : t("Guardar")}
                                    </Button>
                                    {task.done ? (
                                      <span className="text-xs text-cyan-300">
                                        {t("Hecha")}
                                      </span>
                                    ) : null}
                                  </div>
                                </>
                              ) : null}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  ) : null}

                  {mode === "coach" && (
                    <div
                      className="mt-4 space-y-2 rounded-xl border p-3"
                      style={{ borderColor: "var(--v3-line)" }}
                    >
                      {/* Resumen de la clase: de un vistazo qué falta. */}
                      <div className="grid gap-1.5 text-sm">
                        <p className="flex items-center gap-2">
                          <CalendarIcon className="size-4 shrink-0" style={{ color: "var(--v3-muted)" }} />
                          {formatShortDateTime(classRow?.scheduledAt || null) || (
                            <span className="text-amber-600 dark:text-amber-400">{t("Sin fecha")}</span>
                          )}
                        </p>
                        <p className="flex items-center gap-2">
                          <UserIcon className="size-4 shrink-0" style={{ color: "var(--v3-muted)" }} />
                          {classCoachName || (
                            <span style={{ color: "var(--v3-muted)" }}>{t("Sin coach asignado")}</span>
                          )}
                          {classRoleLabel ? (
                            <span style={{ color: "var(--v3-muted)" }}>· {classRoleLabel}</span>
                          ) : null}
                        </p>
                        <p className="flex items-center gap-2">
                          <VideoIcon className="size-4 shrink-0" style={{ color: "var(--v3-muted)" }} />
                          {classRow?.loomUrl ? (
                            t("Grabación subida")
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">{t("Grabación pendiente")}</span>
                          )}
                        </p>
                        <p className="flex items-center gap-2">
                          <ListChecksIcon className="size-4 shrink-0" style={{ color: "var(--v3-muted)" }} />
                          {t("Tareas respondidas: {n}/3", { n: classTasks.filter((task) => task.done).length })}
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant={classEditOpen ? "secondary" : "outline"}
                        className="w-full"
                        onClick={() =>
                          setClassEditOpenByKey((prev) => ({
                            ...prev,
                            [key]: !classEditOpen,
                          }))
                        }
                      >
                        <PencilIcon className="size-3.5" />
                        {classEditOpen ? t("Cerrar edición") : t("Editar fecha, coach y grabación")}
                        <ChevronDownIcon className={`size-3.5 transition ${classEditOpen ? "rotate-180" : ""}`} />
                      </Button>

                      {classEditOpen ? (
                      <div className="space-y-2">
                      <Input
                        value={draft.classRole}
                        onChange={(event) =>
                          setClassDrafts((prev) => ({
                            ...prev,
                            [key]: { ...draft, classRole: event.target.value },
                          }))
                        }
                        placeholder={t("Tipo de clase (ej: Sesión de control)")}
                        disabled={!canEditSelectedPeriod}
                      />
                      <AppSelect
                        value={draft.assignedCoachUserId}
                        onChange={(event) =>
                          setClassDrafts((prev) => ({
                            ...prev,
                            [key]: {
                              ...draft,
                              assignedCoachUserId: event.target.value,
                            },
                          }))
                        }
                        className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        style={{ borderColor: "var(--v3-line)" }}
                        disabled={!canEditSelectedPeriod}
                      >
                        <option value="">{t("Sin coach asignado")}</option>
                        {[
                          ...new Map(
                            [
                              {
                                id: board.session.coachUserId,
                                name:
                                  board.coachers?.primaryCoachDisplayName ||
                                  "Luis",
                              },
                              {
                                id: board.session.supportCoachUserId,
                                name:
                                  board.coachers?.selectedCoachDisplayName ||
                                  coachDisplayName ||
                                  "Coach",
                              },
                            ]
                              .filter((item) => Boolean(item.id))
                              .map((item) => [item.id as string, item.name]),
                          ).entries(),
                        ].map(([id, name]) => (
                          <option key={`class-coach-${slot}-${id}`} value={id}>
                            {name}
                          </option>
                        ))}
                      </AppSelect>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          type="date"
                          value={draft.scheduledDate}
                          onChange={(event) =>
                            setClassDrafts((prev) => ({
                              ...prev,
                              [key]: {
                                ...draft,
                                scheduledDate: event.target.value,
                              },
                            }))
                          }
                          disabled={!canEditSelectedPeriod}
                        />
                        <Input
                          type="time"
                          value={draft.scheduledTime}
                          onChange={(event) =>
                            setClassDrafts((prev) => ({
                              ...prev,
                              [key]: {
                                ...draft,
                                scheduledTime: event.target.value,
                              },
                            }))
                          }
                          disabled={!canEditSelectedPeriod}
                        />
                      </div>
                      <Input
                        value={draft.loomUrl}
                        onChange={(event) =>
                          setClassDrafts((prev) => ({
                            ...prev,
                            [key]: { ...draft, loomUrl: event.target.value },
                          }))
                        }
                        placeholder={t("Link Loom de la clase")}
                        disabled={!canEditSelectedPeriod}
                      />
                      </div>
                      ) : null}
                      <p className="pt-1 text-xs font-medium" style={{ color: "var(--v3-muted)" }}>
                        {t("Tareas de esta clase (el alumno las responde en su tablero)")}
                      </p>
                      <Accordion type="single" collapsible>
                        {[
                          {
                            absoluteIndex: slot === 1 ? 1 : 4,
                            localIndex: 1 as const,
                            guidelineKey: "coachGuideline1" as const,
                            responseValue: draft.response1,
                          },
                          {
                            absoluteIndex: slot === 1 ? 2 : 5,
                            localIndex: 2 as const,
                            guidelineKey: "coachGuideline2" as const,
                            responseValue: draft.response2,
                          },
                          {
                            absoluteIndex: slot === 1 ? 3 : 6,
                            localIndex: 3 as const,
                            guidelineKey: "coachGuideline3" as const,
                            responseValue: draft.response3,
                          },
                        ].map((item) => {
                          const isAnswered = isTaskAnswered(classRow, item.localIndex);
                          const audioAnswer =
                            classRow?.audioAnswers?.find((row) => row.taskIndex === item.localIndex) || null;
                          const isAudioTask = draft.taskAudio[item.localIndex - 1];
                          const hasTextAnswer = Boolean(item.responseValue?.trim());
                          return (
                            <AccordionItem
                              key={`coach-task-${slot}-${item.absoluteIndex}`}
                              value={`coach-task-${slot}-${item.absoluteIndex}`}
                            >
                              <AccordionTrigger className="hover:no-underline">
                                <div className="flex w-full items-center gap-2 text-left">
                                  <span
                                    className={`inline-flex size-5 items-center justify-center rounded-full border text-[11px] ${isAnswered ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}
                                  >
                                    {isAnswered ? (
                                      <CheckIcon className="size-3" />
                                    ) : (
                                      item.absoluteIndex
                                    )}
                                  </span>
                                  <span className="text-sm font-medium">
                                    {t("Tarea {n}", { n: item.absoluteIndex })}
                                  </span>
                                  {isAudioTask ? (
                                    <span className="rounded-full border px-1.5 py-px text-[10px] font-bold" style={{ borderColor: "var(--v3-line)" }}>
                                      {t("Audio")}
                                    </span>
                                  ) : null}
                                  {audioAnswer && !audioAnswer.feedbackAt ? (
                                    <span className="animate-pulse rounded-full px-1.5 py-px text-[10px] font-black" style={{ background: "var(--v3-gold)", color: "#3a2a00" }}>
                                      {t("Falta tu feedback")}
                                    </span>
                                  ) : null}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="space-y-2">
                                <Textarea
                                  value={draft[item.guidelineKey]}
                                  onChange={(event) =>
                                    setClassDrafts((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...draft,
                                        [item.guidelineKey]: event.target.value,
                                      },
                                    }))
                                  }
                                  rows={2}
                                  placeholder={t("Pregunta de tarea {n}", { n: item.absoluteIndex })}
                                  disabled={
                                    isAnswered || !canEditSelectedPeriod
                                  }
                                />
                                <label className="flex items-center gap-2 text-xs font-medium">
                                  <input
                                    type="checkbox"
                                    className="size-4 accent-current"
                                    checked={isAudioTask}
                                    disabled={isAnswered || !canEditSelectedPeriod}
                                    onChange={(event) =>
                                      setClassDrafts((prev) => {
                                        const nextAudio = [...draft.taskAudio] as [boolean, boolean, boolean];
                                        nextAudio[item.localIndex - 1] = event.target.checked;
                                        return { ...prev, [key]: { ...draft, taskAudio: nextAudio } };
                                      })
                                    }
                                  />
                                  {t("El alumno responde con un audio")}
                                </label>
                                {audioAnswer || (isAudioTask && !hasTextAnswer) ? (
                                  <CoachTaskAudioFeedback
                                    key={`${key}-${item.localIndex}-${audioAnswer?.feedbackAt || "new"}`}
                                    target={{
                                      sessionId,
                                      periodNumber: selectedPeriod,
                                      classIndex: slot as 1 | 2,
                                      taskIndex: item.localIndex,
                                    }}
                                    answer={audioAnswer}
                                    onSaved={(answer) => applyTaskAudioAnswer(selectedPeriod, slot as 1 | 2, answer)}
                                  />
                                ) : hasTextAnswer ? (
                                  <div
                                    className="rounded-md border p-2 text-xs"
                                    style={{ borderColor: "var(--v3-line)" }}
                                  >
                                    <p className="font-medium text-foreground">
                                      {t("Respuesta del alumno")}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                      {item.responseValue}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    {t("Sin respuesta del alumno.")}
                                  </p>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                      <Button
                        type="button"
                        onClick={() =>
                          void handleSaveClass(slot as 1 | 2, draft, classRow)
                        }
                        disabled={
                          savingClassKey === key || !canEditSelectedPeriod
                        }
                      >
                        {savingClassKey === key
                          ? t("Guardando...")
                          : t("Guardar clase {n}", { n: slot })}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <div ref={reportSectionRef}>
            <Card
              className="mt-4 rounded-2xl border p-5"
              style={{
                // Colores con variables del tablero: se lee bien en modo claro y oscuro.
                borderColor:
                  reportStatus === "blocked"
                    ? "color-mix(in oklab, var(--v3-cyan) 30%, var(--v3-line) 70%)"
                    : reportStatus === "available"
                      ? "color-mix(in oklab, var(--v3-gold) 55%, var(--v3-line) 45%)"
                      : "var(--v3-line)",
                borderStyle: reportStatus === "blocked" ? "dashed" : "solid",
                background:
                  reportStatus === "available"
                    ? "linear-gradient(120deg, color-mix(in oklab, var(--v3-gold) 14%, var(--v3-card) 86%), var(--v3-card) 62%)"
                    : "color-mix(in oklab, var(--v3-cyan) 5%, var(--v3-card) 95%)",
              }}
            >
              {reportStatus === "blocked" ? (
                <div className="flex items-center gap-4">
                  <span
                    className="inline-flex size-14 items-center justify-center rounded-2xl border"
                    style={{
                      borderColor:
                        "color-mix(in oklab, var(--v3-line) 70%, var(--v3-cyan) 30%)",
                      background:
                        "color-mix(in oklab, var(--v3-card) 86%, black 14%)",
                      color: "var(--v3-muted)",
                    }}
                  >
                    <LockIcon className="size-6" />
                  </span>
                  <div>
                    <h3 className="text-3xl font-semibold leading-tight">
                      {t("Tu reporte se abre con las seis tareas")}
                    </h3>
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      {t("Te faltan {n}:", { n: pendingTaskLabels.length })}{" "}
                      {pendingTaskLabels.length > 0
                        ? `${pendingTaskLabels.join(", ")}.`
                        : t("ninguna tarea.")}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">
                      {t("Reporte de la semana {n}", { n: selectedPeriod })}
                    </h3>
                    <Badge variant="outline" className="rounded-full">
                      {reportStatus === "available"
                        ? t("Disponible")
                        : t("En preparación")}
                    </Badge>
                  </div>

                  {reportStatus === "preparing" && (
                    <p
                      className="mt-2 text-sm"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      {mode === "coach"
                        ? t("Semana completa. El reporte de la semana aún está en preparación.")
                        : t("Aún no está disponible. Tu profe lo subirá pronto.")}
                    </p>
                  )}

                  {reportStatus === "available" && (
                    <div className="mt-3 space-y-3">
                      {board.periodReport?.reportImageUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setReportImagePreviewUrl(
                                board.periodReport?.reportImageUrl || null,
                              )
                            }
                            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border text-left"
                            style={{ borderColor: "var(--v3-line)" }}
                          >
                            <img
                              src={board.periodReport.reportImageUrl}
                              alt={t("Imagen del reporte de la semana {n}", { n: selectedPeriod })}
                              className="max-h-56 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                              <EyeIcon className="size-5 text-white" />
                            </div>
                          </button>
                          <a
                            href={board.periodReport.reportImageUrl}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-2"
                          >
                            <DownloadIcon className="size-3.5" />
                            {t("Descargar imagen")}
                          </a>
                        </>
                      ) : (
                        <p
                          className="text-sm"
                          style={{ color: "var(--v3-muted)" }}
                        >
                          {t("Aún no hay imagen de reporte para esta semana.")}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {mode === "coach" && (
                <div
                  className="mt-4 space-y-3 rounded-xl border p-3"
                  style={{ borderColor: "var(--v3-line)" }}
                >
                  <p className="text-sm font-medium">
                    {t("Editar reporte de la semana")}
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 relative">
                      <Input
                        id={`period-report-image-${selectedPeriod}`}
                        type="file"
                        accept="image/*"
                        className="sr-only!"
                        onChange={(event) => {
                          setReportDraftImageFile(
                            event.target.files?.[0] || null,
                          );
                          setRemoveReportImage(false);
                        }}
                        disabled={!canEditSelectedPeriod}
                      />
                      <Button
                        asChild
                        type="button"
                        variant={
                          reportDraftImageFile ||
                          (board.periodReport?.reportImageUrl &&
                            !removeReportImage)
                            ? "outline"
                            : "default"
                        }
                        size="sm"
                        disabled={!canEditSelectedPeriod}
                      >
                        <label
                          htmlFor={`period-report-image-${selectedPeriod}`}
                        >
                          <UploadIcon className="mr-1 inline size-3.5" />
                          {reportDraftImageFile ||
                          (board.periodReport?.reportImageUrl &&
                            !removeReportImage)
                            ? t("Cambiar fichero")
                            : t("Subir fichero")}
                        </label>
                      </Button>
                      <span className="max-w-[240px] truncate text-xs text-muted-foreground">
                        {reportDraftImageFile
                          ? reportDraftImageFile.name
                          : board.periodReport?.reportImageUrl &&
                              !removeReportImage
                            ? t("Imagen actual cargada")
                            : t("Sin fichero")}
                      </span>
                    </div>
                    {reportDraftImageFile && (
                      <p className="text-xs text-muted-foreground">
                        {t("Nueva imagen: {name}", { name: reportDraftImageFile.name })}
                      </p>
                    )}
                    {!reportDraftImageFile &&
                      board.periodReport?.reportImageUrl &&
                      !removeReportImage && (
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={board.periodReport.reportImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs"
                          >
                            {t("Ver imagen actual")}
                          </a>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setRemoveReportImage(true)}
                            disabled={!canEditSelectedPeriod}
                          >
                            {t("Quitar imagen")}
                          </Button>
                        </div>
                      )}
                    {removeReportImage && (
                      <p className="text-xs text-muted-foreground">
                        {t("La imagen se eliminará al guardar.")}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void handleSavePeriodReport()}
                      disabled={
                        savingReport || !userId || !canEditSelectedPeriod
                      }
                    >
                      {savingReport ? t("Guardando...") : t("Guardar reporte")}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </section>

        {mode === "coach" && coachExtraContent ? (
          <section className="mt-10">{coachExtraContent}</section>
        ) : null}
      </div>

      <Dialog
        open={Boolean(openFocusComment)}
        onOpenChange={(open) => !open && setOpenFocusComment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Comentario del foco")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedFocuses.find((focus) => focus.id === openFocusComment)
              ?.focusComment || t("Sin comentario para este foco.")}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog
        open={focusModalOpen}
        onOpenChange={(open) => {
          setFocusModalOpen(open);
          if (!open) setEditingFocusId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingFocusId ? t("Editar foco") : t("Nuevo foco · semana {n}", { n: selectedPeriod })}
            </DialogTitle>
            <DialogDescription>
              {editingFocusId
                ? t("Si cambias el foco, la IA vuelve a preparar su ejercicio.")
                : t("Escribe el punto gramatical que han trabajado. La IA prepara sola el ejercicio de Entrenado (≈1 min) y el alumno lo verá cuando marques «Explicado».")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveFocus();
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="focus-title">
                {t("Foco gramatical")}
              </label>
              <Input
                id="focus-title"
                autoFocus
                value={focusDraftTitle}
                onChange={(event) => setFocusDraftTitle(event.target.value)}
                placeholder={t("Ej.: Can · Could · Should · Would")}
                disabled={!canEditSelectedPeriod}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="focus-comment">
                {t("Nota para el alumno")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("(opcional)")}
                </span>
              </label>
              <Textarea
                id="focus-comment"
                value={focusDraftComment}
                onChange={(event) => setFocusDraftComment(event.target.value)}
                rows={3}
                placeholder={t("Ej.: Se te escapa el «to» detrás de can. La IA también usa esta nota para afinar el ejercicio.")}
                disabled={!canEditSelectedPeriod}
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {editingFocusId &&
              (() => {
                const editing = (board.focuses.find((row) => row.id === editingFocusId) || null);
                return (
                  editing &&
                  focusProgress(editing) === 0 &&
                  !(board.focusExerciseAttempts || []).some(
                    (row) => row.focusId === editing.id,
                  )
                );
              })() ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={deletingFocus || savingFocus}
                  onClick={() => void handleDeleteFocus()}
                >
                  <Trash2Icon className="size-4" />
                  {deletingFocus ? t("Eliminando...") : t("Eliminar foco")}
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                disabled={
                  savingFocus || !focusDraftTitle.trim() || !canEditSelectedPeriod
                }
              >
                {savingFocus
                  ? t("Guardando...")
                  : editingFocusId
                    ? t("Guardar cambios")
                    : t("Crear foco y preparar ejercicio")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmRegenerateFocusId)}
        onOpenChange={(open) => {
          if (!open) setConfirmRegenerateFocusId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("¿Rehacer el ejercicio?")}</DialogTitle>
            <DialogDescription>
              {t("La IA prepara uno nuevo para este foco (≈1 min). El actual se sustituye; los intentos del alumno se conservan.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRegenerateFocusId(null)}
            >
              {t("Cancelar")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                const target = board.focuses.find(
                  (row) => row.id === confirmRegenerateFocusId,
                );
                setConfirmRegenerateFocusId(null);
                if (target) void handleRegenerateTraining(target);
              }}
            >
              <RefreshCwIcon className="size-4" /> {t("Rehacer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(previewFocusId)}
        onOpenChange={(open) => {
          if (!open) setPreviewFocusId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {t("Vista previa ·")}{" "}
              {board.focuses.find((row) => row.id === previewFocusId)
                ?.focusTitle || t("Ejercicio")}
            </DialogTitle>
            <DialogDescription>
              {t("Así lo verá el alumno. Puedes probarlo: lo que respondas aquí no se guarda.")}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const payload = previewFocusId
              ? focusExerciseByFocusId.get(previewFocusId)?.exercise || null
              : null;
            const previewData = normalizeExercisePayload(payload);
            return previewData ? (
              <CoachingFocusExerciseRunner
                key={previewFocusId || "preview"}
                data={previewData}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("Este ejercicio no tiene el formato esperado. Pulsa «Rehacer».")}
              </p>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reportImagePreviewUrl)}
        onOpenChange={(open) => {
          if (!open) setReportImagePreviewUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("Imagen del reporte")}</DialogTitle>
          </DialogHeader>
          {reportImagePreviewUrl ? (
            <img
              src={reportImagePreviewUrl}
              alt={t("Imagen ampliada del reporte de la semana {n}", { n: selectedPeriod })}
              className="max-h-[75vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(openReviewFocusId)}
        onOpenChange={(open) => {
          if (!open) setOpenReviewFocusId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {t("Respuestas del alumno")}
              {openReviewFocusId
                ? ` · ${board.focuses.find((row) => row.id === openReviewFocusId)?.focusTitle || ""}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              {openReviewAttempt
                ? `${openReviewAttempt.passed ? t("Superado") : t("No superado")} · ${openReviewAttempt.scoreCorrect}/${openReviewAttempt.scoreTotal}`
                : t("Sin intento seleccionado.")}
            </DialogDescription>
          </DialogHeader>

          {openReviewAttempt && (
            <Tabs defaultValue="reconocer" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="reconocer">{t("Reconocer")}</TabsTrigger>
                <TabsTrigger value="construir">{t("Construir")}</TabsTrigger>
                <TabsTrigger value="conversacion">{t("Conversación")}</TabsTrigger>
              </TabsList>

              {(["reconocer", "construir", "conversacion"] as const).map(
                (blockId) => {
                  const answers = (openReviewAttempt.answers || []).filter(
                    (row) => row.block === blockId,
                  );
                  // Intentos antiguos: solo se guardaban los fallos, etiquetados con el
                  // TÍTULO del bloque (que la IA podía inventar). Lo resolvemos con el
                  // propio ejercicio; si no casa con ninguno, va a "Reconocer".
                  const reviewExercise = openReviewFocusId
                    ? normalizeExercisePayload(
                        focusExerciseByFocusId.get(openReviewFocusId)?.exercise ||
                          null,
                      )
                    : null;
                  const normalize = (text: string) =>
                    text
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .trim();
                  const legacyBlockOf = (
                    title: string,
                  ): "reconocer" | "construir" | "conversacion" => {
                    const norm = normalize(title);
                    if (reviewExercise) {
                      if (norm === normalize(reviewExercise.construir.titulo)) return "construir";
                      if (norm === normalize(reviewExercise.conversacion.titulo)) return "conversacion";
                      if (norm === normalize(reviewExercise.reconocer.titulo)) return "reconocer";
                    }
                    if (norm.includes("constru")) return "construir";
                    if (norm.includes("conversa") || norm.includes("dialog")) return "conversacion";
                    return "reconocer";
                  };
                  const legacyFailures =
                    answers.length === 0 && Array.isArray(openReviewAttempt.failures)
                      ? (openReviewAttempt.failures as Array<Record<string, unknown>>)
                          .filter(
                            (row) =>
                              row &&
                              legacyBlockOf(String(row.block || "")) === blockId,
                          )
                          .map((row) => ({
                            question: String(row.question || t("Pregunta")),
                            unit: undefined as string | undefined,
                            mine: String(row.mine || "—"),
                            found: null as string | null | undefined,
                            expected: String(row.expected || "—"),
                            ok: false,
                          }))
                      : [];
                  const rows = answers.length > 0 ? answers : legacyFailures;

                  return (
                    <TabsContent
                      key={`review-tab-${blockId}`}
                      value={blockId}
                      className="mt-3 space-y-2"
                    >
                      {answers.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("Este intento se hizo antes de guardar todas las respuestas: aquí solo salen los fallos.")}
                        </p>
                      ) : null}
                      {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t("Sin fallos en esta sección.")}
                        </p>
                      ) : (
                        rows.map((row, rowIdx) => (
                          <div
                            key={`answer-${blockId}-${rowIdx}`}
                            className={`rounded-md border p-3 text-sm ${row.ok ? "border-emerald-500/40" : "border-rose-500/40"}`}
                          >
                            <p className="flex items-start gap-2 font-medium">
                              <span
                                className={
                                  row.ok
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                }
                              >
                                {row.ok ? "✓" : "✗"}
                              </span>
                              <span>
                                {row.question}
                                {row.unit ? (
                                  <span className="block text-xs font-normal text-muted-foreground">
                                    {t("Se corrige: {unit}", { unit: row.unit })}
                                  </span>
                                ) : null}
                              </span>
                            </p>
                            <p className="mt-1 pl-5 text-sm">
                              <span className="text-xs text-muted-foreground">
                                {t("Escribió:")}{" "}
                              </span>
                              {row.mine}
                              {row.found && row.found !== row.mine ? (
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  {t("(encontrado: «{found}»)", { found: row.found })}
                                </span>
                              ) : null}
                            </p>
                            {!row.ok ? (
                              <p className="pl-5 text-xs text-emerald-700 dark:text-emerald-300">
                                {t("Esperado: {answer}", { answer: row.expected })}
                              </p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </TabsContent>
                  );
                },
              )}
            </Tabs>
          )}

          {openReviewAttempt && (
            <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-xs">
              <p>
                {t("Total: {n}/{total}", { n: openReviewAttempt.scoreCorrect, total: openReviewAttempt.scoreTotal })}
              </p>
              <p>{t("Umbral: {n}", { n: openReviewAttempt.scoreThreshold })}</p>
              <p>
                {t("Resultado:")}{" "}
                {openReviewAttempt.passed ? t("Superado") : t("No superado")}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenReviewFocusId(null)}
            >
              {t("Cerrar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
