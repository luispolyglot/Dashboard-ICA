import { LEVEL_DESCRIPTIONS } from '../constants'
import type {
  ActivationPhraseResult,
  AnthropicResponse,
  CEFRLevel,
  Lexicard,
} from '../types'

const API_URL = `${import.meta.env.VITE_ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const MODEL = import.meta.env.VITE_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'

function getHeaders() {
  if (!API_KEY) {
    throw new Error('Falta VITE_ANTHROPIC_API_KEY en .env')
  }
  return {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

function readTextBlocks(data: AnthropicResponse): string | undefined {
  return data.content
    ?.map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
}

export async function fetchTranslation(
  text: string,
  fromLang: string,
  toLang: string,
): Promise<string | null> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: `You are a translator. Translate from ${fromLang} to ${toLang}. Reply ONLY with the translation. No quotes, no explanation. If you cannot translate, reply: —`,
        messages: [{ role: 'user', content: text }],
      }),
    })

    if (!res.ok) return null
    const data = (await res.json()) as AnthropicResponse
    const result = readTextBlocks(data)
    return result && result !== '—' ? result : null
  } catch {
    return null
  }
}

export async function fetchActivationPhrase(
  words: Lexicard[],
  targetLang: string,
  nativeLang: string,
  level: CEFRLevel,
): Promise<ActivationPhraseResult | null> {
  try {
    const wordList = words.map((w) => w.target).join(', ')
    const levelDesc = LEVEL_DESCRIPTIONS[level] || LEVEL_DESCRIPTIONS.A2
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system:
          'You generate natural sentences for language learners. Reply ONLY in JSON. No markdown, no backticks.',
        messages: [
          {
            role: 'user',
            content: `Generate a sentence in ${targetLang} including ALL words: ${wordList}\nRules:\n- CEFR ${level} level. Description: ${levelDesc}\n- 20-28 words long\n- Natural, native-sounding\n- Translate to ${nativeLang}\nReply ONLY:\n{"phrase":"<sentence>","translation":"<translation>","words_used":["w1","w2"]}`,
          },
        ],
      }),
    })

    if (!res.ok) return null
    const data = (await res.json()) as AnthropicResponse
    const text = readTextBlocks(data)
    if (!text) return null
    return JSON.parse(text.replace(/```json|```/g, '').trim()) as ActivationPhraseResult
  } catch (error) {
    console.error(error)
    return null
  }
}
