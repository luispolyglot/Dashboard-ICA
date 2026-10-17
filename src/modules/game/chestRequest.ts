// «ABRIR» EN EL AVISO DEL COFRE (Luis, 17 Oct): al completar el ciclo sale «¡Ciclo ICA completado!
// Tu cofre del ciclo te espera en Inicio» con el botón «Abrir». Antes solo llevaba a Inicio y el
// cofre seguía cerrado. Ahora el botón deja pedido abrirlo: el camino de Inicio lo abre en cuanto
// el cofre está listo (después de que el camino se rellene y de la celebración de la racha).
// The request expires after a minute, so an old click never opens a chest by surprise.

export const OPEN_CYCLE_CHEST_EVENT = 'ica:open-cycle-chest'
const REQUEST_TTL_MS = 60_000

let requestedUntil = 0

/** The «Abrir» button of the chest notice: open the chest as soon as Inicio can. */
export function requestOpenCycleChest(): void {
  requestedUntil = Date.now() + REQUEST_TTL_MS
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_CYCLE_CHEST_EVENT))
}

/** True if someone asked to open the chest in the last minute (and the request is still there). */
export function hasOpenCycleChestRequest(): boolean {
  return Date.now() <= requestedUntil
}

/** Uses the request (only once). */
export function takeOpenCycleChestRequest(): boolean {
  const pending = hasOpenCycleChestRequest()
  requestedUntil = 0
  return pending
}
