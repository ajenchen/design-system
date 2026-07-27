#!/usr/bin/env node
// Isolated meta-test for dangling LIVE infra references.  Never edits live docs.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = process.cwd()
const CHECKER = resolve(REPO, 'scripts/check-dangling-infra-ref.mjs')
const run = (root) => spawnSync(process.execPath, ['--', CHECKER, '--check', '--root', root], {
  cwd: REPO,
  encoding: 'utf8',
  stdio: 'pipe',
}).status ?? 1

if (run(REPO) !== 0) {
  console.error('✗ baseline run 應 PASS 卻 FAIL — repo 有 dangling LIVE infra ref')
  process.exit(1)
}
console.log('✓ caller repo baseline PASS')

let ok = true
const fixture = mkdtempSync(join(tmpdir(), 'dangling-infra-meta-'))
try {
  const refs = join(fixture, 'packages/design-system/ds-canonical/references')
  mkdirSync(refs, { recursive: true })
  const target = join(refs, 'naming-conventions.md')
  writeFileSync(target, '# Fixture\n')
  if (run(fixture) !== 0) {
    console.error('✗ isolated fixture baseline 應 PASS 卻 FAIL')
    ok = false
  }

  writeFileSync(target, '# Fixture\n- LIVE ref: check_meta_test_dangling_ref_probe.sh\n')
  const code = run(fixture)
  if (code === 0) {
    console.error('✗ 注入 dangling LIVE ref 後 gate 未 FAIL(detection 失效)')
    ok = false
  } else {
    console.log(`✓ isolated fixture dangling LIVE ref 被抓(exit ${code})`)
  }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

if (run(REPO) !== 0) {
  console.error('✗ isolated test 後 caller repo 應 PASS')
  process.exit(1)
}
console.log(ok ? '✅ meta-test PASS(repo 零寫入)' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
