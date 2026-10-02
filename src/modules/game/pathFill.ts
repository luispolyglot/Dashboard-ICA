import { useEffect, useState } from 'react'

// EL CAMINO SE RELLENA AL AVANZAR (una sola vez): al volver a Inicio después de hacer un paso,
// la línea discontinua se pinta desde el paso hecho hasta el siguiente y este se «despierta»
// (pierde el candado, da un salto y sale «SIGUE AQUÍ»). Si se hacen varios pasos seguidos sin
// pasar por Inicio, solo se rellena el último tramo.
//
// Para que no se repita, se guarda hasta qué parada se ha visto hoy el camino (por usuario).
// Las paradas van en orden: 0 Inmersión, 1 Creación, 2 Activación, 3 Cofre, 4 Reto del día.

const STORAGE_PREFIX = 'ica-path-seen-v1'
/** Espera antes de empezar a pintar (para que dé tiempo a ver la pantalla). */
export const PATH_FILL_DELAY_MS = 350
/** Lo que tarda en pintarse un tramo. */
export const PATH_FILL_MS = 1100

export type PathFill = { from: number; to: number }

function todayKey(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Hasta qué parada se vio hoy el camino, o null si hoy aún no se ha visto. */
export function readPathSeen(userId: string, now = new Date()): number | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { day?: string; reached?: number }
    if (parsed.day !== todayKey(now) || typeof parsed.reached !== 'number') return null
    return parsed.reached
  } catch {
    return null
  }
}

export function writePathSeen(userId: string, reached: number, now = new Date()): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}:${userId}`, JSON.stringify({ day: todayKey(now), reached }))
  } catch {
    // Sin almacenamiento: la animación puede repetirse.
  }
}

/**
 * Qué hacer al ver el camino. `seen` es lo visto hoy (null = primera vez hoy) y `reached`,
 * la parada a la que se ha llegado ahora.
 * - 'remember': guardar `reached` sin animar (primera vez del día).
 * - 'fill': rellenar el último tramo, de `reached - 1` a `reached`.
 * - 'none': nada (ya se vio, o se ha deshecho algo: no se retrocede).
 */
export function decidePathFill(seen: number | null, reached: number): 'remember' | 'fill' | 'none' {
  if (seen === null) return 'remember'
  if (reached > seen) return 'fill'
  return 'none'
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Devuelve el tramo que se está rellenando (o null) y la parada que hay que enseñar todavía
 * «dormida» (bloqueada) mientras tanto. `paused` retrasa la animación (p. ej. con la
 * celebración del cofre abierta encima) y `ready` espera a que estén cargados los datos.
 */
export function usePathFill({
  userId,
  reached,
  ready,
  paused,
  onArrive,
}: {
  userId: string | undefined
  reached: number
  ready: boolean
  paused: boolean
  onArrive?: (stop: number) => void
}): { fill: PathFill | null; holdStop: number | null } {
  const [seen, setSeen] = useState<number | null | undefined>(() => (userId ? readPathSeen(userId) : undefined))
  const [fill, setFill] = useState<PathFill | null>(null)

  useEffect(() => {
    if (!userId) return
    setSeen(readPathSeen(userId))
  }, [userId])

  useEffect(() => {
    if (!userId || !ready || seen === undefined || fill) return
    const action = decidePathFill(seen, reached)
    if (action === 'remember') {
      writePathSeen(userId, reached)
      setSeen(reached)
      return
    }
    if (action !== 'fill' || paused) return
    writePathSeen(userId, reached)
    setSeen(reached)
    if (prefersReducedMotion()) {
      onArrive?.(reached)
      return
    }
    setFill({ from: reached - 1, to: reached })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready, seen, reached, paused, fill])

  useEffect(() => {
    if (!fill) return
    const timer = window.setTimeout(() => {
      setFill(null)
      onArrive?.(fill.to)
    }, PATH_FILL_DELAY_MS + PATH_FILL_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill])

  // Mientras no se ha pintado el tramo nuevo, la parada nueva se enseña como estaba (bloqueada).
  const waiting = seen !== undefined && seen !== null && reached > seen
  const holdStop = fill ? fill.to : waiting ? reached : null
  return { fill, holdStop }
}
