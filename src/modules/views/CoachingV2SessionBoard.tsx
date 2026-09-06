import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpenIcon,
  CopyIcon,
  LanguagesIcon,
  PlayCircleIcon,
  UploadIcon,
  UserIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  activateCoachingV2Period,
  closeCoachingV2Period,
  fetchCoachingV2SessionBoard,
  submitCoachingV2StudentClassReport,
  toggleCoachingV2FocusPhase,
  upsertCoachingV2ClassCoachGuidelines,
  upsertCoachingV2Focus,
  uploadCoachingClassReportImage,
  deleteCoachingClassReportImage,
  type CoachingV2ClassSlot,
  type CoachingV2Focus,
  type CoachingV2SessionBoard,
} from "../services/coaching";
import {
  areCoachGuidelinesComplete,
  getVisibleFocusColumns,
} from "./coachingV2Matrix";
import {
  toDateAndTimeFromIso,
  toIsoFromDateAndTime,
} from "./coachingClassResources";

type CoachingV2SessionBoardProps = {
  sessionId: string;
  mode: "coach" | "student";
  targetLang: string;
  userId: string;
  coachDisplayName?: string | null;
};

type ClassDraft = {
  title: string;
  scheduledDate: string;
  scheduledTime: string;
  loomUrl: string;
  report: string;
  reportImageFile: File | null;
  removeReportImage: boolean;
  coachGuideline1: string;
  coachGuideline2: string;
  coachGuideline3: string;
  guidelineResponse1: string;
  guidelineResponse2: string;
  guidelineResponse3: string;
};

const PHASES: Array<{ key: keyof CoachingV2Focus; label: string }> = [
  { key: "phaseExplained", label: "Explicado" },
  { key: "phaseTrained", label: "Entrenado" },
  { key: "phaseUnderstoodExplained", label: "Entendido/Explicado" },
  { key: "phaseUsed", label: "Usado" },
];

function isFocusCompleted(focus: CoachingV2Focus): boolean {
  return (
    focus.phaseExplained &&
    focus.phaseTrained &&
    focus.phaseUnderstoodExplained &&
    focus.phaseUsed
  );
}

function getEmbeddableVideoUrl(value: string | null): string | null {
  if (!value) return null;
  if (/loom\.com/i.test(value)) {
    return value.replace("/share/", "/embed/").replace("/shared/", "/embed/");
  }
  return null;
}

function statusLabel(
  status: CoachingV2SessionBoard["session"]["status"],
): string {
  if (status === "active") return "Activo";
  if (status === "completed") return "Completado";
  if (status === "cancelled") return "Archivado";
  return "Borrador";
}

function statusVariant(
  status: CoachingV2SessionBoard["session"]["status"],
): "default" | "secondary" | "outline" {
  if (status === "active") return "default";
  if (status === "completed") return "secondary";
  return "outline";
}

export function CoachingV2SessionBoard({
  sessionId,
  mode,
  targetLang,
  userId,
  coachDisplayName,
}: CoachingV2SessionBoardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<CoachingV2SessionBoard | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
  const [openPeriodValue, setOpenPeriodValue] = useState<string>("1");
  const [newFocusTitle, setNewFocusTitle] = useState("");
  const [newFocusComment, setNewFocusComment] = useState("");
  const [showAllFocuses, setShowAllFocuses] = useState(false);
  const [classDrafts, setClassDrafts] = useState<Record<string, ClassDraft>>(
    {},
  );
  const [copiedSessionLink, setCopiedSessionLink] = useState(false);

  const handleCopySessionClassLink = async () => {
    const link = board?.session.classJoinUrl || "";
    if (!link || !navigator?.clipboard) return;
    await navigator.clipboard.writeText(link);
    setCopiedSessionLink(true);
    setTimeout(() => setCopiedSessionLink(false), 1500);
  };

  const loadBoard = async (
    period?: number,
    options?: { silent?: boolean; keepOpenValue?: boolean },
  ) => {
    const silent = Boolean(options?.silent);
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchCoachingV2SessionBoard({
        sessionId,
        ...(typeof period === "number" ? { periodNumber: period } : {}),
      });
      setBoard(data);
      setSelectedPeriod(data.periodNumber);
      if (!options?.keepOpenValue) {
        const isSelectedPeriodActivated = data.periodActivations.some(
          (row) => row.periodNumber === data.periodNumber,
        );
        setOpenPeriodValue(
          isSelectedPeriodActivated ? String(data.periodNumber) : "",
        );
      }
      if (!silent) {
        setShowAllFocuses(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el tablero.",
      );
      toast.error(
        err instanceof Error ? err.message : "No se pudo cargar el programa.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadBoard();
  }, [sessionId]);

  useEffect(() => {
    const nextDrafts: Record<string, ClassDraft> = {};
    for (const classSlot of board?.classes || []) {
      const key = `${classSlot.periodNumber}-${classSlot.classIndex}`;
      const scheduled = toDateAndTimeFromIso(classSlot.scheduledAt);
      nextDrafts[key] = {
        title: classSlot.title || `Clase ${classSlot.classIndex}`,
        scheduledDate: scheduled.date,
        scheduledTime: scheduled.time,
        loomUrl: classSlot.loomUrl || "",
        report: classSlot.report || "",
        reportImageFile: null,
        removeReportImage: false,
        coachGuideline1: classSlot.coachGuideline1 || "",
        coachGuideline2: classSlot.coachGuideline2 || "",
        coachGuideline3: classSlot.coachGuideline3 || "",
        guidelineResponse1: classSlot.studentGuidelineResponse1 || "",
        guidelineResponse2: classSlot.studentGuidelineResponse2 || "",
        guidelineResponse3: classSlot.studentGuidelineResponse3 || "",
      };
    }
    setClassDrafts(nextDrafts);
  }, [board?.classes]);

  const upsertClassInState = (updatedClass: CoachingV2ClassSlot | null) => {
    if (!updatedClass) return;
    setBoard((prev) => {
      if (!prev) return prev;
      const current = prev.classes.find(
        (row) =>
          row.periodNumber === updatedClass.periodNumber &&
          row.classIndex === updatedClass.classIndex,
      );
      const merged = {
        ...current,
        ...updatedClass,
      };
      const rest = prev.classes.filter(
        (row) =>
          !(
            row.periodNumber === updatedClass.periodNumber &&
            row.classIndex === updatedClass.classIndex
          ),
      );
      return {
        ...prev,
        classes: [...rest, merged].sort((a, b) => a.classIndex - b.classIndex),
      };
    });
  };

  const handleTogglePhase = async (
    focusId: string,
    phase:
      | "phaseExplained"
      | "phaseTrained"
      | "phaseUnderstoodExplained"
      | "phaseUsed",
    checked: boolean,
  ) => {
    setSaving(true);
    try {
      const updated = await toggleCoachingV2FocusPhase({
        sessionId,
        focusId,
        phase,
        checked,
      });
      if (updated) {
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            focuses: prev.focuses.map((row) =>
              row.id === updated.id ? updated : row,
            ),
          };
        });
      }
      toast.success("Fase actualizada.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo actualizar fase.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFocus = async () => {
    if (!newFocusTitle.trim()) return;
    setSaving(true);
    try {
      const created = await upsertCoachingV2Focus({
        sessionId,
        periodNumber: selectedPeriod,
        focusTitle: newFocusTitle.trim(),
        focusComment: newFocusComment.trim() || null,
      });
      setNewFocusTitle("");
      setNewFocusComment("");
      if (created) {
        setBoard((prev) => {
          if (!prev) return prev;
          return { ...prev, focuses: [...prev.focuses, created] };
        });
      }
      toast.success("Foco creado.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo crear foco.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleClosePeriod = async () => {
    setSaving(true);
    try {
      await closeCoachingV2Period({
        sessionId,
      });
      await loadBoard(selectedPeriod, { silent: true, keepOpenValue: true });
      toast.success("Periodo cerrado correctamente.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo cerrar periodo.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGuidelines = async (
    periodNumber: number,
    classIndex: 1 | 2,
  ) => {
    const key = `${periodNumber}-${classIndex}`;
    const draft = classDrafts[key];
    const classSlot =
      board?.classes.find(
        (item) =>
          item.periodNumber === periodNumber && item.classIndex === classIndex,
      ) || null;
    if (!draft) return;
    setSaving(true);
    try {
      let nextReportImagePath = classSlot?.reportImagePath || null;
      if (draft.reportImageFile) {
        nextReportImagePath = await uploadCoachingClassReportImage({
          file: draft.reportImageFile,
          userId,
          targetLang,
          weekKey: `P${String(periodNumber).padStart(2, "0")}`,
        });
      } else if (draft.removeReportImage) {
        if (classSlot?.reportImagePath) {
          await deleteCoachingClassReportImage(classSlot.reportImagePath);
        }
        nextReportImagePath = null;
      }

      const updatedClass = await upsertCoachingV2ClassCoachGuidelines({
        sessionId,
        periodNumber,
        classIndex,
        title: draft.title.trim() || `Clase ${classIndex}`,
        scheduledAt:
          toIsoFromDateAndTime(draft.scheduledDate, draft.scheduledTime) ||
          null,
        loomUrl: draft.loomUrl.trim() || null,
        report: draft.report.trim() || null,
        reportImagePath: nextReportImagePath,
        coachGuideline1: draft.coachGuideline1.trim() || null,
        coachGuideline2: draft.coachGuideline2.trim() || null,
        coachGuideline3: draft.coachGuideline3.trim() || null,
      });
      upsertClassInState(updatedClass);
      setClassDrafts((prev) => ({
        ...prev,
        [key]: {
          ...draft,
          reportImageFile: null,
          removeReportImage: false,
        },
      }));
      toast.success(`Clase ${classIndex} actualizada.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo guardar tareas.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStudentResponses = async (
    periodNumber: number,
    classIndex: 1 | 2,
    responseIndex?: 1 | 2 | 3,
  ) => {
    const key = `${periodNumber}-${classIndex}`;
    const draft = classDrafts[key];
    if (!draft) return;
    setSaving(true);
    try {
      const updatedClass = await submitCoachingV2StudentClassReport({
        sessionId,
        periodNumber,
        classIndex,
        guidelineResponse1: draft.guidelineResponse1.trim() || null,
        guidelineResponse2: draft.guidelineResponse2.trim() || null,
        guidelineResponse3: draft.guidelineResponse3.trim() || null,
      });
      upsertClassInState(updatedClass);
      const suffix = responseIndex ? ` ${responseIndex}` : "";
      toast.success(`Respuesta${suffix} guardada.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo guardar respuestas.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <p className="text-sm text-muted-foreground">Cargando programa...</p>
    );
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!board)
    return <p className="text-sm text-muted-foreground">Sin datos.</p>;

  const selectedPeriodFocuses = board.focuses.filter(
    (focus) => focus.periodNumber === selectedPeriod,
  );
  const durationPeriods = board.session.durationPeriods || 10;
  const currentProgramPeriod = board.periodState.currentActivePeriod;
  const unlockedPeriods = board.periodActivations.length;
  const unlockedProgressPct = Math.round(
    (unlockedPeriods / durationPeriods) * 100,
  );
  const selectedVisibleFocuses = getVisibleFocusColumns(
    selectedPeriodFocuses,
    showAllFocuses,
  );
  const selectedHiddenFocusColumns =
    selectedPeriodFocuses.length - selectedVisibleFocuses.length;
  const canCreateFocusInSelectedPeriod =
    selectedPeriodFocuses.filter(
      (focus) => !focus.archivedAt && !isFocusCompleted(focus),
    ).length < 3;

  return (
    <div className="grid gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="border-primary/20 bg-linear-to-br from-primary/10 via-background to-muted">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Sesion de coaching</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <PlayCircleIcon className="h-4 w-4 text-primary" />
              <span>Link clase en vivo:</span>
              {board.session.classJoinUrl ? (
                <>
                  <a
                    href={board.session.classJoinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Abrir enlace
                  </a>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => void handleCopySessionClassLink()}
                    aria-label="Copiar link de clase en vivo"
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                  </Button>
                  {copiedSessionLink && (
                    <span className="text-xs">Copiado</span>
                  )}
                </>
              ) : (
                <span>Sin enlace configurado</span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 py-1 md:grid-cols-[1fr_auto] md:items-start">
          <div className="flex h-full flex-col justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(board.session.status)}>
                {statusLabel(board.session.status)}
              </Badge>
              <Badge variant="outline">
                Programa {durationPeriods} periodos
              </Badge>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <p className="inline-flex items-center gap-2 text-muted-foreground">
                <LanguagesIcon className="h-4 w-4 text-primary" />
                Idioma:{" "}
                <span className="font-medium text-foreground">
                  {board.session.targetLang || targetLang}
                </span>
              </p>
              <p className="inline-flex items-center gap-2 text-muted-foreground">
                <BookOpenIcon className="h-4 w-4 text-primary" />
                Nivel:{" "}
                <span className="font-medium text-foreground">
                  {board.session.level}
                </span>
              </p>
              <p className="inline-flex items-center gap-2 text-muted-foreground">
                <UserIcon className="h-4 w-4 text-primary" />
                Coach:{" "}
                <span className="font-medium text-foreground">
                  {coachDisplayName || "Por asignar"}
                </span>
              </p>
            </div>

            {mode === "coach" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || !board.periodState.nextPeriodEligible}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await activateCoachingV2Period({ sessionId });
                      await loadBoard(undefined, { silent: true });
                      toast.success("Periodo activado correctamente.");
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "No se pudo activar el periodo.",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Activar siguiente periodo
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={saving || !board.periodState.currentActivePeriod}
                  onClick={() => void handleClosePeriod()}
                >
                  Cerrar periodo activo
                </Button>
              </div>
            )}
          </div>

          <div className="w-full min-w-52 rounded-lg border bg-card/80 p-3 md:w-64">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Periodo actual
            </p>
            <p className="mb-2 text-2xl font-semibold text-foreground">
              {currentProgramPeriod || "-"}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {durationPeriods}
              </span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${unlockedProgressPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {unlockedPeriods > 0
                ? `${unlockedProgressPct}% del programa completado`
                : "Esperando activación del coach"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Accordion
        type="single"
        collapsible
        value={openPeriodValue}
        onValueChange={(value) => {
          if (!value) {
            setOpenPeriodValue("");
            return;
          }

          const period = Number(value);
          if (!Number.isFinite(period) || period < 1) return;
          const isPeriodActivated = board.periodActivations.some(
            (row) => row.periodNumber === period,
          );
          if (!isPeriodActivated) return;

          setOpenPeriodValue(value);
          setShowAllFocuses(false);

          if (period === selectedPeriod) return;

          setSelectedPeriod(period);
        }}
        className="w-full rounded-xl border bg-card/70"
      >
        {Array.from(
          { length: board.session.durationPeriods || 10 },
          (_, idx) => {
            const period = idx + 1;
            const periodFocuses = board.focuses.filter(
              (focus) => focus.periodNumber === period,
            );
            const visibleFocuses =
              period === selectedPeriod
                ? selectedVisibleFocuses
                : getVisibleFocusColumns(periodFocuses, false);
            const hiddenFocusColumns =
              period === selectedPeriod
                ? selectedHiddenFocusColumns
                : periodFocuses.length - visibleFocuses.length;
            const periodClassesByIndex = new Map<number, CoachingV2ClassSlot>();
            for (const classSlot of board.classes) {
              if (classSlot.periodNumber !== period) continue;
              periodClassesByIndex.set(classSlot.classIndex, classSlot);
            }
            const activation = board.periodActivations.find(
              (row) => row.periodNumber === period,
            );
            const isActive = Boolean(activation && !activation.endedAt);
            const isEnded = Boolean(activation && activation.endedAt);
            const isNotActivated = !activation;
            const accordionBgClass = isEnded
              ? "bg-muted"
              : isActive
                ? "bg-primary/10"
                : "";
            const statusLabel = isActive
              ? "Activo"
              : isEnded
                ? "Finalizado"
                : "No activado";

            return (
              <AccordionItem
                key={period}
                value={String(period)}
                className={`px-2 sm:px-4 ${accordionBgClass}`}
              >
                <AccordionTrigger
                  disabled={isNotActivated}
                  className="py-4 hover:no-underline disabled:pointer-events-none disabled:opacity-60"
                >
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-3 text-left">
                    <div className="flex items-center gap-2">
                      <span>{`Periodo ${period}`}</span>
                      <Badge
                        variant={
                          isActive
                            ? "default"
                            : isEnded
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {statusLabel}
                      </Badge>
                      {activation?.activatedAt && (
                        <Badge variant="outline" className="text-[10px]">
                          {`Inicio: ${new Date(activation.activatedAt).toLocaleDateString("es-AR")}`}
                        </Badge>
                      )}
                      {activation?.endedAt && (
                        <Badge variant="outline" className="text-[10px]">
                          {`Fin: ${new Date(activation.endedAt).toLocaleDateString("es-AR")}`}
                        </Badge>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pb-4">
                  <div className="grid gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Focos y fases</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {mode === "coach" && (
                          <div className="grid gap-2 rounded-md border p-3">
                            <Input
                              value={newFocusTitle}
                              onChange={(event) =>
                                setNewFocusTitle(event.target.value)
                              }
                              placeholder="Ej: Past Simple"
                            />
                            <Input
                              value={newFocusComment}
                              onChange={(event) =>
                                setNewFocusComment(event.target.value)
                              }
                              placeholder="Comentario del foco (opcional)"
                            />
                            <Button
                              type="button"
                              onClick={() => void handleCreateFocus()}
                              disabled={
                                saving ||
                                (period === selectedPeriod
                                  ? !canCreateFocusInSelectedPeriod
                                  : !board.canCreateFocus)
                              }
                            >
                              {(
                                period === selectedPeriod
                                  ? canCreateFocusInSelectedPeriod
                                  : board.canCreateFocus
                              )
                                ? "Agregar foco"
                                : "Limite 3 focos activos"}
                            </Button>
                          </div>
                        )}

                        {periodFocuses.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Sin focos para este periodo.
                          </p>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              {!showAllFocuses && hiddenFocusColumns > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Mostrando ultimos {visibleFocuses.length}{" "}
                                  focos. Hay {hiddenFocusColumns} ocultos.
                                </p>
                              )}
                              {periodFocuses.length > 5 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setShowAllFocuses((current) => !current)
                                  }
                                >
                                  {showAllFocuses
                                    ? "Ver solo ultimos 5"
                                    : "Mostrar todo (expandir tabla)"}
                                </Button>
                              )}
                            </div>

                            <div className="hidden md:block">
                              <div className="overflow-x-auto rounded-md border">
                                <table className="min-w-[760px] w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="w-44 p-2 text-left font-medium">
                                        Fase / Foco
                                      </th>
                                      {visibleFocuses.map((focus) => (
                                        <th
                                          key={focus.id}
                                          className="min-w-36 p-2 text-left align-top"
                                        >
                                          <div className="space-y-1">
                                            <p className="font-medium">
                                              {focus.focusTitle}
                                            </p>
                                            {focus.focusComment && (
                                              <p className="text-xs text-muted-foreground">
                                                {focus.focusComment}
                                              </p>
                                            )}
                                            {focus.completedAt && (
                                              <Badge className="text-[10px]">
                                                Cumplido
                                              </Badge>
                                            )}
                                          </div>
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {PHASES.map((phase) => (
                                      <tr
                                        key={phase.key}
                                        className="border-b last:border-b-0"
                                      >
                                        <td className="p-2 font-medium">
                                          {phase.label}
                                        </td>
                                        {visibleFocuses.map((focus) => (
                                          <td
                                            key={`${focus.id}-${phase.key}`}
                                            className="p-2"
                                          >
                                            <label className="inline-flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={Boolean(
                                                  focus[phase.key],
                                                )}
                                                disabled={
                                                  mode !== "coach" || saving
                                                }
                                                onChange={(event) =>
                                                  void handleTogglePhase(
                                                    focus.id,
                                                    phase.key as
                                                      | "phaseExplained"
                                                      | "phaseTrained"
                                                      | "phaseUnderstoodExplained"
                                                      | "phaseUsed",
                                                    event.target.checked,
                                                  )
                                                }
                                              />
                                              <span className="text-xs text-muted-foreground">
                                                OK
                                              </span>
                                            </label>
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="grid gap-2 md:hidden">
                              {visibleFocuses.map((focus) => (
                                <div
                                  key={focus.id}
                                  className="rounded-md border p-3"
                                >
                                  <div className="mb-2 flex items-center gap-2">
                                    <p className="font-medium">
                                      {focus.focusTitle}
                                    </p>
                                    {focus.completedAt && (
                                      <Badge className="text-[10px]">
                                        Cumplido
                                      </Badge>
                                    )}
                                  </div>
                                  {focus.focusComment && (
                                    <p className="mb-2 text-xs text-muted-foreground">
                                      {focus.focusComment}
                                    </p>
                                  )}
                                  <div className="grid gap-2">
                                    {PHASES.map((phase) => (
                                      <label
                                        key={`${focus.id}-mobile-${phase.key}`}
                                        className="flex items-center justify-between gap-2 text-sm"
                                      >
                                        <span>{phase.label}</span>
                                        <input
                                          type="checkbox"
                                          checked={Boolean(focus[phase.key])}
                                          disabled={mode !== "coach" || saving}
                                          onChange={(event) =>
                                            void handleTogglePhase(
                                              focus.id,
                                              phase.key as
                                                | "phaseExplained"
                                                | "phaseTrained"
                                                | "phaseUnderstoodExplained"
                                                | "phaseUsed",
                                              event.target.checked,
                                            )
                                          }
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Clases del periodo</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 md:grid-cols-2">
                        {[1, 2].map((index) => {
                          const classIndex = index as 1 | 2;
                          const classSlot =
                            periodClassesByIndex.get(classIndex) || null;
                          const key = `${period}-${classIndex}`;
                          const draft = classDrafts[key] || {
                            title: `Clase ${classIndex}`,
                            scheduledDate: "",
                            scheduledTime: "",
                            loomUrl: "",
                            report: "",
                            reportImageFile: null,
                            removeReportImage: false,
                            coachGuideline1: "",
                            coachGuideline2: "",
                            coachGuideline3: "",
                            guidelineResponse1: "",
                            guidelineResponse2: "",
                            guidelineResponse3: "",
                          };
                          const hasGuidelines = areCoachGuidelinesComplete({
                            coachGuideline1: draft.coachGuideline1,
                            coachGuideline2: draft.coachGuideline2,
                            coachGuideline3: draft.coachGuideline3,
                          });
                          const hasStudentResponses =
                            Boolean(
                              classSlot?.studentGuidelineResponse1?.trim(),
                            ) &&
                            Boolean(
                              classSlot?.studentGuidelineResponse2?.trim(),
                            ) &&
                            Boolean(
                              classSlot?.studentGuidelineResponse3?.trim(),
                            );
                          const responseStatus = [
                            Boolean(
                              classSlot?.studentGuidelineResponse1?.trim(),
                            ),
                            Boolean(
                              classSlot?.studentGuidelineResponse2?.trim(),
                            ),
                            Boolean(
                              classSlot?.studentGuidelineResponse3?.trim(),
                            ),
                          ];
                          const classVideoEmbedUrl = getEmbeddableVideoUrl(
                            classSlot?.loomUrl || null,
                          );
                          const classLoomUrl = classSlot?.loomUrl || "";
                          const fileInputId = `report-image-${period}-${classIndex}`;
                          const selectedFileLabel = draft.reportImageFile
                            ? draft.reportImageFile.name
                            : classSlot?.reportImageUrl &&
                                !draft.removeReportImage
                              ? "Usando imagen actual"
                              : "Ningun archivo seleccionado";
                          const teacherTasks = [
                            {
                              task: classSlot?.coachGuideline1?.trim() || "",
                              response: draft.guidelineResponse1,
                              responseKey: "guidelineResponse1" as const,
                              responseIndex: 1 as const,
                            },
                            {
                              task: classSlot?.coachGuideline2?.trim() || "",
                              response: draft.guidelineResponse2,
                              responseKey: "guidelineResponse2" as const,
                              responseIndex: 2 as const,
                            },
                            {
                              task: classSlot?.coachGuideline3?.trim() || "",
                              response: draft.guidelineResponse3,
                              responseKey: "guidelineResponse3" as const,
                              responseIndex: 3 as const,
                            },
                          ].filter((item) => item.task.length > 0);

                          return (
                            <div
                              key={classIndex}
                              className="rounded-md border p-3"
                            >
                              <p className="mb-2 font-medium">
                                Clase {classIndex}
                              </p>
                              {mode === "coach" ? (
                                <div className="space-y-2">
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
                                    />
                                  </div>
                                  <Input
                                    value={draft.loomUrl}
                                    onChange={(event) =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          loomUrl: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Link Loom de la clase"
                                  />
                                  <p className="text-xs mb-1! font-medium text-muted-foreground">
                                    Reportes
                                  </p>
                                  <Textarea
                                    value={draft.report}
                                    onChange={(event) =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          report: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Reporte texto de clase"
                                    rows={3}
                                  />
                                  <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      asChild
                                    >
                                      <label
                                        htmlFor={fileInputId}
                                        className="cursor-pointer"
                                      >
                                        <UploadIcon className="h-4 w-4" />
                                        {draft.reportImageFile
                                          ? "Cambiar imagen de reporte"
                                          : "Subir imagen de reporte"}
                                      </label>
                                    </Button>
                                    <span className="text-xs text-muted-foreground mb-1">
                                      {selectedFileLabel}
                                    </span>
                                  </div>
                                  <Input
                                    id={fileInputId}
                                    aria-label="Reporte imagen de clase"
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(event) =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          reportImageFile:
                                            event.target.files?.[0] || null,
                                          removeReportImage: false,
                                        },
                                      }))
                                    }
                                  />
                                  {classSlot?.reportImageUrl &&
                                    !draft.removeReportImage &&
                                    !draft.reportImageFile && (
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <a
                                          href={classSlot.reportImageUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="underline"
                                        >
                                          Ver imagen actual
                                        </a>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            setClassDrafts((prev) => ({
                                              ...prev,
                                              [key]: {
                                                ...draft,
                                                removeReportImage: true,
                                              },
                                            }))
                                          }
                                        >
                                          Quitar imagen
                                        </Button>
                                      </div>
                                    )}
                                  <p className="mb-1! text-xs font-medium text-muted-foreground">
                                    Tareas para el alumno
                                  </p>
                                  <Textarea
                                    value={draft.coachGuideline1}
                                    onChange={(event) =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          coachGuideline1: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Tarea 1"
                                    rows={2}
                                  />
                                  <Textarea
                                    value={draft.coachGuideline2}
                                    onChange={(event) =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          coachGuideline2: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Tarea 2"
                                    rows={2}
                                  />
                                  <Textarea
                                    value={draft.coachGuideline3}
                                    onChange={(event) =>
                                      setClassDrafts((prev) => ({
                                        ...prev,
                                        [key]: {
                                          ...draft,
                                          coachGuideline3: event.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="Tarea 3"
                                    rows={2}
                                  />
                                  <Button
                                    type="button"
                                    onClick={() =>
                                      void handleSaveGuidelines(
                                        period,
                                        classIndex,
                                      )
                                    }
                                    disabled={saving}
                                  >
                                    Guardar clase
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">
                                    Tareas del profesor
                                  </p>
                                  {teacherTasks.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                      Aun no hay tareas del profesor para esta
                                      clase.
                                    </p>
                                  ) : (
                                    <div className="space-y-3">
                                      {teacherTasks.map((item) => (
                                        <div
                                          key={`${classIndex}-${item.responseKey}`}
                                          className="rounded-md border p-2"
                                        >
                                          <div className="mb-1 flex items-center justify-between gap-2">
                                            <p className="text-sm">
                                              {item.task}
                                            </p>
                                            <span className="text-xs">
                                              {responseStatus[
                                                item.responseIndex - 1
                                              ]
                                                ? "✅"
                                                : "❌"}
                                            </span>
                                          </div>
                                          <Textarea
                                            value={item.response}
                                            onChange={(event) =>
                                              setClassDrafts((prev) => ({
                                                ...prev,
                                                [key]: {
                                                  ...draft,
                                                  [item.responseKey]:
                                                    event.target.value,
                                                },
                                              }))
                                            }
                                            rows={3}
                                            disabled={!hasGuidelines}
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="mt-2"
                                            onClick={() =>
                                              void handleSaveStudentResponses(
                                                period,
                                                classIndex,
                                                item.responseIndex,
                                              )
                                            }
                                            disabled={
                                              saving ||
                                              !hasGuidelines ||
                                              !item.response.trim()
                                            }
                                          >
                                            Guardar
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {(classVideoEmbedUrl || classLoomUrl) && (
                                    <div className="space-y-2 rounded-md border bg-muted/20 p-2 text-sm">
                                      <p className="font-medium">
                                        Clase grabada
                                      </p>
                                      {classVideoEmbedUrl ? (
                                        <div className="overflow-hidden rounded-md border">
                                          <iframe
                                            src={classVideoEmbedUrl}
                                            title={`Clase ${classIndex} periodo ${period}`}
                                            className="aspect-video w-full"
                                            allow="autoplay; fullscreen; picture-in-picture"
                                            allowFullScreen
                                          />
                                        </div>
                                      ) : (
                                        <a
                                          href={classLoomUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="underline"
                                        >
                                          Ver clase en Loom
                                        </a>
                                      )}
                                    </div>
                                  )}

                                  {!hasStudentResponses &&
                                    teacherTasks.length > 0 && (
                                      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                        Completa las 3 tareas del profesor para
                                        desbloquear el reporte de texto y la
                                        imagen.
                                      </p>
                                    )}

                                  {hasStudentResponses && (
                                    <div className="space-y-2 rounded-md border bg-muted/20 p-2 text-sm">
                                      <p className="font-medium">
                                        Reporte del profesor
                                      </p>
                                      {classSlot?.report && (
                                        <p>{classSlot.report}</p>
                                      )}
                                      {classSlot?.reportImageUrl && (
                                        <a
                                          href={classSlot.reportImageUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="underline"
                                        >
                                          Ver imagen de reporte
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          },
        )}
      </Accordion>
    </div>
  );
}
