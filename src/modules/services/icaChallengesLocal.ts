/**
 * DESAFÍOS ICA · MODO LOCAL DE PRUEBA
 *
 * Para probar los desafíos en local sin subir nada a Supabase.
 * Se enciende con esta línea en el .env (y reiniciando `pnpm dev`):
 *
 *   VITE_ICA_CHALLENGES_LOCAL=true
 *
 * Qué hace:
 *  - Hace de "servidor" dentro del navegador con el MISMO motor que la función real
 *    (supabase/functions/ica-challenges-center/engine.ts): mismas preguntas, misma corrección,
 *    mismos tiempos, rondas y turnos.
 *  - Juegas contra rivales de prueba que juegan su turno al momento.
 *  - Los desafíos se guardan solo en este navegador (localStorage).
 *  - Usa tus palabras ICA reales. «Añadir a mi baúl» SÍ guarda la palabra de verdad.
 *
 * En la app publicada (Vercel) no hace nada: esa variable no existe allí.
 */
import { supabase } from '@/lib/supabase'
import { loadMetaTrackerProfile } from './metaTracker'
import {
  boardIndices,
  boardStart,
  buildModeSettings,
  checkMixedAllowed,
  countEligible,
  decideResult,
  DEFAULT_MAX_LEVEL_GAP,
  evaluatePairsBoard,
  evaluateResponse,
  generateQuestions,
  isAnswerInTime,
  isCompetitorDone,
  isLightningSessionOver,
  isPendingQuestionStale,
  isPlayableTypeId,
  isRoundFinished,
  LEVEL_SCALE,
  levelFromTracker,
  MIN_WORDS_TO_JOIN,
  minWordsForKind,
  MODE_DEFAULTS,
  nextTurnUserId,
  readModeSettings,
  readPairMatches,
  remainingQuestionMs,
  roundInfo,
  settingsToMetadata,
  summarizeChallengeActivity,
  usesTimeTiebreak,
  wordsMissingToJoin,
  type CompetitorGameState,
  type EngineCard,
  type ModeSettings,
  type PlayerResponse,
  type PublicQuestion,
  type QuestionKind,
  type SecretAnswer,
  type WordSource,
} from '../../../supabase/functions/ica-challenges-center/engine.ts'
import type {
  IcaChallengeCompetitorInvitationStatus,
  IcaChallengeEnrollment,
  IcaChallengePlayRecord,
  IcaChallengeRecord,
  IcaChallengeResultType,
  IcaChallengeStatus,
  Lexicard,
} from '../types'

export const ICA_CHALLENGES_LOCAL =
  String(import.meta.env.VITE_ICA_CHALLENGES_LOCAL || '').trim().toLowerCase() === 'true'

const STORAGE_KEY = 'ica-challenges-local-v1'
const TURN_WINDOW_MS = 10 * 60 * 60 * 1000
const INVITATION_WINDOW_MS = 12 * 60 * 60 * 1000
const MAX_ACTIVE = 3

// ---------------------------------------------------------------------------
// Catálogo (igual que la migración 20260928120000)
// ---------------------------------------------------------------------------

const CATALOG: Array<{
  id: string
  name: string
  iconKey: string
  isActive: boolean
  order: number
  config: Record<string, unknown>
}> = [
  { id: 'ica-own-words', name: 'Lectura', iconKey: 'book-open', isActive: true, order: 10, config: { pitch: 'Lees la palabra en tu idioma y eliges la correcta entre 4 opciones.', maxLevelGap: 3 } },
  { id: 'ica-writing', name: 'Escritura · por palabra', iconKey: 'pencil', isActive: true, order: 20, config: { pitch: 'Ves la palabra en tu idioma y la escribes en tu idioma objetivo. 10 palabras por turnos.', secondsPerQuestion: 7, maxLevelGap: 3 } },
  { id: 'ica-lightning', name: 'Escritura · cuenta atrás', iconKey: 'zap', isActive: true, order: 30, config: { pitch: 'Escribe todas las palabras que puedas antes de que acabe la cuenta atrás. Gana quien acierte más.', sessionSeconds: 60, maxLevelGap: 3 } },
  { id: 'ica-listen', name: 'Escucha', iconKey: 'headphones', isActive: true, order: 40, config: { pitch: 'Escuchas una palabra ICA en tu idioma objetivo y eliges qué significa.', secondsPerQuestion: 8, needsAudio: true, maxLevelGap: 3 } },
  { id: 'ica-speak', name: 'Habla', iconKey: 'mic', isActive: true, order: 50, config: { pitch: 'Ves la palabra en tu idioma y la dices en voz alta en tu idioma objetivo.', secondsPerQuestion: 10, needsMicrophone: true, maxLevelGap: 3 } },
  { id: 'ica-pairs', name: 'Parejas', iconKey: 'link', isActive: true, order: 55, config: { pitch: 'Une cada palabra ICA con su significado. 2 tableros de 5 parejas; si empatan, gana quien tarde menos.', secondsPerQuestion: 40, maxLevelGap: 3 } },
  // Próximamente: a Luis le resultó difícil y con poco contexto. El motor lo sigue sabiendo jugar.
  { id: 'ica-cloze', name: 'Completa la frase', iconKey: 'text-cursor', isActive: false, order: 60, config: { pitch: 'Una frase de ejemplo con un hueco: elige entre 4 opciones la palabra ICA que falta.', secondsPerQuestion: 12, maxLevelGap: 3 } },
  { id: 'ica-streak-battle', name: 'Batalla de Rachas', iconKey: 'flame', isActive: false, order: 90, config: { pitch: 'Competencia asincronica por consistencia diaria durante varios dias.' } },
]

function catalogRow(typeId: string) {
  return CATALOG.find((item) => item.id === typeId) || null
}

// ---------------------------------------------------------------------------
// Rivales de prueba y sus baúles
// ---------------------------------------------------------------------------

const BOTS = [
  { userId: 'local-bot-marta', displayName: 'Marta', username: 'marta.prueba', levelOffset: 1, accuracy: 0.65 },
  { userId: 'local-bot-jorge', displayName: 'Jorge', username: 'jorge.prueba', levelOffset: 5, accuracy: 0.8 },
  // Dos más para poder probar el 4.º desafío (desafío extra por 2 ICA Coins).
  { userId: 'local-bot-kasia', displayName: 'Kasia', username: 'kasia.prueba', levelOffset: 0, accuracy: 0.55 },
  { userId: 'local-bot-tomas', displayName: 'Tomás', username: 'tomas.prueba', levelOffset: 2, accuracy: 0.7 },
  // Más icademers virtuales para la demo (varias personas que te retan y a las que retar).
  { userId: 'local-bot-sofia', displayName: 'Sofía', username: 'sofia.prueba', levelOffset: 1, accuracy: 0.75 },
  { userId: 'local-bot-piotr', displayName: 'Piotr', username: 'piotr.prueba', levelOffset: 0, accuracy: 0.6 },
  { userId: 'local-bot-lucia', displayName: 'Lucía', username: 'lucia.prueba', levelOffset: 2, accuracy: 0.5 },
  { userId: 'local-bot-andres', displayName: 'Andrés', username: 'andres.prueba', levelOffset: 3, accuracy: 0.7 },
]

export function isLocalBot(userId: string | null | undefined): boolean {
  return BOTS.some((bot) => bot.userId === userId)
}

type SampleWord = [target: string, native: string, phrase: string, translation: string]

// Baúles de ejemplo (idioma materno: español) con frases para «Completa la frase».
const SAMPLE_WORDS: Record<string, SampleWord[]> = {
  Polaco: [
    ['kawa', 'café', 'Rano zawsze piję kawę z mlekiem.', 'Por la mañana siempre tomo café con leche.'],
    ['herbata', 'té', 'Wieczorem piję herbatę z cytryną.', 'Por la noche tomo té con limón.'],
    ['miasto', 'ciudad', 'To miasto jest bardzo piękne.', 'Esta ciudad es muy bonita.'],
    ['rower', 'bici', 'Codziennie jeżdżę rowerem do pracy.', 'Cada día voy en bici al trabajo.'],
    ['krzesło', 'silla', 'To krzesło jest bardzo wygodne.', 'Esta silla es muy cómoda.'],
    ['stół', 'mesa', 'Ten stół jest z drewna.', 'Esta mesa es de madera.'],
    ['ulica', 'calle', 'Ta ulica jest bardzo długa.', 'Esta calle es muy larga.'],
    ['lotnisko', 'aeropuerto', 'Lotnisko jest daleko od centrum.', 'El aeropuerto está lejos del centro.'],
    ['pociąg', 'tren', 'Pociąg przyjeżdża o ósmej.', 'El tren llega a las ocho.'],
    ['szkoła', 'escuela', 'Moja szkoła jest blisko domu.', 'Mi escuela está cerca de casa.'],
    ['pogoda', 'el tiempo (clima)', 'Dzisiaj pogoda jest bardzo ładna.', 'Hoy hace muy buen tiempo.'],
    ['chleb', 'pan', 'Kupiłem świeży chleb w piekarni.', 'Compré pan fresco en la panadería.'],
    ['jutro', 'mañana', 'Jutro idę do kina z przyjaciółmi.', 'Mañana voy al cine con amigos.'],
    ['szybko', 'rápido', 'Ten samochód jedzie bardzo szybko.', 'Este coche va muy rápido.'],
    ['okno', 'ventana', 'Otwórz okno, proszę.', 'Abre la ventana, por favor.'],
    ['woda', 'agua', 'Poproszę szklankę wody.', 'Un vaso de agua, por favor.'],
    ['książka', 'libro', 'Czytam bardzo ciekawą książkę.', 'Estoy leyendo un libro muy interesante.'],
    ['pies', 'perro', 'Mój pies lubi długie spacery.', 'A mi perro le gustan los paseos largos.'],
    ['praca', 'trabajo', 'Dzisiaj mam dużo pracy.', 'Hoy tengo mucho trabajo.'],
    ['dzień dobry', 'buenos días', 'Dzień dobry, jak się pan ma?', 'Buenos días, ¿cómo está usted?'],
  ],
  Alemán: [
    ['der Kaffee', 'el café', 'Am Morgen trinke ich immer einen Kaffee.', 'Por la mañana siempre tomo un café.'],
    ['der Bahnhof', 'la estación', 'Der Bahnhof ist nicht weit von hier.', 'La estación no está lejos de aquí.'],
    ['die Stadt', 'la ciudad', 'Die Stadt ist im Sommer sehr schön.', 'La ciudad es muy bonita en verano.'],
    ['das Fahrrad', 'la bici', 'Ich fahre jeden Tag mit dem Fahrrad zur Arbeit.', 'Voy cada día en bici al trabajo.'],
    ['der Stuhl', 'la silla', 'Der Stuhl in der Küche ist kaputt.', 'La silla de la cocina está rota.'],
    ['der Tisch', 'la mesa', 'Das Buch liegt auf dem Tisch.', 'El libro está sobre la mesa.'],
    ['das Fenster', 'la ventana', 'Mach bitte das Fenster auf.', 'Abre la ventana, por favor.'],
    ['die Schule', 'la escuela', 'Die Schule beginnt um acht Uhr.', 'La escuela empieza a las ocho.'],
    ['das Wetter', 'el tiempo (clima)', 'Das Wetter ist heute wunderbar.', 'Hoy hace un tiempo estupendo.'],
    ['das Brot', 'el pan', 'Ich kaufe frisches Brot beim Bäcker.', 'Compro pan fresco en la panadería.'],
    ['morgen', 'mañana', 'Morgen gehe ich ins Kino.', 'Mañana voy al cine.'],
    ['der Zug', 'el tren', 'Der Zug kommt um acht Uhr an.', 'El tren llega a las ocho.'],
    ['schnell', 'rápido', 'Das Auto fährt sehr schnell.', 'El coche va muy rápido.'],
    ['die Straße', 'la calle', 'Die Straße ist sehr lang.', 'La calle es muy larga.'],
    ['das Wasser', 'el agua', 'Ich trinke jeden Tag viel Wasser.', 'Bebo mucha agua cada día.'],
    ['der Hund', 'el perro', 'Mein Hund schläft den ganzen Tag.', 'Mi perro duerme todo el día.'],
    ['das Buch', 'el libro', 'Das Buch liegt auf dem Tisch.', 'El libro está sobre la mesa.'],
    ['die Arbeit', 'el trabajo', 'Die Arbeit beginnt um neun Uhr.', 'El trabajo empieza a las nueve.'],
    ['arbeiten', 'trabajar', 'Ich arbeite von zu Hause.', 'Trabajo desde casa.'],
    ['heute', 'hoy', 'Heute ist das Wetter sehr schön.', 'Hoy hace muy buen tiempo.'],
  ],
  Francés: [
    ['le café', 'el café', 'Le matin, je bois toujours un café.', 'Por la mañana siempre tomo un café.'],
    ['la gare', 'la estación', 'La gare est près du centre.', 'La estación está cerca del centro.'],
    ['la ville', 'la ciudad', 'La ville est très belle en été.', 'La ciudad es muy bonita en verano.'],
    ['le vélo', 'la bici', 'Je vais au travail à vélo.', 'Voy al trabajo en bici.'],
    ['la chaise', 'la silla', 'La chaise de la cuisine est cassée.', 'La silla de la cocina está rota.'],
    ['la table', 'la mesa', 'Le livre est sur la table.', 'El libro está sobre la mesa.'],
    ['la fenêtre', 'la ventana', "Ouvre la fenêtre, s'il te plaît.", 'Abre la ventana, por favor.'],
    ["l'école", 'la escuela', "L'école commence à huit heures.", 'La escuela empieza a las ocho.'],
    ['le temps', 'el tiempo (clima)', "Le temps est magnifique aujourd'hui.", 'Hoy hace un tiempo estupendo.'],
    ['le pain', 'el pan', "J'achète du pain frais à la boulangerie.", 'Compro pan fresco en la panadería.'],
    ['demain', 'mañana', 'Demain, je vais au cinéma.', 'Mañana voy al cine.'],
    ['le train', 'el tren', 'Le train arrive à huit heures.', 'El tren llega a las ocho.'],
    ['vite', 'rápido', 'Cette voiture roule très vite.', 'Este coche va muy rápido.'],
    ['la rue', 'la calle', 'La rue est très longue.', 'La calle es muy larga.'],
    ["l'eau", 'el agua', "Je bois beaucoup d'eau le matin.", 'Bebo mucha agua por la mañana.'],
    ['le chien', 'el perro', 'Mon chien adore courir dans le parc.', 'A mi perro le encanta correr en el parque.'],
    ['le livre', 'el libro', 'Ce livre est très intéressant.', 'Este libro es muy interesante.'],
    ["l'école", 'la escuela', "L'école est à côté de chez moi.", 'La escuela está al lado de mi casa.'],
    ['le travail', 'el trabajo', "J'ai beaucoup de travail aujourd'hui.", 'Hoy tengo mucho trabajo.'],
    ['travailler', 'trabajar', 'Je travaille dans un bureau.', 'Trabajo en una oficina.'],
    ["aujourd'hui", 'hoy', "Aujourd'hui, il fait très beau.", 'Hoy hace muy buen tiempo.'],
  ],
  Italiano: [
    ['il caffè', 'el café', 'La mattina bevo sempre un caffè.', 'Por la mañana siempre tomo un café.'],
    ['la stazione', 'la estación', 'La stazione è vicino al centro.', 'La estación está cerca del centro.'],
    ['la città', 'la ciudad', "La città è molto bella d'estate.", 'La ciudad es muy bonita en verano.'],
    ['la bicicletta', 'la bici', 'Vado al lavoro in bicicletta.', 'Voy al trabajo en bici.'],
    ['la sedia', 'la silla', 'La sedia della cucina è rotta.', 'La silla de la cocina está rota.'],
    ['il tavolo', 'la mesa', 'Il libro è sul tavolo.', 'El libro está sobre la mesa.'],
    ['la finestra', 'la ventana', 'Apri la finestra, per favore.', 'Abre la ventana, por favor.'],
    ['la scuola', 'la escuela', 'La scuola comincia alle otto.', 'La escuela empieza a las ocho.'],
    ['il tempo', 'el tiempo (clima)', 'Oggi il tempo è bellissimo.', 'Hoy hace un tiempo estupendo.'],
    ['il pane', 'el pan', 'Compro il pane fresco al forno.', 'Compro el pan fresco en el horno.'],
    ['domani', 'mañana', 'Domani vado al cinema.', 'Mañana voy al cine.'],
    ['il treno', 'el tren', 'Il treno arriva alle otto.', 'El tren llega a las ocho.'],
    ['veloce', 'rápido', 'Questa macchina è molto veloce.', 'Este coche es muy rápido.'],
    ['la strada', 'la calle', 'La strada è molto lunga.', 'La calle es muy larga.'],
    ["l'acqua", 'el agua', "Bevo sempre un bicchiere d'acqua.", 'Siempre bebo un vaso de agua.'],
    ['il cane', 'el perro', 'Il mio cane dorme sul divano.', 'Mi perro duerme en el sofá.'],
    ['il libro', 'el libro', 'Questo libro è molto bello.', 'Este libro es muy bonito.'],
    ['il lavoro', 'el trabajo', 'Oggi ho molto lavoro.', 'Hoy tengo mucho trabajo.'],
    ['lavorare', 'trabajar', 'Lavoro in un ufficio in centro.', 'Trabajo en una oficina en el centro.'],
    ['oggi', 'hoy', 'Oggi fa molto caldo.', 'Hoy hace mucho calor.'],
  ],
  Inglés: [
    ['coffee', 'café', 'I always drink a coffee in the morning.', 'Siempre tomo un café por la mañana.'],
    ['station', 'estación', 'The station is near the city centre.', 'La estación está cerca del centro.'],
    ['city', 'ciudad', 'The city is beautiful in summer.', 'La ciudad es preciosa en verano.'],
    ['bike', 'bici', 'I ride my bike to work every day.', 'Voy en bici al trabajo cada día.'],
    ['chair', 'silla', 'This chair is very comfortable.', 'Esta silla es muy cómoda.'],
    ['table', 'mesa', 'The book is on the table.', 'El libro está sobre la mesa.'],
    ['window', 'ventana', 'Please open the window.', 'Abre la ventana, por favor.'],
    ['school', 'escuela', 'School starts at eight o’clock.', 'La escuela empieza a las ocho.'],
    ['weather', 'tiempo (clima)', 'The weather is lovely today.', 'Hoy hace un tiempo precioso.'],
    ['bread', 'pan', 'I buy fresh bread at the bakery.', 'Compro pan fresco en la panadería.'],
    ['tomorrow', 'mañana', "Tomorrow I'm going to the cinema.", 'Mañana voy al cine.'],
    ['train', 'tren', 'The train arrives at eight.', 'El tren llega a las ocho.'],
    ['fast', 'rápido', 'This car is very fast.', 'Este coche es muy rápido.'],
    ['street', 'calle', 'This street is very long.', 'Esta calle es muy larga.'],
    ['water', 'agua', 'I drink a lot of water every day.', 'Bebo mucha agua cada día.'],
    ['dog', 'perro', 'My dog loves long walks.', 'A mi perro le encantan los paseos largos.'],
    ['book', 'libro', 'This book is really interesting.', 'Este libro es muy interesante.'],
    ['work', 'trabajo', 'I have a lot of work today.', 'Hoy tengo mucho trabajo.'],
    ['today', 'hoy', 'Today the weather is really nice.', 'Hoy hace muy buen tiempo.'],
    ['to look forward to', 'tener ganas de', 'I look forward to seeing you.', 'Tengo ganas de verte.'],
  ],
}

// ---------------------------------------------------------------------------
// Estado (solo en este navegador)
// ---------------------------------------------------------------------------

type LocalCompetitor = {
  userId: string
  order: number
  invitationStatus: IcaChallengeCompetitorInvitationStatus
  score: number | null
  game: CompetitorGameState
}

type LocalChallenge = {
  id: string
  slug: string
  status: IcaChallengeStatus
  resultType: IcaChallengeResultType
  scope: 'global' | 'language'
  targetLang: string | null
  nativeLang: string | null
  challengerUserId: string
  challengedUserId: string
  winnerUserId: string | null
  durationSeconds: number
  expiresAt: string
  acceptUntil: string
  turnUserId: string | null
  turnExpiresAt: string | null
  startedAt: string | null
  finalizedAt: string | null
  gameMetadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  competitors: LocalCompetitor[]
}

type StoredAnswer = SecretAnswer & { language: string; nativeLanguage: string }

type LocalQuestion = {
  challengeId: string
  owner: string | null
  index: number
  kind: QuestionKind
  question: PublicQuestion
  answer: StoredAnswer
  responses: Record<string, Record<string, unknown>>
}

type LocalPlay = {
  id: string
  challengeId: string
  userId: string
  index: number
  isCorrect: boolean
  ms: number | null
  createdAt: string
}

type LocalState = {
  version: 1
  enrollmentActive: boolean
  /** Activo o en pausa por idioma («Francés|Español»). Si falta, se usa `enrollmentActive`. */
  enrollmentByLang?: Record<string, boolean>
  seededFor: string | null
  /** Demo preparada con «Preparar demo»: si te faltan palabras, se completan con las de ejemplo. */
  demo?: boolean
  /** Reto de Escritura pendiente añadido después (para los que ya tenían datos de prueba). */
  seededWritingFor?: string | null
  challenges: LocalChallenge[]
  questions: LocalQuestion[]
  plays: LocalPlay[]
}

function emptyState(): LocalState {
  return { version: 1, enrollmentActive: true, seededFor: null, challenges: [], questions: [], plays: [] }
}

let memoryState: LocalState | null = null

function loadState(): LocalState {
  if (memoryState) return memoryState
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as LocalState) : null
    memoryState = parsed && parsed.version === 1 ? parsed : emptyState()
  } catch {
    memoryState = emptyState()
  }
  return memoryState
}

function saveState() {
  if (!memoryState) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState))
  } catch {
    // sin localStorage: se queda en memoria hasta recargar
  }
}

/** Borra todos los desafíos de prueba de este navegador. */
export function resetIcaChallengesLocal() {
  memoryState = emptyState()
  saveState()
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

const nowIso = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// Contexto de la app: tus palabras e idiomas
// ---------------------------------------------------------------------------

let appContext: { cards: Lexicard[]; targetLang: string; nativeLang: string } = {
  cards: [],
  targetLang: '',
  nativeLang: '',
}

export function registerIcaChallengesLocalContext(input: {
  cards: Lexicard[]
  targetLang: string
  nativeLang: string
}) {
  appContext = input
}

async function getMyUserId(): Promise<string> {
  try {
    const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } }
    return data.user?.id || 'local-me'
  } catch {
    return 'local-me'
  }
}

const levelCache = new Map<string, string | null>()

async function getMyLevel(targetLang: string, nativeLang: string): Promise<string> {
  const key = `${targetLang}|${nativeLang}`
  if (!levelCache.has(key)) {
    const profile = await loadMetaTrackerProfile(targetLang, nativeLang).catch(() => null)
    const level = profile
      ? levelFromTracker(
          {
            start_level: profile.startLevel,
            prior_ica_words: profile.priorIcaWords,
            activation_words_total: profile.activationWordsTotal,
            confirmed_at: profile.confirmedAt,
          },
          targetLang,
        )
      : null
    levelCache.set(key, level)
  }
  return levelCache.get(key) || 'A2'
}

function botLevel(myLevel: string, offset: number): string {
  const index = Math.max(0, LEVEL_SCALE.indexOf(myLevel))
  const up = index + offset
  const target = up <= LEVEL_SCALE.length - 1 ? up : index - offset
  return LEVEL_SCALE[Math.max(0, Math.min(LEVEL_SCALE.length - 1, target))]
}

function myCards(userId: string, targetLang: string, nativeLang: string): EngineCard[] {
  const own = myRealCards(userId, targetLang, nativeLang)
  // Con la demo preparada: si tu Baúl ICA de este idioma no llega a 20 palabras, se completa
  // con el baúl de ejemplo para poder enseñar los retos igualmente. Sin demo, la regla de 20 manda.
  const sample = nativeLang === 'Español' ? SAMPLE_WORDS[targetLang] : undefined
  if (!loadState().demo || own.length >= MIN_WORDS_TO_JOIN || !sample) return own
  const known = new Set(own.map((card) => card.target.trim().toLowerCase()))
  const extra = sample
    .filter(([target]) => !known.has(target.trim().toLowerCase()))
    .map(([target, native, phrase, translation], index) => ({
      id: `local-sample-${index}`,
      ownerUserId: userId,
      target,
      native,
      examplePhrase: phrase,
      exampleTranslation: translation,
    }))
  return [...own, ...extra]
}

function myRealCards(userId: string, targetLang: string, nativeLang: string): EngineCard[] {
  return appContext.cards
    .filter(
      (card) =>
        (card.targetLang || appContext.targetLang) === targetLang &&
        (card.nativeLang || appContext.nativeLang) === nativeLang,
    )
    .map((card) => ({
      id: card.id,
      ownerUserId: userId,
      target: card.target,
      native: card.native,
      examplePhrase: card.examplePhrase ?? null,
      exampleTranslation: card.exampleTranslation ?? null,
    }))
}

function botCards(botId: string, me: string, targetLang: string, nativeLang: string): EngineCard[] {
  const sample = nativeLang === 'Español' ? SAMPLE_WORDS[targetLang] : undefined
  if (sample) {
    return sample.map(([target, native, phrase, translation], index) => ({
      id: `${botId}-${index}`,
      ownerUserId: botId,
      target,
      native,
      examplePhrase: phrase,
      exampleTranslation: translation,
    }))
  }
  // Sin baúl de ejemplo para este idioma: el rival usa una copia de tus palabras.
  return myCards(me, targetLang, nativeLang).map((card) => ({
    ...card,
    id: `${botId}-${card.id}`,
    ownerUserId: botId,
  }))
}

function cardsFor(userId: string, me: string, targetLang: string, nativeLang: string): EngineCard[] {
  return isLocalBot(userId) ? botCards(userId, me, targetLang, nativeLang) : myCards(userId, targetLang, nativeLang)
}

// ---------------------------------------------------------------------------
// Partida (copia de la lógica de la función del servidor)
// ---------------------------------------------------------------------------

class LocalError extends Error {
  code: string | null
  constructor(message: string, code: string | null = null) {
    super(message)
    this.code = code
  }
}

const KIND_REQUIREMENT: Record<QuestionKind, string> = {
  choice: '',
  listen: '',
  write: ' de una sola palabra',
  speak: ' de hasta 4 palabras',
  cloze: ' con frase de ejemplo',
  pairs: ' cortas',
}

type Ctx = {
  me: string
  userId: string
  rivalId: string
  challenge: LocalChallenge
  settings: ModeSettings
}

function competitorOf(challenge: LocalChallenge, userId: string): LocalCompetitor {
  const competitor = challenge.competitors.find((item) => item.userId === userId)
  if (!competitor) throw new LocalError('No participas en este desafío.')
  return competitor
}

function playsOf(challengeId: string, userId: string): LocalPlay[] {
  return loadState()
    .plays.filter((play) => play.challengeId === challengeId && play.userId === userId)
    .sort((a, b) => a.index - b.index)
}

function scoreOf(plays: LocalPlay[]): number {
  return plays.reduce((total, play) => total + Number(play.isCorrect), 0)
}

function makeCtx(challenge: LocalChallenge, userId: string, me: string): Ctx {
  const settings = readModeSettings(challenge.slug, challenge.gameMetadata)
  if (!settings) throw new LocalError('Este modo todavía no se puede jugar.')
  const rivalId =
    userId === challenge.challengerUserId ? challenge.challengedUserId : challenge.challengerUserId
  return { me, userId, rivalId, challenge, settings }
}

function isDone(ctx: Ctx, userId: string): boolean {
  return isCompetitorDone({
    settings: ctx.settings,
    state: competitorOf(ctx.challenge, userId).game,
    answeredCount: playsOf(ctx.challenge.id, userId).length,
    nowMs: Date.now(),
  })
}

function updateScore(ctx: Ctx, userId: string) {
  const competitor = competitorOf(ctx.challenge, userId)
  const plays = playsOf(ctx.challenge.id, userId)
  competitor.game = { ...competitor.game, answered: plays.length, correct: scoreOf(plays) }
  if (plays.length > 0 || competitor.game.completedAt) competitor.score = scoreOf(plays)
  ctx.challenge.updatedAt = nowIso()
}

function pairOf(ctx: Ctx, userId: string): { targetLang: string; nativeLang: string } {
  if (ctx.challenge.scope === 'language' && ctx.challenge.targetLang && ctx.challenge.nativeLang) {
    return { targetLang: ctx.challenge.targetLang, nativeLang: ctx.challenge.nativeLang }
  }
  void userId
  return { targetLang: appContext.targetLang, nativeLang: appContext.nativeLang }
}

function ensureQuestions(ctx: Ctx): LocalQuestion[] {
  const state = loadState()
  const owner = ctx.settings.wordSource === 'mixed' ? null : ctx.userId
  const existing = state.questions
    .filter((item) => item.challengeId === ctx.challenge.id && item.owner === owner)
    .sort((a, b) => a.index - b.index)
  if (existing.length > 0) return existing

  const pair = pairOf(ctx, ctx.userId)
  const pools =
    ctx.settings.wordSource === 'mixed'
      ? [
          cardsFor(ctx.challenge.challengerUserId, ctx.me, pair.targetLang, pair.nativeLang),
          cardsFor(ctx.challenge.challengedUserId, ctx.me, pair.targetLang, pair.nativeLang),
        ]
      : [cardsFor(ctx.userId, ctx.me, pair.targetLang, pair.nativeLang)]

  const generated = generateQuestions({
    kind: ctx.settings.kind,
    pools,
    count: ctx.settings.totalQuestions,
    language: pair.targetLang,
  })
  if (!generated.ok) {
    throw new LocalError(
      `No hay suficientes palabras ICA${KIND_REQUIREMENT[ctx.settings.kind]} para este modo.`,
      'ICA_CHALLENGE_NOT_ENOUGH_WORDS',
    )
  }

  const rows: LocalQuestion[] = generated.questions.map((item, index) => ({
    challengeId: ctx.challenge.id,
    owner,
    index,
    kind: item.kind,
    question: item.question,
    answer: { ...item.answer, language: pair.targetLang, nativeLanguage: pair.nativeLang },
    responses: {},
  }))
  state.questions.push(...rows)
  return rows
}

function totalMsOf(plays: LocalPlay[]): number {
  return plays.reduce((total, play) => total + (play.ms ?? 0), 0)
}

function finalize(ctx: Ctx) {
  const challengerPlays = playsOf(ctx.challenge.id, ctx.challenge.challengerUserId)
  const challengedPlays = playsOf(ctx.challenge.id, ctx.challenge.challengedUserId)
  // Parejas: si empatan, gana quien tardó menos.
  const resultType = decideResult(
    scoreOf(challengerPlays),
    scoreOf(challengedPlays),
    usesTimeTiebreak(ctx.settings.kind)
      ? { challengerMs: totalMsOf(challengerPlays), challengedMs: totalMsOf(challengedPlays) }
      : null,
  )
  ctx.challenge.status = 'completed'
  ctx.challenge.resultType = resultType
  ctx.challenge.winnerUserId =
    resultType === 'challenger_win'
      ? ctx.challenge.challengerUserId
      : resultType === 'challenged_win'
        ? ctx.challenge.challengedUserId
        : null
  ctx.challenge.finalizedAt = nowIso()
  ctx.challenge.turnUserId = null
  ctx.challenge.turnExpiresAt = null
}

function afterRound(ctx: Ctx) {
  const meDone = isDone(ctx, ctx.userId)
  const rivalDone = isDone(ctx, ctx.rivalId)
  const next = nextTurnUserId({ me: ctx.userId, rival: ctx.rivalId, meDone, rivalDone })
  if (next === null) {
    finalize(ctx)
    return
  }
  ctx.challenge.turnUserId = next
  ctx.challenge.turnExpiresAt = new Date(Date.now() + TURN_WINDOW_MS).toISOString()
}

function recordPlay(ctx: Ctx, index: number, isCorrect: boolean, ms: number | null) {
  const state = loadState()
  if (state.plays.some((play) => play.challengeId === ctx.challenge.id && play.userId === ctx.userId && play.index === index)) {
    throw new LocalError('Esta respuesta ya estaba guardada.', 'ICA_CHALLENGE_ALREADY_ANSWERED')
  }
  state.plays.push({
    id: newId(),
    challengeId: ctx.challenge.id,
    userId: ctx.userId,
    index,
    isCorrect,
    ms,
    createdAt: nowIso(),
  })
  updateScore(ctx, ctx.userId)
}

function questionPayload(ctx: Ctx, row: LocalQuestion, servedAtMs: number) {
  return {
    index: row.index,
    kind: row.kind,
    data: row.question,
    language: { target: row.answer.language, native: row.answer.nativeLanguage },
    limitMs:
      ctx.settings.format === 'turns'
        ? remainingQuestionMs({ settings: ctx.settings, servedAtMs, nowMs: Date.now() })
        : null,
    round: ctx.settings.format === 'turns' ? roundInfo(ctx.settings, row.index) : null,
  }
}

function progressPayload(ctx: Ctx) {
  const mine = playsOf(ctx.challenge.id, ctx.userId)
  const theirs = playsOf(ctx.challenge.id, ctx.rivalId)
  return {
    answered: mine.length,
    correct: scoreOf(mine),
    total: ctx.settings.format === 'turns' ? ctx.settings.totalQuestions : null,
    rivalAnswered: theirs.length,
    rivalCorrect: scoreOf(theirs),
  }
}

function sessionPayload(ctx: Ctx) {
  const game = competitorOf(ctx.challenge, ctx.userId).game
  if (ctx.settings.format !== 'lightning' || !game.sessionEndsAt) return null
  const endsAt = Date.parse(game.sessionEndsAt)
  return {
    endsAt: game.sessionEndsAt,
    remainingMs: Math.max(0, endsAt - Date.now()),
    totalMs: (ctx.settings.sessionSeconds || 60) * 1000,
  }
}

function finishLightning(ctx: Ctx) {
  const competitor = competitorOf(ctx.challenge, ctx.userId)
  if (competitor.game.completedAt) return
  competitor.game = { ...competitor.game, current: null, completedAt: nowIso() }
  updateScore(ctx, ctx.userId)
  afterRound(ctx)
}

function serve(ctx: Ctx, rows: LocalQuestion[]) {
  const competitor = competitorOf(ctx.challenge, ctx.userId)
  const nextIndex = playsOf(ctx.challenge.id, ctx.userId).length
  const row = rows.find((item) => item.index === nextIndex)
  if (!row) {
    if (ctx.settings.format === 'lightning') finishLightning(ctx)
    else {
      competitor.game = { ...competitor.game, current: null, completedAt: nowIso() }
      afterRound(ctx)
    }
    return { status: 'done' as const }
  }
  const servedAtMs = Date.now()
  competitor.game = { ...competitor.game, current: { index: row.index, servedAt: new Date(servedAtMs).toISOString() } }
  return { status: 'question' as const, question: questionPayload(ctx, row, servedAtMs) }
}

function assertCanPlay(ctx: Ctx) {
  const competitor = competitorOf(ctx.challenge, ctx.userId)
  if (competitor.invitationStatus !== 'accepted') throw new LocalError('No puedes jugar este desafío.')
  if (ctx.challenge.status !== 'in_progress') {
    throw new LocalError('El desafío no está en curso.', 'ICA_CHALLENGE_NOT_IN_PROGRESS')
  }
  if (ctx.challenge.turnUserId && ctx.challenge.turnUserId !== ctx.userId) {
    throw new LocalError('Aún no es tu turno.', 'ICA_CHALLENGE_NOT_YOUR_TURN')
  }
}

function nextQuestion(ctx: Ctx) {
  assertCanPlay(ctx)
  const competitor = competitorOf(ctx.challenge, ctx.userId)
  const nowMs = Date.now()

  if (ctx.settings.format === 'lightning') {
    if (competitor.game.completedAt) return { status: 'done' as const }
    if (!competitor.game.sessionEndsAt) {
      ensureQuestions(ctx)
      const startedAt = new Date()
      competitor.game = {
        ...competitor.game,
        sessionStartedAt: startedAt.toISOString(),
        sessionEndsAt: new Date(startedAt.getTime() + (ctx.settings.sessionSeconds || 60) * 1000).toISOString(),
      }
    } else if (isLightningSessionOver(competitor.game, nowMs)) {
      finishLightning(ctx)
      return { status: 'done' as const }
    }
  } else if (isDone(ctx, ctx.userId)) {
    return { status: 'done' as const }
  }

  const rows = ensureQuestions(ctx)
  const current = competitor.game.current
  const mine = playsOf(ctx.challenge.id, ctx.userId)
  if (current && !mine.some((play) => play.index === current.index)) {
    const servedAtMs = Date.parse(current.servedAt)
    const row = rows.find((item) => item.index === current.index)
    const stale = !Number.isFinite(servedAtMs) || isPendingQuestionStale({ settings: ctx.settings, servedAtMs, nowMs })
    if (row && !stale) return { status: 'question' as const, question: questionPayload(ctx, row, servedAtMs) }
    if (row) {
      // En Parejas cuenta como fallo todo el tablero.
      const staleIndices =
        ctx.settings.kind === 'pairs' ? boardIndices(current.index, ctx.settings.totalQuestions) : [current.index]
      for (const index of staleIndices) {
        const staleRow = rows.find((item) => item.index === index)
        if (!staleRow || playsOf(ctx.challenge.id, ctx.userId).some((play) => play.index === index)) continue
        recordPlay(ctx, index, false, null)
        staleRow.responses[ctx.userId] = { optionIndex: null, text: null, transcript: null, correct: false, timedOut: true }
      }
      competitor.game = { ...competitor.game, current: null }
      const answered = playsOf(ctx.challenge.id, ctx.userId).length
      if (isRoundFinished(ctx.settings, answered)) {
        if (answered >= ctx.settings.totalQuestions) competitor.game = { ...competitor.game, completedAt: nowIso() }
        afterRound(ctx)
        return { status: competitor.game.completedAt ? ('done' as const) : ('round_finished' as const) }
      }
    }
  }

  return serve(ctx, rows)
}

function readResponse(raw: unknown): PlayerResponse {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const optionIndex = data.optionIndex
  return {
    optionIndex: optionIndex === null || optionIndex === undefined ? null : Math.round(Number(optionIndex)),
    text: typeof data.text === 'string' ? data.text.slice(0, 120) : null,
    transcripts: Array.isArray(data.transcripts)
      ? data.transcripts.filter((item): item is string => typeof item === 'string').slice(0, 6)
      : null,
  }
}

function reveal(row: LocalQuestion) {
  return {
    target: row.answer.target,
    native: row.answer.native,
    correctOptionIndex: row.answer.correctOptionIndex,
    phrase: row.answer.phrase,
    phraseTranslation: row.answer.phraseTranslation,
  }
}

function answerQuestion(ctx: Ctx, body: Record<string, unknown>) {
  const nowMs = Date.now()
  const questionIndex = Math.round(Number(body.questionIndex))
  const rows = ensureQuestions(ctx)
  const row = rows.find((item) => item.index === questionIndex)
  if (!row) throw new LocalError('Pregunta inválida.')

  if (ctx.settings.kind === 'pairs') return answerPairsBoard(ctx, body, rows, questionIndex, nowMs)

  const already = playsOf(ctx.challenge.id, ctx.userId).find((play) => play.index === questionIndex)
  if (already) {
    return {
      status: 'answered' as const,
      duplicate: true,
      result: { isCorrect: already.isCorrect, timedOut: false, reveal: reveal(row) },
      progress: progressPayload(ctx),
    }
  }

  assertCanPlay(ctx)
  const competitor = competitorOf(ctx.challenge, ctx.userId)
  const current = competitor.game.current
  if (!current || current.index !== questionIndex) {
    throw new LocalError('Esta pregunta ya no está activa.', 'ICA_CHALLENGE_QUESTION_NOT_ACTIVE')
  }

  const clientMsRaw = Number(body.clientMs)
  const clientMs = Number.isFinite(clientMsRaw) ? Math.max(0, Math.round(clientMsRaw)) : null
  const inTime = isAnswerInTime({
    settings: ctx.settings,
    servedAtMs: Date.parse(current.servedAt),
    nowMs,
    clientMs,
    sessionEndsAtMs: competitor.game.sessionEndsAt ? Date.parse(competitor.game.sessionEndsAt) : null,
  })

  if (ctx.settings.format === 'lightning' && !inTime) {
    finishLightning(ctx)
    return { status: 'done' as const, late: true, progress: progressPayload(ctx) }
  }

  const timedOut = Boolean(body.timedOut) || !inTime
  const response = readResponse(body.response)
  const isCorrect =
    !timedOut && evaluateResponse({ kind: row.kind, answer: row.answer, response, language: row.answer.language })

  recordPlay(ctx, questionIndex, isCorrect, clientMs)
  row.responses[ctx.userId] = {
    optionIndex: response.optionIndex,
    text: response.text,
    transcript: response.transcripts?.[0] ?? null,
    correct: isCorrect,
    timedOut,
  }
  const result = { isCorrect, timedOut, reveal: reveal(row) }

  if (ctx.settings.format === 'lightning') {
    const served = serve(ctx, rows)
    return {
      status: served.status === 'question' ? ('answered' as const) : ('done' as const),
      result,
      next: served.status === 'question' ? served.question : null,
      progress: progressPayload(ctx),
      session: sessionPayload(ctx),
    }
  }

  const answered = playsOf(ctx.challenge.id, ctx.userId).length
  if (isRoundFinished(ctx.settings, answered)) {
    const done = answered >= ctx.settings.totalQuestions
    competitor.game = { ...competitor.game, current: null, completedAt: done ? nowIso() : competitor.game.completedAt }
    afterRound(ctx)
    runBotTurns(ctx.challenge, ctx.me)
    return {
      status: done ? ('done' as const) : ('round_finished' as const),
      result,
      next: null,
      progress: progressPayload(ctx),
      isMyTurn: ctx.challenge.turnUserId === ctx.userId,
    }
  }

  const served = serve(ctx, rows)
  return {
    status: 'answered' as const,
    result,
    next: served.status === 'question' ? served.question : null,
    progress: progressPayload(ctx),
  }
}

/** Parejas: se corrige el tablero entero (igual que answerPairsBoard del servidor). */
function answerPairsBoard(
  ctx: Ctx,
  body: Record<string, unknown>,
  rows: LocalQuestion[],
  questionIndex: number,
  nowMs: number,
) {
  const start = boardStart(questionIndex)
  const indices = boardIndices(start, ctx.settings.totalQuestions)
  const boardRows = indices
    .map((index) => rows.find((item) => item.index === index))
    .filter((item): item is LocalQuestion => Boolean(item))
  if (questionIndex !== start || boardRows.length !== indices.length) throw new LocalError('Tablero inválido.')

  const mine = playsOf(ctx.challenge.id, ctx.userId)
  if (mine.some((play) => indices.includes(play.index))) {
    const pairs = {
      correct: boardRows.map((item) => mine.find((play) => play.index === item.index)?.isCorrect ?? false),
      solution: boardRows.map((item) => item.answer.correctOptionIndex ?? -1),
      chosen: boardRows.map((item) => {
        const value = item.responses[ctx.userId]?.optionIndex
        return typeof value === 'number' ? value : null
      }),
    }
    return {
      status: 'answered' as const,
      duplicate: true,
      result: { isCorrect: pairs.correct.every(Boolean), timedOut: false, reveal: reveal(boardRows[0]) },
      pairs,
      next: null,
      progress: progressPayload(ctx),
    }
  }

  assertCanPlay(ctx)
  const competitor = competitorOf(ctx.challenge, ctx.userId)
  const current = competitor.game.current
  if (!current || current.index !== start) {
    throw new LocalError('Este tablero ya no está activo.', 'ICA_CHALLENGE_QUESTION_NOT_ACTIVE')
  }

  const servedAtMs = Date.parse(current.servedAt)
  const clientMsRaw = Number(body.clientMs)
  const clientMs = Number.isFinite(clientMsRaw) ? Math.max(0, Math.round(clientMsRaw)) : null
  const inTime = isAnswerInTime({ settings: ctx.settings, servedAtMs, nowMs, clientMs, sessionEndsAtMs: null })
  const elapsedMs = Number.isFinite(servedAtMs) ? Math.max(0, nowMs - servedAtMs) : clientMs
  const response = body.response && typeof body.response === 'object' ? (body.response as Record<string, unknown>) : {}
  const board = evaluatePairsBoard({
    answers: boardRows.map((item) => item.answer),
    matches: readPairMatches(response.matches),
    inTime,
  })
  const timedOut = !inTime || Boolean(body.timedOut)

  boardRows.forEach((item, position) => {
    recordPlay(ctx, item.index, board.correct[position], elapsedMs)
    item.responses[ctx.userId] = {
      optionIndex: board.chosen[position],
      text: null,
      transcript: null,
      correct: board.correct[position],
      timedOut,
    }
  })

  const result = { isCorrect: board.correct.every(Boolean), timedOut, reveal: reveal(boardRows[0]) }
  const answered = playsOf(ctx.challenge.id, ctx.userId).length
  if (isRoundFinished(ctx.settings, answered)) {
    const done = answered >= ctx.settings.totalQuestions
    competitor.game = { ...competitor.game, current: null, completedAt: done ? nowIso() : competitor.game.completedAt }
    afterRound(ctx)
    runBotTurns(ctx.challenge, ctx.me)
    return {
      status: done ? ('done' as const) : ('round_finished' as const),
      result,
      pairs: board,
      next: null,
      progress: progressPayload(ctx),
      isMyTurn: ctx.challenge.turnUserId === ctx.userId,
    }
  }

  competitor.game = { ...competitor.game, current: null }
  return { status: 'answered' as const, result, pairs: board, next: null, progress: progressPayload(ctx) }
}

/** El rival de prueba juega su turno al momento (acierta más o menos según su nivel). */
function botPlayTurn(challenge: LocalChallenge, botId: string, me: string, accuracyOverride?: number) {
  const found = BOTS.find((item) => item.userId === botId)
  const bot = accuracyOverride === undefined ? found : { accuracy: accuracyOverride }
  const ctx = makeCtx(challenge, botId, me)
  const rows = ensureQuestions(ctx)
  const competitor = competitorOf(challenge, botId)

  if (ctx.settings.format === 'lightning') {
    const count = 6 + Math.floor(Math.random() * 8)
    for (let i = 0; i < count; i += 1) {
      const index = playsOf(challenge.id, botId).length
      if (!rows.some((row) => row.index === index)) break
      recordPlay(ctx, index, Math.random() < (bot?.accuracy ?? 0.65), 1500)
    }
    competitor.game = { ...competitor.game, current: null, completedAt: nowIso() }
    updateScore(ctx, botId)
    afterRound(ctx)
    return
  }

  let answered = playsOf(challenge.id, botId).length
  // En Parejas, el tiempo va por tablero (sirve para el desempate).
  const botMs = ctx.settings.kind === 'pairs' ? 14000 + Math.floor(Math.random() * 14000) : 2500
  do {
    recordPlay(ctx, answered, Math.random() < (bot?.accuracy ?? 0.65), botMs)
    answered += 1
  } while (!isRoundFinished(ctx.settings, answered))
  if (answered >= ctx.settings.totalQuestions) {
    competitor.game = { ...competitor.game, completedAt: nowIso() }
  }
  afterRound(ctx)
}

function runBotTurns(challenge: LocalChallenge, me: string) {
  let guard = 0
  while (challenge.status === 'in_progress' && isLocalBot(challenge.turnUserId) && guard < 20) {
    botPlayTurn(challenge, challenge.turnUserId as string, me)
    guard += 1
  }
}

function playState(ctx: Ctx) {
  const competitor = competitorOf(ctx.challenge, ctx.userId)
  if (
    ctx.challenge.status === 'in_progress' &&
    ctx.settings.format === 'lightning' &&
    competitor.game.sessionEndsAt &&
    !competitor.game.completedAt &&
    isLightningSessionOver(competitor.game, Date.now())
  ) {
    finishLightning(ctx)
    runBotTurns(ctx.challenge, ctx.me)
  }
  const mine = playsOf(ctx.challenge.id, ctx.userId)
  const theirs = playsOf(ctx.challenge.id, ctx.rivalId)
  const levels = ctx.challenge.gameMetadata.levels
  return {
    challenge: {
      id: ctx.challenge.id,
      status: ctx.challenge.status,
      typeId: ctx.settings.typeId,
      kind: ctx.settings.kind,
      format: ctx.settings.format,
      wordSource: ctx.settings.wordSource,
      rounds: ctx.settings.rounds,
      questionsPerRound: ctx.settings.questionsPerRound,
      totalQuestions: ctx.settings.format === 'turns' ? ctx.settings.totalQuestions : null,
      secondsPerQuestion: ctx.settings.secondsPerQuestion,
      sessionSeconds: ctx.settings.sessionSeconds,
      isMyTurn:
        ctx.challenge.status === 'in_progress' &&
        (!ctx.challenge.turnUserId || ctx.challenge.turnUserId === ctx.userId),
      turnExpiresAt: ctx.challenge.turnExpiresAt,
      resultType: ctx.challenge.resultType,
      winnerUserId: ctx.challenge.winnerUserId,
      levels: levels && typeof levels === 'object' ? levels : null,
    },
    me: {
      userId: ctx.userId,
      answered: mine.length,
      correct: scoreOf(mine),
      done: isDone(ctx, ctx.userId),
      hasOpenQuestion: Boolean(
        competitor.game.current && !mine.some((play) => play.index === competitor.game.current?.index),
      ),
      sessionStarted: Boolean(competitor.game.sessionStartedAt),
      round: ctx.settings.format === 'turns' ? roundInfo(ctx.settings, mine.length) : null,
    },
    rival: { userId: ctx.rivalId, answered: theirs.length, correct: scoreOf(theirs), done: isDone(ctx, ctx.rivalId) },
    session: sessionPayload(ctx),
  }
}

function review(ctx: Ctx) {
  const finished = ['completed', 'expired', 'cancelled', 'not_accepted'].includes(ctx.challenge.status)
  if (!isDone(ctx, ctx.userId) && !finished) {
    throw new LocalError('Termina tus palabras para ver los resultados.', 'ICA_CHALLENGE_REVIEW_LOCKED')
  }
  const owner = ctx.settings.wordSource === 'mixed' ? null : ctx.userId
  const rows = loadState().questions.filter((item) => item.challengeId === ctx.challenge.id && item.owner === owner)
  const items = playsOf(ctx.challenge.id, ctx.userId)
    .map((play) => {
      const row = rows.find((item) => item.index === play.index)
      const mine = row?.responses[ctx.userId]
      if (!row || !mine) return null
      const options = 'options' in row.question ? row.question.options : []
      const optionIndex = typeof mine.optionIndex === 'number' ? mine.optionIndex : null
      return {
        index: play.index,
        kind: row.kind,
        target: row.answer.target,
        native: row.answer.native,
        phrase: row.answer.phrase,
        phraseTranslation: row.answer.phraseTranslation,
        isCorrect: play.isCorrect,
        timedOut: Boolean(mine.timedOut),
        myAnswer:
          (typeof mine.text === 'string' && mine.text) ||
          (typeof mine.transcript === 'string' && mine.transcript) ||
          (optionIndex !== null && options[optionIndex] ? options[optionIndex] : null),
        fromRival: row.answer.ownerUserId !== ctx.userId,
        targetLang: row.answer.language,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const theirs = playsOf(ctx.challenge.id, ctx.rivalId)
  // Con el desafío terminado, las palabras del baúl del rival (para poder añadirlas al tuyo).
  const seen = new Set<string>()
  const rivalWords =
    finished && ctx.settings.wordSource !== 'mixed'
      ? loadState()
          .questions.filter((item) => item.challengeId === ctx.challenge.id && item.owner === ctx.rivalId)
          .map((item) => item.answer)
          .filter((answer) => {
            const key = answer.target.trim().toLowerCase()
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map((answer) => ({
            target: answer.target,
            native: answer.native,
            phrase: answer.phrase ?? null,
            phraseTranslation: answer.phraseTranslation ?? null,
            targetLang: answer.language ?? null,
          }))
      : []
  return {
    items,
    rivalWords,
    me: { correct: scoreOf(playsOf(ctx.challenge.id, ctx.userId)), answered: items.length },
    rival: { correct: scoreOf(theirs), answered: theirs.length, done: isDone(ctx, ctx.rivalId) },
    wordSource: ctx.settings.wordSource,
  }
}

// ---------------------------------------------------------------------------
// Crear, aceptar y listar
// ---------------------------------------------------------------------------

function activeCount(userId: string): number {
  return loadState().challenges.filter(
    (item) =>
      (item.status === 'created' || item.status === 'in_progress') &&
      (item.challengerUserId === userId || item.challengedUserId === userId),
  ).length
}

function hasActivePair(a: string, b: string): boolean {
  return loadState().challenges.some(
    (item) =>
      (item.status === 'created' || item.status === 'in_progress') &&
      ((item.challengerUserId === a && item.challengedUserId === b) ||
        (item.challengerUserId === b && item.challengedUserId === a)),
  )
}

function emptyGame(): CompetitorGameState {
  return { answered: 0, correct: 0, completedAt: null, current: null, sessionStartedAt: null, sessionEndsAt: null }
}

function buildChallenge(input: {
  typeId: string
  challenger: string
  challenged: string
  targetLang: string
  nativeLang: string
  settings: ModeSettings
  levels: Record<string, string | null> | null
  durationSeconds: number
}): LocalChallenge {
  const now = Date.now()
  // Como en el servidor: Por idioma = mezcla de baúles; Global = cada uno con sus palabras.
  const isLanguage = input.settings.wordSource === 'mixed'
  return {
    id: newId(),
    slug: input.typeId,
    status: 'created',
    resultType: 'pending',
    scope: isLanguage ? 'language' : 'global',
    targetLang: isLanguage ? input.targetLang : null,
    nativeLang: isLanguage ? input.nativeLang : null,
    challengerUserId: input.challenger,
    challengedUserId: input.challenged,
    winnerUserId: null,
    durationSeconds: input.durationSeconds,
    expiresAt: new Date(now + input.durationSeconds * 1000).toISOString(),
    acceptUntil: new Date(now + INVITATION_WINDOW_MS).toISOString(),
    turnUserId: null,
    turnExpiresAt: null,
    startedAt: null,
    finalizedAt: null,
    gameMetadata: settingsToMetadata(input.settings, input.levels ? { levels: input.levels } : {}),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    competitors: [
      { userId: input.challenger, order: 1, invitationStatus: 'accepted', score: null, game: emptyGame() },
      { userId: input.challenged, order: 2, invitationStatus: 'pending', score: null, game: emptyGame() },
    ],
  }
}

function accept(challenge: LocalChallenge, userId: string, me: string) {
  const competitor = competitorOf(challenge, userId)
  competitor.invitationStatus = 'accepted'
  challenge.status = 'in_progress'
  challenge.startedAt = nowIso()
  // Como en el servidor: empieza quien acepta.
  challenge.turnUserId = userId
  challenge.turnExpiresAt = new Date(Date.now() + TURN_WINDOW_MS).toISOString()
  runBotTurns(challenge, me)
}

/** Un reto pendiente de un rival de prueba (para ver «Pendientes» y poder aceptarlo). */
function seedPending(me: string, botIndex: number, typeId: string) {
  const state = loadState()
  const bot = BOTS[botIndex]
  const settings = buildModeSettings({
    typeId,
    typeConfig: catalogRow(typeId)?.config || {},
    rounds: 2,
    responseSeconds: 5,
    wordSource: 'own',
  })
  if (!settings) return
  state.challenges.push(
    buildChallenge({
      typeId,
      challenger: bot.userId,
      challenged: me,
      targetLang: appContext.targetLang,
      nativeLang: appContext.nativeLang,
      settings,
      levels: null,
      durationSeconds: 86400,
    }),
  )
}

async function seedIfNeeded(me: string) {
  const state = loadState()
  if (!appContext.targetLang || !appContext.nativeLang) return
  let changed = false
  if (state.seededFor !== me) {
    state.seededFor = me
    // Un reto de Escucha pendiente (de Jorge). Marta queda libre para que la retes tú.
    seedPending(me, 1, 'ica-listen')
    changed = true
  }
  if (state.seededWritingFor !== me) {
    state.seededWritingFor = me
    // Y uno de Escritura (de Tomás), para poder aceptar un reto que se juegue escribiendo.
    seedPending(me, 3, 'ica-writing')
    changed = true
  }
  if (changed) saveState()
}

async function createChallenge(me: string, body: Record<string, unknown>) {
  const typeId = String(body.challengeTypeId || 'ica-own-words')
  const rivalId = String(body.challengedUserId || '')
  const bot = BOTS.find((item) => item.userId === rivalId)
  if (!bot) throw new LocalError('En el modo local solo puedes retar a los rivales de prueba.')
  const type = catalogRow(typeId)
  if (!type || !type.isActive) throw new LocalError('Ese modo aún no está disponible.')
  const wordSource: WordSource = body.wordSource === 'mixed' && body.scope !== 'global' ? 'mixed' : 'own'
  const targetLang = String(body.targetLang || appContext.targetLang)
  const nativeLang = String(body.nativeLang || appContext.nativeLang)

  const settings = buildModeSettings({
    typeId,
    typeConfig: type.config,
    rounds: body.rounds,
    responseSeconds: body.responseSeconds,
    wordSource,
  })
  if (!settings) throw new LocalError('Este modo todavía no se puede jugar.')
  // Con un «desafío extra» (2 ICA Coins) se puede tener un 4.º.
  const myLimit = MAX_ACTIVE + (body.useExtraSlot ? 1 : 0)
  if (activeCount(me) >= myLimit) throw new LocalError('Ya tienes 3 desafíos activos. Termina uno para retar de nuevo.')
  if (hasActivePair(me, rivalId)) throw new LocalError('Ya tienen un desafío activo entre ustedes.')

  const myLevel = await getMyLevel(targetLang, nativeLang)
  const rivalLevel = botLevel(myLevel, bot.levelOffset)
  if (wordSource === 'mixed') {
    const mixed = checkMixedAllowed({ myLevel, rivalLevel, maxGap: Number(type.config.maxLevelGap ?? DEFAULT_MAX_LEVEL_GAP) })
    if (!mixed.allowed) throw new LocalError(mixed.reason, 'ICA_CHALLENGE_LEVEL_GAP')
  }

  const mine = myCards(me, targetLang, nativeLang)
  const theirs = botCards(bot.userId, me, targetLang, nativeLang)
  // Como en el servidor: 20 palabras en el baúl para entrar en los retos.
  if (wordsMissingToJoin(mine.length) > 0) {
    throw new LocalError(notEnoughWordsToJoinMessage(mine.length, 'retar'), 'ICA_CHALLENGE_MIN_WORDS')
  }
  const requirement = KIND_REQUIREMENT[settings.kind]
  const minWords = minWordsForKind(settings.kind)
  const myEligible = countEligible(settings.kind, mine, targetLang)
  const theirEligible = countEligible(settings.kind, theirs, targetLang)
  if (wordSource === 'mixed' ? myEligible + theirEligible < minWords : myEligible < minWords) {
    throw new LocalError(`Necesitas al menos ${minWords} palabras ICA${requirement} para «${type.name}».`)
  }

  const challenge = buildChallenge({
    typeId,
    challenger: me,
    challenged: bot.userId,
    targetLang,
    nativeLang,
    settings,
    levels: wordSource === 'mixed' ? { challenger: myLevel, challenged: rivalLevel } : null,
    durationSeconds: Math.max(86400, Math.min(3 * 86400, Math.round(Number(body.durationSeconds) || 86400))),
  })
  loadState().challenges.unshift(challenge)
  // El rival de prueba acepta y juega su turno al momento.
  accept(challenge, bot.userId, me)
  return { challengeId: challenge.id }
}

function notEnoughWordsToJoinMessage(wordCount: number, action: 'retar' | 'aceptar'): string {
  const verb = action === 'retar' ? 'retar' : 'aceptar retos'
  return `Necesitas ${MIN_WORDS_TO_JOIN} palabras en tu Baúl ICA para ${verb}. Tienes ${wordCount}: te faltan ${wordsMissingToJoin(wordCount)}.`
}

async function listAvailableUsers(me: string, body: Record<string, unknown>) {
  const targetLang = String(body.targetLang || appContext.targetLang)
  const nativeLang = String(body.nativeLang || appContext.nativeLang)
  const myLevel = await getMyLevel(targetLang, nativeLang)
  const myActive = activeCount(me)
  const myWordCount = myCards(me, targetLang, nativeLang).length
  // Los rivales de prueba solo salen si su baúl de ejemplo llega a 20 palabras.
  const visibleBots = BOTS.filter(
    (bot) => wordsMissingToJoin(botCards(bot.userId, me, targetLang, nativeLang).length) === 0,
  )
  // Como en el servidor: racha de victorias y «los que más juegan, arriba».
  const activityRows = loadState().challenges.map((item) => ({
    challengerUserId: item.challengerUserId,
    challengedUserId: item.challengedUserId,
    status: item.status,
    resultType: item.resultType,
    winnerUserId: item.winnerUserId,
    finalizedAt: item.finalizedAt,
    createdAt: item.createdAt,
  }))
  const rows = visibleBots.map((bot) => {
    const activity = summarizeChallengeActivity(activityRows, bot.userId)
    const level = botLevel(myLevel, bot.levelOffset)
    const mixed = checkMixedAllowed({ myLevel, rivalLevel: level, maxGap: DEFAULT_MAX_LEVEL_GAP })
    let blockedReason: string | null = null
    if (myActive >= MAX_ACTIVE) blockedReason = 'Tu máximo de desafíos activos es 3.'
    else if (hasActivePair(me, bot.userId)) blockedReason = 'Ya tienen un desafío activo entre ustedes.'
    return {
      userId: bot.userId,
      displayName: bot.displayName,
      username: bot.username,
      nativeLang,
      targetLang,
      cefrLevel: level,
      level,
      samePair: true,
      mixedAllowed: mixed.allowed,
      mixedBlockedReason: mixed.allowed ? null : mixed.reason,
      activeChallengesCount: activeCount(bot.userId),
      canChallenge: blockedReason === null,
      blockedReason,
      winStreak: activity.winStreak,
      recentChallenges: activity.recentChallenges,
    }
  })
  rows.sort((a, b) => b.recentChallenges - a.recentChallenges || a.displayName.localeCompare(b.displayName, 'es'))
  return { rows, myActiveChallengesCount: myActive, myLevel, myWordCount, minWordsToJoin: MIN_WORDS_TO_JOIN }
}

/** Hace de función ica-challenges-center. Devuelve lo mismo que el servidor. */
export async function localInvoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const me = await getMyUserId()
  const action = String(body.action || '')
  try {
    let result: Record<string, unknown>
    if (action === 'list-challenge-types') {
      result = {
        rows: CATALOG.map((item) => ({
          id: item.id,
          name: item.name,
          iconKey: item.iconKey,
          isActive: item.isActive,
          order: item.order,
          scopes: ['global', 'language'],
          config: item.config,
          isPlayable: isPlayableTypeId(item.id),
          kind: MODE_DEFAULTS[item.id]?.kind ?? null,
          format: MODE_DEFAULTS[item.id]?.format ?? null,
          maxLevelGap: Number(item.config.maxLevelGap ?? DEFAULT_MAX_LEVEL_GAP),
        })),
      }
    } else if (action === 'list-available-users') {
      result = await listAvailableUsers(me, body)
    } else if (action === 'create-challenge' || action === 'create-own-words') {
      result = await createChallenge(me, body)
    } else if (action === 'respond-invitation' || action === 'cancel-invitation') {
      const challenge = loadState().challenges.find((item) => item.id === body.challengeId)
      if (!challenge || challenge.status !== 'created') throw new LocalError('El desafío ya no está pendiente.')
      if (action === 'cancel-invitation') {
        challenge.status = 'cancelled'
        challenge.resultType = 'cancelled'
        challenge.finalizedAt = nowIso()
      } else if (body.accept) {
        const pair = challenge.targetLang && challenge.nativeLang
          ? { targetLang: challenge.targetLang, nativeLang: challenge.nativeLang }
          : { targetLang: appContext.targetLang, nativeLang: appContext.nativeLang }
        const wordCount = myCards(me, pair.targetLang, pair.nativeLang).length
        if (wordsMissingToJoin(wordCount) > 0) {
          throw new LocalError(notEnoughWordsToJoinMessage(wordCount, 'aceptar'), 'ICA_CHALLENGE_MIN_WORDS')
        }
        accept(challenge, me, me)
      } else {
        competitorOf(challenge, me).invitationStatus = 'rejected'
        challenge.status = 'not_accepted'
        challenge.resultType = 'not_accepted'
        challenge.finalizedAt = nowIso()
      }
      result = { challengeId: challenge.id }
    } else {
      const challenge = loadState().challenges.find((item) => item.id === body.challengeId)
      if (!challenge) throw new LocalError('Desafío no encontrado.')
      const ctx = makeCtx(challenge, me, me)
      if (action === 'play-state') result = playState(ctx)
      else if (action === 'next-question') {
        result = { ...nextQuestion(ctx), progress: progressPayload(ctx), session: sessionPayload(ctx) }
        runBotTurns(challenge, me)
      } else if (action === 'answer-question') result = answerQuestion(ctx, body)
      else if (action === 'end-session') {
        if (challenge.status === 'in_progress' && competitorOf(challenge, me).game.sessionStartedAt) finishLightning(ctx)
        runBotTurns(challenge, me)
        result = { status: 'done', progress: progressPayload(ctx) }
      } else if (action === 'review') result = review(ctx)
      else throw new LocalError('Acción no soportada.')
    }
    saveState()
    return { ok: true, ...result }
  } catch (error) {
    saveState()
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Error en el modo local.',
      code: error instanceof LocalError ? error.code : null,
    }
  }
}

// ---------------------------------------------------------------------------
// Lo que la app lee directamente de tablas (en local, de aquí)
// ---------------------------------------------------------------------------

export async function localFetchEnrollment(targetLang: string, nativeLang: string): Promise<IcaChallengeEnrollment> {
  const me = await getMyUserId()
  return {
    id: 'local-enrollment',
    userId: me,
    targetLang,
    nativeLang,
    isActive: loadState().enrollmentByLang?.[`${targetLang}|${nativeLang}`] ?? loadState().enrollmentActive,
    createdAt: null,
    updatedAt: null,
  }
}

export async function localSetEnrollment(input: {
  targetLang: string
  nativeLang: string
  isActive: boolean
}): Promise<IcaChallengeEnrollment> {
  const state = loadState()
  state.enrollmentByLang = { ...(state.enrollmentByLang || {}), [`${input.targetLang}|${input.nativeLang}`]: input.isActive }
  saveState()
  return localFetchEnrollment(input.targetLang, input.nativeLang)
}

function toRecord(challenge: LocalChallenge): IcaChallengeRecord {
  return {
    id: challenge.id,
    challengeSlug: challenge.slug,
    status: challenge.status,
    resultType: challenge.resultType,
    scope: challenge.scope,
    targetLang: challenge.targetLang,
    nativeLang: challenge.nativeLang,
    challengerUserId: challenge.challengerUserId,
    challengedUserId: challenge.challengedUserId,
    winnerUserId: challenge.winnerUserId,
    durationSeconds: challenge.durationSeconds,
    expiresAt: challenge.expiresAt,
    acceptUntil: challenge.acceptUntil,
    turnUserId: challenge.turnUserId,
    turnExpiresAt: challenge.turnExpiresAt,
    startedAt: challenge.startedAt,
    finalizedAt: challenge.finalizedAt,
    gameMetadata: challenge.gameMetadata,
    phases: [],
    competitors: challenge.competitors.map((item) => ({
      challengeId: challenge.id,
      userId: item.userId,
      competitorOrder: item.order,
      invitationStatus: item.invitationStatus,
      score: item.score,
      payload: { game: item.game },
      acceptedAt: null,
      rejectedAt: null,
      createdAt: challenge.createdAt,
      updatedAt: challenge.updatedAt,
    })),
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
  }
}

export async function localListChallenges(): Promise<IcaChallengeRecord[]> {
  const me = await getMyUserId()
  await seedIfNeeded(me)
  return loadState()
    .challenges.filter((item) => item.challengerUserId === me || item.challengedUserId === me)
    .map(toRecord)
}

export async function localGetChallenge(challengeId: string): Promise<IcaChallengeRecord | null> {
  const challenge = loadState().challenges.find((item) => item.id === challengeId)
  return challenge ? toRecord(challenge) : null
}

export function localListPlays(challengeIds: string[]): IcaChallengePlayRecord[] {
  const ids = new Set(challengeIds)
  return loadState()
    .plays.filter((play) => ids.has(play.challengeId))
    .sort((a, b) => a.index - b.index)
    .map((play) => ({
      id: play.id,
      challengeId: play.challengeId,
      userId: play.userId,
      index: play.index,
      isCorrect: play.isCorrect,
      responseMs: play.ms,
      payload: {},
      createdAt: play.createdAt,
    }))
}

export function localBotProfiles(): Record<string, { displayName: string; username: string | null; avatarUrl: string | null }> {
  return BOTS.reduce<Record<string, { displayName: string; username: string | null; avatarUrl: string | null }>>(
    (acc, bot) => {
      acc[bot.userId] = { displayName: bot.displayName, username: bot.username, avatarUrl: null }
      return acc
    },
    {},
  )
}

// ---------------------------------------------------------------------------
// Reto de un icademer virtual (para probar «Pendientes» cuando quieras)
// ---------------------------------------------------------------------------

/** Nombres cortos para `?reto-virtual=<modo>` en la dirección. */
const VIRTUAL_MODE_ALIASES: Record<string, string> = {
  lectura: 'ica-own-words',
  escritura: 'ica-writing',
  'cuenta-atras': 'ica-lightning',
  relampago: 'ica-lightning',
  escucha: 'ica-listen',
  habla: 'ica-speak',
  parejas: 'ica-pairs',
}

/**
 * Un icademer virtual libre (sin un reto ya abierto contigo) te reta. Sin modo, se elige
 * uno al azar entre los que se pueden jugar. Solo en el modo local de Desafíos ICA.
 */
export async function seedVirtualChallenge(mode?: string | null): Promise<{ botName: string; modeName: string }> {
  const me = await getMyUserId()
  if (!appContext.targetLang || !appContext.nativeLang) {
    throw new LocalError('Abre Desafíos ICA para que el modo de prueba sepa tu idioma.')
  }
  const free = BOTS.map((bot, index) => ({ bot, index }))
    .filter(({ bot }) => !hasActivePair(me, bot.userId))
    .sort((a, b) => activeCount(a.bot.userId) - activeCount(b.bot.userId))
  if (free.length === 0) {
    throw new LocalError('Ya tienes un reto abierto con los 4 icademers virtuales. Termina o rechaza uno.')
  }
  const playable = CATALOG.filter((item) => item.isActive && isPlayableTypeId(item.id))
  const wanted = mode ? VIRTUAL_MODE_ALIASES[mode.toLowerCase()] ?? mode : null
  const type = (wanted && playable.find((item) => item.id === wanted)) || playable[Math.floor(Math.random() * playable.length)]
  const pick = free[Math.floor(Math.random() * Math.min(2, free.length))]
  seedPending(me, pick.index, type.id)
  saveState()
  return { botName: pick.bot.displayName, modeName: type.name }
}

// ---------------------------------------------------------------------------
// Demo de Desafíos ICA (para enseñarlo): varias personas te retan y puedes retar
// ---------------------------------------------------------------------------

/** Juega una partida entera en segundo plano (tú con `myAccuracy`) y la deja como de hace unos días. */
function simulateFinishedChallenge(me: string, botId: string, typeId: string, myAccuracy: number, daysAgo: number) {
  const settings = buildModeSettings({
    typeId,
    typeConfig: catalogRow(typeId)?.config || {},
    rounds: 2,
    responseSeconds: 5,
    wordSource: 'own',
  })
  if (!settings) return
  const challenge = buildChallenge({
    typeId,
    challenger: me,
    challenged: botId,
    targetLang: appContext.targetLang,
    nativeLang: appContext.nativeLang,
    settings,
    levels: null,
    durationSeconds: 86400,
  })
  loadState().challenges.unshift(challenge)
  accept(challenge, botId, me)
  let guard = 0
  while (challenge.status === 'in_progress' && guard < 40) {
    if (challenge.turnUserId === me) botPlayTurn(challenge, me, me, myAccuracy)
    runBotTurns(challenge, me)
    guard += 1
  }
  const when = new Date(Date.now() - daysAgo * 86400000)
  const iso = when.toISOString()
  challenge.createdAt = new Date(when.getTime() - 3 * 3600000).toISOString()
  challenge.startedAt = new Date(when.getTime() - 2 * 3600000).toISOString()
  challenge.finalizedAt = iso
  challenge.updatedAt = iso
}

/**
 * Deja Desafíos ICA listo para enseñarlo (solo modo local): borra los retos de prueba,
 * te inscribe, crea un historial (2 ganados seguidos y 1 perdido), y dos icademers te retan
 * a modos distintos. Quedan libres varios icademers para que los retes tú.
 */
export async function prepareChallengesDemo(): Promise<{ pending: number; free: number }> {
  const me = await getMyUserId()
  if (!appContext.targetLang || !appContext.nativeLang) {
    throw new LocalError('Abre Desafíos ICA para que el modo de prueba sepa tu idioma.')
  }
  memoryState = emptyState()
  const state = memoryState
  state.seededFor = me
  state.seededWritingFor = me
  state.demo = true
  state.enrollmentByLang = { [`${appContext.targetLang}|${appContext.nativeLang}`]: true }

  // Historial: perdiste con Jorge, ganaste a Kasia y a Lucía (racha de 2 victorias).
  simulateFinishedChallenge(me, 'local-bot-jorge', 'ica-listen', 0.2, 3)
  simulateFinishedChallenge(me, 'local-bot-kasia', 'ica-own-words', 1, 2)
  simulateFinishedChallenge(me, 'local-bot-lucia', 'ica-pairs', 1, 1)

  // Te retan: Sofía a Parejas y Piotr a Escritura · cuenta atrás (en «Pendientes»).
  seedPending(me, BOTS.findIndex((bot) => bot.userId === 'local-bot-sofia'), 'ica-pairs')
  seedPending(me, BOTS.findIndex((bot) => bot.userId === 'local-bot-piotr'), 'ica-lightning')
  saveState()
  const free = BOTS.filter((bot) => !hasActivePair(me, bot.userId)).length
  return { pending: 2, free }
}
