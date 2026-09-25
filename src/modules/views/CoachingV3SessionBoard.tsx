import {
  type ReactNode,
  useCallback,
  useEffect,
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

type CoachingV3SessionBoardProps = {
  sessionId: string;
  mode: "coach" | "student";
  targetLang: string;
  userId?: string;
  coachDisplayName?: string | null;
  fetchAsStudent?: boolean;
  onSelectedPeriodChange?: (period: number) => void;
  coachExtraContent?: ReactNode;
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
  return date.toLocaleString("es-ES", {
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
}: CoachingV3SessionBoardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<CoachingV2SessionBoard | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(1);
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
      }
    >
  >({});
  const [savingClassKey, setSavingClassKey] = useState<string | null>(null);
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
          err instanceof Error ? err.message : "No se pudo cargar el tablero.",
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
        done: Boolean(row.prompt.trim()),
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
  const canAddFocus = activeFocuses.length < 3;
  const titleRecorrido =
    mode === "coach" ? "Recorrido del alumno" : "Tu recorrido";
  const titleClases = mode === "coach" ? "Clases del alumno" : "Tus clases";
  const classesSubtitle =
    mode === "coach"
      ? "Grabaciones, tareas y seguimiento del alumno por semana."
      : "Las grabaciones se quedan contigo para siempre.";
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
    "Eve";
  const isSecondaryCoachPrimary =
    secondaryCoachDisplayName.trim().toLowerCase() === "luis";
  const coachLineLabel = isSecondaryCoachPrimary
    ? "Luis"
    : `Luis y ${secondaryCoachDisplayName}`;
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
    .map((task) => task.title.toLowerCase());
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
      toast.error("La semana está cerrada. Ya no se puede editar.");
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
      toast.success("Reporte del periodo guardado.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar el reporte.",
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
      toast.error("La semana está cerrada. Ya no se puede editar.");
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
      if (!saved) throw new Error("No se pudo guardar el foco.");
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
          ? "Foco guardado. Preparando el ejercicio de Entrenado (≈1 min)..."
          : "Foco guardado.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar el foco.",
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
      toast.success("Foco eliminado.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo eliminar el foco.",
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
    },
    classRow: CoachingV2ClassSlot | null,
  ) => {
    if (isSelectedPeriodClosed) {
      toast.error("La semana está cerrada. Ya no se puede editar.");
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
                  .concat(updatedClass)
                  .sort(
                    (a, b) =>
                      a.periodNumber - b.periodNumber ||
                      a.classIndex - b.classIndex,
                  ),
              }
            : prev,
        );
      }
      toast.success(`Clase ${classIndex} actualizada.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar la clase.",
      );
    } finally {
      setSavingClassKey(null);
    }
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
      toast.error("La semana está cerrada. Ya no se puede editar.");
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
                  .concat(updatedClass)
                  .sort(
                    (a, b) =>
                      a.periodNumber - b.periodNumber ||
                      a.classIndex - b.classIndex,
                  ),
              }
            : prev,
        );
      }
      toast.success(`Tarea ${responseIndex} guardada.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo guardar la tarea.",
      );
    } finally {
      setSavingClassKey(null);
    }
  };

  const handleActivateNextWeek = async () => {
    setSavingPeriodAction(true);
    try {
      await activateCoachingV2Period({ sessionId });
      toast.success("Semana activada correctamente.");
      await loadBoard(undefined, { silent: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo activar la semana.",
      );
    } finally {
      setSavingPeriodAction(false);
    }
  };

  const handleCloseCurrentWeek = async () => {
    setSavingPeriodAction(true);
    try {
      await closeCoachingV2Period({ sessionId });
      toast.success("Semana cerrada correctamente.");
      await loadBoard(undefined, { silent: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo cerrar la semana.",
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
      toast.error("La semana está cerrada. Ya no se puede editar.");
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
        err instanceof Error ? err.message : "No se pudo actualizar foco.",
      );
    }
  };

  const handleRegenerateTraining = async (focus: CoachingV2Focus) => {
    if (isSelectedPeriodClosed) {
      toast.error("La semana está cerrada. Ya no se puede editar.");
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

      toast.success("Generando el ejercicio (≈1 min)...");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudo regenerar el entrenamiento.",
      );
    } finally {
      setRegeneratingFocusId(null);
    }
  };

  const handleSaveExternalTrainingUrl = async (focus: CoachingV2Focus) => {
    if (isSelectedPeriodClosed) {
      toast.error("La semana está cerrada. Ya no se puede editar.");
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
          ? "Link externo guardado."
          : "Link externo eliminado.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el link externo.",
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
        label: `La semana ${board.periodState.nextPeriodEligible} está sin activar`,
        action: "Activar",
        onClick: () => void handleActivateNextWeek(),
      });
    }
    const freeSlots = Math.max(0, 3 - activeFocuses.length);
    if (freeSlots > 0) {
      coachTodos.push({
        key: "add-focus",
        label:
          freeSlots === 3
            ? "Esta semana no tiene focos"
            : `Tienes ${freeSlots} hueco${freeSlots === 1 ? "" : "s"} de foco libre${freeSlots === 1 ? "" : "s"}`,
        action: "Añadir foco",
        onClick: openCreateFocus,
      });
    }
    for (const focus of activeFocuses) {
      const state = getTrainingState(exerciseByFocusId.get(focus.id));
      if (state === "error" || state === "stuck" || state === "missing") {
        coachTodos.push({
          key: `exercise-${focus.id}`,
          label: `El ejercicio de «${focus.focusTitle}» no está listo`,
          action: "Ver",
          tone: "warn",
          onClick: () => scrollToRef(focusSectionRef),
        });
      } else if (!focus.phaseExplained) {
        coachTodos.push({
          key: `explain-${focus.id}`,
          label: `¿Ya explicaste «${focus.focusTitle}»? Márcalo como Explicado`,
          action: "Ir",
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
          label: `La clase ${slot} no tiene fecha`,
          action: "Poner fecha",
          onClick: openClass,
        });
      } else if (
        !classRow.loomUrl &&
        new Date(classRow.scheduledAt).getTime() < Date.now()
      ) {
        coachTodos.push({
          key: `loom-${slot}`,
          label: `Falta la grabación de la clase ${slot}`,
          action: "Subir",
          onClick: openClass,
        });
      }
    }
    if (reportStatus === "preparing") {
      coachTodos.push({
        key: "report",
        label: "El alumno ha hecho las 6 tareas: falta su reporte",
        action: "Subir reporte",
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
      <p className="text-sm text-muted-foreground">Cargando coaching...</p>
    );
  }

  if (!board) {
    return (
      <p className="text-sm text-muted-foreground">Sin datos de coaching.</p>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl [--v3-bg:oklch(0.98_0.01_220)] [--v3-card:oklch(1_0_0)] [--v3-line:oklch(0.9_0.02_220)] [--v3-text:oklch(0.24_0.03_230)] [--v3-muted:oklch(0.51_0.03_230)] [--v3-cyan:oklch(0.76_0.13_210)] [--v3-gold:oklch(0.79_0.11_78)] dark:[--v3-bg:oklch(0.2_0.04_230)] dark:[--v3-card:oklch(0.25_0.04_230)] dark:[--v3-line:oklch(0.36_0.04_230)] dark:[--v3-text:oklch(0.94_0.01_230)] dark:[--v3-muted:oklch(0.73_0.03_230)]">
      <div
        className="rounded-3xl border p-6 shadow-sm md:p-8"
        style={{
          background:
            "radial-gradient(130% 90% at 80% -15%, color-mix(in oklab, var(--v3-cyan) 8%, transparent 92%), transparent), var(--v3-bg)",
          borderColor: "var(--v3-line)",
          color: "var(--v3-text)",
        }}
      >
        <header
          className="flex flex-wrap items-end justify-between gap-5 border-b pb-5"
          style={{ borderColor: "var(--v3-line)" }}
        >
          <div>
            <p className="text-xs" style={{ color: "var(--v3-muted)" }}>
              Coaching ICA
            </p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight md:text-5xl">
              {board.session.targetLang || targetLang}
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <Badge className="rounded-full" variant="outline">
                {board.session.level}
              </Badge>
              <span className="text-sm" style={{ color: "var(--v3-muted)" }}>
                Semana {selectedPeriod} de {durationPeriods}
              </span>
            </div>
          </div>
          <div className="text-sm" style={{ color: "var(--v3-muted)" }}>
            <div className="flex items-center gap-2">
              <span className="inline-flex size-6 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/20 text-xs font-semibold text-cyan-300">
                L
              </span>
              {!isSecondaryCoachPrimary ? (
                <span className="inline-flex size-6 items-center justify-center rounded-full border border-amber-500/35 bg-amber-500/15 text-xs font-semibold text-amber-300">
                  {secondaryCoachDisplayName.slice(0, 1).toUpperCase()}
                </span>
              ) : null}
              <p>{coachLineLabel}</p>
            </div>
            <div className="mt-2 text-end">
              {hasClassLink ? (
                <a
                  href={classJoinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${classLinkState === "live" ? "animate-pulse" : ""}`}
                  style={{
                    borderColor:
                      classLinkState === "live"
                        ? "color-mix(in oklab, #ef4444 48%, var(--v3-line) 52%)"
                        : "color-mix(in oklab, var(--v3-cyan) 35%, var(--v3-line) 65%)",
                    background:
                      classLinkState === "live"
                        ? "color-mix(in oklab, #ef4444 12%, transparent 88%)"
                        : "color-mix(in oklab, var(--v3-cyan) 8%, transparent 92%)",
                    color: "var(--v3-text)",
                  }}
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{
                      background:
                        classLinkState === "live"
                          ? "#ef4444"
                          : "var(--v3-cyan)",
                    }}
                  />
                  {classLinkState === "live"
                    ? "Clase en vivo ahora"
                    : "Link a tu clase"}
                </a>
              ) : (
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium opacity-80"
                  style={{
                    borderColor:
                      "color-mix(in oklab, var(--v3-muted) 30%, var(--v3-line) 70%)",
                    background:
                      "color-mix(in oklab, var(--v3-line) 55%, transparent 45%)",
                    color: "var(--v3-muted)",
                  }}
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{
                      background:
                        "color-mix(in oklab, var(--v3-muted) 70%, transparent 30%)",
                    }}
                  />
                  Sin link para tu clase
                </span>
              )}
            </div>
          </div>
        </header>

        {mode === "coach" && !isSelectedPeriodClosed ? (
          <section
            className="mt-5 rounded-2xl border p-4"
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
                Te toca · semana {selectedPeriod}
              </p>
            </div>
            {coachTodos.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--v3-muted)" }}>
                Todo al día. ✓
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

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">{titleRecorrido}</p>
            <span className="text-xs" style={{ color: "var(--v3-muted)" }}>
              Quedan {Math.max(0, durationPeriods - selectedPeriod)} semanas
            </span>
          </div>
          <div
            className="grid gap-1.5 pb-1"
            style={{
              gridTemplateColumns: `repeat(${durationPeriods}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: durationPeriods }, (_, idx) => {
              const period = idx + 1;
              const isSelected = period === selectedPeriod;
              const activation = periodActivationByNumber.get(period);
              const isActivated = Boolean(activation);
              const isClosed = Boolean(activation?.endedAt);
              const isActive = currentActivePeriod === period;
              return (
                <button
                  key={`period-${period}`}
                  type="button"
                  className={`rounded-md px-1 pb-2 pt-1 text-center transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${isSelected ? `ring-1 ${isClosed ? "ring-amber-400/60" : "ring-cyan-400/60"} ring-offset-1 ring-offset-transparent` : ""}`}
                  onClick={() => {
                    if (!activatedPeriods.has(period)) return;
                    void loadBoard(period);
                  }}
                  disabled={!activatedPeriods.has(period)}
                  title={`Semana ${period}`}
                >
                  <span
                    className="block h-2 rounded-full"
                    style={{
                      background: !isActivated
                        ? "color-mix(in oklab, var(--v3-line) 65%, transparent 35%)"
                        : isActive
                          ? "var(--v3-cyan)"
                          : isClosed
                            ? "var(--v3-gold)"
                            : "color-mix(in oklab, var(--v3-cyan) 75%, var(--v3-line) 25%)",
                    }}
                  />
                  <span
                    className="mt-1 block text-[11px]"
                    style={{
                      color: !isActivated
                        ? "color-mix(in oklab, var(--v3-muted) 55%, transparent 45%)"
                        : isSelected
                          ? "var(--v3-text)"
                          : "var(--v3-muted)",
                    }}
                  >
                    {period}
                  </span>
                </button>
              );
            })}
          </div>

          {isSelectedPeriodClosed ? (
            <p className="mt-3 text-xs" style={{ color: "var(--v3-gold)" }}>
              Semana cerrada: solo lectura para alumno y coach.
            </p>
          ) : null}

          {mode === "coach" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleActivateNextWeek()}
                disabled={
                  savingPeriodAction || !board.periodState.nextPeriodEligible
                }
              >
                {savingPeriodAction
                  ? "Activando..."
                  : "Activar siguiente semana"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleCloseCurrentWeek()}
                disabled={
                  savingPeriodAction || !board.periodState.currentActivePeriod
                }
              >
                {savingPeriodAction ? "Cerrando..." : "Cerrar semana activa"}
              </Button>
            </div>
          )}
        </section>

        <section ref={focusSectionRef} className="mt-10 scroll-mt-4">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              Los tres focos
            </h2>
            <p className="text-xs" style={{ color: "var(--v3-muted)" }}>
              Un foco nuevo se abre cuando uno llega a dominado.
            </p>
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
                        "color-mix(in oklab, var(--v3-card) 88%, black 12%)",
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
                      Hueco libre
                    </p>
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      {mode === "coach"
                        ? "Escribe un foco gramatical y la IA prepara sola su ejercicio de Entrenado."
                        : "Se abre un foco nuevo cuando uno de los otros llegue a dominado."}
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
                        <CirclePlusIcon className="size-4" /> Añadir foco
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
              const trainButtonLabel = focusAttempt ? "Reintentar" : "Entrenar";
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
                  nextPhaseIdx >= 0 ? PHASE_LABELS[nextPhaseIdx] : null;
                const nextPhaseHint =
                  nextPhaseIdx === 0
                    ? "Cuando se lo expliques en clase, marca «Explicado»: así se le abre el ejercicio."
                    : nextPhaseIdx === 1
                      ? "Se marca solo cuando el alumno supera el ejercicio (75 % de aciertos). También puedes marcarlo tú."
                      : nextPhaseIdx === 2
                        ? "Marca «Entendido» cuando el alumno te lo explique a ti."
                        : nextPhaseIdx === 3
                          ? "Marca «Dominado» cuando le salga solo en clase."
                          : "Foco dominado. Deja el hueco libre para uno nuevo.";
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
                        Foco {idx + 1} · desde semana {focus.periodNumber}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">
                          {progress}/4
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-7 rounded-full"
                          title="Nota del foco"
                          onClick={() => setOpenFocusComment(focus.id)}
                        >
                          <MessageCircleIcon className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-7 rounded-full"
                          title="Editar foco"
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
                        const clickable =
                          canEditSelectedPeriod &&
                          canTogglePhase(focus, phaseKey);
                        const isNext = phaseIdx === nextPhaseIdx;
                        return (
                          <button
                            key={`${focus.id}-${phaseKey}`}
                            type="button"
                            disabled={!clickable}
                            onClick={() =>
                              void handleToggleFocus(focus, phaseKey)
                            }
                            title={
                              done
                                ? clickable
                                  ? `Desmarcar ${PHASE_LABELS[phaseIdx]}`
                                  : PHASE_LABELS[phaseIdx]
                                : clickable
                                  ? `Marcar ${PHASE_LABELS[phaseIdx]}`
                                  : "Primero marca la fase anterior"
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
                            {PHASE_LABELS[phaseIdx]}
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
                          Siguiente: {nextPhaseLabel}.{" "}
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
                            ? "Ejercicio listo"
                            : trainingState === "generating"
                              ? "Preparando el ejercicio…"
                              : trainingState === "stuck"
                                ? "El ejercicio se ha quedado atascado"
                                : trainingState === "error"
                                  ? "No se pudo generar el ejercicio"
                                  : "Sin ejercicio todavía"}
                        </span>
                      </div>
                      <p
                        className="mt-1 text-xs leading-relaxed"
                        style={{ color: "var(--v3-muted)" }}
                      >
                        {trainingState === "ready"
                          ? focus.phaseExplained
                            ? "El alumno ya lo tiene en Entrenado."
                            : "Se le abrirá al alumno cuando marques «Explicado»."
                          : trainingState === "generating"
                            ? "La IA lo está creando con tu plantilla (≈1 min). Puedes seguir trabajando."
                            : "Vuelve a generarlo: no tienes que hacer nada más."}
                      </p>
                      {focusAttempt ? (
                        <p className="mt-1 text-xs">
                          {(attemptCountByFocusId.get(focus.id) || 1) > 1
                            ? `Último de ${attemptCountByFocusId.get(focus.id)} intentos: `
                            : "Entregado: "}
                          <b>
                            {focusAttempt.scoreCorrect}/{focusAttempt.scoreTotal}
                          </b>{" "}
                          ·{" "}
                          {focusAttempt.passed ? "superado" : "no superado"}
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
                            <EyeIcon className="size-3.5" /> Ver ejercicio
                          </Button>
                        ) : null}
                        {focusAttempt ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setOpenReviewFocusId(focus.id)}
                          >
                            <ListChecksIcon className="size-3.5" /> Ver
                            respuestas
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
                              ? "Rehacer"
                              : trainingState === "missing"
                                ? "Generar"
                                : "Reintentar"}
                          </Button>
                        ) : null}
                      </div>
                      {trainingState === "error" && focusExercise?.error ? (
                        <details className="mt-2 text-[11px]" style={{ color: "var(--v3-muted)" }}>
                          <summary className="cursor-pointer">Detalle técnico</summary>
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
                        ? "Link externo guardado"
                        : "Añadir link externo (opcional)"}
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
                          placeholder="https://… (se usa si no hay ejercicio)"
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
                            : "Guardar"}
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
                      Abierto en semana {focus.periodNumber}
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
                            {phaseLabel}
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
                      {selectedPhaseInfo.label}.
                    </b>{" "}
                    {selectedPhaseInfo.description}
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
                            ? "Tu entrenamiento se está preparando."
                            : "Tu entrenamiento aún no está disponible. Tu coach lo está preparando."}
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
                Ya dominados:
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
                        title={`Ver el entrenamiento de «${focus.focusTitle}»`}
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
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              Tareas semanales
            </h2>
            <p className="text-xs" style={{ color: "var(--v3-muted)" }}>
              Seis tareas entre las dos clases. Al completarlas se abre tu
              reporte.
            </p>
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
                <p className="text-sm font-medium">Semana {selectedPeriod}</p>
                <p className="text-xs" style={{ color: "var(--v3-muted)" }}>
                  Tres tareas por clase. Una sola cuenta.
                </p>
              </div>
              <p className="text-sm">
                <b className="text-4xl font-bold leading-none">
                  {completedTasks}
                </b>{" "}
                de 6 tareas
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
                        Clase {idx < 3 ? 1 : 2}
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
                  <span style={{ color: "var(--v3-muted)" }}>Reporte</span>
                </div>
              </div>
            </div>

            <div
              className="mt-5 border-t pt-4"
              style={{ borderColor: "var(--v3-line)" }}
            >
              <p className="text-sm" style={{ color: "var(--v3-muted)" }}>
                <LockIcon className="mr-2 inline size-4 align-text-bottom" />
                Siguiente:{" "}
                <b style={{ color: "var(--v3-text)" }}>
                  {nextPendingTask?.title || "Todas las tareas completas"}
                </b>
                {nextPendingTask
                  ? `, de la clase ${nextPendingTask.classIndex}.`
                  : "."}
              </p>
            </div>
          </Card>
        </section>

        <section ref={classesSectionRef} className="mt-10 scroll-mt-4">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              {titleClases}
            </h2>
            <p className="text-xs" style={{ color: "var(--v3-muted)" }}>
              {classesSubtitle}
            </p>
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
                      <h3 className="text-lg font-semibold">Clase {slot}</h3>
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
                        title={`Clase ${slot} semana ${selectedPeriod}`}
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
                        ? "Abrir grabacion en Loom"
                        : "Grabacion pendiente"}
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
                                      ? task.title
                                      : "Pendiente de asignar"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {isAssigned
                                      ? isDone
                                        ? "Hecha"
                                        : "Por completar"
                                      : "Pendiente de asignar por tu coach"}
                                  </p>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              {isAssigned ? (
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
                                    placeholder="Escribe tu respuesta..."
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
                                        ? "Guardando..."
                                        : "Guardar"}
                                    </Button>
                                    {task.done ? (
                                      <span className="text-xs text-cyan-300">
                                        Hecha
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
                            <span className="text-amber-600 dark:text-amber-400">Sin fecha</span>
                          )}
                        </p>
                        <p className="flex items-center gap-2">
                          <UserIcon className="size-4 shrink-0" style={{ color: "var(--v3-muted)" }} />
                          {classCoachName || (
                            <span style={{ color: "var(--v3-muted)" }}>Sin coach asignado</span>
                          )}
                          {classRoleLabel ? (
                            <span style={{ color: "var(--v3-muted)" }}>· {classRoleLabel}</span>
                          ) : null}
                        </p>
                        <p className="flex items-center gap-2">
                          <VideoIcon className="size-4 shrink-0" style={{ color: "var(--v3-muted)" }} />
                          {classRow?.loomUrl ? (
                            "Grabación subida"
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">Grabación pendiente</span>
                          )}
                        </p>
                        <p className="flex items-center gap-2">
                          <ListChecksIcon className="size-4 shrink-0" style={{ color: "var(--v3-muted)" }} />
                          Tareas respondidas: {classTasks.filter((task) => task.done).length}/3
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
                        {classEditOpen ? "Cerrar edición" : "Editar fecha, coach y grabación"}
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
                        placeholder="Tipo de clase (ej: Sesión de control)"
                        disabled={!canEditSelectedPeriod}
                      />
                      <select
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
                        <option value="">Sin coach asignado</option>
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
                      </select>
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
                        placeholder="Link Loom de la clase"
                        disabled={!canEditSelectedPeriod}
                      />
                      </div>
                      ) : null}
                      <p className="pt-1 text-xs font-medium" style={{ color: "var(--v3-muted)" }}>
                        Tareas de esta clase (el alumno las responde en su tablero)
                      </p>
                      <Accordion type="single" collapsible>
                        {[
                          {
                            absoluteIndex: slot === 1 ? 1 : 4,
                            guidelineKey: "coachGuideline1" as const,
                            responseValue: draft.response1,
                          },
                          {
                            absoluteIndex: slot === 1 ? 2 : 5,
                            guidelineKey: "coachGuideline2" as const,
                            responseValue: draft.response2,
                          },
                          {
                            absoluteIndex: slot === 1 ? 3 : 6,
                            guidelineKey: "coachGuideline3" as const,
                            responseValue: draft.response3,
                          },
                        ].map((item) => {
                          const isAnswered = Boolean(
                            item.responseValue?.trim(),
                          );
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
                                    Tarea {item.absoluteIndex}
                                  </span>
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
                                  placeholder={`Pregunta de tarea ${item.absoluteIndex}`}
                                  disabled={
                                    isAnswered || !canEditSelectedPeriod
                                  }
                                />
                                {isAnswered ? (
                                  <div
                                    className="rounded-md border p-2 text-xs"
                                    style={{ borderColor: "var(--v3-line)" }}
                                  >
                                    <p className="font-medium text-foreground">
                                      Respuesta del alumno
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                      {item.responseValue}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    Sin respuesta del alumno.
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
                          ? "Guardando..."
                          : `Guardar clase ${slot}`}
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
                      Tu reporte se abre con las seis tareas
                    </h3>
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      Te faltan {pendingTaskLabels.length}:{" "}
                      {pendingTaskLabels.length > 0
                        ? `${pendingTaskLabels.join(", ")}.`
                        : "ninguna tarea."}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">
                      Reporte de la semana {selectedPeriod}
                    </h3>
                    <Badge variant="outline" className="rounded-full">
                      {reportStatus === "available"
                        ? "Disponible"
                        : "En preparación"}
                    </Badge>
                  </div>

                  {reportStatus === "preparing" && (
                    <p
                      className="mt-2 text-sm"
                      style={{ color: "var(--v3-muted)" }}
                    >
                      {mode === "coach"
                        ? "Semana completa. El reporte de la semana aún está en preparación."
                        : "Aún no está disponible. Tu profe lo subirá pronto."}
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
                              alt={`Imagen del reporte de la semana ${selectedPeriod}`}
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
                            Descargar imagen
                          </a>
                        </>
                      ) : (
                        <p
                          className="text-sm"
                          style={{ color: "var(--v3-muted)" }}
                        >
                          Aún no hay imagen de reporte para esta semana.
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
                    Editar reporte de la semana
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
                            ? "Cambiar fichero"
                            : "Subir fichero"}
                        </label>
                      </Button>
                      <span className="max-w-[240px] truncate text-xs text-muted-foreground">
                        {reportDraftImageFile
                          ? reportDraftImageFile.name
                          : board.periodReport?.reportImageUrl &&
                              !removeReportImage
                            ? "Imagen actual cargada"
                            : "Sin fichero"}
                      </span>
                    </div>
                    {reportDraftImageFile && (
                      <p className="text-xs text-muted-foreground">
                        Nueva imagen: {reportDraftImageFile.name}
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
                            Ver imagen actual
                          </a>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setRemoveReportImage(true)}
                            disabled={!canEditSelectedPeriod}
                          >
                            Quitar imagen
                          </Button>
                        </div>
                      )}
                    {removeReportImage && (
                      <p className="text-xs text-muted-foreground">
                        La imagen se eliminará al guardar.
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
                      {savingReport ? "Guardando..." : "Guardar reporte"}
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
            <DialogTitle>Comentario del foco</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedFocuses.find((focus) => focus.id === openFocusComment)
              ?.focusComment || "Sin comentario para este foco."}
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
              {editingFocusId ? "Editar foco" : `Nuevo foco · semana ${selectedPeriod}`}
            </DialogTitle>
            <DialogDescription>
              {editingFocusId
                ? "Si cambias el foco, la IA vuelve a preparar su ejercicio."
                : "Escribe el punto gramatical que habéis trabajado. La IA prepara sola el ejercicio de Entrenado (≈1 min) y el alumno lo verá cuando marques «Explicado»."}
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
                Foco gramatical
              </label>
              <Input
                id="focus-title"
                autoFocus
                value={focusDraftTitle}
                onChange={(event) => setFocusDraftTitle(event.target.value)}
                placeholder="Ej.: Can · Could · Should · Would"
                disabled={!canEditSelectedPeriod}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="focus-comment">
                Nota para el alumno{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </label>
              <Textarea
                id="focus-comment"
                value={focusDraftComment}
                onChange={(event) => setFocusDraftComment(event.target.value)}
                rows={3}
                placeholder="Ej.: Se te escapa el «to» detrás de can. La IA también usa esta nota para afinar el ejercicio."
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
                  {deletingFocus ? "Eliminando..." : "Eliminar foco"}
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
                  ? "Guardando..."
                  : editingFocusId
                    ? "Guardar cambios"
                    : "Crear foco y preparar ejercicio"}
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
            <DialogTitle>¿Rehacer el ejercicio?</DialogTitle>
            <DialogDescription>
              La IA prepara uno nuevo para este foco (≈1 min). El actual se
              sustituye; los intentos del alumno se conservan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRegenerateFocusId(null)}
            >
              Cancelar
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
              <RefreshCwIcon className="size-4" /> Rehacer
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
              Vista previa ·{" "}
              {board.focuses.find((row) => row.id === previewFocusId)
                ?.focusTitle || "Ejercicio"}
            </DialogTitle>
            <DialogDescription>
              Así lo verá el alumno. Puedes probarlo: lo que respondas aquí no
              se guarda.
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
                Este ejercicio no tiene el formato esperado. Pulsa «Rehacer».
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
            <DialogTitle>Imagen del reporte</DialogTitle>
          </DialogHeader>
          {reportImagePreviewUrl ? (
            <img
              src={reportImagePreviewUrl}
              alt={`Imagen ampliada del reporte de la semana ${selectedPeriod}`}
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
              Respuestas del alumno
              {openReviewFocusId
                ? ` · ${board.focuses.find((row) => row.id === openReviewFocusId)?.focusTitle || ""}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              {openReviewAttempt
                ? `${openReviewAttempt.passed ? "Superado" : "No superado"} · ${openReviewAttempt.scoreCorrect}/${openReviewAttempt.scoreTotal}`
                : "Sin intento seleccionado."}
            </DialogDescription>
          </DialogHeader>

          {openReviewAttempt && (
            <Tabs defaultValue="reconocer" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="reconocer">Reconocer</TabsTrigger>
                <TabsTrigger value="construir">Construir</TabsTrigger>
                <TabsTrigger value="conversacion">Conversación</TabsTrigger>
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
                    const t = normalize(title);
                    if (reviewExercise) {
                      if (t === normalize(reviewExercise.construir.titulo)) return "construir";
                      if (t === normalize(reviewExercise.conversacion.titulo)) return "conversacion";
                      if (t === normalize(reviewExercise.reconocer.titulo)) return "reconocer";
                    }
                    if (t.includes("constru")) return "construir";
                    if (t.includes("conversa") || t.includes("dialog")) return "conversacion";
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
                            question: String(row.question || "Pregunta"),
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
                          Este intento se hizo antes de guardar todas las
                          respuestas: aquí solo salen los fallos.
                        </p>
                      ) : null}
                      {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Sin fallos en esta sección.
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
                                    Se corrige: {row.unit}
                                  </span>
                                ) : null}
                              </span>
                            </p>
                            <p className="mt-1 pl-5 text-sm">
                              <span className="text-xs text-muted-foreground">
                                Escribió:{" "}
                              </span>
                              {row.mine}
                              {row.found && row.found !== row.mine ? (
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  (encontrado: «{row.found}»)
                                </span>
                              ) : null}
                            </p>
                            {!row.ok ? (
                              <p className="pl-5 text-xs text-emerald-700 dark:text-emerald-300">
                                Esperado: {row.expected}
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
                Total: {openReviewAttempt.scoreCorrect}/
                {openReviewAttempt.scoreTotal}
              </p>
              <p>Umbral: {openReviewAttempt.scoreThreshold}</p>
              <p>
                Resultado:{" "}
                {openReviewAttempt.passed ? "Superado" : "No superado"}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenReviewFocusId(null)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
