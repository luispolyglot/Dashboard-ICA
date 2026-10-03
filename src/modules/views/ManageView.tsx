import { useEffect, useState } from "react";
import {
  ArchiveIcon,
  CopyIcon,
  DownloadIcon,
  FileDownIcon,
  FileTextIcon,
  LoaderCircleIcon,
  LockIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
  Volume2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { Dispatch, SetStateAction } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { langName, t, tn, uiLocale } from "@/i18n";
import { IcaDeletionWarningDialog } from "../components/IcaDeletionWarningDialog";
import { RomanizationHint } from "../components/RomanizationHint";
import { IMPORTANCE_LEVELS, getImportance } from "../constants";
import {
  EmptyState,
  GamePage,
  IconTile,
  PageTitle,
  PhaseLetter,
  Pill,
  RowGroup,
  tone,
} from "../game/ui";
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
import {
  IMPORTANCE_TONE,
  ImportanceBars,
  ImportancePicker,
  ImportanceTile,
} from "./IcaWordParts";
import { SwipeRow } from "../game/SwipeRow";

type ManageViewProps = {
  cards: Lexicard[];
  setCards: Dispatch<SetStateAction<Lexicard[]>>;
  config: AppConfig;
  studyLevel: StudyLevel;
  todayWordsAdded: number;
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
        className="rounded bg-[color-mix(in_oklab,var(--ica-i)_22%,transparent)] px-0.5 text-[var(--ica-i-ink)]"
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
  const [swipedId, setSwipedId] = useState<string | null>(null);

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
    t("Usuario");
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
      await copyWordsToClipboard(ownerName, sorted, {
        targetLang: langName(config.targetLang),
        nativeLang: langName(config.nativeLang),
        level: studyLevel,
      });
      toast.success(t("Palabras copiadas con un prompt para practicarlas"));
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
        [id]: t("No se puede eliminar: palabra protegida por activaciones."),
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
        [id]: t("No se pudo eliminar: palabra protegida por activaciones."),
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
      setEditError(t("Ya existe esta palabra en tu baúl ICA."));
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
          [card.id]: t("No se pudo generar ejemplo ahora"),
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

  // --- Lo que se ve ---
  const activatedCount = cards.filter(
    (card) => (wordUsageCounts[card.id] ?? card.activationCount ?? 0) > 0,
  ).length;
  const exportDisabled = sorted.length === 0 || busyExport !== null;

  // Pastillas de filtro: Todas, Por aprender y una por frecuencia.
  const filterPill = (
    key: ImportanceKey | "all" | "to_learn",
    content: ReactNode,
    ariaLabel?: string,
  ) => {
    const active = filter === key;
    const colors =
      key === "all" || key === "to_learn"
        ? tone("i")
        : tone(IMPORTANCE_TONE[key]);
    return (
      <button
        key={key}
        type="button"
        onClick={() => setFilter(key)}
        aria-pressed={active}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-10 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-extrabold whitespace-nowrap transition-[transform,box-shadow,background-color] active:translate-y-[2px] active:shadow-none",
          active
            ? ""
            : "border-border bg-card text-muted-foreground hover:text-foreground dark:bg-transparent",
        )}
        style={
          active
            ? {
                background: colors.soft,
                borderColor: colors.solid,
                color: colors.ink,
                boxShadow: `0 2px 0 ${colors.solid}`,
              }
            : { boxShadow: "0 2px 0 var(--border)" }
        }
      >
        {content}
      </button>
    );
  };

  return (
    <GamePage className="gap-5 lg:max-w-2xl">
      <PageTitle
        icon={<PhaseLetter letter="I" size={48} />}
        subtitle={t("Tu baúl ICA · la más reciente primero")}
        right={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={exportDisabled}
                aria-label={t("Copiar o descargar tus palabras")}
              >
                {busyExport ? (
                  <LoaderCircleIcon className="size-5 animate-spin" strokeWidth={2.6} />
                ) : (
                  <DownloadIcon className="size-5" strokeWidth={2.4} />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                {tn(sorted.length, "{n} palabra", "{n} palabras")}
              </DropdownMenuLabel>
              {[
                {
                  key: "copy",
                  icon: <CopyIcon className="size-4.5" strokeWidth={2.6} />,
                  label: t("Copiar"),
                  hint: t("Con un prompt para practicarlas en ChatGPT o Claude"),
                  toneKey: "i" as const,
                  run: handleCopyWords,
                },
                {
                  key: "docx",
                  icon: <FileTextIcon className="size-4.5" strokeWidth={2.6} />,
                  label: t("Descargar Word"),
                  hint: t("Documento editable (.docx)"),
                  toneKey: "primary" as const,
                  run: handleDownloadDocx,
                },
                {
                  key: "pdf",
                  icon: <FileDownIcon className="size-4.5" strokeWidth={2.6} />,
                  label: t("Descargar PDF"),
                  hint: t("Listo para imprimir"),
                  toneKey: "a" as const,
                  run: handleDownloadPdf,
                },
              ].map((item) => (
                <DropdownMenuItem key={item.key} onClick={() => void item.run()}>
                  <IconTile tone={item.toneKey} size={36}>
                    {item.icon}
                  </IconTile>
                  <span className="flex min-w-0 flex-col">
                    <span className="leading-tight">{item.label}</span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {item.hint}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        {t("Mis palabras ICA")}
      </PageTitle>

      {/* Tu baúl en números */}
      <div
        className="rounded-3xl px-5 py-4"
        style={{ background: "var(--ica-i-soft)" }}
      >
        <div className="flex items-center gap-4">
          <IconTile tone="i" solid size={60}>
            <ArchiveIcon className="size-8" strokeWidth={2.4} aria-hidden="true" />
          </IconTile>
          <div className="min-w-0">
            <p
              className="m-0 text-5xl leading-none font-black tabular-nums"
              style={{ color: "var(--ica-i-ink)" }}
            >
              {cards.length}
            </p>
            <p
              className="m-0 mt-1 text-sm font-extrabold"
              style={{ color: "var(--ica-i-ink)" }}
            >
              {tn(cards.length, "palabra en tu baúl ICA", "palabras en tu baúl ICA")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { value: `+${todayWordsAdded}`, label: t("hoy") },
            { value: String(toLearnCount), label: t("por aprender") },
            { value: String(activatedCount), label: t("ya activadas") },
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center rounded-2xl bg-card px-2 py-2.5 text-center dark:bg-background/40"
            >
              <span className="text-xl leading-none font-black tabular-nums">
                {item.value}
              </span>
              <span className="mt-1 text-[11px] leading-tight font-bold text-muted-foreground">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Buscador y filtros (se quedan arriba al bajar) */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 bg-background/95 px-4 pt-2 pb-3 backdrop-blur">
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2.6}
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Buscar palabra...")}
            aria-label={t("Buscar palabra")}
            className="h-14 rounded-2xl pr-12 pl-12 text-lg font-bold placeholder:font-semibold placeholder:text-muted-foreground/75 focus-visible:border-[var(--ica-i)] focus-visible:ring-[color-mix(in_oklab,var(--ica-i)_22%,transparent)] md:text-lg"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("Borrar búsqueda")}
              className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" strokeWidth={2.8} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {filterPill(
            "all",
            <>
              {t("Todas")}
              <span className="tabular-nums opacity-70">{cards.length}</span>
            </>,
          )}
          {filterPill(
            "to_learn",
            <>
              {t("Por aprender")}
              <span className="tabular-nums opacity-70">{toLearnCount}</span>
            </>,
          )}
          {IMPORTANCE_LEVELS.map((level) =>
            filterPill(
              level.key,
              <>
                <ImportanceBars level={level.key} size={16} />
                <span
                  className={cn(
                    filter === level.key ? "inline" : "hidden sm:inline",
                  )}
                >
                  {t(level.label)}
                </span>
                <span className="tabular-nums opacity-70">
                  {importanceCounts[level.key]}
                </span>
              </>,
              `${t(level.label)}: ${importanceCounts[level.key]}`,
            ),
          )}
        </div>
      </div>

      <div>
        {sorted.length === 0 ? (
          <EmptyState
            icon={
              <IconTile tone="i" size={64}>
                <ArchiveIcon className="size-8" strokeWidth={2.4} aria-hidden="true" />
              </IconTile>
            }
            title={t("No hay palabras con ese filtro.")}
            text={
              query.trim()
                ? t("Prueba con otra búsqueda o cambia el filtro.")
                : undefined
            }
          />
        ) : (
          <RowGroup>
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
                ? new Date(card.createdAt).toLocaleDateString(uiLocale(), {
                    day: "numeric",
                    month: "short",
                  })
                : "";

              return (
                <SwipeRow
                  key={card.id}
                  open={swipedId === card.id}
                  onOpenChange={(next) => setSwipedId(next ? card.id : null)}
                  disabled={isEditing}
                  locked={isDeletionProtected}
                  onDelete={() => {
                    if (isDeletionProtected) {
                      setDeleteErrorById((prev) => ({
                        ...prev,
                        [card.id]: t("Protegida: tiene activaciones asociadas."),
                      }));
                      return;
                    }
                    setDeleteCandidate(card);
                  }}
                >
                <div className="py-3">
                  <div className="flex items-start gap-3">
                    <ImportanceTile level={importance.key} size={44} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="m-0 text-base leading-tight font-extrabold break-words">
                            {highlightMatch(card.target, query)}
                          </p>
                          <p className="m-0 mt-0.5 text-sm font-semibold break-words text-muted-foreground">
                            {highlightMatch(card.native, query)}
                          </p>
                          <RomanizationHint
                            text={card.target}
                            language={card.targetLang || ""}
                            className="m-0 mt-0.5 text-xs font-semibold text-muted-foreground"
                          />
                        </div>

                        {/* Acciones discretas: escuchar y editar */}
                        {!isEditing && (
                          <div className="-mr-1 flex shrink-0 items-center">
                            <button
                              type="button"
                              onClick={() => handlePlayWord(card)}
                              aria-label={t("Escuchar {word}", { word: card.target })}
                              className={cn(
                                "flex size-10 items-center justify-center rounded-xl transition-colors",
                                playingWordId === card.id
                                  ? "bg-[var(--ica-i-soft)] text-[var(--ica-i-ink)]"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              {playingWordId === card.id ? (
                                <SquareIcon className="size-4" fill="currentColor" strokeWidth={2.6} />
                              ) : (
                                <Volume2Icon className="size-5" strokeWidth={2.4} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditor(card)}
                              aria-label={t("Editar {word}", { word: card.target })}
                              title={t("Editar")}
                              className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <PencilIcon className="size-4.5" strokeWidth={2.4} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Frecuencia, fecha y estado (a todo el ancho, bajo las acciones) */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-extrabold whitespace-nowrap">
                          <span style={{ color: tone(IMPORTANCE_TONE[importance.key]).ink }}>
                            {t(importance.label)}
                          </span>
                          {dateStr && (
                            <span className="font-bold text-muted-foreground">
                              {" "}
                              · {dateStr}
                            </span>
                          )}
                        </span>
                        <Pill tone={isFailed ? "bad" : "ok"}>
                          {isFailed ? t("Por aprender") : t("Racha {n}", { n: card.streak })}
                        </Pill>
                        {usageLevel > 0 && (
                          <Pill
                            tone="gold"
                            solid={usageLevel === 2}
                            className={usageLevel === 2 ? "text-[#4a3200]!" : undefined}
                          >
                            <ZapIcon className="size-3" strokeWidth={2.8} aria-hidden="true" />
                            {usageLevel === 2
                              ? t("Muy usada en activación ({n})", { n: usageCount })
                              : t("Usada en activación")}
                          </Pill>
                        )}
                      </div>
                    </div>
                  </div>

                  {isEditing && (
                    <div
                      className="mt-3 flex flex-col gap-4 rounded-2xl border-2 p-3.5"
                      style={{
                        background: "var(--ica-i-soft)",
                        borderColor:
                          "color-mix(in oklab, var(--ica-i) 30%, transparent)",
                      }}
                    >
                      <p className="ica-label m-0" style={{ color: "var(--ica-i-ink)" }}>
                        {t("Editar palabra")}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-extrabold text-muted-foreground">
                            {langName(card.targetLang || config.targetLang)}
                          </span>
                          <Input
                            value={draftTarget}
                            onChange={(event) => {
                              setDraftTarget(event.target.value);
                              setEditError(null);
                            }}
                            disabled={isTargetProtected}
                            className="h-12 rounded-2xl text-base font-bold md:text-base"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-extrabold text-muted-foreground">
                            {langName(card.nativeLang || config.nativeLang)}
                          </span>
                          <Input
                            value={draftNative}
                            onChange={(event) => setDraftNative(event.target.value)}
                            className="h-12 rounded-2xl text-base font-bold md:text-base"
                          />
                        </label>
                      </div>

                      {isTargetProtected && (
                        <p
                          className="m-0 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-bold"
                          style={{ background: "var(--ica-gold-soft)", color: "var(--ica-gold-ink)" }}
                        >
                          <LockIcon className="mt-px size-3.5 shrink-0" strokeWidth={2.6} aria-hidden="true" />
                          {t("La palabra ICA nativa no se puede editar porque ya tiene activaciones asociadas.")}
                        </p>
                      )}

                      {(hasDuplicateEditTarget || editError) && (
                        <p
                          className="m-0 rounded-xl px-3 py-2 text-xs font-bold"
                          style={{ background: "var(--ica-bad-soft)", color: "var(--ica-bad-ink)" }}
                          role="alert"
                        >
                          {editError || t("Ya existe esta palabra en tu baúl ICA.")}
                        </p>
                      )}
                      <RomanizationHint
                        text={draftTarget}
                        language={card.targetLang || config.targetLang}
                        className="m-0 -mt-2 text-xs font-semibold text-muted-foreground"
                      />

                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-extrabold text-muted-foreground">
                          {t("Ejemplo")}
                        </span>
                        <Input
                          value={draftExamplePhrase}
                          onChange={(event) =>
                            setDraftExamplePhrase(event.target.value)
                          }
                          placeholder={t("Ejemplo (idioma objetivo)")}
                          aria-label={t("Ejemplo (idioma objetivo)")}
                        />
                        <Input
                          value={draftExampleTranslation}
                          onChange={(event) =>
                            setDraftExampleTranslation(event.target.value)
                          }
                          placeholder={t("Traducción del ejemplo")}
                          aria-label={t("Traducción del ejemplo")}
                        />

                        {!card.examplePhrase && (
                          <div>
                            <Button
                              type="button"
                              onClick={() => void handleGenerateExample(card)}
                              variant="outline"
                              size="sm"
                              disabled={generatingExampleId === card.id}
                            >
                              {generatingExampleId === card.id ? (
                                <LoaderCircleIcon className="animate-spin" strokeWidth={2.6} />
                              ) : (
                                <SparklesIcon strokeWidth={2.4} style={{ color: "var(--ica-i)" }} />
                              )}
                              {generatingExampleId === card.id
                                ? t("Generando ejemplo...")
                                : t("Generar ejemplo con IA")}
                            </Button>
                            {exampleErrorById[card.id] && (
                              <p className="m-0 mt-1 text-xs font-bold text-destructive">
                                {exampleErrorById[card.id]}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-extrabold text-muted-foreground">
                          {t("Frecuencia de uso")}
                        </span>
                        <ImportancePicker
                          value={draftImportance}
                          onChange={setDraftImportance}
                          showHint={false}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-[color-mix(in_oklab,var(--ica-i)_18%,transparent)] pt-3">
                        {isDeletionProtected ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled
                            >
                              <LockIcon className="size-3.5" strokeWidth={2.6} />
                              {t("Eliminar bloqueado")}
                            </Button>
                            <span className="text-xs font-bold" style={{ color: "var(--ica-gold-ink)" }}>
                              {t("Protegida: tiene activaciones asociadas.")}
                            </span>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => setDeleteCandidate(card)}
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2Icon className="size-4" strokeWidth={2.4} />
                            {t("Eliminar")}
                          </Button>
                        )}

                        {deleteErrorById[card.id] && (
                          <span className="text-xs font-bold" style={{ color: "var(--ica-bad-ink)" }}>
                            {deleteErrorById[card.id]}
                          </span>
                        )}

                        <div className="ml-auto flex gap-2">
                          <Button
                            type="button"
                            onClick={closeEditor}
                            variant="outline"
                          >
                            {t("Cancelar")}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleSaveEdit(card.id)}
                            variant="i"
                            disabled={hasDuplicateEditTarget}
                          >
                            {t("Guardar cambios")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!isEditing && deleteErrorById[card.id] ? (
                    <p
                      className="m-0 mt-2 flex items-center gap-1.5 text-xs font-bold"
                      style={{ color: "var(--ica-gold-ink)" }}
                    >
                      <LockIcon className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
                      {deleteErrorById[card.id]}
                    </p>
                  ) : null}
                </div>
                </SwipeRow>
              );
            })}
          </RowGroup>
        )}
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
        title={t("Eliminar palabra ICA")}
        resourceLabel={t("esta palabra ICA")}
        resource="word"
        resourceDates={[deleteCandidate?.createdAt]}
        todayTotalCount={todayWordsAdded}
      />
    </GamePage>
  );
}
