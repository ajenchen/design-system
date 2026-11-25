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
  const triageLine = agentsText.split('\n').find((line) => line.startsWith('**分診與預算**'))
  write('AGENTS.md', `# Fixture governance\n\n${triageLine}\n\n${block}\n`)
  write('CLAUDE.md', '@AGENTS.md\n')
  // 分診段也照抄進 fixture,它引用的檔(2026-11-25 起指向 feedback_orchestration_verify_before_scale.md)一樣要有樁,否則死鏈檢查讓綠格假紅
  for (const rel of [...`${triageLine}\n${block}`.matchAll(/`((?:scripts|packages|governance|infra)\/[^`*]+?\.(?:md|mjs|sh|json))`/g)].map((m) => m[1])) write(rel, 'fixture\n')
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
      console.error(`✗ ${label}:應${wantGreen ? '綠' : '紅'},實際 exit ${code}`)
      ok = false
    } else console.log(`✓ ${label}(exit ${code})`)
  }
  expect('A8 SSOT 齊全、沒有手抄 → 綠', true)
  const note = 'packages/design-system/ds-canonical/rules/note.md'
  write(note, `${boundaryLine.replace(/^\*\*Human-only boundaries\*\*/, '要交給人的只有這些')}\n`)
  expect('A8 規則檔抄一份 human-only 清單、沒引用 → 紅', false)
  write(note, `${boundaryLine.replace(/^\*\*Human-only boundaries\*\*/, '要交給人的只有這些')}(見 AGENTS.md#canonical-decision-authority)\n`)
  expect('A8 同一份清單附上 SSOT 出處 → 綠', true)
  write(note, `可以交給 user 的:${ids.slice(0, 2).join('、')}。\n`)
  expect('A8 寫死 2 個 scope id、沒引用 → 紅', false)
  write(note, `可以交給 user 的:${ids.join('、')}(approval-evidence.mjs humanOnlyAuthorityScopes())。\n`)
  expect('A8 完整 id 集合 + 出處 → 綠', true)
  write('packages/design-system/ds-canonical/fork/launchers/approval-evidence.mjs', `${readFileSync(resolve(REPO, classifierRel), 'utf8')}\n// drift\n`)
  expect('A8 分類器 fork 投影與正本不同 → 紅', false)
  copy(classifierRel, 'packages/design-system/ds-canonical/fork/launchers/approval-evidence.mjs')
  rmSync(join(authorityFixture, note))

  // A8 中文 / 混寫清單與「誰決定」結構(2026-11-22 審查必修 1:原本只認英文詞,規格點名 4 支 skill 的手抄原文還原回去仍綠)。
  // (1) 中文清單由 SSOT 那一句自己造:決策區塊 Human-only boundaries 那一句拿掉英文詞、只剩中文項 → 紅;附出處 → 綠。
  write(note, `${boundaryLine.replace(/^\*\*Human-only boundaries\*\*/, '要交給人的只有這些').replace(/[A-Za-z]+/g, '')}\n`)
  expect('A8 只剩中文項的 human-only 清單、沒引用 → 紅', false)
  write(note, `${boundaryLine.replace(/^\*\*Human-only boundaries\*\*/, '要交給人的只有這些').replace(/[A-Za-z]+/g, '')}(見 AGENTS.md#canonical-decision-authority)\n`)
  expect('A8 只剩中文項的清單附上出處 → 綠', true)
  rmSync(join(authorityFixture, note))
  // (2) 真實寫法讀 scripts/test-fixtures/agents-bootstrap-a8/cases.json(本檔不寫清單):規格點名 4 支 skill 先放 repo 現行檔
  //     (引用決策區塊)證綠,再逐支換成 68c260ee 的手抄原文證紅、換回證綠;其餘中文 / 混寫 / 結構寫法放進規則檔照 want 判。
  const a8Cases = JSON.parse(readFileSync(resolve(REPO, 'scripts/test-fixtures/agents-bootstrap-a8/cases.json'), 'utf8')).cases
  const isSkill = (c) => c.rel.includes('/skills/')
  const skillRels = [...new Set(a8Cases.filter(isSkill).map((c) => c.rel))]
  if (skillRels.length !== 4) {
    console.error(`✗ cases.json 應列規格點名的 4 支 skill,實際 ${skillRels.length} 支`)
    ok = false
  }
  for (const rel of skillRels) copy(rel)
  expect(`A8 規格點名 ${skillRels.length} 支 skill 的現行檔(引用決策區塊)→ 綠`, true)
  for (const c of a8Cases.filter((x) => isSkill(x) && x.want === 'red')) {
    write(c.rel, c.text)
    expect(`A8 ${c.name} 放回原路徑 → 紅`, false)
    copy(c.rel)
  }
  expect('A8 4 支 skill 換回現行檔 → 綠', true)
  for (const c of a8Cases.filter((x) => !isSkill(x))) {
    const rel = `packages/design-system/ds-canonical/rules/${c.rel}`
    write(rel, c.text)
    expect(`A8 ${c.name} → ${c.want === 'red' ? '紅' : '綠'}`, c.want !== 'red')
    rmSync(join(authorityFixture, rel))
  }

  // A6 開場 bytes 上限(CG0-SLIM-CAP):把開場固定載入檔湊到剛好等於上限 → 綠;多一行 → 紅;
  // 同一份大檔加上 paths 前置設定(不再每次載入)→ 不算進開場 → 綠。上限從檢查器原始碼讀,不在本檔重寫數字。
  const cap = Number(readFileSync(CHECKER, 'utf8').match(/const OPENING_FILES_MAX_BYTES = ([\d_]+)/)[1].replaceAll('_', ''))
  const sizeOf = (rel) => Buffer.byteLength(readFileSync(join(authorityFixture, rel), 'utf8'))
  const metaRel = 'packages/design-system/ds-canonical/rules/meta-patterns.md'
  const metaHead = '**優先序**:見 AGENTS.md「分診與預算」。\n'
  const filler = (n) => metaHead + 'x'.repeat(n - Buffer.byteLength(metaHead))
  write(metaRel, metaHead)
  const others = sizeOf('AGENTS.md') + sizeOf('CLAUDE.md')
  write(metaRel, filler(cap - others))
  expect('A6 開場固定載入剛好等於上限 → 綠', true)
  write(metaRel, `${filler(cap - others)}\n`)
  expect('A6 多一行 → 紅', false)
  write(metaRel, `---\npaths:\n  - "**/*.tsx"\n---\n${filler(cap - others)}\n`)
  expect('A6 同一份檔改成依 paths 載入(不在開場)→ 綠', true)
  write(metaRel, metaHead)
  // A7「分診與預算」段(CG0-THRIFT):刪掉 → 紅;meta-patterns 優先序那一行刪掉 → 紅
  write('AGENTS.md', `# Fixture governance\n\n${block}\n`)
  expect('A7 AGENTS.md 刪掉「分診與預算」段 → 紅', false)
  write('AGENTS.md', `# Fixture governance\n\n${triageLine}\n\n${block}\n`)
  write(metaRel, 'x\n')
  expect('A7 meta-patterns 刪掉優先序那一行 → 紅', false)
} finally {
  rmSync(authorityFixture, { recursive: true, force: true })
}

if (run(REPO) !== 0) {
  console.error('✗ isolated test 後 caller repo 應 PASS')
  process.exit(1)
}
console.log(ok ? '✅ meta-test PASS(repo 零寫入)' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
