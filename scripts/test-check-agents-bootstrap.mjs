#!/usr/bin/env node
// Isolated meta-test for check-agents-bootstrap.  Never mutates the caller repo.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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

if (run(REPO) !== 0) {
  console.error('✗ isolated test 後 caller repo 應 PASS')
  process.exit(1)
}
console.log(ok ? '✅ meta-test PASS(repo 零寫入)' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
