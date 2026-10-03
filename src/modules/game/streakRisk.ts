// RACHA EN PELIGRO: cuando quedan STREAK_RISK_HOURS horas (o menos) para que acabe el día y
// el ciclo ICA de hoy aún no está hecho, la racha se pierde a medianoche (hora del alumno).
// El servidor manda el mismo aviso por notificación (streak-push-reminders, a las 19:00).

/** Horas antes de medianoche en las que se avisa (Luis, 3 oct: 5 horas). */
export const STREAK_RISK_HOURS = 5

/** Milisegundos que quedan hasta la medianoche local de `now`. */
export function msUntilMidnight(now: Date): number {
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return Math.max(0, midnight.getTime() - now.getTime())
}

export type StreakRisk = {
  atRisk: boolean
  hours: number
  minutes: number
}

/** ¿Hay racha que perder hoy y quedan STREAK_RISK_HOURS horas o menos? */
export function getStreakRisk(input: { streak: number; cycleDoneToday: boolean; now: Date }): StreakRisk {
  const left = msUntilMidnight(input.now)
  const totalMinutes = Math.ceil(left / 60000)
  return {
    atRisk: input.streak > 0 && !input.cycleDoneToday && left > 0 && left <= STREAK_RISK_HOURS * 3600000,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  }
}
