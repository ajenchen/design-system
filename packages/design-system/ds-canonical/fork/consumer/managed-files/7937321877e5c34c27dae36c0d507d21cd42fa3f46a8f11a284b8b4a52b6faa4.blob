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
import { isCanonicalOutputRoot } from './lib/consumer-output-roots.mjs'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_REPO_ROOT = join(dirname(SCRIPT_PATH), '..')
const SCAN_DIRS = ['apps', 'packages']
const FORBIDDEN_PATTERNS = [
  /@qijenchen\/design-system\/src\//,
  /@qijenchen\/design-system\/dist\//,
]

// 建置輸出只在規範位置略過(workspace 根 apps/<name> / packages/<name> 的直接子資料夾,清單 = lib/consumer-output-roots.mjs;
// 2026-11-27 上游判定 B4):以前按名字略過所有叫 dist 的資料夾,原始碼放在 src/dist 也被跳過。
function walk(dir, workspaceRoot) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (isCanonicalOutputRoot(workspaceRoot, full)) continue
      out.push(...walk(full, workspaceRoot))
    } else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

function workspaceFiles(top) {
  const out = []
  for (const entry of readdirSync(top, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(top, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, full))
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
    for (const file of workspaceFiles(root)) {
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
