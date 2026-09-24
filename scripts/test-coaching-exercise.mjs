/**
 * PRUEBA LOCAL — generador del ejercicio de foco (Coaching ICA)
 *
 * Genera ejercicios de verdad con la IA, SIN tocar Supabase, y los guarda en
 * scripts/.coaching-exercise-output/ para revisarlos.
 *
 * Uso (desde la carpeta del proyecto):
 *   node --experimental-strip-types scripts/test-coaching-exercise.mjs
 *   node --experimental-strip-types scripts/test-coaching-exercise.mjs "Inglés" "Present perfect vs past simple" B1
 *
 * Lee ANTHROPIC_API_KEY del archivo .env (sin "VITE_", nunca llega al navegador).
 * Opcional en .env: LOCAL_AI_MODEL=claude-sonnet-4-6
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createAnthropicToolCaller,
  generateCoachingFocusExercise,
} from '../supabase/functions/_shared/coaching-focus-exercise.ts'
import { findForm } from '../supabase/functions/_shared/coaching-exercise-corrector.ts'
import { spawn } from 'node:child_process'

/* Detrás de un proxy, fetch de Node no siempre sale: usamos curl (respeta HTTPS_PROXY). */
function curlFetch(url, init) {
  return new Promise((resolve, reject) => {
    const args = ['-sS', '-X', init.method || 'POST', url, '--max-time', '150', '-w', '\n%{http_code}', '--data-binary', '@-']
    for (const [key, value] of Object.entries(init.headers || {})) args.push('-H', `${key}: ${value}`)
    const child = spawn('curl', args)
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`curl ${code}: ${err}`))
      const cut = out.lastIndexOf('\n')
      const status = Number(out.slice(cut + 1))
      const body = out.slice(0, cut)
      resolve({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) })
    })
    child.stdin.end(init.body)
  })
}

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function readEnv() {
  const env = {}
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* sin .env */
  }
  return { ...env, ...process.env }
}

const env = readEnv()
if (!env.ANTHROPIC_API_KEY) {
  console.error('Falta ANTHROPIC_API_KEY en .env')
  process.exit(1)
}

const model = env.LOCAL_AI_MODEL || env.ANTHROPIC_COACHING_MODEL || 'claude-sonnet-4-6'
const useCurl = Boolean(env.HTTPS_PROXY || env.https_proxy)
const call = createAnthropicToolCaller({ apiKey: env.ANTHROPIC_API_KEY, model, ...(useCurl ? { fetchImpl: curlFetch } : {}) })

const [argLang, argFocus, argLevel] = process.argv.slice(2)
const cases = argFocus
  ? [{ targetLang: argLang || 'Inglés', focusTitle: argFocus, level: argLevel || 'A2' }]
  : [
      { targetLang: 'Inglés', focusTitle: 'Can · Could · Should · Would', level: 'A2', studentName: 'Gretta', studentContext: 'Trabaja en una ONG y organiza cumbres internacionales.' },
      { targetLang: 'Francés', focusTitle: 'Passé composé con être o avoir', level: 'A2' },
      { targetLang: 'Alemán', focusTitle: 'Verbos separables en presente', level: 'A2' },
    ]

const outDir = join(root, 'scripts', '.coaching-exercise-output')
mkdirSync(outDir, { recursive: true })

for (const testCase of cases) {
  const started = Date.now()
  const input = {
    nativeLang: 'español',
    focusSlot: 'Foco 1',
    phase: 'Entrenado',
    studentContext: '',
    ...testCase,
  }
  process.stdout.write(`\n▶ ${input.targetLang} · ${input.focusTitle} (${input.level}) con ${model}\n`)
  try {
    const result = await generateCoachingFocusExercise(call, input)
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    if (!result.exercise) {
      console.log(`  ✗ ERROR en ${secs}s: ${result.errorReason}`)
      if (result.invalidJsonSnippet) console.log(`    ${result.invalidJsonSnippet.slice(0, 300)}`)
    } else {
      const ex = result.exercise
      const ctx = { equivalencias: ex.equivalencias, libre: ex.libre }
      const [reco, build, dialog] = ex.bloques
      const units = reco.items.length + build.items.reduce((a, i) => a + i.verbos.length, 0) + dialog.items.length
      let ejemplosOk = 0
      let ejemplosTotal = 0
      for (const item of build.items) for (const v of item.verbos) {
        ejemplosTotal++
        if (findForm(item.ejemplo, v.formas, ctx, v)) ejemplosOk++
      }
      console.log(`  ✓ OK en ${secs}s · ${units} unidades · umbral ${ex.umbral} · ejemplos que pasan su corrección: ${ejemplosOk}/${ejemplosTotal}`)
      console.log(`    etiquetas: ${Object.values(ex.etiquetas).join(' / ')}`)
      console.log(`    libre: ${JSON.stringify(ex.libre)}`)
      for (const item of build.items) console.log(`    · ${item.ejemplo}  ←  ${item.verbos.map((v) => v.formas.join(' ; ')).join('  +  ')}`)
      for (const line of dialog.lineas) console.log(`    ${line.quien}: ${line.texto}`)
    }
    for (const warning of result.warnings) console.log(`    aviso: ${warning.slice(0, 400)}`)
    const file = join(outDir, `${input.targetLang}-${input.focusTitle}`.replace(/[^\p{L}\p{N}]+/gu, '_') + '.json')
    writeFileSync(file, JSON.stringify(result, null, 2))
    console.log(`    guardado en ${file}`)
  } catch (error) {
    console.log(`  ✗ FALLO: ${error instanceof Error ? error.message : error}`)
  }
}
