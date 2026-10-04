// Shared cache of pronunciation respellings (table public.pronunciation_respellings).
// A word is asked to the AI once for everyone; later requests read it from the table.

export const pronunciationLangKey = (lang: string) => lang.trim().toLowerCase()
export const pronunciationWordKey = (word: string) => word.normalize('NFC').trim().toLowerCase()

type Row = { word_key: string; respelling: string }

/** Minimal shape of the Supabase client used here (keeps this file testable without the SDK). */
export type PronunciationCacheClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          in: (column: string, values: string[]) => PromiseLike<{ data: Row[] | null; error: unknown }>
        }
      }
    }
    upsert: (
      rows: Array<Record<string, string>>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => PromiseLike<{ error: unknown }>
  }
}

/** Returns { word: respelling } for the words already in the table. Errors count as a miss. */
export async function readCachedRespellings(
  client: PronunciationCacheClient | null,
  words: string[],
  targetLang: string,
  nativeLang: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!client || words.length === 0) return out
  try {
    const keys = Array.from(new Set(words.map(pronunciationWordKey)))
    const { data, error } = await client
      .from('pronunciation_respellings')
      .select('word_key, respelling')
      .eq('target_lang', pronunciationLangKey(targetLang))
      .eq('native_lang', pronunciationLangKey(nativeLang))
      .in('word_key', keys)
    if (error || !data) return out
    const byKey = new Map(data.map((row) => [row.word_key, row.respelling]))
    for (const word of words) {
      const hit = byKey.get(pronunciationWordKey(word))
      if (hit) out[word] = hit
    }
  } catch {
    // Without the cache the AI is asked, as before.
  }
  return out
}

/** Stores new respellings. Never overwrites an existing one. Errors are ignored. */
export async function storeRespellings(
  client: PronunciationCacheClient | null,
  entries: Record<string, string>,
  targetLang: string,
  nativeLang: string,
  model: string,
): Promise<void> {
  if (!client) return
  const rows = Object.entries(entries)
    .map(([word, respelling]) => ({
      target_lang: pronunciationLangKey(targetLang),
      native_lang: pronunciationLangKey(nativeLang),
      word_key: pronunciationWordKey(word),
      respelling: respelling.trim(),
      model,
    }))
    .filter((row) => row.word_key && row.respelling && row.word_key.length <= 80 && row.respelling.length <= 80)
  if (rows.length === 0) return
  try {
    await client
      .from('pronunciation_respellings')
      .upsert(rows, { onConflict: 'target_lang,native_lang,word_key', ignoreDuplicates: true })
  } catch {
    // The student still gets the result; it will just be asked again next time.
  }
}
