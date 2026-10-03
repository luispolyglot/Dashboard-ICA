// Reglas del modo juego de ICADEMY, en un solo sitio para poder ajustarlas.
// Decididas por Luis (30 sept 2026). Las fichas se llaman ICA Coins en la app.

/** Máximo de cada fase ICA por día, sin gastar fichas. */
export const DAILY_LIMITS = {
  words: 10,
  phrases: 2,
  activations: 2,
} as const

export type DailyLimitKey = keyof typeof DAILY_LIMITS

/**
 * «Ampliar» una fase: por PHASE_BOOST_COST ICA Coins, ese día el límite de esa fase se
 * multiplica por 2 (Inmersión 20 palabras, Creación 4 frases o Activación 4 activaciones).
 * Cada fase se compra por separado (Luis, 3 oct; antes era «Ampliar el día» todo junto por 50).
 */
export const PHASE_BOOST_COST = 15
export const PHASE_BOOST_MULTIPLIER = 2


/**
 * Hucha: como mucho COIN_WALLET_CAP ICA Coins. Por encima, el cofre y los desafíos ganados
 * ya no suman (los hitos de racha y el ranking sí). Aviso de «casi llena» desde COIN_WALLET_WARN.
 */
export const COIN_WALLET_CAP = 100
export const COIN_WALLET_WARN = 80

/** Nombre de la fase de cada límite (para la tienda y los avisos). */
export const LIMIT_PHASE: Record<DailyLimitKey, { letter: 'I' | 'C' | 'A'; name: string }> = {
  words: { letter: 'I', name: 'Inmersión' },
  phrases: { letter: 'C', name: 'Creación' },
  activations: { letter: 'A', name: 'Activación' },
}

/**
 * ICA Coins que da el cofre al completar el ciclo ICA del día (I + C + A): de 1 a 5, al azar.
 * 1 → 40 % · 2 → 30 % · 3 → 20 % · 4 → 8 % · 5 → 2 %.
 */
export const CYCLE_CHEST_ODDS: ReadonlyArray<readonly [coins: number, percent: number]> = [
  [1, 40],
  [2, 30],
  [3, 20],
  [4, 8],
  [5, 2],
]
export const CYCLE_CHEST_MIN = 1
export const CYCLE_CHEST_MAX = 5

/** Tira el cofre: cuántas ICA Coins salen (de 1 a 5, con las probabilidades de arriba). */
export function rollCycleChest(random: () => number = Math.random): number {
  let roll = random() * 100
  for (const [coins, percent] of CYCLE_CHEST_ODDS) {
    if (roll < percent) return coins
    roll -= percent
  }
  return CYCLE_CHEST_MIN
}

/** ICA Coins por cada desafío ICA ganado. */
export const CHALLENGE_WIN_REWARD = 1
/** Como mucho estas ICA Coins por semana (de lunes a domingo) por desafíos ganados. */
export const CHALLENGE_WIN_WEEKLY_CAP = 7
/** Desde este día (los desafíos ganados antes no dan moneda). */
export const CHALLENGE_WIN_REWARD_SINCE = Date.parse('2026-10-01T00:00:00Z')

/** Un intento extra de PreguntICA: 50 ICA Coins (aunque no hayas activado las 20 palabras de la semana). */
export const PREGUNTICA_EXTRA_COST = 50

/** Retar (o aceptar el reto de) una 4.ª persona en Desafíos ICA cuando ya tienes 3 activos. */
export const EXTRA_CHALLENGE_COST = 15

/** Ranking del mes: 1 ICA Coin por cada 10 puntos; lo que sobra se guarda para la siguiente. */
export const RANKING_POINTS_PER_COIN = 10

/** Las flashcards se desbloquean con 20 palabras activadas (usadas en frases de creación). */
export const FLASHCARDS_MIN_ACTIVATED_WORDS = 20

/** La nota desafiante se desbloquea con 2 notas maestras terminadas. */
export const CHALLENGE_NOTE_MIN_CLOSED_NOTES = 2

/** Hitos de racha ICA: mismos días que las insignias de racha, con premio en ICA Coins. */
export const STREAK_MILESTONES = [
  { days: 7, reward: 2 },
  { days: 30, reward: 5 },
  { days: 90, reward: 10 },
  { days: 180, reward: 20 },
  { days: 360, reward: 40 },
] as const

/** Hitos de racha de flashcards: la mitad, más o menos. */
export const FLASH_STREAK_MILESTONES = [
  { days: 7, reward: 1 },
  { days: 30, reward: 3 },
  { days: 90, reward: 5 },
  { days: 180, reward: 10 },
  { days: 360, reward: 20 },
] as const

export type StreakMilestone = { days: number; reward: number }
