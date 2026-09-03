import { useEffect, useState } from "react";
import {
  CopyIcon,
  DownloadIcon,
  SquareIcon,
  Trash2Icon,
  Volume1Icon,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { Dispatch, SetStateAction } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { IcaDeletionWarningDialog } from "../components/IcaDeletionWarningDialog";
import { RomanizationHint } from "../components/RomanizationHint";
import { IMPORTANCE_LEVELS, getImportance } from "../constants";
import { fetchWordExample } from "../services/anthropic";
import { fetchWordActivationCounts } from "../services/metaTracker";
import { deleteWordById, loadData, updateWord } from "../services/storage";
import { speakNatural, stopTTS } from "../services/tts";
import {
  copyWordsToClipboard,
  downloadWordsAsDocx,
  downloadWordsAsPdf,
} from "../services/wordExport";
import { sortChronological } from "../utils";
import type { AppConfig, ImportanceKey, Lexicard, StudyLevel } from "../types";
import useBreakpoints from "../hooks/useBreakpoints";

type ManageViewProps = {
  cards: Lexicard[];
  setCards: Dispatch<SetStateAction<Lexicard[]>>;
  config: AppConfig;
  studyLevel: StudyLevel;
  todayWordsAdded: number;
};

const TONE_CLASS: Record<ImportanceKey, string> = {
  vital: "text-blue-400",
  frequent: "text-emerald-400",
  occasional: "text-amber-400",
  rare: "text-orange-400",
  irrelevant: "text-red-400",
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeComparableText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function highlightMatch(text: string, query: string): ReactNode {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const regex = new RegExp(`(${escapeRegex(trimmedQuery)})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) =>
    part.toLowerCase() === trimmedQuery.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className="rounded-sm bg-primary/20 px-0.5 text-primary"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

export function ManageView({
  cards,
  setCards,
  config,
  studyLevel,
  todayWordsAdded,
}: ManageViewProps) {
  const { user } = useAuth();
  const { isLg } = useBreakpoints();
  const [filter, setFilter] = useState<ImportanceKey | "all" | "to_learn">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTarget, setDraftTarget] = useState("");
  const [draftNative, setDraftNative] = useState("");
  const [draftExamplePhrase, setDraftExamplePhrase] = useState("");
  const [draftExampleTranslation, setDraftExampleTranslation] = useState("");
  const [draftImportance, setDraftImportance] =
    useState<ImportanceKey>("vital");
  const [deleteCandidate, setDeleteCandidate] = useState<Lexicard | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrorById, setDeleteErrorById] = useState<
    Record<string, string>
  >({});
  const [generatingExampleId, setGeneratingExampleId] = useState<string | null>(
    null,
  );
  const [exampleErrorById, setExampleErrorById] = useState<
    Record<string, string>
  >({});
  const [busyExport, setBusyExport] = useState<null | "copy" | "docx" | "pdf">(
    null,
  );
  const [wordUsageCounts, setWordUsageCounts] = useState<
    Record<string, number>
  >({});
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void loadData("dashboard-ICA-words", [] as Lexicard[])
      .then((nextCards) => {
        if (!active) return;
        setCards(nextCards);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [setCards]);

  useEffect(() => {
    let active = true;

    fetchWordActivationCounts(
      cards.map((card) => card.id),
      config.targetLang,
      config.nativeLang,
    )
      .then((next) => {
        if (!active) return;
        setWordUsageCounts(next);
      })
      .catch(() => {
        if (!active) return;
        setWordUsageCounts({});
      });

    return () => {
      active = false;
    };
  }, [cards, config.nativeLang, config.targetLang]);

  useEffect(() => {
    return () => {
      stopTTS();
    };
  }, []);

  const filteredByImportance =
    filter === "all"
      ? cards
      : filter === "to_learn"
        ? cards.filter((c) => (c.streak || 0) === 0)
        : cards.filter((c) => c.importance === filter);
  const toLearnCount = cards.filter((card) => (card.streak || 0) === 0).length;
  const importanceCounts = cards.reduce<Record<ImportanceKey, number>>(
    (acc, card) => {
      acc[card.importance] += 1;
      return acc;
    },
    {
      vital: 0,
      frequent: 0,
      occasional: 0,
      rare: 0,
      irrelevant: 0,
    },
  );
  const filtered = filteredByImportance.filter((card) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      card.target.toLowerCase().includes(q) ||
      card.native.toLowerCase().includes(q)
    );
  });
  const sorted = sortChronological(filtered);
  const ownerName =
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "Usuario";
  const editingCard = cards.find((card) => card.id === editingId) || null;
  const hasDuplicateEditTarget = Boolean(
    editingCard &&
    draftTarget.trim() &&
    cards.some(
      (card) =>
        card.id !== editingCard.id &&
        normalizeComparableText(card.target) ===
          normalizeComparableText(draftTarget) &&
        (card.targetLang || "") === (editingCard.targetLang || "") &&
        (card.nativeLang || "") === (editingCard.nativeLang || ""),
    ),
  );

  const handleCopyWords = async (): Promise<void> => {
    if (busyExport) return;
    setBusyExport("copy");
    try {
      await copyWordsToClipboard(ownerName, sorted);
    } finally {
      setBusyExport(null);
    }
  };

  const handleDownloadDocx = async (): Promise<void> => {
    if (busyExport) return;
    setBusyExport("docx");
    try {
      await downloadWordsAsDocx(ownerName, sorted);
    } finally {
      setBusyExport(null);
    }
  };

  const handleDownloadPdf = async (): Promise<void> => {
    if (busyExport) return;
    setBusyExport("pdf");
    try {
      await downloadWordsAsPdf(ownerName, sorted);
    } finally {
      setBusyExport(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    const usageCount =
      wordUsageCounts[id] ??
      cards.find((card) => card.id === id)?.activationCount ??
      0;
    if (usageCount > 0) {
      setDeleteErrorById((prev) => ({
        ...prev,
        [id]: "No se puede eliminar: palabra protegida por activaciones.",
      }));
      setDeleteCandidate(null);
      return;
    }

    try {
      await deleteWordById(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      setDeleteErrorById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setEditingId(null);
      setDeleteCandidate(null);
    } catch {
      setDeleteErrorById((prev) => ({
        ...prev,
        [id]: "No se pudo eliminar: palabra protegida por activaciones.",
      }));
      setDeleteCandidate(null);
    }
  };

  const openEditor = (card: Lexicard): void => {
    setEditingId(card.id);
    setDraftTarget(card.target);
    setDraftNative(card.native);
    setDraftExamplePhrase(card.examplePhrase || "");
    setDraftExampleTranslation(card.exampleTranslation || "");
    setDraftImportance(card.importance);
    setDeleteCandidate(null);
    setEditError(null);
    setDeleteErrorById((prev) => {
      const next = { ...prev };
      delete next[card.id];
      return next;
    });
  };

  const closeEditor = (): void => {
    setEditingId(null);
    setDeleteCandidate(null);
    setEditError(null);
  };

  const handleSaveEdit = async (id: string): Promise<void> => {
    if (hasDuplicateEditTarget) {
      setEditError("Ya existe esta palabra en tu baúl ICA.");
      return;
    }

    let updatedCard: Lexicard | null = null;
    const nextCards = cards.map((card) => {
      if (card.id !== id) return card;
      const isTargetProtected =
        (wordUsageCounts[card.id] ?? card.activationCount ?? 0) > 0;
      updatedCard = {
        ...card,
        target: isTargetProtected
          ? card.target
          : draftTarget.trim() || card.target,
        native: draftNative.trim() || card.native,
        examplePhrase: draftExamplePhrase.trim() || null,
        exampleTranslation: draftExampleTranslation.trim() || null,
        importance: draftImportance,
      };
      return updatedCard;
    });

    if (!updatedCard) return;
    setCards(nextCards);
    await updateWord(updatedCard);
    closeEditor();
  };

  const handleGenerateExample = async (card: Lexicard): Promise<void> => {
    if (generatingExampleId) return;

    setGeneratingExampleId(card.id);
    setExampleErrorById((prev) => ({ ...prev, [card.id]: "" }));
    try {
      const example = await fetchWordExample(
        card.target,
        card.native,
        config.targetLang,
        config.nativeLang,
        studyLevel,
      );

      if (!example?.phrase || !example.translation) {
        setExampleErrorById((prev) => ({
          ...prev,
          [card.id]: "No se pudo generar ejemplo ahora",
        }));
        return;
      }

      let updatedCard: Lexicard | null = null;
      const nextCards = cards.map((current) => {
        if (current.id !== card.id) return current;
        updatedCard = {
          ...current,
          examplePhrase: example.phrase,
          exampleTranslation: example.translation,
        };
        return updatedCard;
      });

      if (!updatedCard) return;
      setCards(nextCards);
      await updateWord(updatedCard);
    } finally {
      setGeneratingExampleId(null);
    }
  };

  const handlePlayWord = (card: Lexicard): void => {
    if (playingWordId === card.id) {
      stopTTS();
      setPlayingWordId(null);
      return;
    }

    stopTTS();
    setPlayingWordId(card.id);
    speakNatural(card.target, card.targetLang || config.targetLang, () => {
      setPlayingWordId((current) => (current === card.id ? null : current));
    });
  };

  return (
    <section className="mx-auto flex h-auto w-full max-w-2xl flex-1 flex-col pt-4 px-4 pb-24 lg:h-full lg:min-h-0 lg:pt-8 lg:pb-8">
      <h2 className="mb-0 lg:mb-1 font-serif text-2xl lg:text-3xl font-bold">
        📦 Mi baúl ICA
      </h2>
      <p className="mb-2 lg:mb-6 text-sm text-muted-foreground">
        {cards.length} palabra{cards.length !== 1 ? "s" : ""} · Más reciente
        primero
      </p>

      <div className="sticky top-0 z-20 -mx-5 mb-4 border-b border-border/60 bg-background/95 px-5 pt-1 pb-3 backdrop-blur lg:static lg:z-auto lg:m-0 lg:mb-6 lg:border-none lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:backdrop-blur-none">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 lg:min-w-60">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              🔎
            </span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar palabra..."
              className="pl-9"
            />
          </div>

          <Button
            type="button"
            onClick={() => handleCopyWords()}
            disabled={sorted.length === 0 || busyExport !== null}
            variant="outline"
            size="sm"
          >
            <CopyIcon />
            {isLg && "Copiar"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                disabled={sorted.length === 0 || busyExport !== null}
                variant="outline"
                size="sm"
              >
                <DownloadIcon />
                {(busyExport === "docx" || busyExport === "pdf") && isLg
                  ? "Generando..."
                  : isLg && "Descargar"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleDownloadDocx()}>
                DOCX
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDownloadPdf()}>
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-0 flex flex-wrap gap-1 lg:gap-1.5">
          <Button
            type="button"
            onClick={() => setFilter("all")}
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
          >
            Todas ({cards.length})
          </Button>

          {IMPORTANCE_LEVELS.map((level) => {
            const count = importanceCounts[level.key];
            const selected = filter === level.key;
            return (
              <Button
                key={level.key}
                type="button"
                onClick={() => setFilter(level.key)}
                variant={selected ? "default" : "outline"}
                size="sm"
                className={selected ? TONE_CLASS[level.key] : ""}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${TONE_CLASS[level.key].replace("text", "bg")}`}
                />
                {count}
              </Button>
            );
          })}

          <Button
            type="button"
            onClick={() => setFilter("to_learn")}
            variant={filter === "to_learn" ? "default" : "outline"}
            size="sm"
          >
            Por aprender ({toLearnCount})
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-visible lg:overflow-y-auto lg:pr-1">
        {sorted.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No hay palabras con ese filtro.
          </p>
        )}

        {sorted.map((card) => {
          const importance = getImportance(card.importance);
          const isFailed = (card.streak || 0) === 0;
          const isEditing = editingId === card.id;
          const usageCount =
            wordUsageCounts[card.id] ?? card.activationCount ?? 0;
          const isDeletionProtected = usageCount > 0;
          const isTargetProtected = usageCount > 0;
          const usageLevel = usageCount >= 3 ? 2 : usageCount >= 1 ? 1 : 0;
          const dateStr = card.createdAt
            ? new Date(card.createdAt).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
              })
            : "";

          return (
            <Card
              key={card.id}
              className={`mb-2.5 rounded-xl border p-3.5 ${
                isEditing
                  ? "border-primary/30 bg-primary/5"
                  : usageLevel === 2
                    ? "border-amber-400/70 bg-amber-500/10 shadow-[0_0_28px_-10px_rgba(251,191,36,0.95)]"
                    : usageLevel === 1
                      ? "border-amber-400/50 bg-amber-500/5 shadow-[0_0_24px_-12px_rgba(251,191,36,0.7)]"
                      : ""
              }`}
            >
              <CardContent className="p-0">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${TONE_CLASS[card.importance].replace("text", "bg")}`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">
                        {highlightMatch(card.target, query)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-base text-muted-foreground">
                        {highlightMatch(card.native, query)}
                      </span>
                    </div>
                    <RomanizationHint
                      text={card.target}
                      language={card.targetLang || ""}
                    />

                    <div className="mt-1 flex flex-wrap items-center gap-2.5">
                      <span
                        className={`text-xs ${TONE_CLASS[card.importance]}`}
                      >
                        {importance.label}
                      </span>
                      <span
                        className={`text-xs ${isFailed ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {isFailed ? "Por aprender" : `Racha ${card.streak}`}
                      </span>
                      {dateStr && (
                        <span className="text-[10px] text-muted-foreground">
                          {dateStr}
                        </span>
                      )}
                      {usageLevel > 0 && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            usageLevel === 2
                              ? "border-amber-400/70 bg-amber-500/25 text-amber-600"
                              : "border-amber-400/50 bg-amber-500/15 text-amber-500"
                          }`}
                        >
                          {usageLevel === 2
                            ? `Muy usada en activación (${usageCount})`
                            : "Usada en activación"}
                        </span>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        onClick={() => handlePlayWord(card)}
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Escuchar ${card.target}`}
                      >
                        {playingWordId === card.id ? (
                          <SquareIcon className="size-4" />
                        ) : (
                          <Volume1Icon className="size-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => openEditor(card)}
                        variant="outline"
                        size="sm"
                      >
                        Editar
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={draftTarget}
                        onChange={(event) => {
                          setDraftTarget(event.target.value);
                          setEditError(null);
                        }}
                        disabled={isTargetProtected}
                      />
                      <Input
                        value={draftNative}
                        onChange={(event) => setDraftNative(event.target.value)}
                      />
                    </div>

                    {isTargetProtected && (
                      <p className="text-xs text-amber-600">
                        La palabra ICA nativa no se puede editar porque ya tiene
                        activaciones asociadas.
                      </p>
                    )}

                    {(hasDuplicateEditTarget || editError) && (
                      <p className="text-xs text-red-600 dark:text-red-300">
                        {editError || "Ya existe esta palabra en tu baúl ICA."}
                      </p>
                    )}
                    <RomanizationHint
                      text={draftTarget}
                      language={card.targetLang || config.targetLang}
                    />

                    <div className="grid gap-2">
                      <Input
                        value={draftExamplePhrase}
                        onChange={(event) =>
                          setDraftExamplePhrase(event.target.value)
                        }
                        placeholder="Ejemplo (idioma objetivo)"
                      />
                      <Input
                        value={draftExampleTranslation}
                        onChange={(event) =>
                          setDraftExampleTranslation(event.target.value)
                        }
                        placeholder="Traducción del ejemplo"
                      />

                      {!card.examplePhrase && (
                        <div>
                          <Button
                            type="button"
                            onClick={() => void handleGenerateExample(card)}
                            variant="secondary"
                            size="sm"
                            disabled={generatingExampleId === card.id}
                          >
                            {generatingExampleId === card.id
                              ? "Generando ejemplo..."
                              : "Generar ejemplo con IA"}
                          </Button>
                          {exampleErrorById[card.id] && (
                            <p className="mt-1 text-xs text-destructive">
                              {exampleErrorById[card.id]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {IMPORTANCE_LEVELS.map((level) => (
                        <Button
                          key={level.key}
                          type="button"
                          onClick={() => setDraftImportance(level.key)}
                          variant={
                            draftImportance === level.key
                              ? "secondary"
                              : "outline"
                          }
                          size="sm"
                          className={
                            draftImportance === level.key
                              ? TONE_CLASS[level.key]
                              : ""
                          }
                        >
                          {level.label}
                        </Button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {isDeletionProtected ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-amber-600">
                            Protegida: tiene activaciones asociadas.
                          </span>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled
                          >
                            Eliminar bloqueado
                            <Trash2Icon className="size-4 ml-1" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => setDeleteCandidate(card)}
                          variant="destructive"
                          size="sm"
                        >
                          Eliminar
                          <Trash2Icon className="size-4 ml-1" />
                        </Button>
                      )}

                      {deleteErrorById[card.id] && (
                        <span className="text-xs text-red-500">
                          {deleteErrorById[card.id]}
                        </span>
                      )}

                      <div className="ml-auto flex gap-2">
                        <Button
                          type="button"
                          onClick={closeEditor}
                          variant="outline"
                          size="sm"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => handleSaveEdit(card.id)}
                          size="sm"
                          disabled={hasDuplicateEditTarget}
                        >
                          Guardar cambios
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <IcaDeletionWarningDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null);
        }}
        onConfirm={() => {
          if (!deleteCandidate) return;
          void handleDelete(deleteCandidate.id);
        }}
        title="Eliminar palabra ICA"
        resourceLabel="esta palabra ICA"
        resource="word"
        resourceDates={[deleteCandidate?.createdAt]}
        todayTotalCount={todayWordsAdded}
      />
    </section>
  );
}
