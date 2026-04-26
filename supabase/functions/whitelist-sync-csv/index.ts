import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts'
import { ensureSuperAdmin } from '../_shared/super-admin.ts'

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    const next = line[i + 1]

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }

    current += ch
  }

  out.push(current)
  return out.map((value) => value.trim())
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function extractCsvEmails(rawCsv: string): string[] {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    throw new Error('El CSV está vacío.')
  }

  const header = parseCsvLine(lines[0])
  const emailIdx = header.findIndex((value) => value.toLowerCase() === 'email')

  if (emailIdx === -1) {
    throw new Error('No se encontró la columna Email en el CSV.')
  }

  return Array.from(
    new Set(
      lines
        .slice(1)
        .map((line) => parseCsvLine(line)[emailIdx] || '')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes('@')),
    ),
  ).sort()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const auth = await ensureSuperAdmin(req)
  if (!auth.ok) return auth.response

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonResponse(400, { error: 'Invalid multipart form data' })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return jsonResponse(400, { error: 'CSV file is required in form field "file"' })
  }

  const rawCsv = await file.text()
  let emails: string[] = []
  try {
    emails = extractCsvEmails(rawCsv)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo parsear el CSV.'
    return jsonResponse(400, { error: message })
  }

  const nowIso = new Date().toISOString()
  const incomingSet = new Set(emails)
  const CHUNK_SIZE = 500

  const existingByEmail = new Map<string, string>()
  for (const chunk of chunkArray(emails, CHUNK_SIZE)) {
    const { data, error } = await auth.adminClient
      .from('auth_whitelist')
      .select('email, source')
      .in('email', chunk)

    if (error) {
      return jsonResponse(500, { error: error.message })
    }

    for (const row of data || []) {
      existingByEmail.set(String(row.email), String(row.source))
    }
  }

  const upsertRows = emails
    .filter((email) => existingByEmail.get(email) !== 'manual')
    .map((email) => ({
      email,
      can_register: true,
      can_login: true,
      source: 'csv_sync',
      last_synced_at: nowIso,
    }))

  for (const chunk of chunkArray(upsertRows, CHUNK_SIZE)) {
    if (chunk.length === 0) continue

    const { error } = await auth.adminClient
      .from('auth_whitelist')
      .upsert(chunk, { onConflict: 'email' })

    if (error) {
      return jsonResponse(500, { error: error.message })
    }
  }

  const { data: csvSyncRows, error: csvSyncError } = await auth.adminClient
    .from('auth_whitelist')
    .select('email')
    .eq('source', 'csv_sync')

  if (csvSyncError) {
    return jsonResponse(500, { error: csvSyncError.message })
  }

  const toDisable = (csvSyncRows || [])
    .map((row) => String(row.email))
    .filter((email) => !incomingSet.has(email))

  for (const chunk of chunkArray(toDisable, CHUNK_SIZE)) {
    if (chunk.length === 0) continue

    const { error } = await auth.adminClient
      .from('auth_whitelist')
      .update({
        can_register: false,
        can_login: false,
        last_synced_at: nowIso,
      })
      .in('email', chunk)
      .eq('source', 'csv_sync')

    if (error) {
      return jsonResponse(500, { error: error.message })
    }
  }

  return jsonResponse(200, {
    ok: true,
    total: emails.length,
    inserted: upsertRows.length,
    disabled: toDisable.length,
  })
})
