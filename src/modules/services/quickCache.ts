/**
 * CACHÉ RÁPIDA: guarda la última respuesta de una consulta (en memoria y en el navegador)
 * para enseñarla AL MOMENTO la próxima vez, mientras se pide la versión nueva por detrás.
 *
 * - `peekQuick(key)`: lo último que se guardó (o undefined). Es instantáneo.
 * - `quickFetch(key, fetcher)`: pide los datos; si ya hay una petición igual en marcha, la
 *   reutiliza; si la última respuesta es muy reciente (`maxAgeMs`), la devuelve sin pedir.
 *
 * Las claves que dependen del usuario deben llevar su id (p. ej. `coins:${userId}`).
 */

type Entry = { value: unknown; at: number }

const PREFIX = 'ica-quick-cache-v1:'
const memory = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

function readStored(key: string): Entry | undefined {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Entry
    if (!parsed || typeof parsed.at !== 'number') return undefined
    return parsed
  } catch {
    return undefined
  }
}

function writeStored(key: string, entry: Entry): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    /* sin sitio o sin almacenamiento: se queda solo en memoria */
  }
}

/** Lo último guardado con esta clave (o undefined si no hay nada). */
export function peekQuick<T>(key: string): T | undefined {
  const inMemory = memory.get(key)
  if (inMemory) return inMemory.value as T
  const stored = readStored(key)
  if (!stored) return undefined
  memory.set(key, stored)
  return stored.value as T
}

/** Cuándo se guardó por última vez (ms) o null. */
export function quickAge(key: string): number | null {
  const entry = memory.get(key) ?? readStored(key)
  return entry ? Date.now() - entry.at : null
}

export function storeQuick<T>(key: string, value: T, persist = true): void {
  const entry: Entry = { value, at: Date.now() }
  memory.set(key, entry)
  if (persist) writeStored(key, entry)
}

/** Borra una clave (p. ej. al cerrar sesión o tras un cambio que la deja vieja). */
export function forgetQuick(key: string): void {
  memory.delete(key)
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    /* nada */
  }
}

export function quickFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { maxAgeMs?: number; persist?: boolean } = {},
): Promise<T> {
  const { maxAgeMs = 0, persist = true } = options
  if (maxAgeMs > 0) {
    const entry = memory.get(key)
    if (entry && Date.now() - entry.at < maxAgeMs) return Promise.resolve(entry.value as T)
  }
  const running = inflight.get(key)
  if (running) return running as Promise<T>
  const request = fetcher()
    .then((value) => {
      storeQuick(key, value, persist)
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, request)
  return request
}
