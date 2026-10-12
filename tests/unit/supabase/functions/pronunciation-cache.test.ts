import { describe, expect, it, vi } from 'vitest'
import {
  readCachedRespellings,
  storeRespellings,
  type PronunciationCacheClient,
} from '../../../../supabase/functions/_shared/pronunciation-cache'

function fakeClient(rows: Array<{ word_key: string; respelling: string }>) {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const upsert = vi.fn(async (...args: unknown[]) => {
    calls.push({ op: 'upsert', args })
    return { error: null }
  })
  const client = {
    from: () => ({
      select: () => ({
        eq: (_c1: string, v1: string) => ({
          eq: (_c2: string, v2: string) => ({
            in: async (_c3: string, keys: string[]) => {
              calls.push({ op: 'read', args: [v1, v2, keys] })
              return { data: rows.filter((row) => keys.includes(row.word_key)), error: null }
            },
          }),
        }),
      }),
      upsert,
    }),
  } as unknown as PronunciationCacheClient
  return { client, calls, upsert }
}

describe('caché compartida de pronunciación', () => {
  it('devuelve las que ya están, sin distinguir mayúsculas', async () => {
    const { client, calls } = fakeClient([{ word_key: 'merci', respelling: 'mersí' }])
    const result = await readCachedRespellings(client, ['Merci', 'bonjour'], 'Francés', 'Español')
    expect(result).toEqual({ Merci: 'mersí' })
    expect(calls[0].args).toEqual(['francés', 'español', ['merci', 'bonjour']])
  })

  it('guarda las nuevas sin pisar las que ya hay', async () => {
    const { client, upsert } = fakeClient([])
    await storeRespellings(client, { Bonjour: 'bonyur' }, 'Francés', 'Español', 'm')
    expect(upsert).toHaveBeenCalledWith(
      [{ target_lang: 'francés', native_lang: 'español', word_key: 'bonjour', respelling: 'bonyur', model: 'm' }],
      { onConflict: 'target_lang,native_lang,word_key', ignoreDuplicates: true },
    )
  })

  it('sin base de datos no falla', async () => {
    expect(await readCachedRespellings(null, ['a'], 'x', 'y')).toEqual({})
    await expect(storeRespellings(null, { a: 'b' }, 'x', 'y', 'm')).resolves.toBeUndefined()
  })
})
