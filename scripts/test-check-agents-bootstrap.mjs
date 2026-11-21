#!/usr/bin/env node
// Isolated meta-test for check-agents-bootstrap.  Never mutates the caller repo.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { humanOnlyAuthorityScopes } from '../packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs'

const REPO = process.cwd()
const CHECKER = resolve(REPO, 'scripts/check-agents-bootstrap.mjs')
const run = (root) => spawnSync(process.execPath, ['--', CHECKER, '--check', '--root', root], {
  cwd: REPO,
  encoding: 'utf8',
  stdio: 'pipe',
}).status ?? 1

if (run(REPO) !== 0) {
  console.error('✗ baseline run 應 PASS 卻 FAIL')
  process.exit(1)
}

let ok = true
const fixture = mkdtempSync(join(tmpdir(), 'agents-bootstrap-meta-'))
try {
  mkdirSync(join(fixture, 'packages/design-system'), { recursive: true })
  mkdirSync(join(fixture, 'scripts/package-role-sources'), { recursive: true })
  const agents = '# Fixture governance\n\nNo external references.\n'
  const packageAgents = '# Package scope\n\nScoped augmentation; not repository or consumer SSOT.\n'
  const packageClaude = '@AGENTS.md\n\n# Claude package adapter\n'
  writeFileSync(join(fixture, 'AGENTS.md'), agents)
  writeFileSync(join(fixture, 'CLAUDE.md'), '@AGENTS.md\n')
  writeFileSync(join(fixture, 'scripts/package-role-sources/AGENTS.package.md'), packageAgents)
  writeFileSync(join(fixture, 'scripts/package-role-sources/CLAUDE.package.md'), packageClaude)
  writeFileSync(join(fixture, 'packages/design-system/AGENTS.md'), packageAgents)
  writeFileSync(join(fixture, 'packages/design-system/CLAUDE.md'), packageClaude)
  writeFileSync(join(fixture, 'packages/design-system/package.json'), JSON.stringify({ files: ['AGENTS.md', 'CLAUDE.md'] }))

  if (run(fixture) !== 0) {
    console.error('✗ isolated fixture baseline 應 PASS 卻 FAIL')
    ok = false
  }

  const providerAuthority = '# Fixture governance\n\nSSOT 詳 `.claude/rules/meta-patterns.md`。\n'
  writeFileSync(join(fixture, 'AGENTS.md'), providerAuthority)
  if (run(fixture) === 0) {
    console.error('✗ generated provider view 被當 SSOT pointer 卻未 FAIL')
    ok = false
  } else {
    console.log('✓ provider-view authority pointer 被 fail-closed gate 抓到')
  }

  const adapterDisclosure = '# Fixture governance\n\n`.claude/rules` 是 generated adapter view，非 SSOT 或 edit target。\n'
  writeFileSync(join(fixture, 'AGENTS.md'), adapterDisclosure)
  if (run(fixture) !== 0) {
    console.error('✗ 明示 non-authority 的 provider adapter 說明不應被誤殺')
    ok = false
  }

  writeFileSync(join(fixture, 'AGENTS.md'), '# Fixture governance\n\n讀 `packages/missing/canonical.md`。\n')
  if (run(fixture) === 0) {
    console.error('✗ canonical dead reference 未 FAIL')
    ok = false
  } else {
    console.log('✓ canonical dead reference 被 fail-closed gate 抓到')
  }

  writeFileSync(join(fixture, 'AGENTS.md'), agents)
  writeFileSync(join(fixture, 'CLAUDE.md'), '# 非法首行\n@AGENTS.md\n')
  const code = run(fixture)
  if (code === 0) {
    console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)')
    ok = false
  } else {
    console.log(`✓ isolated fixture 注入違規被抓(exit ${code})`)
  }

  writeFileSync(join(fixture, 'CLAUDE.md'), '@AGENTS.md\n')
  writeFileSync(join(fixture, 'packages/design-system/AGENTS.md'), agents)
  if (run(fixture) === 0) {
    console.error('✗ nested package AGENTS 複製 root 卻未 FAIL')
    ok = false
  } else {
    console.log('✓ nested package 重複 SSOT/context 被 fail-closed gate 抓到')
  }

  writeFileSync(join(fixture, 'packages/design-system/AGENTS.md'), packageAgents)
  const oversizedRoot = `# Fixture governance\n\n${'x'.repeat(32700)}\n`
  writeFileSync(join(fixture, 'AGENTS.md'), oversizedRoot)
  if (run(fixture) === 0) {
    console.error('✗ root→nested combined project-doc chain 超過 32KiB 卻未 FAIL')
    ok = false
  } else {
    console.log('✓ root→nested 累積 32KiB cap 被 fail-closed gate 抓到')
  }

  writeFileSync(join(fixture, 'AGENTS.md'), agents)
  writeFileSync(join(fixture, 'packages/design-system/AGENTS.md'), `${packageAgents}\ndrift\n`)
  if (run(fixture) === 0) {
    console.error('✗ package-scope generated instruction drift 卻未 FAIL')
    ok = false
  } else {
    console.log('✓ package-scope generated instruction drift 被抓到')
  }
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

// A8(2026-11-22 WP-AGENTS / ASKFIX-REPO-DRIFT):在拋棄式小樹裡放 SSOT 三處(決策區塊、分類器、release-workflow.json)
// 與分類器 / 收據契約的投影,先證綠,再逐格注入「手抄 human-only 清單 / 寫死 scope id / 投影漂移」證紅、加了出處證綠。
// 注入的文字取自 SSOT 本身(決策區塊那一行、分類器回傳的 id),本檔不寫任何類別清單。
const authorityFixture = mkdtempSync(join(tmpdir(), 'agents-bootstrap-a8-'))
try {
  const write = (rel, text) => { mkdirSync(dirname(join(authorityFixture, rel)), { recursive: true }); writeFileSync(join(authorityFixture, rel), text) }
  const copy = (from, to = from) => { mkdirSync(dirname(join(authorityFixture, to)), { recursive: true }); copyFileSync(resolve(REPO, from), join(authorityFixture, to)) }
  const agentsText = readFileSync(resolve(REPO, 'AGENTS.md'), 'utf8')
  const start = agentsText.indexOf('<!-- canonical-decision-authority:start -->')
  const end = agentsText.indexOf('<!-- canonical-decision-authority:end -->') + '<!-- canonical-decision-authority:end -->'.length
  const block = agentsText.slice(start, end)
  const boundaryLine = block.split('\n').find((line) => line.startsWith('**Human-only boundaries**'))
  write('AGENTS.md', `# Fixture governance\n\n${block}\n`)
  write('CLAUDE.md', '@AGENTS.md\n')
  for (const rel of [...block.matchAll(/`((?:scripts|packages|governance|infra)\/[^`*]+?\.(?:md|mjs|sh|json))`/g)].map((m) => m[1])) write(rel, 'fixture\n')
  write('scripts/package-role-sources/AGENTS.package.md', '# Package scope\n\nScoped augmentation; not repository or consumer SSOT.\n')
  write('scripts/package-role-sources/CLAUDE.package.md', '@AGENTS.md\n\n# Claude package adapter\n')
  write('packages/design-system/AGENTS.md', '# Package scope\n\nScoped augmentation; not repository or consumer SSOT.\n')
  write('packages/design-system/CLAUDE.md', '@AGENTS.md\n\n# Claude package adapter\n')
  write('packages/design-system/package.json', JSON.stringify({ files: ['AGENTS.md', 'CLAUDE.md'] }))
  const classifierRel = 'packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs'
  const receiptRel = 'packages/governance/src/authority-decision-evidence.mjs'
  copy(classifierRel)
  copy('packages/design-system/ds-canonical/hooks/lib/ask-route.mjs')
  copy('infra/governance/release-workflow.json')
  copy(receiptRel)
  copy(classifierRel, 'packages/design-system/ds-canonical/fork/launchers/approval-evidence.mjs')
  copy(classifierRel, 'template/ds-product-template/governance/bin/approval-evidence.mjs')
  copy(receiptRel, 'packages/design-system/ds-canonical/fork/launchers/authority-decision-evidence.mjs')
  copy(receiptRel, 'template/ds-product-template/governance/bin/authority-decision-evidence.mjs')
  const ids = humanOnlyAuthorityScopes()
  const expect = (label, wantGreen) => {
    const code = run(authorityFixture)
    if ((code === 0) !== wantGreen) {
      console.error(`✗ A8 ${label}:應${wantGreen ? '綠' : '紅'},實際 exit ${code}`)
      ok = false
    } else console.log(`✓ A8 ${label}(exit ${code})`)
  }
  expect('SSOT 齊全、沒有手抄 → 綠', true)
  const note = 'packages/design-system/ds-canonical/rules/note.md'
  write(note, `${boundaryLine.replace(/^\*\*Human-only boundaries\*\*/, '要交給人的只有這些')}\n`)
  expect('規則檔抄一份 human-only 清單、沒引用 → 紅', false)
  write(note, `${boundaryLine.replace(/^\*\*Human-only boundaries\*\*/, '要交給人的只有這些')}(見 AGENTS.md#canonical-decision-authority)\n`)
  expect('同一份清單附上 SSOT 出處 → 綠', true)
  write(note, `可以交給 user 的:${ids.slice(0, 2).join('、')}。\n`)
  expect('寫死 2 個 scope id、沒引用 → 紅', false)
  write(note, `可以交給 user 的:${ids.join('、')}(approval-evidence.mjs humanOnlyAuthorityScopes())。\n`)
  expect('完整 id 集合 + 出處 → 綠', true)
  write('packages/design-system/ds-canonical/fork/launchers/approval-evidence.mjs', `${readFileSync(resolve(REPO, classifierRel), 'utf8')}\n// drift\n`)
  expect('分類器 fork 投影與正本不同 → 紅', false)
} finally {
  rmSync(authorityFixture, { recursive: true, force: true })
}

if (run(REPO) !== 0) {
  console.error('✗ isolated test 後 caller repo 應 PASS')
  process.exit(1)
}
console.log(ok ? '✅ meta-test PASS(repo 零寫入)' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
