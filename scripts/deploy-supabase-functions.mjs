import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const currentFile = fileURLToPath(import.meta.url)
const rootDir = dirname(dirname(currentFile))
const functionsDir = join(rootDir, 'supabase', 'functions')

function parseArgs(argv) {
  const options = {
    projectRef: process.env.SUPABASE_PROJECT_REF || '',
    selectedNames: [],
  }

  for (const arg of argv) {
    if (arg.startsWith('--project-ref=')) {
      options.projectRef = arg.slice('--project-ref='.length)
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (!arg.startsWith('-')) {
      options.selectedNames.push(arg)
    }
  }

  return options
}

function printHelp() {
  process.stdout.write(
    [
      'Deploy Supabase Edge Functions',
      '',
      'Usage:',
      '  pnpm deploy:functions',
      '  pnpm deploy:functions -- anthropic-proxy master-note-close',
      '  pnpm deploy:functions -- --project-ref=your_project_ref',
      '',
      'Options:',
      '  --project-ref=<ref>   Deploy to a specific Supabase project',
      '  -h, --help            Show this help',
      '',
      'Environment:',
      '  SUPABASE_PROJECT_REF  Optional fallback for --project-ref',
    ].join('\n') + '\n',
  )
}

async function listFunctionNames() {
  const entries = await readdir(functionsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('_'))
    .sort((a, b) => a.localeCompare(b))
}

function deployFunction(name, projectRef) {
  const args = ['functions', 'deploy', name]
  if (projectRef) {
    args.push('--project-ref', projectRef)
  }

  const result = spawnSync('supabase', args, {
    cwd: rootDir,
    stdio: 'inherit',
  })

  if (typeof result.status === 'number') {
    return result.status === 0
  }
  return false
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const allNames = await listFunctionNames()
  const namesToDeploy =
    options.selectedNames.length > 0
      ? allNames.filter((name) => options.selectedNames.includes(name))
      : allNames

  if (namesToDeploy.length === 0) {
    process.stderr.write('No functions found to deploy.\n')
    process.exit(1)
  }

  const unknownNames = options.selectedNames.filter(
    (name) => !allNames.includes(name),
  )
  if (unknownNames.length > 0) {
    process.stderr.write(`Unknown functions: ${unknownNames.join(', ')}\n`)
    process.exit(1)
  }

  process.stdout.write(
    `Deploying ${namesToDeploy.length} function(s): ${namesToDeploy.join(', ')}\n`,
  )
  if (options.projectRef) {
    process.stdout.write(`Project ref: ${options.projectRef}\n`)
  } else {
    process.stdout.write('Project ref: linked project (supabase link)\n')
  }

  const failed = []
  for (const name of namesToDeploy) {
    process.stdout.write(`\n==> Deploying ${name}\n`)
    const ok = deployFunction(name, options.projectRef)
    if (!ok) {
      failed.push(name)
    }
  }

  if (failed.length > 0) {
    process.stderr.write(
      `\nDeployment failed for: ${failed.join(', ')}\n`,
    )
    process.exit(1)
  }

  process.stdout.write('\nAll selected functions were deployed successfully.\n')
}

main().catch((error) => {
  process.stderr.write(`Failed to deploy functions: ${String(error)}\n`)
  process.exit(1)
})
