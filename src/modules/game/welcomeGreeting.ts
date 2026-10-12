// SALUDO DE ENTRADA (móvil): al abrir la app, arriba sale «Ciao, Clara!» en el idioma que
// aprende el icademer y, al momento, el logo ICA ocupa su sitio. Va con exclamación, alegre:
// en español y catalán, con la de apertura (¡Hola, Clara!); en chino y japonés, con la suya (！).

/** «Hola» informal en cada idioma de la app (los nombres son los que guarda la app). */
const HELLO_BY_LANGUAGE: Record<string, string> = {
  Español: 'Hola',
  Inglés: 'Hi',
  Polaco: 'Cześć',
  Francés: 'Salut',
  Alemán: 'Hallo',
  Italiano: 'Ciao',
  Portugués: 'Olá',
  Ruso: 'Привет',
  Chino: '你好',
  Japonés: 'こんにちは',
  Coreano: '안녕',
  // Árabe y hebreo se escriben de derecha a izquierda: en una línea con el nombre se leen
  // mejor transliterados.
  Árabe: 'Marhaba',
  Turco: 'Merhaba',
  Holandés: 'Hoi',
  Sueco: 'Hej',
  Noruego: 'Hei',
  Danés: 'Hej',
  Finés: 'Moi',
  Checo: 'Ahoj',
  Húngaro: 'Szia',
  Rumano: 'Salut',
  Griego: 'Γεια',
  Hindi: 'नमस्ते',
  Tailandés: 'สวัสดี',
  Vietnamita: 'Xin chào',
  Ucraniano: 'Привіт',
  Catalán: 'Hola',
  Hebreo: 'Shalom',
}

/**
 * «Buenos días» en cada idioma (por la mañana, de 5:00 a 12:59). El resto del día, «hola».
 * Luis (2 oct): «hola o buenos días»; los dos caben en la cabecera del móvil.
 */
const MORNING_BY_LANGUAGE: Record<string, string> = {
  Español: 'Buenos días',
  Inglés: 'Good morning',
  Polaco: 'Dzień dobry',
  Francés: 'Bonjour',
  Alemán: 'Guten Morgen',
  Italiano: 'Buongiorno',
  Portugués: 'Bom dia',
  Ruso: 'Доброе утро',
  Chino: '早上好',
  Japonés: 'おはよう',
  Coreano: '좋은 아침',
  Árabe: 'Sabah al-khair',
  Turco: 'Günaydın',
  Holandés: 'Goedemorgen',
  Sueco: 'God morgon',
  Noruego: 'God morgen',
  Danés: 'Godmorgen',
  Finés: 'Huomenta',
  Checo: 'Dobré ráno',
  Húngaro: 'Jó reggelt',
  Rumano: 'Bună dimineața',
  Griego: 'Καλημέρα',
  Hindi: 'सुप्रभात',
  Tailandés: 'อรุณสวัสดิ์',
  Vietnamita: 'Chào buổi sáng',
  Ucraniano: 'Доброго ранку',
  Catalán: 'Bon dia',
  Hebreo: 'Boker tov',
}

/** Por la mañana (de 5:00 a 12:59) se saluda con «buenos días». */
export function isMorning(hour: number): boolean {
  return hour >= 5 && hour < 13
}

/** Signo que separa el saludo del nombre (en chino y japonés, su propia coma). */
const SEPARATOR_BY_LANGUAGE: Record<string, string> = {
  Chino: '，',
  Japonés: '、',
}

/** Idiomas que abren la exclamación (¡…!). Un idioma desconocido saluda en español, así que también. */
const OPENING_MARK_LANGUAGES = new Set(['Español', 'Catalán'])

/** Cierre de la exclamación en chino y japonés (el de ancho completo). */
const CLOSING_MARK_BY_LANGUAGE: Record<string, string> = {
  Chino: '！',
  Japonés: '！',
}

function exclaim(language: string, text: string): string {
  const opens = OPENING_MARK_LANGUAGES.has(language) || !(language in HELLO_BY_LANGUAGE)
  return `${opens ? '¡' : ''}${text}${CLOSING_MARK_BY_LANGUAGE[language] ?? '!'}`
}

/** «Ciao, Clara!». Null si no hay nombre; con un idioma desconocido saluda en español. */
export function buildWelcomeGreeting(targetLang: string | null | undefined, firstName: string | null | undefined): string | null {
  const name = (firstName || '').trim()
  if (!name) return null
  const language = (targetLang || '').trim()
  const hello = HELLO_BY_LANGUAGE[language] ?? 'Hola'
  const separator = SEPARATOR_BY_LANGUAGE[language] ?? ', '
  return exclaim(language, `${hello}${separator}${name}`)
}

/** Solo el «hola» del idioma (cuando el nombre no cabe en la pantalla): «Ciao!», «¡Hola!». */
export function buildWelcomeHello(targetLang: string | null | undefined): string {
  const language = (targetLang || '').trim()
  return exclaim(language, HELLO_BY_LANGUAGE[language] ?? 'Hola')
}

/**
 * Saludos posibles, del más completo al más corto: por la mañana «¡Buenos días, Clara!»,
 * «¡Buenos días!», «¡Hola, Clara!», «¡Hola!»; el resto del día, solo los de «hola».
 * La cabecera usa el primero que quepa.
 */
export function buildWelcomeCandidates(
  targetLang: string | null | undefined,
  firstName: string | null | undefined,
  hour: number,
): string[] {
  const language = (targetLang || '').trim()
  const name = (firstName || '').trim()
  const separator = SEPARATOR_BY_LANGUAGE[language] ?? ', '
  const hello = HELLO_BY_LANGUAGE[language] ?? 'Hola'
  const morning = MORNING_BY_LANGUAGE[language] ?? 'Buenos días'
  const words = isMorning(hour) ? [morning, hello] : [hello]
  const out: string[] = []
  for (const word of words) {
    if (name) out.push(exclaim(language, `${word}${separator}${name}`))
    out.push(exclaim(language, word))
  }
  return out
}

/** Primer nombre a partir del nombre visible o, si no hay, del correo. */
export function firstNameFrom(displayName: unknown, email: string | null | undefined): string {
  return String(displayName || (email || '').split('@')[0] || '')
    .trim()
    .split(/\s+/)[0]
}
