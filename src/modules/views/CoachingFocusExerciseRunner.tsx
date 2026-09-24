import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  correctorContextOf,
  detectWrongBuildCandidate,
  findBuildVerbMatch,
  readablePattern,
  scoreDialogItem,
  type ExerciseData,
} from "./coachingV2ExerciseLogic";

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
    })
      .then((message) => {
        setAttemptSaved(true);
        setAttemptFeedback(message);
      })
      .catch((err) => {
        setAttemptFeedback(
          err instanceof Error
            ? err.message
            : "No se pudo guardar el resultado del ejercicio.",
        );
      })
      .finally(() => {
        setAttemptSaving(false);
      });
  }, [
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


  return (
    <div className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            {blockList.map((block, idx) => (
              <div
                key={block.id}
                className="rounded-md border border-primary/20 bg-card/80 p-2"
              >
                <p className="text-xs text-muted-foreground">
                  Bloque {idx + 1}
                </p>
                <p className="font-medium">{block.titulo}</p>
                <Badge variant={idx === step ? "default" : "outline"}>
                  {idx < step
                    ? "Respondido"
                    : idx === step
                      ? "Actual"
                      : "Pendiente"}
                </Badge>
              </div>
            ))}
          </div>

          {step < 3 && currentBlock?.id === "reconocer" && (
            <div className="space-y-4">
              {currentBlock.instruccion && (
                <p className="text-sm text-muted-foreground">
                  {currentBlock.instruccion}
                </p>
              )}
              {data.reconocer.items.map((item, itemIdx) => {
                const key = itemKey(0, itemIdx);
                const selectedIndex = picked[key];
                const isDone = Boolean(answered[key]);
                return (
                  <div
                    key={key}
                    className="rounded-md border border-primary/20 bg-card/80 p-3"
                  >
                    <p className="mb-2 text-sm font-medium">
                      {itemIdx + 1}. {item.lead}
                    </p>
                    <div className="space-y-2">
                      {item.options.map((option, optionIdx) => {
                        const state = !isDone
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
                            className={`w-full rounded-md border p-2 text-left text-sm ${
                              state === "ok"
                                ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100"
                                : state === "no"
                                  ? "border-rose-600 bg-rose-100 text-rose-950 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-100"
                                  : "border-border bg-background text-foreground"
                            }`}
                            onClick={() => answerReco(itemIdx, optionIdx)}
                            disabled={isDone}
                          >
                            {option.t}
                          </button>
                        );
                      })}
                    </div>
                    {isDone && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.options[selectedIndex]?.why || ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {step < 3 && currentBlock?.id === "construir" && (
            <div className="space-y-4">
              {currentBlock.instruccion && (
                <p className="text-sm text-muted-foreground">
                  {currentBlock.instruccion}
                </p>
              )}
              {data.construir.items.map((item, itemIdx) => {
                const key = itemKey(1, itemIdx);
                const isDone = Boolean(answered[key]);
                return (
                  <div
                    key={key}
                    className="rounded-md border border-primary/20 bg-card/80 p-3"
                  >
                    <p className="mb-2 text-sm font-medium">
                      {itemIdx + 1}. {item.situacion}
                    </p>

                    <div className="mb-2 flex flex-wrap gap-1">
                      {item.verbos.map((verb, verbIdx) => {
                        const ok = scores[unitKey(1, itemIdx, verbIdx)];
                        return (
                          <Badge
                            key={`${key}-verb-${verbIdx}`}
                            variant="outline"
                          >
                            {typeof ok === "boolean"
                              ? ok
                                ? "✓ "
                                : "✗ "
                              : ""}
                            {verb.nombre}
                          </Badge>
                        );
                      })}
                    </div>

                    <label htmlFor={`${key}-input`} className="sr-only">
                      Respuesta libre del item {itemIdx + 1}
                    </label>
                    <Input
                      id={`${key}-input`}
                      value={written[key] || ""}
                      onChange={(event) =>
                        setWritten((prev) => ({
                          ...prev,
                          [key]: event.target.value,
                        }))
                      }
                      placeholder="Escribe tu frase"
                      disabled={isDone}
                    />

                    {!isDone && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => evaluateBuildItem(itemIdx)}
                        >
                          Comprobar
                        </Button>
                        {warnings[key] && (
                          <p className="text-xs text-destructive">
                            Escribe una respuesta antes de comprobar.
                          </p>
                        )}
                      </div>
                    )}

                    {isDone && (
                      <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                        {item.verbos.map((verb, verbIdx) => {
                          const ok = scores[unitKey(1, itemIdx, verbIdx)];
                          return (
                            <p key={`${key}-feedback-${verbIdx}`}>
                              <span
                                className={
                                  ok
                                    ? "font-medium text-emerald-700 dark:text-emerald-300"
                                    : "font-medium text-rose-700 dark:text-rose-300"
                                }
                              >
                                {ok ? "✓ " : "✗ "}
                              </span>
                              {(() => {
                                const hit =
                                  found[unitKey(1, itemIdx, verbIdx)];
                                const good = readablePattern(
                                  verb.formas[0] || "",
                                );
                                if (ok) {
                                  return (
                                    <>
                                      En tu frase:{" "}
                                      <b className="font-medium text-emerald-700 dark:text-emerald-300">
                                        «{hit}»
                                      </b>
                                      . {verb.nota}
                                    </>
                                  );
                                }
                                return (
                                  <>
                                    {hit ? (
                                      <>
                                        Has escrito{" "}
                                        <b className="font-medium text-rose-700 dark:text-rose-300">
                                          «{hit}»
                                        </b>
                                        .{" "}
                                      </>
                                    ) : (
                                      "No encuentro esta forma en tu frase. "
                                    )}
                                    Aquí va{" "}
                                    <b className="font-medium text-emerald-700 dark:text-emerald-300">
                                      {good}
                                    </b>
                                    . {verb.nota}
                                  </>
                                );
                              })()}
                            </p>
                          );
                        })}
                        {item.ejemplo && (
                          <p className="rounded-md bg-muted p-2">
                            Una forma de decirlo entre muchas (el resto
                            de palabras es libre):{" "}
                            <span className="font-medium text-foreground">
                              {item.ejemplo}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {step < 3 && currentBlock?.id === "conversacion" && (
            <div className="space-y-4">
              {currentBlock.instruccion && (
                <p className="text-sm text-muted-foreground">
                  {currentBlock.instruccion}
                </p>
              )}

              <div className="space-y-3 rounded-md border bg-card/60 p-3">
                {data.conversacion.lineas.map((line, lineIdx) => (
                  <div
                    key={`line-${lineIdx}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="font-medium">{line.quien}:</span>
                    <span>
                      {line.texto
                        .split(/(\{\d+\})/g)
                        .map((part, partIdx) => {
                          const match = part.match(/^\{(\d+)\}$/);
                          if (!match)
                            return (
                              <span key={`${lineIdx}-${partIdx}`}>
                                {part}
                              </span>
                            );
                          const index = Number(match[1]);
                          const item = data.conversacion.items[index];
                          if (!item)
                            return (
                              <span key={`${lineIdx}-${partIdx}`}>
                                {part}
                              </span>
                            );
                          const key = unitKey(2, index);
                          const currentValue = written[key] || "";
                          const result = scores[key];
                          return (
                            <span
                              key={`${lineIdx}-${partIdx}`}
                              className="inline-flex items-center gap-1"
                            >
                              <Input
                                value={currentValue}
                                onChange={(event) =>
                                  setWritten((prev) => ({
                                    ...prev,
                                    [key]: event.target.value,
                                  }))
                                }
                                placeholder={item.verbo}
                                disabled={dialogSubmitted}
                                className={`inline-block h-8 w-36 text-foreground ${
                                  result === true
                                    ? "border-emerald-600 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100"
                                    : result === false
                                      ? "border-rose-600 bg-rose-100 text-rose-950 dark:border-rose-500 dark:bg-rose-950/60 dark:text-rose-100"
                                      : ""
                                }`}
                                aria-label={`Hueco ${index + 1} (${item.verbo})`}
                              />
                              {result === false && (
                                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                                  {item.show || item.formas[0]}
                                </span>
                              )}
                            </span>
                          );
                        })}
                    </span>
                  </div>
                ))}
              </div>

              {!dialogSubmitted && (
                <Button
                  type="button"
                  onClick={submitDialog}
                  disabled={!dialogCanSubmit}
                >
                  {dialogCanSubmit
                    ? "Corregir conversacion"
                    : "Completa todos los huecos"}
                </Button>
              )}

              {dialogSubmitted && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {data.conversacion.items.map((item, idx) =>
                    scores[unitKey(2, idx)] === false ? (
                      <p key={`dialog-why-${idx}`}>
                        <span className="font-medium text-foreground">
                          {item.show || item.formas[0]}
                        </span>{" "}
                        - {item.why}
                      </p>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          )}

          {step < 3 && (
            <Button
              type="button"
              onClick={() => setStep((prev) => prev + 1)}
              disabled={!blockDone}
            >
              {blockDone
                ? step === 2
                  ? "Ver resultado"
                  : `Seguir a ${blockList[step + 1]?.titulo || "siguiente bloque"}`
                : "Responde todo el bloque para continuar"}
            </Button>
          )}

          {step === 3 && (
            <div className="space-y-4 rounded-md border border-primary/20 bg-card/85 p-4 shadow-sm">
              {attemptSaving && (
                <p className="text-xs text-muted-foreground">
                  Guardando tu resultado...
                </p>
              )}
              {attemptFeedback && (
                <p className="text-xs text-muted-foreground">
                  {attemptFeedback}
                </p>
              )}
              <div>
                <p className="text-3xl font-semibold">
                  {correctCount} de {totalUnits}
                </p>
                <p className="text-sm text-muted-foreground">
                  {passed
                    ? `Superado. Umbral: ${data.umbral}.`
                    : `No superado. Te faltan ${Math.max(0, data.umbral - correctCount)} aciertos para llegar a ${data.umbral}.`}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Por bloque</p>
                {blockScore.map((row) => (
                  <p
                    key={`block-score-${row.id}`}
                    className="text-sm text-muted-foreground"
                  >
                    {row.title}: {row.got}/{row.max}
                  </p>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Por etiqueta</p>
                {tagScore.map((row) => (
                  <p
                    key={`tag-score-${row.tag}`}
                    className="text-sm text-muted-foreground"
                  >
                    {data.etiquetas[row.tag] || row.tag}: {row.ok}/
                    {row.total}
                  </p>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Tus fallos</p>
                {failures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hubo fallos.
                  </p>
                ) : (
                  failures.map((row, idx) => (
                    <div
                      key={`failure-${idx}`}
                      className="rounded-md border p-2 text-xs"
                    >
                      <p className="font-medium">{row.block}</p>
                      <p>{row.question}</p>
                      <p className="text-destructive">
                        Escribiste: {row.mine}
                      </p>
                      <p className="text-emerald-700 dark:text-emerald-300">
                        Esperado: {row.expected}
                      </p>
                      {row.why && (
                        <p className="text-muted-foreground">{row.why}</p>
                      )}
                    </div>
                  ))
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
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
                }}
              >
                Repetir ejercicio
              </Button>
            </div>
          )}
    </div>
  );
}
