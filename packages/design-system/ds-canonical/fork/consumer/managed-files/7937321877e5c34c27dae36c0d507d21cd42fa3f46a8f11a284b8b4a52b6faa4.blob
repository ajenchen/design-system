#!/usr/bin/env node
// scripts/lint-ds-internal-imports.mjs — guard against importing DS internal paths
//
// Rule: consumer apps should only import from public DS surface:
//   ✓ '@qijenchen/design-system'(top barrel)
//   ✓ '@qijenchen/design-system/styles/tokens'(CSS aggregator)
//   ✓ '@qijenchen/design-system/hooks/<name>'
//   ✓ '@qijenchen/design-system/tokens/...'
//   ✗ '@qijenchen/design-system/src/...'(internal source path)
//   ✗ '@qijenchen/design-system/dist/components/<X>/<x>'(deep dist path,not exported subpath)
//
// Pre-commit guard / CI check. Exits 1 on violation.

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_REPO_ROOT = join(dirname(SCRIPT_PATH), '..')
const SCAN_DIRS = ['apps', 'packages']
const FORBIDDEN_PATTERNS = [
  /@qijenchen\/design-system\/src\//,
  /@qijenchen\/design-system\/dist\//,
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

export function findDsInternalImportViolations(repoRoot = DEFAULT_REPO_ROOT) {
  repoRoot = resolve(repoRoot)
  const violations = []
  for (const top of SCAN_DIRS) {
    const root = join(repoRoot, top)
    try { statSync(root) } catch { continue }
    for (const file of walk(root)) {
      const content = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push({ file: relative(repoRoot, file).replaceAll('\\', '/'), pattern: pattern.source })
        }
      }
    }
  }
  return violations
}

function parseRepoArgument(args) {
  if (args.length === 0) return DEFAULT_REPO_ROOT
  if (args.length === 2 && args[0] === '--repo' && args[1]) return args[1]
  throw new Error('usage: lint-ds-internal-imports.mjs [--repo <candidate>]')
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH)) {
  let violations
  try {
    violations = findDsInternalImportViolations(parseRepoArgument(process.argv.slice(2)))
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }

  if (violations.length > 0) {
    console.error(`✗ ${violations.length} DS internal import violation(s):`)
    for (const v of violations) {
      console.error(`  ${v.file} — matches ${v.pattern}`)
    }
    console.error(``)
    console.error(`Rule: consumer apps must use public DS API only:`)
    console.error(`  ✓ import { Button } from '@qijenchen/design-system'`)
    console.error(`  ✓ import '@qijenchen/design-system/styles/tokens'`)
    console.error(`  ✗ import { ... } from '@qijenchen/design-system/src/...'(internal source)`)
    process.exit(1)
  }

  console.log(`✓ 0 DS internal import violations across apps/ + packages/`)
}
