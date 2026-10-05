// LOCAL PREMIUM VOICE (Luis, 5 Oct): a Vite plugin that only runs with `pnpm dev` (never in the build).
//
// The app asks POST /__ica/tts { text, lang } and gets the audio from Gemini TTS
// (gemini-3.8-flash-lite-tts, voice Kore). The key lives in .env.local as GEMINI_API_KEY
// (no VITE_ prefix, so it never reaches the browser). Each text is generated once and saved in
// node_modules/.cache/ica-tts, so repeating it costs nothing. Without a key the endpoint answers 404
// and the app keeps its old voices.
//
// Plain JS on purpose: it is imported by vite.config.js (the file Vite actually loads) and by
// vite.config.ts.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'

/** @param {Buffer} pcm @param {number} rate */
function toWav(pcm, rate) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

// USAGE (Luis, 5 Oct): every generated audio is written to usage.jsonl next to the cached audios
// (tokens, seconds and estimated price), and every audio served from the cache too (free).
// GET /__ica/tts/usage returns the totals for the admin panel («Voz premium»).
// Paid tier prices per million tokens (ai.google.dev/gemini-api/docs/pricing, October 2026).
const PRICES = {
  'gemini-3.8-flash-lite-tts': { input: [0.5, 1], output: [6, 12] },
  'gemini-3.8-flash-tts': { input: [0.5, 1], output: [9, 18] },
}
/** Prices double from 1 January 2027. */
const PRICE_CHANGE_DAY = '2027-01-01'
/** Gemini counts 25 audio tokens per second when the answer does not say. */
const AUDIO_TOKENS_PER_SECOND = 25

function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** @param {string} model @param {string} day @param {number} inputTokens @param {number} outputTokens */
function priceUsd(model, day, inputTokens, outputTokens) {
  const prices = PRICES[model] || PRICES['gemini-3.8-flash-lite-tts']
  const step = day >= PRICE_CHANGE_DAY ? 1 : 0
  return (inputTokens * prices.input[step] + outputTokens * prices.output[step]) / 1_000_000
}

/** @param {Buffer} wav */
function wavSeconds(wav) {
  if (wav.length < 44 || wav.subarray(0, 4).toString('ascii') !== 'RIFF') return 0
  const byteRate = wav.readUInt32LE(28) || 48000
  return Math.max(0, (wav.length - 44) / byteRate)
}

/** @param {string} file */
function readUsage(file) {
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/** Totals for today, this month, everything, and the last 14 days. */
function summarizeUsage(rows, model) {
  const empty = () => ({ generated: 0, reused: 0, seconds: 0, costUsd: 0 })
  const today = localDay()
  const month = today.slice(0, 7)
  const totals = { today: empty(), month: empty(), all: empty() }
  /** @type {Record<string, ReturnType<typeof empty>>} */
  const byDay = {}
  for (const row of rows) {
    const day = String(row.day || '')
    const buckets = [totals.all, (byDay[day] ||= empty())]
    if (day === today) buckets.push(totals.today)
    if (day.startsWith(month)) buckets.push(totals.month)
    for (const bucket of buckets) {
      if (row.kind === 'hit') {
        bucket.reused += 1
      } else {
        bucket.generated += 1
        bucket.seconds += Number(row.seconds || 0)
        bucket.costUsd += Number(row.costUsd || 0)
      }
    }
  }
  const days = []
  for (let back = 13; back >= 0; back -= 1) {
    const date = new Date()
    date.setDate(date.getDate() - back)
    const day = localDay(date)
    days.push({ day, ...(byDay[day] || empty()) })
  }
  const prices = PRICES[model] || PRICES['gemini-3.8-flash-lite-tts']
  return { model, source: 'local', today: totals.today, month: totals.month, all: totals.all, days, prices: { inputPerMillionUsd: prices.input[0], outputPerMillionUsd: prices.output[0], from2027Multiplier: 2 } }
}

/** @returns {import('vite').Plugin} */
export function localPremiumVoice() {
  return {
    name: 'ica-local-premium-voice',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''
      const model = env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts'
      const voice = env.GEMINI_TTS_VOICE || 'Kore'
      const cacheDir = path.resolve(server.config.root, 'node_modules/.cache/ica-tts')
      /** @type {Map<string, Promise<Buffer>>} */
      const inFlight = new Map()
      const usageFile = path.join(cacheDir, 'usage.jsonl')
      /** @param {Record<string, unknown>} entry */
      const logUsage = (entry) => {
        try {
          fs.mkdirSync(cacheDir, { recursive: true })
          fs.appendFileSync(usageFile, `${JSON.stringify(entry)}\n`)
        } catch {
          // Without the log the voice still works.
        }
      }
      const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
      server.config.logger.info(
        apiKey ? `  Premium voice: ${model} (${voice})` : '  Premium voice: off (no GEMINI_API_KEY in .env.local)',
      )

      /** @param {string} text @param {string} lang @returns {Promise<Buffer>} */
      const generate = async (text, lang) => {
        const language = languageNames.of(lang) || lang
        /** @param {boolean} withStyle */
        const call = async (withStyle) => {
          /** @type {Record<string, unknown>} */
          const part = { text }
          if (withStyle) {
            part.speech_metadata = {
              style: `Native ${language} speaker (${lang}). Read it in ${language}, clearly and naturally, like a friendly teacher.`,
            }
          }
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [part] }],
              generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice } } },
            }),
          })
          const data = await response.json().catch(() => ({}))
          return { response, data }
        }
        let { response, data } = await call(true)
        // If this model does not accept the style field, try once with the plain text.
        if (response.status === 400) ({ response, data } = await call(false))
        if (!response.ok) throw new Error(data?.error?.message || `Gemini TTS ${response.status}`)
        const parts = data?.candidates?.[0]?.content?.parts || []
        const inline = parts.find((p) => p?.inlineData?.data)?.inlineData
        if (!inline?.data) throw new Error('Gemini TTS: no audio in the answer')
        const bytes = Buffer.from(inline.data, 'base64')
        const rate = Number(/rate=(\d+)/.exec(inline.mimeType || '')?.[1]) || 24000
        const audio = bytes.subarray(0, 4).toString('ascii') === 'RIFF' ? bytes : toWav(bytes, rate)
        // Usage of this call: the real token counts when Gemini sends them, an estimate if not.
        const seconds = wavSeconds(audio)
        const meta = data?.usageMetadata || {}
        const inputTokens = Number(meta.promptTokenCount) || Math.ceil((text.length + 120) / 4)
        const outputTokens = Number(meta.candidatesTokenCount) || Math.ceil(seconds * AUDIO_TOKENS_PER_SECOND)
        const day = localDay()
        logUsage({
          at: new Date().toISOString(),
          day,
          kind: 'gen',
          model,
          lang,
          chars: text.length,
          seconds: Math.round(seconds * 100) / 100,
          inputTokens,
          outputTokens,
          costUsd: priceUsd(model, day, inputTokens, outputTokens),
        })
        return audio
      }

      server.middlewares.use('/__ica/tts', (req, res) => {
        /** @param {number} status @param {Buffer | string} body */
        const reply = (status, body, type = 'text/plain; charset=utf-8') => {
          res.statusCode = status
          res.setHeader('Content-Type', type)
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
        }
        if (req.method === 'GET' && (req.url || '').startsWith('/usage')) {
          return reply(200, JSON.stringify({ enabled: Boolean(apiKey), ...summarizeUsage(readUsage(usageFile), model) }), 'application/json')
        }
        if (!apiKey) return reply(404, 'Premium voice is off')
        if (req.method !== 'POST') return reply(405, 'POST only')
        let raw = ''
        req.on('data', (chunk) => {
          raw += chunk
        })
        req.on('end', async () => {
          try {
            const { text, lang } = JSON.parse(raw || '{}')
            const clean = String(text || '').trim()
            if (!clean || clean.length > 800 || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(String(lang || ''))) {
              return reply(400, 'Bad request')
            }
            const key = createHash('sha1').update(`${model}|${voice}|${lang}|${clean}`).digest('hex')
            const file = path.join(cacheDir, `${key}.wav`)
            if (fs.existsSync(file)) {
              logUsage({ at: new Date().toISOString(), day: localDay(), kind: 'hit', model, lang })
              return reply(200, fs.readFileSync(file), 'audio/wav')
            }
            let job = inFlight.get(key)
            if (!job) {
              job = generate(clean, String(lang)).then((audio) => {
                fs.mkdirSync(cacheDir, { recursive: true })
                fs.writeFileSync(file, audio)
                return audio
              })
              inFlight.set(key, job)
              job.finally(() => inFlight.delete(key)).catch(() => undefined)
            }
            reply(200, await job, 'audio/wav')
          } catch (error) {
            server.config.logger.warn(`  Premium voice failed: ${error instanceof Error ? error.message : String(error)}`)
            reply(502, 'Premium voice failed')
          }
        })
      })
    },
  }
}
