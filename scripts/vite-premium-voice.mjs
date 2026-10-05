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
        if (bytes.subarray(0, 4).toString('ascii') === 'RIFF') return bytes
        const rate = Number(/rate=(\d+)/.exec(inline.mimeType || '')?.[1]) || 24000
        return toWav(bytes, rate)
      }

      server.middlewares.use('/__ica/tts', (req, res) => {
        /** @param {number} status @param {Buffer | string} body */
        const reply = (status, body, type = 'text/plain; charset=utf-8') => {
          res.statusCode = status
          res.setHeader('Content-Type', type)
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
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
            if (fs.existsSync(file)) return reply(200, fs.readFileSync(file), 'audio/wav')
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
