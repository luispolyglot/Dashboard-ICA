import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRightIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { LANGUAGES } from "../constants";
import type { AppConfig } from "../types";

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

export function LangEditModal({
  config,
  setConfig,
  onClose,
}: LangEditModalProps) {
  const [recentLanguagePairs, setRecentLanguagePairs] = useState<
    RecentLanguagePair[]
  >([]);
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
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(RECENT_LANGUAGE_PAIRS_STORAGE_KEY);
      if (!raw) {
        setRecentLanguagePairs([]);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizeRecentLanguagePairs(parsed);
      setRecentLanguagePairs(normalized);
      window.localStorage.setItem(
        RECENT_LANGUAGE_PAIRS_STORAGE_KEY,
        JSON.stringify(normalized),
      );
    } catch {
      setRecentLanguagePairs([]);
    }
  }, []);

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar idiomas</DialogTitle>
          <DialogDescription>
            Actualiza tu idioma materno y objetivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Atajos rápidos
            </p>
            <p className="text-sm text-muted-foreground">
              Cambia entre pares recientes en un solo toque.
            </p>
            <div className="space-y-2">
              {quickLanguagePairs.map((pair) => {
                const isActive =
                  pair.nativeLang === config.nativeLang &&
                  pair.targetLang === config.targetLang;

                return (
                  <Button
                    key={`${pair.nativeLang}-${pair.targetLang}`}
                    type="button"
                    variant="outline"
                    className={`w-full justify-between ${
                      isActive
                        ? "border-emerald-500/55 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/45 dark:bg-emerald-900/20 dark:text-emerald-300"
                        : ""
                    }`}
                    disabled={isActive}
                    onClick={() => {
                      setConfig({
                        ...config,
                        nativeLang: pair.nativeLang,
                        targetLang: pair.targetLang,
                      });
                    }}
                  >
                    <span>{pair.nativeLang} -&gt; {pair.targetLang}</span>
                    {isActive ? (
                      <CheckIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ArrowLeftRightIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>Idioma materno</Label>
            <Select
              value={config.nativeLang}
              onValueChange={(nativeLang) =>
                setConfig({ ...config, nativeLang })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((language) => (
                  <SelectItem key={language} value={language}>
                    {language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Idioma objetivo</Label>
            <Select
              value={config.targetLang}
              onValueChange={(targetLang) =>
                setConfig({ ...config, targetLang })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTargetLanguages.map((language) => (
                  <SelectItem key={language} value={language}>
                    {language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
