/**
 * MODO PRUEBA LOCAL — Nota desafiante
 *
 * Solo funciona con `pnpm dev` (nunca en producción ni en Vercel).
 * Permite probar la creación de frases con trozos y la división de frases
 * SIN publicar nada en Supabase: la IA se llama desde el propio ordenador.
 *
 * Se activa con estas dos líneas en el archivo .env (que no se sube a GitHub):
 *   VITE_CHALLENGE_LOCAL=true
 *   ANTHROPIC_API_KEY=sk-ant-...        <- sin "VITE_", así nunca llega al navegador
 * Opcional:
 *   LOCAL_AI_MODEL=claude-sonnet-5
 *   ANTHROPIC_WORKSPACE_ID=wrkspc_...   <- solo si la clave no pertenece a un workspace
 *
 * Usa exactamente la misma lógica que la Edge Function
 * (supabase/functions/_shared/challenge-chunks.ts).
 */
import { loadEnv } from 'vite'
import {
  generateActivationText,
  splitExistingText,
} from '../supabase/functions/_shared/challenge-chunks.ts'

// Copia de LEVEL_DESCRIPTIONS / normalizeLevelKey de anthropic-proxy (para no importar Deno).
const LEVEL_DESCRIPTIONS = {
  '0': 'Very basic words and chunks. Keep it concrete and short.',
  'Pre-A1': 'Very basic words and chunks. Keep it concrete and short.',
  A1: 'Simple present tense, high-frequency words, clear sentence structure.',
  'A1+': 'Simple present with slightly richer detail and basic connectors.',
  A2: 'Everyday situations with basic connectors. Keep grammar straightforward.',
  'A2+': 'Everyday situations with more variety and clearer sentence links.',
  B1: 'Practical vocabulary and mixed tenses. Natural but still learner-friendly.',
  'B1+': 'Comfortable practical communication with broader vocabulary and tense control.',
  B2: 'More nuanced wording and varied sentence structure.',
  'B2+': 'Nuanced wording with flexible structures and greater precision.',
  C1: 'Advanced fluency with rich vocabulary and idiomatic choices.',
}

function normalizeLevelKey(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (['PREA1', 'PRE-A1', '0', 'A0', 'LEVEL0'].includes(normalized)) return 'Pre-A1'
  if (normalized === 'A1PLUS') return 'A1+'
  if (normalized === 'A2PLUS') return 'A2+'
  if (normalized === 'B1PLUS') return 'B1+'
  if (normalized === 'B2PLUS') return 'B2+'
  if (normalized === 'C2') return 'C1'
  return normalized || 'A2'
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 200_000) reject(new Error('Body too large'))
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function isLoopback(address) {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address === 'localhost'
  )
}

export function localAiDevPlugin() {
  return {
    name: 'ica-local-ai',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      const apiKey = env.ANTHROPIC_API_KEY
      const model = env.LOCAL_AI_MODEL || 'claude-sonnet-5'
      const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
      const workspaceId = env.ANTHROPIC_WORKSPACE_ID || ''

      const callAnthropic = async (system, prompt, options) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
          },
          body: JSON.stringify({
            model,
            max_tokens: options.maxTokens,
            // Los modelos nuevos (Sonnet 5) no aceptan "temperature": solo se envía si se pide.
            ...(env.LOCAL_AI_SEND_TEMPERATURE === 'true'
              ? { temperature: options.temperature }
              : {}),
            system,
            messages: [{ role: 'user', content: prompt }],
            tools: [options.tool],
            tool_choice: { type: 'tool', name: options.tool.name },
          }),
        })
        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(`Anthropic ${response.status}: ${detail.slice(0, 300)}`)
        }
        const data = await response.json()
        const blocks = Array.isArray(data.content) ? data.content : []
        const text = blocks
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
        const toolBlock = blocks.find(
          (block) => block.type === 'tool_use' && block.name === options.tool.name,
        )
        return { text: text || null, toolInput: toolBlock?.input ?? null }
      }

      server.middlewares.use('/__local-ai', async (req, res) => {
        // Solo desde este mismo ordenador: nadie más de la red WiFi puede gastar tu clave.
        if (!isLoopback(req.socket.remoteAddress)) {
          return sendJson(res, 403, { error: 'El modo prueba local solo funciona en este ordenador.' })
        }
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
        if (!apiKey) {
          return sendJson(res, 500, {
            error: 'Falta ANTHROPIC_API_KEY en el archivo .env. Añádela y reinicia pnpm dev.',
          })
        }

        try {
          const payload = await readBody(req)
          const action = (req.url || '').replace(/^\//, '').split('?')[0]

          if (action === 'activation_phrase') {
            const normalizedWords = (Array.isArray(payload.words) ? payload.words : [])
              .map((word) => {
                if (typeof word === 'string') {
                  const cleaned = word.trim()
                  return cleaned ? { target: cleaned, native: null } : null
                }
                const target = typeof word?.target === 'string' ? word.target.trim() : ''
                const native = typeof word?.native === 'string' ? word.native.trim() : ''
                return target ? { target, native: native || null } : null
              })
              .filter(Boolean)
            const words = normalizedWords.map((word) => word.target)
            if (!words.length) return sendJson(res, 400, { error: 'Words are required' })

            const levelKey = normalizeLevelKey(payload.level)
            const result = await generateActivationText(
              {
                words,
                intendedMeanings: normalizedWords
                  .filter((word) => word.native)
                  .map((word) => `${word.target} = ${word.native}`),
                targetLang: payload.targetLang,
                nativeLang: payload.nativeLang,
                normalizedLevel: levelKey,
                levelDescription: LEVEL_DESCRIPTIONS[levelKey] || LEVEL_DESCRIPTIONS.A2,
                previousPhrase:
                  typeof payload.previousPhrase === 'string' ? payload.previousPhrase.trim() : '',
              },
              callAnthropic,
            )
            return sendJson(res, 200, { result })
          }

          if (action === 'split_phrase') {
            const targetPhrase = String(payload.targetPhrase || '').trim()
            const nativePhrase = String(payload.nativePhrase || '').trim()
            if (!targetPhrase || !nativePhrase) {
              return sendJson(res, 400, { error: 'targetPhrase and nativePhrase are required' })
            }
            const result = await splitExistingText(
              {
                targetPhrase,
                nativePhrase,
                targetLang: payload.targetLang,
                nativeLang: payload.nativeLang,
              },
              callAnthropic,
            )
            return sendJson(res, 200, { result })
          }

          return sendJson(res, 400, { error: 'Unsupported action' })
        } catch (error) {
          console.error('[local-ai]', error)
          return sendJson(res, 500, {
            error: error instanceof Error ? error.message : 'Error desconocido',
          })
        }
      })

      if (env.VITE_CHALLENGE_LOCAL === 'true') {
        server.config.logger.info(
          apiKey
            ? `  ➜ Nota desafiante: modo prueba local ACTIVADO (modelo ${model})`
            : '  ➜ Nota desafiante: falta ANTHROPIC_API_KEY en .env',
        )
      }
    },
  }
}
