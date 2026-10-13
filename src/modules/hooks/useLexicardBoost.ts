import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { t, tn } from '@/i18n'
import {
  BOOST_DAILY_LIMIT,
  BOOST_GAMES,
  BoostLimitError,
  boostLexicard,
  fetchBoostUsage,
  isBoosted,
  type BoostSource,
} from '../services/lexicardBoost'
import type { AppConfig, Lexicard } from '../types'

/**
 * POTENCIAR (Luis, 12 Oct): one place for everything the boost button needs, used by Inmersión,
 * the results of a Desafío ICA and PreguntICA. The server counts the day (max 3, all places
 * together); this hook only shows «quedan N» and sends the tap.
 */
export type WordBoostState =
  | 'none' // the word is not in the Baúl ICA: nothing to boost
  | 'available'
  | 'boosted' // already boosted and not played yet
  | 'limit' // the 3 of today are used

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

export function useLexicardBoost({
  cards,
  setCards,
  config,
  source,
  successToast = true,
}: {
  cards: Lexicard[]
  setCards: Dispatch<SetStateAction<Lexicard[]>>
  config: Pick<AppConfig, 'targetLang' | 'nativeLang'>
  source: BoostSource
  successToast?: boolean
}) {
  // null = the server has not said yet (the button stays available; the server decides).
  const [remaining, setRemaining] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const busyRef = useRef(false)
  // Once a boost has answered, its numbers are newer than the first count.
  const answeredRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void fetchBoostUsage().then((usage) => {
      if (!cancelled && usage && !answeredRef.current) setRemaining(usage.remaining)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const findCard = useCallback(
    (word: string): Lexicard | undefined => {
      const key = normalize(word)
      if (!key) return undefined
      return cards.find(
        (card) =>
          normalize(card.target) === key
          && (card.targetLang || config.targetLang) === config.targetLang
          && (card.nativeLang || config.nativeLang) === config.nativeLang,
      )
    },
    [cards, config.nativeLang, config.targetLang],
  )

  const stateOfCard = useCallback(
    (card: Lexicard | undefined): WordBoostState => {
      if (!card) return 'none'
      if (isBoosted(card, 'flash') || isBoosted(card, 'daily') || isBoosted(card, 'duel')) return 'boosted'
      if (remaining !== null && remaining <= 0) return 'limit'
      return 'available'
    },
    [remaining],
  )

  const stateOf = useCallback((word: string): WordBoostState => stateOfCard(findCard(word)), [findCard, stateOfCard])

  /** Boosts this card (true when it worked). Shows its own error; the success toast is optional. */
  const boostCard = useCallback(
    async (card: Lexicard | undefined): Promise<boolean> => {
      if (!card || busyRef.current) return false
      if (remaining !== null && remaining <= 0) {
        toast.error(t('Hoy ya se usaron las {n} potenciaciones. Mañana habrá {n} más.', { n: BOOST_DAILY_LIMIT }))
        return false
      }
      busyRef.current = true
      setBusyId(card.id)
      try {
        const usage = await boostLexicard(card.id, source)
        answeredRef.current = true
        setCards((prev) =>
          prev.map((item) =>
            item.id === card.id
              ? { ...item, importance: 'vital', boostFlash: BOOST_GAMES, boostDaily: BOOST_GAMES, boostDuel: BOOST_GAMES }
              : item,
          ),
        )
        const left = usage ? usage.remaining : remaining === null ? null : Math.max(0, remaining - 1)
        setRemaining(left)
        if (successToast) {
          toast.success(t('"{word}" potenciada. Saldrá con preferencia en tus próximos juegos.', { word: card.target }), {
            description:
              left === null
                ? undefined
                : left === 0
                  ? t('Hoy ya no quedan más potenciaciones.')
                  : tn(left, 'Queda {n} potenciación hoy.', 'Quedan {n} potenciaciones hoy.'),
          })
        }
        return true
      } catch (error) {
        if (error instanceof BoostLimitError) {
          answeredRef.current = true
          setRemaining(0)
          toast.error(t('Hoy ya se usaron las {n} potenciaciones. Mañana habrá {n} más.', { n: BOOST_DAILY_LIMIT }))
        } else {
          console.error(error)
          toast.error(t('No se pudo potenciar la palabra. Inténtalo de nuevo.'))
        }
        return false
      } finally {
        busyRef.current = false
        setBusyId(null)
      }
    },
    [remaining, setCards, source, successToast],
  )

  /** Boosts the word of the Baúl ICA with this text (true when it worked). */
  const boost = useCallback((word: string): Promise<boolean> => boostCard(findCard(word)), [boostCard, findCard])

  const isBusy = useCallback(
    (word: string): boolean => busyId !== null && findCard(word)?.id === busyId,
    [busyId, findCard],
  )

  return {
    /** Boosts left today (null = unknown yet). */
    remaining,
    limit: BOOST_DAILY_LIMIT,
    /** Id of the word being boosted right now. */
    busyId,
    findCard,
    isBusy,
    stateOf,
    stateOfCard,
    boost,
    boostCard,
  }
}
