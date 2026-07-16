#!/usr/bin/env node
// Sync .claude governance SSOT → packages/design-system/ds-canonical mirror (npm-shipped to fork users).
//
// Why: ds-canonical/ + packages/design-system/CLAUDE.md are hand-maintained npm-shipped mirrors of the
// `.claude/` SSOT + root CLAUDE.md. With no auto-sync they chronically drift (2026-05-29 deep-audit found
// rules/ + references/ + shipped CLAUDE.md stale after a partial hooks-only rsync). This script makes the
// `.claude → ds-canonical` direction (the canonical SSOT direction) one command, and `--check` gates publish.
//
// Usage:
//   node scripts/sync-ds-canonical.mjs           # write: exact-mirror .claude → ds-canonical (rsync --delete)
//   node scripts/sync-ds-canonical.mjs --check    # dry-run: exit 1 if any drift, print drifting paths

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')

// Content dirs mirrored from .claude/ → ds-canonical/ + root CLAUDE.md → packages CLAUDE.md.
// NOTE: ds-canonical/templates is ds-canonical-native (fork-user scaffold, no .claude source) → NOT mirrored.
const DIR_PAIRS = ['commands', 'hooks', 'references', 'rules', 'skills'].map((d) => ({
  src: `.claude/${d}/`,
  dest: `packages/design-system/ds-canonical/${d}/`,
}))
const FILE_PAIRS = [{ src: 'CLAUDE.md', dest: 'packages/design-system/CLAUDE.md' }, { src: 'AGENTS.md', dest: 'packages/design-system/AGENTS.md' }]

// -rtc = recurse + preserve mtime + checksum compare (content, not mtime). -i itemizes changes.
const flags = CHECK ? '-rtci --delete --dry-run' : '-rtci --delete'
let drift = []

// Real content drift only: a deletion (`*deleting`), a new/transferred file with checksum (`c`) or
// size (`s`) change, or a `+++++++` new file. Pure mtime/perm-only itemize lines (`.f..t....`,
// `.d..t....`) are NOT drift — git checkout touches SSOT mtimes without changing content.
function contentDrift(itemizeOut) {
  return itemizeOut
    .split('\n')
    .filter((l) => l.trim())
    .filter((l) => {
      if (l.startsWith('*deleting')) return true
      const code = l.split(/\s+/)[0] // e.g. >f.st.... / .f..t.... / >f+++++++
      return code.includes('+') || code[2] === 'c' || code[3] === 's'
    })
}

for (const { src, dest } of DIR_PAIRS) {
  const out = execSync(`rsync ${flags} '${join(ROOT, src)}' '${join(ROOT, dest)}'`, {
    encoding: 'utf8',
  }).trim()
  const real = contentDrift(out)
  if (real.length) drift.push(`[${src}]\n${real.join('\n')}`)
}
// Single files: deterministic content compare (rsync -c on a single file dest mis-reports in dry-run).
for (const { src, dest } of FILE_PAIRS) {
  // dest 首次不存在 = 視為 drift → copy(2026-07-16 AGENTS.md 首次 mirror 修)
  const same = existsSync(join(ROOT, dest)) && readFileSync(join(ROOT, src), 'utf8') === readFileSync(join(ROOT, dest), 'utf8')
  if (same) continue
  if (CHECK) drift.push(`[${src} → ${dest}]\n>f content differs`)
  else {
    copyFileSync(join(ROOT, src), join(ROOT, dest))
    drift.push(`[${src} → ${dest}] copied`)
  }
}

if (CHECK) {
  if (drift.length) {
    console.error('❌ ds-canonical mirror DRIFT (run `node scripts/sync-ds-canonical.mjs` to fix):\n')
    console.error(drift.join('\n\n'))
    process.exit(1)
  }
  console.log('✓ ds-canonical mirror in sync with .claude SSOT (0 drift)')
} else {
  console.log(drift.length ? `✓ synced .claude → ds-canonical (${drift.length} group(s) updated)` : '✓ already in sync (0 changes)')
}
