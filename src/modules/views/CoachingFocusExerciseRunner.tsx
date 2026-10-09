import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  LightbulbIcon,
  RotateCcwIcon,
  TargetIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GameProgress, Pill, SectionLabel, tone } from "../game/ui";
import {
  correctorContextOf,
  detectWrongBuildCandidate,
  findBuildVerbMatch,
  readablePattern,
  scoreDialogItem,
  type ExerciseData,
} from "./coachingV2ExerciseLogic";
import type { CoachingV2AttemptAnswer } from "../services/coaching";
import { t } from "@/i18n";

/* Los textos "Hueco N (verbo)" y "en blanco" se guardan en español (los ve el coach);
   aquí solo se traducen al enseñarlos. */
function displayQuestion(question: string): string {
  const match = question.match(/^Hueco (\d+) \((.*)\)$/);
  if (!match) return question;
  return t("Hueco {n} ({verb})", { n: match[1], verb: match[2] });
}

function displayAnswer(answer: string): string {
  return answer === "en blanco" ? t("en blanco") : answer;
}

/* Look of the exercise (Luis, 6 Oct): the same pieces as the rest of the new app. */
type AnswerState = "idle" | "ok" | "no" | "off";

function answerStyle(state: AnswerState): CSSProperties {
  if (state === "ok" || state === "no") {
    const colors = tone(state === "ok" ? "ok" : "bad");
    return {
      background: colors.soft,
      borderColor: colors.solid,
      color: colors.ink,
      boxShadow: `0 3px 0 ${colors.edge}`,
    };
  }
  return {
    background: "var(--card)",
    borderColor: "var(--border)",
    boxShadow: "0 3px 0 var(--border)",
    opacity: state === "off" ? 0.55 : 1,
  };
}

function ResultMark({ ok, size = 22 }: { ok: boolean; size?: number }) {
  const colors = tone(ok ? "ok" : "bad");
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, background: colors.solid }}
      aria-label={ok ? t("Correcto") : t("Incorrecto")}
    >
      {ok ? (
        <CheckIcon style={{ width: size * 0.64, height: size * 0.64 }} strokeWidth={3.4} aria-hidden="true" />
      ) : (
        <XIcon style={{ width: size * 0.64, height: size * 0.64 }} strokeWidth={3.4} aria-hidden="true" />
      )}
    </span>
  );
}

function ItemCard({ number, title, children }: { number: number; title: ReactNode; children: ReactNode }) {
  return (
    <div className="ica-panel p-4">
      <div className="mb-3 flex items-start gap-3">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
          style={{ background: "var(--ica-gold-soft)", color: "var(--ica-gold-ink)" }}
        >
          {number}
        </span>
        <p className="m-0 min-w-0 flex-1 pt-0.5 text-[15px] leading-snug font-bold">{title}</p>
      </div>
      {children}
    </div>
  );
}

/* Ejercicio de foco (fase Entrenado): los tres bloques + resultado.
   Lo usan el alumno (guarda su intento) y el coach (vista previa, sin guardar). */

export type CoachingFocusExerciseResult = {
  scoreCorrect: number;
  scoreTotal: number;
  scoreThreshold: number;
  passed: boolean;
  blockScores: Array<{ id: string; title: string; got: number; max: number }>;
  tagScores: Array<{ tag: string; ok: number; total: number }>;
  failures: Array<{
    block: string;
    question: string;
    mine: string;
    expected: string;
    why: string;
  }>;
  /** Todas las respuestas, acertadas o no: el coach ve el ejercicio tal y como lo hizo el alumno. */
  answers: CoachingV2AttemptAnswer[];
};

type UnitMeta = {
  key: string;
  tags: string[];
  blockId: "reconocer" | "construir" | "conversacion";
};

type CoachingFocusExerciseRunnerProps = {
  data: ExerciseData;
  /** Se llama al terminar. Devuelve el mensaje a mostrar (o null). Sin ella, no se guarda nada (vista previa). */
  onComplete?: (result: CoachingFocusExerciseResult) => Promise<string | null>;
};

export function CoachingFocusExerciseRunner({
  data,
  onComplete,
}: CoachingFocusExerciseRunnerProps) {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Record<string, boolean>>({});
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [written, setWritten] = useState<Record<string, string>>({});
  const [said, setSaid] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, boolean>>({});
  const [found, setFound] = useState<Record<string, string | null>>({});
  const [attemptSaving, setAttemptSaving] = useState(false);
  const [attemptSaved, setAttemptSaved] = useState(false);
  const [attemptFeedback, setAttemptFeedback] = useState<string | null>(null);
  const ctx = useMemo(() => correctorContextOf(data), [data]);

  useEffect(() => {
    setStep(0);
    setScores({});
    setAnswered({});
    setPicked({});
    setWritten({});
    setSaid({});
    setWarnings({});
    setFound({});
    setAttemptSaved(false);
    setAttemptSaving(false);
    setAttemptFeedback(null);
  }, [data]);

  const blockList = useMemo(() => {
    if (!data) return [];
    return [
      {
        id: "reconocer" as const,
        titulo: data.reconocer.titulo,
        instruccion: data.reconocer.instruccion,
      },
      {
        id: "construir" as const,
        titulo: data.construir.titulo,
        instruccion: data.construir.instruccion,
      },
      {
        id: "conversacion" as const,
        titulo: data.conversacion.titulo,
        instruccion: data.conversacion.instruccion,
      },
    ];
  }, [data]);

  const itemKey = (blockIndex: number, itemIndex: number) =>
    `${blockIndex}.${itemIndex}`;
  const unitKey = (
    blockIndex: number,
    itemIndex: number,
    unitIndex?: number,
  ) =>
    typeof unitIndex === "number"
      ? `${blockIndex}.${itemIndex}.${unitIndex}`
      : `${blockIndex}.${itemIndex}`;

  const allUnits = useMemo<UnitMeta[]>(() => {
    if (!data) return [];
    const out: UnitMeta[] = [];
    data.reconocer.items.forEach((item, idx) => {
      out.push({ key: unitKey(0, idx), tags: item.tags, blockId: "reconocer" });
    });
    data.construir.items.forEach((item, idx) => {
      item.verbos.forEach((verb, verbIdx) => {
        out.push({
          key: unitKey(1, idx, verbIdx),
          tags: verb.tags,
          blockId: "construir",
        });
      });
    });
    data.conversacion.items.forEach((item, idx) => {
      out.push({
        key: unitKey(2, idx),
        tags: item.tags,
        blockId: "conversacion",
      });
    });
    return out;
  }, [data]);

  const currentBlock = blockList[step] || null;

  const answerReco = (itemIndex: number, optionIndex: number) => {
    if (!data) return;
    const key = itemKey(0, itemIndex);
    if (answered[key]) return;
    const item = data.reconocer.items[itemIndex];
    const selected = item.options[optionIndex];
    if (!selected) return;
    setPicked((prev) => ({ ...prev, [key]: optionIndex }));
    setScores((prev) => ({ ...prev, [unitKey(0, itemIndex)]: selected.ok }));
    setSaid((prev) => ({ ...prev, [unitKey(0, itemIndex)]: selected.t }));
    setAnswered((prev) => ({ ...prev, [key]: true }));
  };

  const evaluateBuildItem = (itemIndex: number) => {
    if (!data) return;
    const key = itemKey(1, itemIndex);
    if (answered[key]) return;
    const raw = (written[key] || "").trim();
    if (!raw) {
      setWarnings((prev) => ({ ...prev, [key]: true }));
      return;
    }

    const item = data.construir.items[itemIndex];
    const result: Record<string, boolean> = {};
    const hits: Record<string, string | null> = {};
    item.verbos.forEach((verb, verbIdx) => {
      const k = unitKey(1, itemIndex, verbIdx);
      const hit = findBuildVerbMatch(raw, verb, ctx);
      result[k] = Boolean(hit);
      hits[k] = hit || detectWrongBuildCandidate(raw, verb, ctx);
    });

    setScores((prev) => ({ ...prev, ...result }));
    setFound((prev) => ({ ...prev, ...hits }));
    setSaid((prev) => ({ ...prev, [key]: raw }));
    setAnswered((prev) => ({ ...prev, [key]: true }));
    setWarnings((prev) => ({ ...prev, [key]: false }));
  };

  const dialogCanSubmit = Boolean(
    data &&
    data.conversacion.items.every((_, idx) => {
      const key = unitKey(2, idx);
      return (written[key] || "").trim().length > 0;
    }),
  );

  const dialogSubmitted = Boolean(
    data && data.conversacion.items.some((_, idx) => answered[itemKey(2, idx)]),
  );

  const submitDialog = () => {
    if (!data || dialogSubmitted || !dialogCanSubmit) return;

    const nextScores: Record<string, boolean> = {};
    const nextAnswered: Record<string, boolean> = {};
    const nextSaid: Record<string, string> = {};

    data.conversacion.items.forEach((item, idx) => {
      const key = unitKey(2, idx);
      const raw = (written[key] || "").trim();
      const ok = scoreDialogItem(raw, item, ctx);
      nextScores[key] = ok;
      nextAnswered[itemKey(2, idx)] = true;
      nextSaid[key] = raw || "en blanco";
    });

    setScores((prev) => ({ ...prev, ...nextScores }));
    setAnswered((prev) => ({ ...prev, ...nextAnswered }));
    setSaid((prev) => ({ ...prev, ...nextSaid }));
  };

  const blockDone = useMemo(() => {
    if (!data || !currentBlock) return false;
    if (currentBlock.id === "reconocer") {
      return data.reconocer.items.every((_, idx) => answered[itemKey(0, idx)]);
    }
    if (currentBlock.id === "construir") {
      return data.construir.items.every((_, idx) => answered[itemKey(1, idx)]);
    }
    return data.conversacion.items.every((_, idx) => answered[itemKey(2, idx)]);
  }, [answered, currentBlock, data]);

  const totalUnits = allUnits.length;
  const correctCount = allUnits.filter((unit) => scores[unit.key]).length;
  const passed = Boolean(data && correctCount >= data.umbral);

  const blockScore = useMemo(() => {
    if (!data)
      return [] as Array<{
        id: string;
        title: string;
        got: number;
        max: number;
      }>;
    const summarize = (blockId: UnitMeta["blockId"], title: string) => {
      const units = allUnits.filter((unit) => unit.blockId === blockId);
      return {
        id: blockId,
        title,
        got: units.filter((unit) => scores[unit.key]).length,
        max: units.length,
      };
    };
    return [
      summarize("reconocer", data.reconocer.titulo),
      summarize("construir", data.construir.titulo),
      summarize("conversacion", data.conversacion.titulo),
    ];
  }, [allUnits, data, scores]);

  const tagScore = useMemo(() => {
    if (!data) return [] as Array<{ tag: string; ok: number; total: number }>;
    const map = new Map<string, { ok: number; total: number }>();
    allUnits.forEach((unit) => {
      unit.tags.forEach((tag) => {
        const row = map.get(tag) || { ok: 0, total: 0 };
        row.total += 1;
        if (scores[unit.key]) row.ok += 1;
        map.set(tag, row);
      });
    });

    return Array.from(map.entries())
      .map(([tag, value]) => ({ tag, ok: value.ok, total: value.total }))
      .sort(
        (a, b) => a.ok / Math.max(1, a.total) - b.ok / Math.max(1, b.total),
      );
  }, [allUnits, data, scores]);

  const failures = useMemo(() => {
    if (!data)
      return [] as Array<{
        block: string;
        question: string;
        mine: string;
        expected: string;
        why: string;
      }>;
    const out: Array<{
      block: string;
      question: string;
      mine: string;
      expected: string;
      why: string;
    }> = [];

    data.reconocer.items.forEach((item, idx) => {
      const key = unitKey(0, idx);
      if (scores[key] !== false) return;
      out.push({
        block: data.reconocer.titulo,
        question: item.lead,
        mine: said[key] || "—",
        expected: item.options.find((option) => option.ok)?.t || "—",
        why: item.options.find((option) => option.ok)?.why || "",
      });
    });

    data.construir.items.forEach((item, idx) => {
      item.verbos.forEach((verb, verbIdx) => {
        const key = unitKey(1, idx, verbIdx);
        if (scores[key] !== false) return;
        out.push({
          block: data.construir.titulo,
          question: item.situacion,
          mine: said[itemKey(1, idx)] || "—",
          expected: `${verb.nombre}: ${readablePattern(verb.formas[0] || "") || "—"}`,
          why: verb.nota,
        });
      });
    });

    data.conversacion.items.forEach((item, idx) => {
      const key = unitKey(2, idx);
      if (scores[key] !== false) return;
      out.push({
        block: data.conversacion.titulo,
        question: `Hueco ${idx + 1} (${item.verbo})`,
        mine: said[key] || "—",
        expected: item.show || item.formas[0] || "—",
        why: item.why,
      });
    });

    return out;
  }, [data, said, scores]);

  const answers = useMemo(() => {
    const out: CoachingV2AttemptAnswer[] = [];
    data.reconocer.items.forEach((item, idx) => {
      const key = unitKey(0, idx);
      out.push({
        block: "reconocer",
        itemIndex: idx,
        blockTitle: data.reconocer.titulo,
        question: item.lead,
        mine: said[key] || "—",
        expected: item.options.find((option) => option.ok)?.t || "—",
        ok: Boolean(scores[key]),
      });
    });
    data.construir.items.forEach((item, idx) => {
      item.verbos.forEach((verb, verbIdx) => {
        const key = unitKey(1, idx, verbIdx);
        out.push({
          block: "construir",
          itemIndex: idx,
          unitIndex: verbIdx,
          blockTitle: data.construir.titulo,
          question: item.situacion,
          unit: verb.nombre,
          mine: said[itemKey(1, idx)] || "—",
          found: found[key] || null,
          expected: readablePattern(verb.formas[0] || "") || "—",
          ok: Boolean(scores[key]),
        });
      });
    });
    data.conversacion.items.forEach((item, idx) => {
      const key = unitKey(2, idx);
      out.push({
        block: "conversacion",
        itemIndex: idx,
        blockTitle: data.conversacion.titulo,
        question: `Hueco ${idx + 1} (${item.verbo})`,
        mine: said[key] || "—",
        expected: item.show || item.formas[0] || "—",
        ok: Boolean(scores[key]),
      });
    });
    return out;
  }, [data, found, said, scores]);

  useEffect(() => {
    if (step !== 3 || attemptSaved || attemptSaving || !onComplete) return;
    setAttemptSaving(true);
    setAttemptFeedback(null);
    void onComplete({
      scoreCorrect: correctCount,
      scoreTotal: totalUnits,
      scoreThreshold: data.umbral,
      passed,
      blockScores: blockScore,
      tagScores: tagScore,
      failures,
      answers,
    })
      .then((message) => {
        setAttemptSaved(true);
        setAttemptFeedback(message);
      })
      .catch((err) => {
        setAttemptFeedback(
          err instanceof Error
            ? err.message
            : t("No se pudo guardar el resultado del ejercicio."),
        );
      })
      .finally(() => {
        setAttemptSaving(false);
      });
  }, [
    answers,
    attemptSaved,
    attemptSaving,
    blockScore,
    correctCount,
    data.umbral,
    failures,
    onComplete,
    passed,
    step,
    tagScore,
    totalUnits,
  ]);


  const resetAll = () => {
    setStep(0);
    setScores({});
    setAnswered({});
    setPicked({});
    setWritten({});
    setSaid({});
    setWarnings({});
    setFound({});
    setAttemptSaved(false);
    setAttemptFeedback(null);
  };

  // Speakers of the conversation in order of appearance: the first one on the left, the rest on the right.
  const firstSpeaker = data.conversacion.lineas[0]?.quien || "";

  return (
    <div className="flex flex-col gap-4">
      {/* Progress by block */}
      <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label={t("Bloques del ejercicio")}>
        {blockList.map((block, idx) => {
          const done = idx < step;
          const current = idx === step && step < 3;
          return (
            <li key={block.id} className="min-w-0" aria-current={current ? "step" : undefined}>
              <span
                className="block h-2 rounded-full transition-colors"
                style={{
                  background: done ? "var(--ica-ok)" : current ? "var(--ica-gold)" : "var(--muted)",
                }}
              />
              <p
                className="m-0 mt-1.5 flex items-center gap-1 text-[11px] font-extrabold tracking-[0.06em] uppercase"
                style={{
                  color: done ? "var(--ica-ok-ink)" : current ? "var(--ica-gold-ink)" : "var(--muted-foreground)",
                }}
              >
                {done ? <CheckIcon className="size-3" strokeWidth={3.4} aria-hidden="true" /> : null}
                {t("Bloque {n}", { n: idx + 1 })}
              </p>
              <p className="m-0 truncate text-sm font-bold">{block.titulo}</p>
            </li>
          );
        })}
      </ol>

      {step < 3 && currentBlock ? (
        <div>
          <h2 className="m-0 font-display text-xl leading-tight font-extrabold tracking-tight">
            {currentBlock.titulo}
          </h2>
          {currentBlock.instruccion ? (
            <p className="m-0 mt-1 text-sm font-semibold text-muted-foreground">{currentBlock.instruccion}</p>
          ) : null}
        </div>
      ) : null}

      {step < 3 && currentBlock?.id === "reconocer" && (
        <div className="flex flex-col gap-3">
          {data.reconocer.items.map((item, itemIdx) => {
            const key = itemKey(0, itemIdx);
            const selectedIndex = picked[key];
            const isDone = Boolean(answered[key]);
            const pickedOk = isDone && Boolean(item.options[selectedIndex]?.ok);
            return (
              <ItemCard key={key} number={itemIdx + 1} title={item.lead}>
                <div className="flex flex-col gap-2">
                  {item.options.map((option, optionIdx) => {
                    const state: AnswerState = !isDone
                      ? "idle"
                      : option.ok
                        ? "ok"
                        : selectedIndex === optionIdx
                          ? "no"
                          : "off";
                    return (
                      <button
                        key={`${key}-${optionIdx}`}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-bold transition-colors",
                          isDone ? "cursor-default" : "ica-press hover:border-[var(--ica-gold-edge)]",
                        )}
                        style={answerStyle(state)}
                        onClick={() => answerReco(itemIdx, optionIdx)}
                        disabled={isDone}
                      >
                        <span className="min-w-0 flex-1">{option.t}</span>
                        {state === "ok" || state === "no" ? <ResultMark ok={state === "ok"} /> : null}
                      </button>
                    );
                  })}
                </div>
                {isDone && item.options[selectedIndex]?.why ? (
                  <p
                    className="m-0 mt-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold"
                    style={{ background: tone(pickedOk ? "ok" : "bad").soft, color: tone(pickedOk ? "ok" : "bad").ink }}
                  >
                    {item.options[selectedIndex]?.why}
                  </p>
                ) : null}
              </ItemCard>
            );
          })}
        </div>
      )}

      {step < 3 && currentBlock?.id === "construir" && (
        <div className="flex flex-col gap-3">
          {data.construir.items.map((item, itemIdx) => {
            const key = itemKey(1, itemIdx);
            const isDone = Boolean(answered[key]);
            return (
              <ItemCard key={key} number={itemIdx + 1} title={item.situacion}>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {item.verbos.map((verb, verbIdx) => {
                    const ok = scores[unitKey(1, itemIdx, verbIdx)];
                    return (
                      <Pill
                        key={`${key}-verb-${verbIdx}`}
                        tone={typeof ok === "boolean" ? (ok ? "ok" : "bad") : "gold"}
                        className="inline-flex items-center gap-1"
                      >
                        {typeof ok === "boolean" ? (
                          ok ? (
                            <CheckIcon className="size-3" strokeWidth={3.4} aria-hidden="true" />
                          ) : (
                            <XIcon className="size-3" strokeWidth={3.4} aria-hidden="true" />
                          )
                        ) : null}
                        {verb.nombre}
                      </Pill>
                    );
                  })}
                </div>

                <label htmlFor={`${key}-input`} className="sr-only">
                  {t("Respuesta libre del item {n}", { n: itemIdx + 1 })}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`${key}-input`}
                    value={written[key] || ""}
                    onChange={(event) =>
                      setWritten((prev) => ({
                        ...prev,
                        [key]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !isDone) evaluateBuildItem(itemIdx);
                    }}
                    placeholder={t("Escribe tu frase")}
                    disabled={isDone}
                    className="h-12 flex-1 rounded-2xl text-base font-semibold"
                  />
                  {!isDone ? (
                    <Button type="button" variant="gold" size="lg" className="h-12 rounded-2xl" onClick={() => evaluateBuildItem(itemIdx)}>
                      {t("Comprobar")}
                    </Button>
                  ) : null}
                </div>
                {!isDone && warnings[key] ? (
                  <p className="m-0 mt-2 text-xs font-bold" style={{ color: "var(--ica-bad-ink)" }}>
                    {t("Escribe una respuesta antes de comprobar.")}
                  </p>
                ) : null}

                {isDone && (
                  <div className="mt-3 flex flex-col gap-2">
                    {item.verbos.map((verb, verbIdx) => {
                      const ok = Boolean(scores[unitKey(1, itemIdx, verbIdx)]);
                      const hit = found[unitKey(1, itemIdx, verbIdx)];
                      const good = readablePattern(verb.formas[0] || "");
                      const okInk = tone("ok").ink;
                      const badInk = tone("bad").ink;
                      return (
                        <div key={`${key}-feedback-${verbIdx}`} className="flex items-start gap-2.5 text-sm font-semibold">
                          <ResultMark ok={ok} size={20} />
                          <p className="m-0 min-w-0 flex-1 text-muted-foreground">
                            {ok ? (
                              <>
                                {t("En tu frase:")}{" "}
                                <b className="font-extrabold" style={{ color: okInk }}>«{hit}»</b>. {verb.nota}
                              </>
                            ) : (
                              <>
                                {hit ? (
                                  <>
                                    {t("Has escrito")}{" "}
                                    <b className="font-extrabold" style={{ color: badInk }}>«{hit}»</b>.{" "}
                                  </>
                                ) : (
                                  t("No encuentro esta forma en tu frase.") + " "
                                )}
                                {t("Aquí va")}{" "}
                                <b className="font-extrabold" style={{ color: okInk }}>{good}</b>. {verb.nota}
                              </>
                            )}
                          </p>
                        </div>
                      );
                    })}
                    {item.ejemplo ? (
                      <div
                        className="flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold"
                        style={{ background: "var(--ica-gold-soft)", color: "var(--ica-gold-ink)" }}
                      >
                        <LightbulbIcon className="mt-0.5 size-4 shrink-0" strokeWidth={2.6} aria-hidden="true" />
                        <p className="m-0">
                          {t("Una forma de decirlo entre muchas (el resto de palabras es libre):")}{" "}
                          <span className="font-extrabold text-foreground">{item.ejemplo}</span>
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </ItemCard>
            );
          })}
        </div>
      )}

      {step < 3 && currentBlock?.id === "conversacion" && (
        <div className="flex flex-col gap-3">
          <div className="ica-panel flex flex-col gap-3 p-4">
            {data.conversacion.lineas.map((line, lineIdx) => {
              const mine = line.quien !== firstSpeaker;
              return (
                <div key={`line-${lineIdx}`} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <span className="mb-1 px-1 text-[11px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
                    {line.quien}
                  </span>
                  <div
                    className={cn(
                      "max-w-[92%] rounded-3xl px-4 py-2.5 text-[15px] leading-loose font-semibold",
                      mine ? "rounded-tr-lg" : "rounded-tl-lg",
                    )}
                    style={{ background: mine ? "var(--ica-i-soft)" : "var(--muted)" }}
                  >
                    {line.texto.split(/(\{\d+\})/g).map((part, partIdx) => {
                      const match = part.match(/^\{(\d+)\}$/);
                      if (!match) return <span key={`${lineIdx}-${partIdx}`}>{part}</span>;
                      const index = Number(match[1]);
                      const item = data.conversacion.items[index];
                      if (!item) return <span key={`${lineIdx}-${partIdx}`}>{part}</span>;
                      const key = unitKey(2, index);
                      const result = scores[key];
                      const state: AnswerState = result === true ? "ok" : result === false ? "no" : "idle";
                      return (
                        <span key={`${lineIdx}-${partIdx}`} className="mx-0.5 inline-flex flex-wrap items-center gap-1 align-middle">
                          <Input
                            value={written[key] || ""}
                            onChange={(event) =>
                              setWritten((prev) => ({
                                ...prev,
                                [key]: event.target.value,
                              }))
                            }
                            placeholder={item.verbo}
                            disabled={dialogSubmitted}
                            className="inline-block h-9 w-36 rounded-xl border-2 px-2.5 text-center text-[15px] font-bold disabled:opacity-100"
                            style={answerStyle(state)}
                            aria-label={t("Hueco {n} ({verb})", { n: index + 1, verb: item.verbo })}
                          />
                          {result === false ? (
                            <span className="text-sm font-extrabold" style={{ color: tone("ok").ink }}>
                              {item.show || item.formas[0]}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {!dialogSubmitted ? (
            <Button type="button" variant="gold" size="xl" className="w-full" onClick={submitDialog} disabled={!dialogCanSubmit}>
              {dialogCanSubmit ? t("Corregir conversacion") : t("Completa todos los huecos")}
            </Button>
          ) : (
            data.conversacion.items.some((_, idx) => scores[unitKey(2, idx)] === false) && (
              <div className="flex flex-col gap-2">
                {data.conversacion.items.map((item, idx) =>
                  scores[unitKey(2, idx)] === false ? (
                    <div key={`dialog-why-${idx}`} className="flex items-start gap-2.5 text-sm font-semibold">
                      <ResultMark ok={false} size={20} />
                      <p className="m-0 min-w-0 flex-1 text-muted-foreground">
                        <b className="font-extrabold" style={{ color: tone("ok").ink }}>
                          {item.show || item.formas[0]}
                        </b>{" "}
                        · {item.why}
                      </p>
                    </div>
                  ) : null,
                )}
              </div>
            )
          )}
        </div>
      )}

      {step < 3 && (
        <Button
          type="button"
          variant={blockDone ? "gold" : "outline"}
          size="xl"
          className="w-full"
          onClick={() => setStep((prev) => prev + 1)}
          disabled={!blockDone}
        >
          {blockDone
            ? step === 2
              ? t("Ver resultado")
              : t("Seguir a {block}", { block: blockList[step + 1]?.titulo || t("siguiente bloque") })
            : t("Responde todo el bloque para continuar")}
          {blockDone ? <ArrowRightIcon strokeWidth={2.8} aria-hidden="true" /> : null}
        </Button>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          {/* Score */}
          <div
            className="rounded-3xl px-5 py-5"
            style={{ background: tone(passed ? "ok" : "bad").soft }}
          >
            <div className="flex items-center gap-4">
              <span
                className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-white"
                style={{ background: tone(passed ? "ok" : "bad").solid, boxShadow: `0 4px 0 ${tone(passed ? "ok" : "bad").edge}` }}
              >
                {passed ? (
                  <CheckIcon className="size-8" strokeWidth={3.2} aria-hidden="true" />
                ) : (
                  <TargetIcon className="size-8" strokeWidth={2.6} aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1" style={{ color: tone(passed ? "ok" : "bad").ink }}>
                <p className="m-0 font-display text-3xl leading-none font-black tabular-nums">
                  {t("{n} de {total}", { n: correctCount, total: totalUnits })}
                </p>
                <p className="m-0 mt-1.5 text-sm font-bold">
                  {passed
                    ? t("Superado: necesitabas {need} de {total}. El foco pasa a Entrenado.", { need: data.umbral, total: totalUnits })
                    : t("No superado: te faltan {n} aciertos para llegar a {need} de {total}. Repásalo y vuelve a intentarlo.", { n: Math.max(0, data.umbral - correctCount), need: data.umbral, total: totalUnits })}
                </p>
              </div>
            </div>
            <GameProgress
              className="mt-4"
              value={totalUnits ? correctCount / totalUnits : 0}
              color={tone(passed ? "ok" : "bad").solid}
              label={t("{n} de {total}", { n: correctCount, total: totalUnits })}
            />
            {attemptSaving || attemptFeedback ? (
              <p className="m-0 mt-3 text-xs font-bold text-muted-foreground">
                {attemptSaving ? t("Guardando tu resultado...") : attemptFeedback}
              </p>
            ) : null}
          </div>

          {/* By block */}
          <div>
            <SectionLabel>{t("Por bloque")}</SectionLabel>
            <div className="ica-panel flex flex-col gap-3 p-4">
              {blockScore.map((row) => (
                <div key={`block-score-${row.id}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-bold">
                    <span className="min-w-0 truncate">{row.title}</span>
                    <span className="shrink-0 tabular-nums">{row.got}/{row.max}</span>
                  </div>
                  <GameProgress
                    value={row.max ? row.got / row.max : 0}
                    height={10}
                    color={row.got === row.max ? "var(--ica-ok)" : "var(--ica-gold)"}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* By label */}
          {tagScore.length > 0 ? (
            <div>
              <SectionLabel>{t("Por etiqueta")}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {tagScore.map((row) => (
                  <Pill key={`tag-score-${row.tag}`} tone={row.ok === row.total ? "ok" : row.ok === 0 ? "bad" : "gold"}>
                    {data.etiquetas[row.tag] || row.tag} · {row.ok}/{row.total}
                  </Pill>
                ))}
              </div>
            </div>
          ) : null}

          {/* Mistakes */}
          <div>
            <SectionLabel>{t("Tus fallos")}</SectionLabel>
            {failures.length === 0 ? (
              <div className="ica-panel flex items-center gap-3 p-4">
                <ResultMark ok size={26} />
                <p className="m-0 text-sm font-bold">{t("No hubo fallos.")}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {failures.map((row, idx) => (
                  <div key={`failure-${idx}`} className="ica-panel p-4 text-sm">
                    <p className="ica-label m-0">{row.block}</p>
                    <p className="m-0 mt-1 font-bold">{displayQuestion(row.question)}</p>
                    <div className="mt-2 flex flex-col gap-1.5">
                      <p className="m-0 flex items-start gap-2 font-semibold" style={{ color: tone("bad").ink }}>
                        <ResultMark ok={false} size={18} />
                        <span className="min-w-0">{t("Escribiste: {answer}", { answer: displayAnswer(row.mine) })}</span>
                      </p>
                      <p className="m-0 flex items-start gap-2 font-semibold" style={{ color: tone("ok").ink }}>
                        <ResultMark ok size={18} />
                        <span className="min-w-0">{t("Esperado: {answer}", { answer: row.expected })}</span>
                      </p>
                    </div>
                    {row.why ? <p className="m-0 mt-2 text-xs font-semibold text-muted-foreground">{row.why}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="button" variant="outline" size="xl" className="w-full" onClick={resetAll}>
            <RotateCcwIcon strokeWidth={2.8} aria-hidden="true" />
            {t("Repetir ejercicio")}
          </Button>
        </div>
      )}
    </div>
  );
}
