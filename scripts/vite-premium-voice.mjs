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

// SHORT TEXTS (Luis, 11 Oct): with a single word Gemini sometimes runs on into a next word
// («dzień d…»). Same rule as supabase/functions/premium-tts: one to three words get a full stop,
// an instruction to say only that, and a new cache key.
const SHORT_TEXT_MAX_WORDS = 3
/** @param {string} text */
const isShortText = (text) => text.trim().split(/\s+/).length <= SHORT_TEXT_MAX_WORDS
/** @param {string} text */
const speakableText = (text) => {
  const clean = text.trim()
  return isShortText(clean) && !/[.!?…。！？]$/.test(clean) ? `${clean}.` : clean
}
/** @param {string} model @param {string} voice @param {string} lang @param {string} text */
const cacheKeySource = (model, voice, lang, text) =>
  isShortText(text) ? `${model}|${voice}|${lang}|${text}|short-v2` : `${model}|${voice}|${lang}|${text}`

// GEMINI BUSY (Luis, 11 Oct): Gemini only takes a few new audios per minute for this project and
// answers 429 to the rest. New audios are made at most two at a time; a 429 waits the time Gemini
// asks for (RetryInfo) and tries again, and only after that the app is told «busy» (503 with
// retryAfter), never a hard failure that would switch it to the old voices.
const GENERATION_CONCURRENCY = 2
const GEMINI_TRIES = 3
const MAX_WAIT_SECONDS = 30

/** Seconds Gemini asks to wait (error.details RetryInfo «21s»), or null. @param {any} data */
const geminiRetrySeconds = (data) => {
  const details = Array.isArray(data?.error?.details) ? data.error.details : []
  for (const detail of details) {
    const match = /^(\d+(?:\.\d+)?)s$/.exec(String(detail?.retryDelay || ''))
    if (match) return Math.ceil(Number(match[1]))
  }
  return null
}

class GeminiBusyError extends Error {
  /** @param {string} message @param {number} retryAfter */
  constructor(message, retryAfter) {
    super(message)
    this.retryAfter = retryAfter
  }
}

// GEMINI DAILY LIMIT (Luis, 11 Oct): Google only lets a project make 100 audios a day with each
// Gemini 3.8 TTS model (quota GenerateRequestsPerDayPerProjectPerModel). On 9 Oct development made
// 102; on 11 Oct this local copy (65) and development (39) reached about 100 in the afternoon and
// from then on every new word fell back to the old voices. The quota is per model: when the main one runs out the backup models
// (same voice, GEMINI_TTS_BACKUP_MODELS) are used, and when all are out the app gets 503
// VOICE_DAY_LIMIT and stops retrying. It comes back at midnight Pacific time (9:00 in Spain).
/** A Gemini answer that is not audio (status kept to tell setup errors from one-off failures). */
class GeminiHttpError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

class GeminiDayLimitError extends Error {
  /** @param {string} message @param {number} retryAfter */
  constructor(message, retryAfter) {
    super(message)
    this.retryAfter = retryAfter
  }
}

/** Seconds until midnight in Pacific time, when Google resets the daily quotas. */
const secondsUntilQuotaReset = (now = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  const elapsed = (Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
  return Math.max(60, 86400 - elapsed)
}

/** Whether a Gemini 429 is the daily quota (not the per-minute one). @param {any} data */
const isDailyQuota = (data) => {
  const details = Array.isArray(data?.error?.details) ? data.error.details : []
  for (const detail of details) {
    for (const violation of Array.isArray(detail?.violations) ? detail.violations : []) {
      if (/per_?day/i.test(`${violation?.quotaId ?? ''} ${violation?.quotaMetric ?? ''}`)) return true
    }
  }
  return /per[ _]?day/i.test(String(data?.error?.message ?? ''))
}

/** Short description of the quota Gemini says was hit, for usage.jsonl. @param {any} data */
const quotaInfo = (data) => {
  const details = Array.isArray(data?.error?.details) ? data.error.details : []
  const found = []
  for (const detail of details) {
    for (const violation of Array.isArray(detail?.violations) ? detail.violations : []) {
      found.push(`${violation?.quotaId ?? violation?.quotaMetric ?? '?'}=${violation?.quotaValue ?? '?'}`)
    }
  }
  return found.join(', ') || String(data?.error?.message ?? '').slice(0, 200)
}

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// GOOGLE CLOUD VOICE (Luis, 11 Oct): Gemini only allows 100 new audios a day and 10 a minute, too
// little for 50 students. With GOOGLE_CLOUD_TTS_API_KEY in .env.local the voice comes from Google
// Cloud Text-to-Speech (Chirp 3 HD, voice Kore: 200 a minute, no daily cap, about 30 $ per million
// letters). Gemini stays as the backup if Google Cloud fails. PREMIUM_TTS_ENGINE=gemini forces the
// old order. Each engine keeps its own saved audios, so one word always sounds with one voice.
const CLOUD_TTS_USD_PER_CHAR = 30 / 1_000_000
/** Chirp 3 HD names a few languages differently from the app. @param {string} lang */
const cloudLocale = (lang) => ({ 'zh-CN': 'cmn-CN', 'ar-SA': 'ar-XA', 'no-NO': 'nb-NO' })[lang] || lang

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
      } else if (row.kind === 'gen') {
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
      const backupModels = (env.GEMINI_TTS_BACKUP_MODELS ?? 'gemini-3.8-flash-tts')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name && name !== model)
      /** Models with no audios left today, until when (ms). @type {Map<string, number>} */
      const exhaustedUntil = new Map()
      const voice = env.GEMINI_TTS_VOICE || 'Kore'
      // GEMINI ENTERPRISE (Luis, 11 Oct): the same Gemini voice through Google's business platform
      // (formerly Vertex AI), which does not have AI Studio's 100-a-day cap. It needs an API key bound
      // to a service account (GEMINI_ENTERPRISE_API_KEY) and, optionally, the project id
      // (GOOGLE_CLOUD_PROJECT). With it, Gemini goes first again; Google Cloud Chirp is the backup.
      const enterpriseKey = env.GEMINI_ENTERPRISE_API_KEY || process.env.GEMINI_ENTERPRISE_API_KEY || ''
      const enterpriseProject = env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || ''
      const cloudKey = env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GOOGLE_CLOUD_TTS_API_KEY || ''
      const cloudVoice = env.GOOGLE_CLOUD_TTS_VOICE || 'Kore'
      /** Languages Google Cloud has no Chirp 3 HD voice for (they go straight to Gemini). */
      const cloudUnsupported = new Set()
      /** Engines in the order they are tried. @type {Array<'cloud' | 'gemini'>} */
      const engines = /** @type {Array<'cloud' | 'gemini'>} */ (
        (env.PREMIUM_TTS_ENGINE === 'gemini' || (enterpriseKey && env.PREMIUM_TTS_ENGINE !== 'cloud')
          ? ['gemini', 'cloud']
          : ['cloud', 'gemini']
        ).filter((name) => (name === 'cloud' ? Boolean(cloudKey) : Boolean(apiKey || enterpriseKey)))
      )
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
        engines.length === 0
          ? '  Premium voice: off (no GOOGLE_CLOUD_TTS_API_KEY or GEMINI_API_KEY in .env.local)'
          : `  Premium voice: ${engines
              .map((name) =>
                name === 'cloud'
                  ? `Google Cloud Chirp 3 HD (${cloudVoice})`
                  : `${model} (${voice})${enterpriseKey ? ' via Gemini Enterprise' + (apiKey ? ', then AI Studio' : '') : ''}`,
              )
              .join(', then ')}`,
      )

      /** One request to Google Cloud Text-to-Speech. @param {string} text @param {string} lang @returns {Promise<Buffer>} */
      const generateCloud = async (text, lang) => {
        const locale = cloudLocale(lang)
        for (let attempt = 1; ; attempt += 1) {
          const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cloudKey },
            body: JSON.stringify({
              input: { text: speakableText(text) },
              voice: { languageCode: locale, name: `${locale}-Chirp3-HD-${cloudVoice}` },
              audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
            }),
          })
          const data = await response.json().catch(() => ({}))
          if ((response.status === 429 || response.status === 503) && attempt < 3) {
            logUsage({ at: new Date().toISOString(), day: localDay(), kind: 'busy', model: 'chirp3-hd', lang, status: response.status })
            await wait(1500 * attempt)
            continue
          }
          if (!response.ok || !data?.audioContent) {
            throw new Error(`Cloud TTS ${response.status}: ${String(data?.error?.message || 'no audio').slice(0, 200)}`)
          }
          const bytes = Buffer.from(data.audioContent, 'base64')
          const audio = bytes.subarray(0, 4).toString('ascii') === 'RIFF' ? bytes : toWav(bytes, 24000)
          const seconds = wavSeconds(audio)
          logUsage({
            at: new Date().toISOString(),
            day: localDay(),
            kind: 'gen',
            model: 'chirp3-hd',
            lang,
            chars: text.length,
            seconds: Math.round(seconds * 100) / 100,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: text.length * CLOUD_TTS_USD_PER_CHAR,
          })
          return audio
        }
      }

      /** Voice field the Enterprise platform accepted (it may differ from AI Studio's). */
      let enterpriseVoiceFormat = 'voice'
      /**
       * @param {string} text @param {string} lang @param {string} modelName
       * @param {'studio' | 'enterprise'} via @returns {Promise<Buffer>}
       */
      const generateWith = async (text, lang, modelName, via = 'studio') => {
        const language = languageNames.of(lang) || lang
        const url =
          via === 'enterprise'
            ? enterpriseProject
              ? `https://aiplatform.googleapis.com/v1/projects/${enterpriseProject}/locations/global/publishers/google/models/${modelName}:generateContent`
              : `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelName}:generateContent`
            : `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`
        const key = via === 'enterprise' ? enterpriseKey : apiKey
        /** @param {string} format */
        const voiceConfig = (format) =>
          format === 'prebuilt' ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } : { voiceConfig: { voice } }
        /** @param {boolean} withStyle @param {string} [format] */
        const call = async (withStyle, format = via === 'enterprise' ? enterpriseVoiceFormat : 'voice') => {
          const short = isShortText(text)
          /** @type {Record<string, unknown>} */
          const part = { text: speakableText(text) }
          if (withStyle) {
            part.speech_metadata = {
              style:
                `Native ${language} speaker (${lang}). Read it in ${language}, clearly and naturally, like a friendly teacher.` +
                (short ? ' Say only these exact words, once, and then stop. Do not add any other word or sound.' : ''),
            }
          }
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [part] }],
              generationConfig: { responseModalities: ['AUDIO'], speechConfig: voiceConfig(format) },
            }),
          })
          const data = await response.json().catch(() => ({}))
          if (via === 'enterprise' && !response.ok) {
            logUsage({
              at: new Date().toISOString(),
              day: localDay(),
              kind: 'enterprise-error',
              model: modelName,
              status: response.status,
              format,
              withStyle,
              message: String(data?.error?.message || '').slice(0, 300),
            })
          }
          if (via === 'enterprise' && response.ok) enterpriseVoiceFormat = format
          return { response, data }
        }
        let response
        let data
        for (let attempt = 1; ; attempt += 1) {
          ;({ response, data } = await call(true))
          // If this model does not accept the style field, try once with the plain text.
          if (response.status === 400) ({ response, data } = await call(false))
          // The Enterprise platform may want the voice written the other way.
          if (response.status === 400 && via === 'enterprise') {
            ;({ response, data } = await call(false, enterpriseVoiceFormat === 'voice' ? 'prebuilt' : 'voice'))
          }
          // 500: Gemini sometimes fails one answer; it is retried like «busy».
          if (response.status !== 429 && response.status !== 503 && response.status !== 500) break
          if (response.status === 429 && isDailyQuota(data)) {
            logUsage({ at: new Date().toISOString(), day: localDay(), kind: 'day-limit', model: modelName, via, lang, quota: quotaInfo(data) })
            throw new GeminiDayLimitError(`Gemini TTS daily limit (${modelName})`, secondsUntilQuotaReset())
          }
          const retryAfter = Math.min(MAX_WAIT_SECONDS, geminiRetrySeconds(data) ?? (response.status === 500 ? 1 : 5 * attempt))
          logUsage({
            at: new Date().toISOString(),
            day: localDay(),
            kind: 'busy',
            model: modelName,
            lang,
            status: response.status,
            retryAfter,
            quota: quotaInfo(data),
          })
          if (attempt >= GEMINI_TRIES) {
            throw new GeminiBusyError(data?.error?.message || `Gemini TTS ${response.status}`, retryAfter)
          }
          await wait(retryAfter * 1000)
        }
        if (!response.ok) {
          throw new GeminiHttpError(`Gemini TTS ${response.status}: ${String(data?.error?.message || '').slice(0, 200)}`, response.status)
        }
        const parts = data?.candidates?.[0]?.content?.parts || []
        const inline = parts.find((p) => p?.inlineData?.data)?.inlineData
        if (!inline?.data) throw new GeminiHttpError('Gemini TTS: no audio in the answer', 502)
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
          model: modelName,
          via,
          lang,
          chars: text.length,
          seconds: Math.round(seconds * 100) / 100,
          inputTokens,
          outputTokens,
          costUsd: priceUsd(modelName, day, inputTokens, outputTokens),
        })
        return audio
      }

      /**
       * The main model, or a backup one when the main one has no audios left today.
       * @param {string} text @param {string} lang @returns {Promise<Buffer>}
       */
      const generate = async (text, lang) => {
        /** @type {Array<['studio' | 'enterprise', string]>} */
        const routes = []
        if (enterpriseKey && enterpriseBrokenUntil <= Date.now()) {
          for (const name of [model, ...backupModels]) routes.push(['enterprise', name])
        }
        if (apiKey) for (const name of [model, ...backupModels]) routes.push(['studio', name])
        /** @type {unknown} */
        let lastError = null
        let skippedForToday = false
        for (const [via, name] of routes) {
          const slot = `${via}:${name}`
          if ((exhaustedUntil.get(slot) ?? 0) > Date.now()) {
            skippedForToday = true
            continue
          }
          try {
            return await generateWith(text, lang, name, via)
          } catch (error) {
            lastError = error
            if (error instanceof GeminiDayLimitError) {
              exhaustedUntil.set(slot, Date.now() + error.retryAfter * 1000)
              server.config.logger.warn(`  Premium voice: no audios left today with ${name} (${via})`)
              continue
            }
            if (via === 'enterprise') {
              server.config.logger.warn(`  Premium voice: Gemini Enterprise failed (${error instanceof Error ? error.message : error})`)
              // Not set up (no permission, wrong project, model not found): skip it for 10 minutes.
              // Any other failure only affects this text: the next route tries it.
              if (error instanceof GeminiHttpError && [401, 403, 404].includes(error.status)) {
                enterpriseBrokenUntil = Date.now() + 10 * 60_000
              }
              continue
            }
            throw error
          }
        }
        if (lastError === null && !skippedForToday) throw new GeminiBusyError('Gemini TTS: no route available now', 30)
        if (lastError !== null && !(lastError instanceof GeminiDayLimitError)) throw lastError
        throw new GeminiDayLimitError('Gemini TTS daily limit (all models)', secondsUntilQuotaReset())
      }
      let enterpriseBrokenUntil = 0

      // At most GENERATION_CONCURRENCY new audios are being made at the same time; the rest wait.
      let generating = 0
      /** @type {Array<() => void>} */
      const waiting = []
      /** @template T @param {() => Promise<T>} task @returns {Promise<T>} */
      const limited = async (task) => {
        if (generating >= (enterpriseKey ? 6 : GENERATION_CONCURRENCY)) await new Promise((resolve) => waiting.push(() => resolve(undefined)))
        generating += 1
        try {
          return await task()
        } finally {
          generating -= 1
          waiting.shift()?.()
        }
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
          return reply(200, JSON.stringify({ enabled: engines.length > 0, ...summarizeUsage(readUsage(usageFile), model) }), 'application/json')
        }
        if (engines.length === 0) return reply(404, 'Premium voice is off')
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
            /** Where each engine saves this text. @param {'cloud' | 'gemini'} engine */
            const fileFor = (engine) => {
              const source =
                engine === 'cloud'
                  ? `cloud|chirp3-hd|${cloudVoice}|${lang}|${clean}`
                  : cacheKeySource(model, voice, lang, clean)
              return path.join(cacheDir, `${createHash('sha1').update(source).digest('hex')}.wav`)
            }
            const primaryFile = fileFor(engines[0])
            if (fs.existsSync(primaryFile)) {
              logUsage({ at: new Date().toISOString(), day: localDay(), kind: 'hit', model: engines[0] === 'cloud' ? 'chirp3-hd' : model, lang })
              return reply(200, fs.readFileSync(primaryFile), 'audio/wav')
            }
            let job = inFlight.get(primaryFile)
            if (!job) {
              job = (async () => {
                /** @type {unknown} */
                let lastError = null
                for (const engine of engines) {
                  const file = fileFor(engine)
                  if (engine !== engines[0] && fs.existsSync(file)) return fs.readFileSync(file)
                  if (engine === 'cloud' && cloudUnsupported.has(lang)) continue
                  try {
                    const audio =
                      engine === 'cloud' ? await generateCloud(clean, String(lang)) : await limited(() => generate(clean, String(lang)))
                    fs.mkdirSync(cacheDir, { recursive: true })
                    fs.writeFileSync(file, audio)
                    return audio
                  } catch (error) {
                    lastError = error
                    if (engine === 'cloud' && /^Cloud TTS 400: .*(voice|language)/i.test(String(error instanceof Error ? error.message : ''))) {
                      cloudUnsupported.add(lang)
                    }
                    if (engine !== engines[engines.length - 1]) {
                      server.config.logger.warn(`  Premium voice: ${engine} failed, trying the next one (${error instanceof Error ? error.message : error})`)
                    }
                  }
                }
                throw lastError
              })()
              inFlight.set(primaryFile, job)
              job.finally(() => inFlight.delete(primaryFile)).catch(() => undefined)
            }
            reply(200, await job, 'audio/wav')
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logUsage({ at: new Date().toISOString(), day: localDay(), kind: 'fail', model, message: message.slice(0, 300) })
            if (error instanceof GeminiDayLimitError) {
              server.config.logger.warn(`  Premium voice: Google's daily limit reached, back in ${Math.round(error.retryAfter / 60)} min`)
              return reply(503, JSON.stringify({ code: 'VOICE_DAY_LIMIT', retryAfter: error.retryAfter }), 'application/json')
            }
            if (error instanceof GeminiBusyError) {
              server.config.logger.warn(`  Premium voice busy (Gemini limit), retry in ${error.retryAfter}s`)
              return reply(503, JSON.stringify({ code: 'VOICE_BUSY', retryAfter: error.retryAfter }), 'application/json')
            }
            server.config.logger.warn(`  Premium voice failed: ${message}`)
            reply(502, JSON.stringify({ code: 'VOICE_FAILED', retryAfter: 5 }), 'application/json')
          }
        })
      })
    },
  }
}
