export const LEVEL_KEYS = ['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'] as const

type LevelKey = (typeof LEVEL_KEYS)[number]

const LEVEL_THRESHOLDS_BY_FAMILY: Record<string, Record<LevelKey, number>> = {
  germanic_romance_easy: {
    A1: 90,
    'A1+': 170,
    A2: 230,
    'A2+': 340,
    B1: 500,
    'B1+': 610,
    B2: 770,
    'B2+': 980,
    C1: 1600,
  },
  french_romanian: {
    A1: 110,
    'A1+': 270,
    A2: 330,
    'A2+': 440,
    B1: 650,
    'B1+': 810,
    B2: 970,
    'B2+': 1280,
    C1: 1850,
  },
  germanic_hard: {
    A1: 130,
    'A1+': 270,
    A2: 410,
    'A2+': 590,
    B1: 770,
    'B1+': 960,
    B2: 1270,
    'B2+': 1580,
    C1: 2100,
  },
  slavic_thai: {
    A1: 210,
    'A1+': 420,
    A2: 580,
    'A2+': 760,
    B1: 950,
    'B1+': 1260,
    B2: 1570,
    'B2+': 2230,
    C1: 2800,
  },
  distant: {
    A1: 270,
    'A1+': 430,
    A2: 760,
    'A2+': 950,
    B1: 1260,
    'B1+': 1570,
    B2: 2080,
    'B2+': 2590,
    C1: 3300,
  },
}

const LANG_TO_FAMILY: Record<string, string> = {
  Inglés: 'germanic_romance_easy',
  Portugués: 'germanic_romance_easy',
  Italiano: 'germanic_romance_easy',
  Francés: 'french_romanian',
  Rumano: 'french_romanian',
  Alemán: 'germanic_hard',
  Holandés: 'germanic_hard',
  Ruso: 'slavic_thai',
  Tailandés: 'slavic_thai',
  Polaco: 'slavic_thai',
  Ucraniano: 'slavic_thai',
  Checo: 'slavic_thai',
  Hindi: 'distant',
  Chino: 'distant',
  Japonés: 'distant',
  Coreano: 'distant',
  Árabe: 'distant',
  Español: 'germanic_romance_easy',
  Catalán: 'germanic_romance_easy',
  Sueco: 'germanic_hard',
  Noruego: 'germanic_hard',
  Danés: 'germanic_hard',
  Finés: 'germanic_hard',
  Húngaro: 'distant',
  Griego: 'distant',
  Turco: 'distant',
  Hebreo: 'distant',
  Vietnamita: 'distant',
}

export function getLevelThresholds(language: string): Record<LevelKey, number> {
  const family = LANG_TO_FAMILY[language] || 'germanic_romance_easy'
  return LEVEL_THRESHOLDS_BY_FAMILY[family]
}

export function computeLevelPosition(total: number, thresholds: Record<LevelKey, number>) {
  const stops = [0, ...LEVEL_KEYS.map((key) => thresholds[key])]
  const max = stops[stops.length - 1]
  const clamped = Math.max(0, Math.min(total, max))

  let idx = 0
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i] && clamped < stops[i + 1]) {
      idx = i
      break
    }
    if (clamped >= stops[stops.length - 1]) idx = stops.length - 2
  }

  const segStart = stops[idx]
  const segEnd = stops[idx + 1]
  const pctWithin = segEnd > segStart ? (clamped - segStart) / (segEnd - segStart) : 1
  const pctOverall = Math.min(1, (idx + pctWithin) / LEVEL_KEYS.length)
  const currentLevelKey = idx === 0 ? 'Pre-A1' : LEVEL_KEYS[idx - 1]
  const nextLevelKey = LEVEL_KEYS[Math.min(idx, LEVEL_KEYS.length - 1)]
  const wordsToNext = Math.max(0, segEnd - clamped)

  return {
    currentLevelKey,
    nextLevelKey,
    pctWithin,
    pctOverall,
    segStart,
    segEnd,
    wordsToNext,
    total: clamped,
  }
}
