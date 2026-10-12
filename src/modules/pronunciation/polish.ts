// PRONUNCIACIÓN DEL POLACO PARA HISPANOHABLANTES, SIN IA (Luis, 4 oct).
//
// La IA barata se equivocaba mucho («postawiłem» → /postawiem/, «sposób» → /spósob/). El polaco
// se escribe casi siempre como suena, así que se puede pasar a ortografía española con reglas fijas:
//
//   ł → u · w → v · ó, u → u · y → i · j → y · ch, h → j · c → ts · z → s
//   sz, ś, si, rz, ż, ź, zi → sh · cz, ć, ci → ch · dź, dzi, dż → y · dz → ds
//   ń, ni → ñ · ą → on · ę → en (al final, e) · ge, gi → gue, gui
//   Al final de palabra, las sonoras se vuelven sordas: b → p, d → t, g → k, w → f, z → s.
//   El acento va siempre en la penúltima sílaba; se escribe la tilde solo si un hispanohablante
//   no la pondría ahí solo (spósup, postavíuem).
//
// Ejemplos: postawiłem → postavíuem · sposób → spósup · dziękuję → yenkúye · przepraszam → pshepráshom

const VOWELS = new Set(['a', 'ą', 'e', 'ę', 'i', 'o', 'ó', 'u', 'y'])
/** Consonantes sordas: ante ellas (o al final), la w suena f. */
const VOICELESS = ['p', 't', 'k', 's', 'ś', 'sz', 'c', 'ć', 'cz', 'ch', 'h', 'f']

type Piece = { out: string; vowel: boolean }

const isVowel = (char: string | undefined) => Boolean(char && VOWELS.has(char))

function startsVoiceless(word: string, at: number): boolean {
  return VOICELESS.some((item) => word.startsWith(item, at))
}

/** Pasa una palabra polaca (en minúsculas) a trozos de ortografía española. */
function respellPieces(word: string): Piece[] {
  const pieces: Piece[] = []
  let i = 0
  const push = (out: string, vowel = false) => pieces.push({ out, vowel })
  const atEnd = (at: number) => at >= word.length

  // Consonante blanda: «ci», «si», «zi», «ni», «dzi» + vocal → la i no suena (solo ablanda).
  const soft = (len: number, out: string, finalOut = out) => {
    const next = i + len
    if (word[next] === 'i' && isVowel(word[next + 1])) {
      push(out)
      i = next + 1
    } else if (word[next] === 'i') {
      push(out)
      i = next // la i se queda como vocal
    } else {
      push(atEnd(next) ? finalOut : out)
      i = next
    }
  }

  while (i < word.length) {
    const c = word[i]
    const two = word.slice(i, i + 2)
    const three = word.slice(i, i + 3)
    const prevPiece = pieces[pieces.length - 1]

    if (three === 'dzi') {
      soft(2, 'y', 'ch')
      continue
    }
    if (two === 'dź' || two === 'dż') {
      push(atEnd(i + 2) ? 'ch' : 'y')
      i += 2
      continue
    }
    if (two === 'dz') {
      push(atEnd(i + 2) ? 'ts' : 'ds')
      i += 2
      continue
    }
    if (two === 'sz' || two === 'rz') {
      push('sh')
      i += 2
      continue
    }
    if (two === 'cz') {
      push('ch')
      i += 2
      continue
    }
    if (two === 'ch') {
      push('j')
      i += 2
      continue
    }
    if (two === 'ci') {
      soft(1, 'ch')
      continue
    }
    if (two === 'si' || two === 'zi') {
      soft(1, 'sh')
      continue
    }
    if (two === 'ni') {
      soft(1, 'ñ', 'ñ')
      continue
    }

    switch (c) {
      case 'a':
      case 'e':
      case 'o':
        push(c, true)
        break
      case 'i':
        // Tras consonante y antes de vocal, la i solo ablanda (pię → pie, miasto → mias-to).
        push('i', !(prevPiece && !prevPiece.vowel && isVowel(word[i + 1])))
        break
      case 'y':
        push('i', true)
        break
      case 'u':
      case 'ó':
        push('u', true)
        break
      case 'ą': {
        const next = word[i + 1]
        push(next === 'b' || next === 'p' ? 'om' : next === 'l' || next === 'ł' ? 'o' : 'on', true)
        break
      }
      case 'ę': {
        const next = word[i + 1]
        push(atEnd(i + 1) || next === 'l' || next === 'ł' ? 'e' : next === 'b' || next === 'p' ? 'em' : 'en', true)
        break
      }
      case 'ł':
        // Entre dos consonantes casi no suena (jabłko → yabko).
        if (prevPiece && !prevPiece.vowel && word[i + 1] && !isVowel(word[i + 1])) break
        push('u')
        break
      case 'w': {
        const afterVoiceless = prevPiece && !prevPiece.vowel && ['p', 't', 'k', 's', 'sh', 'ch', 'ts', 'j', 'f'].includes(prevPiece.out)
        push(atEnd(i + 1) || startsVoiceless(word, i + 1) || afterVoiceless ? 'f' : 'v')
        break
      }
      case 'j':
        push(isVowel(word[i + 1]) ? 'y' : 'i')
        break
      case 'h':
        push('j')
        break
      case 'c':
      case 'ć':
        push(c === 'c' ? 'ts' : 'ch')
        break
      case 'ś':
      case 'ż':
      case 'ź':
        push('sh')
        break
      case 'z':
        push('s')
        break
      case 'ń':
        push('ñ')
        break
      case 'g': {
        const next = word[i + 1]
        push(atEnd(i + 1) ? 'k' : next === 'e' || next === 'i' || next === 'ę' || next === 'y' ? 'gu' : 'g')
        break
      }
      case 'b':
        push(atEnd(i + 1) ? 'p' : 'b')
        break
      case 'd':
        push(atEnd(i + 1) ? 't' : 'd')
        break
      case 'x':
        push('ks')
        break
      case 'q':
        push('k')
        break
      default:
        push(c)
    }
    i += 1
  }
  return pieces
}

const STRONG = new Set(['a', 'e', 'o'])
const WEAK = new Set(['i', 'u'])
const ACCENTED: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' }

/** Grupos de vocales tal como los lee un hispanohablante (diptongos juntos, hiatos separados). */
function spanishNuclei(text: string): Array<{ start: number; end: number }> {
  const groups: Array<{ start: number; end: number }> = []
  let index = 0
  while (index < text.length) {
    if (!STRONG.has(text[index]) && !WEAK.has(text[index])) {
      index += 1
      continue
    }
    let end = index + 1
    // Se juntan mientras no haya dos fuertes seguidas.
    while (end < text.length && (STRONG.has(text[end]) || WEAK.has(text[end]))) {
      if (STRONG.has(text[end]) && STRONG.has(text[end - 1])) break
      end += 1
    }
    groups.push({ start: index, end })
    index = end
  }
  return groups
}

/** Dónde pondría el acento un hispanohablante sin tilde: la letra de la sílaba fuerte. */
function naturalStress(text: string): number | null {
  const groups = spanishNuclei(text)
  if (groups.length === 0) return null
  const last = text[text.length - 1]
  const group = groups.length === 1 ? groups[0] : /[aeiouns]/.test(last) ? groups[groups.length - 2] : groups[groups.length - 1]
  const letters = text.slice(group.start, group.end)
  const strongAt = [...letters].findIndex((letter) => STRONG.has(letter))
  // Diptongo de dos débiles («ui», «iu»): suena la segunda.
  return group.start + (strongAt >= 0 ? strongAt : letters.length - 1)
}

/** «postawiłem» → «postavíuem». Palabras sueltas o expresiones de varias palabras. */
export function polishToSpanishRespelling(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((token) => {
      if (!/\p{L}/u.test(token)) return token
      const word = token.replace(/[^\p{L}]/gu, '')
      const pieces = respellPieces(word)
      const text = pieces.map((piece) => piece.out).join('')
      const nuclei = pieces.map((piece, index) => ({ piece, index })).filter(({ piece }) => piece.vowel)
      if (nuclei.length < 2) return text
      // En polaco, la penúltima sílaba.
      const stressedPiece = nuclei[nuclei.length - 2].index
      const offset = pieces.slice(0, stressedPiece).reduce((sum, piece) => sum + piece.out.length, 0)
      const target = offset // primera letra del trozo (la vocal)
      if (naturalStress(text) === target) return text
      const letter = text[target]
      return ACCENTED[letter] ? text.slice(0, target) + ACCENTED[letter] + text.slice(target + 1) : text
    })
    .join('')
}

/** ¿Se puede sacar sin IA? (polaco para quien habla español). */
export function canRespellLocally(targetLang: string | null | undefined, nativeLang: string | null | undefined): boolean {
  const target = (targetLang || '').trim().toLowerCase()
  const native = (nativeLang || '').trim().toLowerCase()
  return (target === 'polaco' || target === 'polish' || target === 'pl') && (native === 'español' || native === 'spanish' || native === 'es')
}
