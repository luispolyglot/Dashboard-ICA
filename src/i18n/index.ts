import { Fragment, createElement, useSyncExternalStore, type ReactNode } from 'react'

/**
 * Idioma de la interfaz.
 * - La interfaz sale en el idioma NATIVO del alumno: español (o catalán) → español; cualquier otro → inglés.
 *   (Por ahora solo hay español e inglés.)
 * - Los textos se escriben en español dentro del código, envueltos en t('…'). El español es la "llave":
 *   si la interfaz va en inglés, t() busca la traducción en los diccionarios de src/i18n/en/*.ts.
 *   Si falta una traducción, sale el español (nunca se rompe nada).
 * - Variables: t('Te faltan {n} para {nivel}', { n: 5, nivel: 'B1' }).
 */

export type UiLang = 'es' | 'en'

const STORAGE_KEY = 'ica-ui-lang-v1'

// Todos los diccionarios en inglés: un archivo por zona de la app (src/i18n/en/inicio.ts, perfil.ts…).
const modules = import.meta.glob<{ default: Record<string, string> }>('./en/*.ts', { eager: true })
const EN: Record<string, string> = Object.assign({}, ...Object.values(modules).map((mod) => mod.default))

function readInitial(): UiLang {
  // En los tests, siempre español (los textos de las pruebas están en español).
  if (import.meta.env.MODE === 'test') return 'es'
  try {
    // ?lang=en o ?lang=es en la dirección: útil para probar la otra versión.
    const fromUrl = new URLSearchParams(window.location.search).get('lang')
    if (fromUrl === 'es' || fromUrl === 'en') {
      window.localStorage.setItem(STORAGE_KEY, fromUrl)
      return fromUrl
    }
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    // Sin almacenamiento: español.
  }
  // La primera vez (login, registro…) siempre en español. Al entrar, manda el idioma nativo del alumno.
  return 'es'
}

let current: UiLang = typeof window === 'undefined' ? 'es' : readInitial()
const listeners = new Set<() => void>()

if (typeof document !== 'undefined') document.documentElement.lang = current

/** Idioma de la interfaz que toca según el idioma nativo guardado en la configuración ("Español", "Polaco"…). */
export function uiLangForNative(nativeLang: string | null | undefined): UiLang {
  if (!nativeLang) return current
  const normalized = nativeLang.trim().toLowerCase()
  return normalized === 'español' || normalized === 'catalán' ? 'es' : 'en'
}

export function getUiLang(): UiLang {
  return current
}

export function setUiLang(lang: UiLang): void {
  if (lang === current) return
  current = lang
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Sin almacenamiento: dura hasta recargar.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Idioma actual (y repinta el componente cuando cambia). */
export function useUiLang(): UiLang {
  return useSyncExternalStore(subscribe, getUiLang, getUiLang)
}

/** Traduce un texto escrito en español. */
export function t(text: string, vars?: Record<string, string | number | null | undefined>): string {
  const base = current === 'en' ? (EN[text] ?? text) : text
  if (!vars) return base
  return base.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key] ?? '') : match))
}

/** Elige entre singular y plural: tn(n, '{n} palabra', '{n} palabras'). */
export function tn(count: number, singular: string, plural: string, vars?: Record<string, string | number | null | undefined>): string {
  return t(count === 1 ? singular : plural, { n: count, ...vars })
}

/** Locale para fechas y números (Intl / toLocaleString). */
export function uiLocale(): string {
  return current === 'en' ? 'en-GB' : 'es-ES'
}

const LANGUAGE_NAMES_EN: Record<string, string> = {
  Español: 'Spanish', Inglés: 'English', Polaco: 'Polish', Francés: 'French', Alemán: 'German', Italiano: 'Italian',
  Portugués: 'Portuguese', Ruso: 'Russian', Chino: 'Chinese', Japonés: 'Japanese', Coreano: 'Korean', Árabe: 'Arabic',
  Turco: 'Turkish', Holandés: 'Dutch', Sueco: 'Swedish', Noruego: 'Norwegian', Danés: 'Danish', Finés: 'Finnish',
  Checo: 'Czech', Húngaro: 'Hungarian', Rumano: 'Romanian', Griego: 'Greek', Hindi: 'Hindi', Tailandés: 'Thai',
  Vietnamita: 'Vietnamese', Ucraniano: 'Ukrainian', Catalán: 'Catalan', Hebreo: 'Hebrew',
}

/** Nombre de un idioma para mostrar ("Italiano" → "Italian" si la interfaz va en inglés). El valor guardado no cambia. */
export function langName(name: string | null | undefined): string {
  if (!name) return ''
  return current === 'en' ? (LANGUAGE_NAMES_EN[name] ?? name) : name
}

/** Repinta toda la app cuando cambia el idioma de la interfaz. */
export function I18nRoot({ children }: { children: ReactNode }) {
  const lang = useUiLang()
  return createElement(Fragment, { key: lang }, children)
}
