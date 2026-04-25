import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const csvPath = path.join(root, 'whitelist', 'community.csv')
const outputPath = path.join(root, 'whitelist', 'sync.generated.sql')

function parseCsvLine(line) {
  const out = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
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

function escapeSql(value) {
  return value.replace(/'/g, "''")
}

async function main() {
  const rawCsv = await fs.readFile(csvPath, 'utf8')
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    throw new Error('community.csv esta vacio')
  }

  const header = parseCsvLine(lines[0])
  const emailIdx = header.findIndex((item) => item.toLowerCase() === 'email')
  if (emailIdx === -1) {
    throw new Error('No se encontro la columna Email en community.csv')
  }

  const emails = Array.from(
    new Set(
      lines
        .slice(1)
        .map((line) => parseCsvLine(line)[emailIdx] || '')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes('@')),
    ),
  ).sort()

  const insertSql = emails.length
    ? `insert into tmp_whitelist (email)\nvalues\n${emails.map((email) => `  ('${escapeSql(email)}')`).join(',\n')};`
    : `insert into tmp_whitelist (email)\nselect null::text where false;`

  const sql = `-- Generated automatically from whitelist/community.csv\n-- Source of truth sync: upsert current emails, disable missing csv_sync ones\n\nbegin;\n\ncreate temp table tmp_whitelist (\n  email text primary key\n) on commit drop;\n\n${insertSql}\n\ninsert into public.auth_whitelist (email, can_register, can_login, source, last_synced_at)\nselect t.email, true, true, 'csv_sync', now()\nfrom tmp_whitelist t\non conflict (email) do update set\n  can_register = excluded.can_register,\n  can_login = excluded.can_login,\n  source = excluded.source,\n  last_synced_at = excluded.last_synced_at\nwhere public.auth_whitelist.source = 'csv_sync';\n\nupdate public.auth_whitelist w\nset\n  can_register = false,\n  can_login = false,\n  last_synced_at = now()\nwhere not exists (\n  select 1\n  from tmp_whitelist t\n  where t.email = w.email\n)\nand w.source = 'csv_sync';\n\ncommit;\n`

  await fs.writeFile(outputPath, sql, 'utf8')
  console.log(`Generated ${outputPath} with ${emails.length} emails.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
