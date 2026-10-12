import { getUiLang, langName, t } from '@/i18n'
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "../constants";
import { SectionLabel } from "../game/ui";
import type { AppConfig } from "../types";
import { LanguageCard, LanguageFlag, LanguageListPicker } from "./LanguagePicker";

type LangEditModalProps = {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  onClose: () => void;
};

type RecentLanguagePair = {
  nativeLang: string;
  targetLang: string;
  updatedAt: number;
};

// Qué se ve dentro de la ventana: el resumen o la lista para elegir un idioma
type PickerStep = "overview" | "target" | "native";

const RECENT_LANGUAGE_PAIRS_STORAGE_KEY = "dashboard-ICA-recent-language-pairs";
const MAX_RECENT_LANGUAGE_PAIRS = 4;

function isSameLanguagePair(
  first: Pick<RecentLanguagePair, "nativeLang" | "targetLang">,
  second: Pick<RecentLanguagePair, "nativeLang" | "targetLang">,
): boolean {
  return (
    first.nativeLang === second.nativeLang && first.targetLang === second.targetLang
  );
}

function normalizeRecentLanguagePairs(value: unknown): RecentLanguagePair[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .filter((item): item is RecentLanguagePair => {
      if (!item || typeof item !== "object") return false;
      const maybePair = item as Partial<RecentLanguagePair>;
      return (
        typeof maybePair.nativeLang === "string" &&
        maybePair.nativeLang.trim() !== "" &&
        typeof maybePair.targetLang === "string" &&
        maybePair.targetLang.trim() !== "" &&
        maybePair.nativeLang !== maybePair.targetLang &&
        typeof maybePair.updatedAt === "number" &&
        Number.isFinite(maybePair.updatedAt)
      );
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const deduped: RecentLanguagePair[] = [];
  for (const pair of normalized) {
    if (deduped.some((item) => isSameLanguagePair(item, pair))) continue;
    deduped.push(pair);
    if (deduped.length === MAX_RECENT_LANGUAGE_PAIRS) break;
  }

  return deduped;
}

function persistRecentLanguagePairs(pairs: RecentLanguagePair[]): RecentLanguagePair[] {
  const normalized = normalizeRecentLanguagePairs(pairs);
  if (typeof window === "undefined") return normalized;

  try {
    window.localStorage.setItem(
      RECENT_LANGUAGE_PAIRS_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch {}

  return normalized;
}

function readRecentLanguagePairs(): RecentLanguagePair[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_LANGUAGE_PAIRS_STORAGE_KEY);
    return raw ? normalizeRecentLanguagePairs(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

/**
 * IDIOMAS: el que aprendes y tu idioma nativo en dos tarjetas grandes con bandera.
 * Al tocar una se abre la lista (con buscador) dentro de la misma ventana.
 * Debajo, los pares recientes para cambiar en un toque.
 */
export function LangEditModal({
  config,
  setConfig,
  onClose,
}: LangEditModalProps) {
  // Se leen al momento (antes de pintar) para que «Cambio rápido» salga a la vez que el resto.
  const [recentLanguagePairs, setRecentLanguagePairs] = useState<
    RecentLanguagePair[]
  >(readRecentLanguagePairs);
  const [step, setStep] = useState<PickerStep>("overview");
  const previousConfigRef = useRef<AppConfig | null>(null);

  const availableTargetLanguages = useMemo(
    () => LANGUAGES.filter((language) => language !== config.nativeLang),
    [config.nativeLang],
  );

  const quickLanguagePairs = useMemo(() => {
    const activePair = {
      nativeLang: config.nativeLang,
      targetLang: config.targetLang,
      updatedAt: Date.now(),
    };

    return [
      activePair,
      ...recentLanguagePairs.filter(
        (pair) => !isSameLanguagePair(pair, activePair),
      ),
    ];
  }, [config.nativeLang, config.targetLang, recentLanguagePairs]);

  useEffect(() => {
    const previousConfig = previousConfigRef.current;

    if (previousConfig && !isSameLanguagePair(previousConfig, config)) {
      setRecentLanguagePairs((currentPairs) =>
        persistRecentLanguagePairs([
          {
            nativeLang: previousConfig.nativeLang,
            targetLang: previousConfig.targetLang,
            updatedAt: Date.now(),
          },
          ...currentPairs,
        ]),
      );
    }

    previousConfigRef.current = config;
  }, [config]);

  useEffect(() => {
    if (availableTargetLanguages.includes(config.targetLang)) return;
    const nextTargetLang = availableTargetLanguages[0] ?? "";
    if (nextTargetLang === config.targetLang) return;
    setConfig({ ...config, targetLang: nextTargetLang });
  }, [availableTargetLanguages, config, setConfig]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 sm:max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{t("Tus idiomas")}</DialogTitle>
          <DialogDescription>
            {t("Elige el idioma que aprendes y tu idioma nativo.")}
          </DialogDescription>
        </DialogHeader>

        {step === "target" ? (
          <LanguageListPicker
            title={t("¿Qué idioma aprendes?")}
            value={config.targetLang}
            options={availableTargetLanguages}
            listClassName="max-h-[52dvh]"
            onBack={() => setStep("overview")}
            onPick={(targetLang) => {
              setConfig({ ...config, targetLang });
              setStep("overview");
            }}
          />
        ) : step === "native" ? (
          <LanguageListPicker
            title={t("¿Cuál es tu idioma nativo?")}
            value={config.nativeLang}
            options={LANGUAGES}
            listClassName="max-h-[52dvh]"
            onBack={() => setStep("overview")}
            onPick={(nativeLang) => {
              setConfig({ ...config, nativeLang });
              setStep("overview");
            }}
          />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <LanguageCard
                label={t("Aprendes")}
                language={config.targetLang}
                tone="primary"
                onClick={() => setStep("target")}
              />
              <LanguageCard
                label={t("Tu idioma nativo")}
                language={config.nativeLang}
                onClick={() => setStep("native")}
              />
            </div>

            {quickLanguagePairs.length > 1 ? (
              <div>
                <SectionLabel>{t("Cambio rápido")}</SectionLabel>
                <div className="flex flex-col gap-2">
                  {quickLanguagePairs.map((pair) => {
                    const isActive =
                      pair.nativeLang === config.nativeLang &&
                      pair.targetLang === config.targetLang;

                    return (
                      <button
                        key={`${pair.nativeLang}-${pair.targetLang}`}
                        type="button"
                        disabled={isActive}
                        onClick={() => {
                          setConfig({
                            ...config,
                            nativeLang: pair.nativeLang,
                            targetLang: pair.targetLang,
                          });
                        }}
                        className={cn(
                          "ica-press flex min-h-13 w-full items-center gap-2.5 rounded-2xl border-2 px-3 py-2 text-left",
                          !isActive &&
                            "border-border bg-card hover:bg-muted/60 dark:bg-transparent",
                        )}
                        style={
                          isActive
                            ? {
                                background: "var(--ica-ok-soft)",
                                borderColor:
                                  "color-mix(in oklab, var(--ica-ok) 55%, transparent)",
                              }
                            : { boxShadow: "0 3px 0 var(--border)" }
                        }
                        aria-label={t("{native} a {target}", { native: langName(pair.nativeLang), target: langName(pair.targetLang) })}
                      >
                        <LanguageFlag language={pair.nativeLang} size={28} />
                        <ArrowRightIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          strokeWidth={2.6}
                          aria-hidden="true"
                        />
                        <LanguageFlag language={pair.targetLang} size={28} />
                        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">
                          {langName(pair.targetLang)}
                          <span className="font-bold text-muted-foreground">
                            {" "}
                            {t("desde {lang}", {
                              lang: getUiLang() === "en" ? langName(pair.nativeLang) : pair.nativeLang.toLowerCase(),
                            })}
                          </span>
                        </span>
                        {isActive ? (
                          <span
                            className="flex size-7 shrink-0 items-center justify-center rounded-full text-white"
                            style={{ background: "var(--ica-ok)" }}
                          >
                            <CheckIcon className="size-4" strokeWidth={3} aria-hidden="true" />
                            <span className="sr-only">{t("Activo")}</span>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <Button type="button" size="xl" className="w-full" onClick={onClose}>
              {t("Guardar")}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
