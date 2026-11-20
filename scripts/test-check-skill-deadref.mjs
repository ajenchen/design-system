#!/usr/bin/env node
// Isolated meta-test for check-skill-deadref.  Never edits live provider views.
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: check-skill-deadref.mjs 該綠時綠、該紅時紅 —— 本 repo 現況(--check --root 本 repo)必須 exit 0;mkdtemp 夾具裡乾淨的 rules + 產品 spec
//         → 必須 exit 0,rules 寫「CLAUDE.md line 999」→ 必須非 0,產品 spec 的出處改成 CLAUDE.md → 必須非 0;夾具跑完本 repo 再驗一次必須 exit 0
//   紅: 任一步不照預期 → 印出是哪一步並 exit 1
//   綠: 都照預期時 exit 0;不寫入本 repo,夾具在 finally 刪掉,不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = process.cwd()
const CHECKER = resolve(REPO, 'scripts/check-skill-deadref.mjs')
const run = (root) => spawnSync(process.execPath, ['--', CHECKER, '--check', '--root', root], {
  cwd: REPO,
  encoding: 'utf8',
  stdio: 'pipe',
}).status ?? 1

if (run(REPO) !== 0) {
  console.error('✗ baseline run 應 PASS 卻 FAIL(repo 有真 dead-ref)')
  process.exit(1)
}
console.log('✓ caller repo baseline PASS')

let ok = true
const fixture = mkdtempSync(join(tmpdir(), 'skill-deadref-meta-'))
try {
  const rules = join(fixture, 'packages/design-system/ds-canonical/rules')
  const specs = join(fixture, 'packages/design-system/src/components/Button')
  mkdirSync(rules, { recursive: true })
  mkdirSync(specs, { recursive: true })
  const target = join(rules, 'self-verify.md')
  const productSpec = join(specs, 'button.spec.md')
  writeFileSync(target, '# Fixture\n')
  writeFileSync(productSpec, '# Button\nCanonical: `AGENTS.md` `# 4-Family Layout Model`.\n')
  if (run(fixture) !== 0) {
    console.error('✗ isolated fixture baseline 應 PASS 卻 FAIL')
    ok = false
  }

  writeFileSync(target, '# Fixture\nSee CLAUDE.md line 999.\n')
  const code = run(fixture)
  if (code === 0) {
    console.error('✗ 注入 line-number dead ref 後 gate 未 FAIL(detection 失效)')
    ok = false
  } else {
    console.log(`✓ isolated fixture dead ref 被抓(exit ${code})`)
  }

  writeFileSync(target, '# Fixture\n')
  writeFileSync(productSpec, '# Button\nCanonical: `CLAUDE.md` `# 4-Family Layout Model`.\n')
  const specCode = run(fixture)
  if (specCode === 0) {
    console.error('✗ product spec canonical pointer mutation 成 CLAUDE.md 後 gate 未 FAIL')
    ok = false
  } else {
    console.log(`✓ product spec provider-view authority mutation 被抓(exit ${specCode})`)
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
