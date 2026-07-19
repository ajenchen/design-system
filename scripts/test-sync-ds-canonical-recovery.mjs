#!/usr/bin/env node
// Sync-recovery / idempotence meta-test for scripts/sync-ds-canonical.mjs.
//
// Mechanically proves the ds-canonical mirror self-heals (recovery / rollback property)
// and that repeated sync is idempotent. A corrupted OR deleted mirror file MUST:
//   (a) be detected as drift by `--check` (exit 1), and
//   (b) be fully restored (byte-for-byte) by a write-mode sync (exit 0, `--check` clean),
// with a 2nd write producing 0 further changes (idempotence).
//
// Leaves the repo pristine via a finally-block precise restore + git-checkout backstop.
//
// Usage: node scripts/test-sync-ds-canonical-recovery.mjs   (prints PASS + exit 0 on success)

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SYNC = 'scripts/sync-ds-canonical.mjs'

// Run the sync script, NEVER throw; capture exit code + combined stdout/stderr.
// (`--check` exits 1 on drift and writes the DRIFT report to stderr — must not crash the test.)
function run(args) {
  try {
    const out = execSync(`node ${SYNC} ${args}`.trim(), {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

const failures = []
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failures.push(msg)
  }
}

// Pick a real mirrored rules/*.md that also exists in the .claude SSOT (so a write sync restores it).
const MIRROR_RULES = join(ROOT, 'packages/design-system/ds-canonical/rules')
const SRC_RULES = join(ROOT, '.claude/rules')
const candidate = readdirSync(MIRROR_RULES)
  .filter((f) => f.endsWith('.md'))
  .find((f) => existsSync(join(SRC_RULES, f)))
if (!candidate) {
  console.error('✗ no mirrored rules/*.md with a .claude SSOT counterpart found to test')
  process.exit(1)
}
const TARGET = join(MIRROR_RULES, candidate)
const ORIGINAL = readFileSync(TARGET, 'utf8')
console.log(`Target mirror file under test: packages/design-system/ds-canonical/rules/${candidate}\n`)

try {
  // 1. Baseline — mirror must already be in sync.
  console.log('1. Baseline: `--check` must PASS (exit 0, no drift)')
  let r = run('--check')
  assert(r.code === 0, `baseline --check exit 0 (got ${r.code})`)

  // 2. Corrupt the mirror (append a junk line) — `--check` MUST report drift.
  console.log('2. Corrupt mirror (append junk) → `--check` MUST report drift (exit 1)')
  writeFileSync(TARGET, ORIGINAL + '\n<!-- meta-test JUNK line (simulated mirror corruption) -->\n')
  r = run('--check')
  assert(r.code === 1, `--check on corrupted mirror exit 1 (got ${r.code})`)
  assert(/DRIFT/.test(r.out) && r.out.includes(candidate), `drift report names ${candidate}`)

  // 3. Recover — a write-mode sync must self-heal the mirror; `--check` PASS again.
  console.log('3. Recover: write sync restores mirror → `--check` PASS again (self-heal)')
  r = run('')
  assert(r.code === 0, `write sync exit 0 (got ${r.code})`)
  assert(readFileSync(TARGET, 'utf8') === ORIGINAL, 'corrupted file byte-restored to SSOT content')
  r = run('--check')
  assert(r.code === 0, `--check after recover exit 0 (got ${r.code})`)

  // 4. Idempotence — a 2nd write must be a no-op (0 further changes) and stay in sync.
  console.log('4. Idempotence: 2nd write sync is a no-op → `--check` still PASS')
  r = run('')
  assert(r.code === 0, `2nd write exit 0 (got ${r.code})`)
  assert(/0 changes/.test(r.out), `2nd write reports "0 changes" (got: "${r.out.trim()}")`)
  r = run('--check')
  assert(r.code === 0, `--check still PASS after 2nd write (got ${r.code})`)

  // 5. Deletion — delete a mirrored file; `--check` MUST flag it, write must recreate it.
  console.log('5. Deletion: delete mirror file → `--check` exit 1 → write restores → `--check` exit 0')
  unlinkSync(TARGET)
  r = run('--check')
  assert(r.code === 1, `--check on deleted mirror exit 1 (got ${r.code})`)
  r = run('')
  assert(r.code === 0, `write sync after deletion exit 0 (got ${r.code})`)
  assert(
    existsSync(TARGET) && readFileSync(TARGET, 'utf8') === ORIGINAL,
    'deleted file recreated with SSOT content',
  )
  r = run('--check')
  assert(r.code === 0, `--check after deletion recover exit 0 (got ${r.code})`)
} finally {
  // Precise restore of the one file we touched.
  try {
    writeFileSync(TARGET, ORIGINAL)
  } catch {}
  // Backstop: git-checkout the mirror + shipped bootstrap files in case any step left drift.
  try {
    execSync(
      'git checkout -- packages/design-system/ds-canonical packages/design-system/CLAUDE.md packages/design-system/AGENTS.md',
      { cwd: ROOT, stdio: 'ignore' },
    )
  } catch {}
  // Verify the repo is left pristine (mirror back in sync).
  const clean = run('--check')
  if (clean.code !== 0) {
    console.error('  ✗ cleanup left mirror in drift')
    failures.push('cleanup left mirror in drift')
  } else {
    console.log('\n(cleanup) repo left pristine: `--check` exit 0')
  }
}

if (failures.length) {
  console.error(`\n❌ sync-recovery / idempotence meta-test FAIL (${failures.length} assertion(s)):`)
  failures.forEach((f) => console.error(`   - ${f}`))
  process.exit(1)
}
console.log('\n✅ sync-recovery / idempotence meta-test PASS')
process.exit(0)
