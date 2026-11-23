import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve } from 'node:path'
import test from 'node:test'

const scorer = resolve(import.meta.dirname, 'score-infra-best-practice.mjs')

function write(root, path, value = '') {
  const target = resolve(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, value)
}

function snapshot(root, current = root) {
  const rows = []
  for (const name of readdirSync(current).sort()) {
    const path = resolve(current, name)
    const rel = relative(root, path).split('\\').join('/')
    const info = statSync(path)
    if (info.isDirectory()) rows.push(['d', rel], ...snapshot(root, path))
    else rows.push(['f', rel, createHash('sha256').update(readFileSync(path)).digest('hex')])
  }
  return rows
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'infra-score-neutral-'))
  const registry = {
    canonical: {
      roots: {
        contextForkAgents: 'canonical/agents',
        commands: 'canonical/commands',
        hooks: 'canonical/hooks',
        references: 'canonical/references',
        rules: 'canonical/rules',
        skills: 'canonical/skills',
      },
      hookRegistrations: 'canonical/hooks/registrations.json',
      reservedDiscovery: {
        providerRootNames: ['.agents', '.claude', '.codex'],
        instructionNames: ['AGENTS.md', 'CLAUDE.md'],
        instructionOverrideNames: ['AGENTS.local.md', 'AGENTS.override.md', 'CLAUDE.local.md', 'CLAUDE.override.md'],
        configPaths: ['.claude/settings.json', '.codex/config.toml'],
        pluginRootNames: ['.claude-plugin', '.codex-plugin'],
      },
    },
  }
  write(root, 'packages/governance/canonical/providers.json', `${JSON.stringify(registry)}\n`)
  write(root, 'canonical/hooks/registrations.json', `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ hook: 'stop_self_audit.sh' }] }] } })}\n`)
  write(root, 'canonical/hooks/stop_self_audit.sh', '#!/bin/sh\n')
  write(root, 'canonical/hooks/tests/test_stop_self_audit.sh', '#!/bin/sh\n')
  write(root, 'canonical/skills/codify-principle/SKILL.md', '# Canonical principle\n')
  write(root, 'canonical/agents/reviewer.md', '# Reviewer\n')
  for (const name of ['one', 'two', 'three']) write(root, `canonical/rules/${name}.md`, `# ${name}\n`)
  write(root, 'AGENTS.md', '# Shared\n')
  write(root, 'CLAUDE.md', '# Adapter\n')
  memory(root, { links: 1 })
  write(root, '.github/workflows/ci.yml', 'name: ci\n')
  write(root, '.storybook/main.ts', 'export default {}\n')
  write(root, 'scripts/audit-content-quality.mjs', 'process.exit(0)\n')
  return root
}

// governance/memory 的 fixture:links 條索引(各有內容檔)、unindexed 個沒進索引的檔、README.md 一份。
// contract / index 為 false 時分別不寫 contract.json / MEMORY.md。
function memory(root, { links, cap = 20, unindexed = 0, contract = true, index = true }) {
  rmSync(resolve(root, 'governance/memory'), { recursive: true, force: true })
  if (contract) write(root, 'governance/memory/contract.json', `${JSON.stringify({ index: 'MEMORY.md', readme: 'README.md', maxIndexEntries: cap })}\n`)
  write(root, 'governance/memory/README.md', '# Memory README\n')
  const rows = []
  for (let i = 1; i <= links; i++) {
    rows.push(`- [Entry ${i}](entry_${i}.md) — fixture`)
    write(root, `governance/memory/entry_${i}.md`, `# Entry ${i}\n`)
  }
  for (let i = 1; i <= unindexed; i++) write(root, `governance/memory/note_${i}.md`, `# Note ${i}\n`)
  if (index) write(root, 'governance/memory/MEMORY.md', `# Memory Index\n\n${rows.join('\n')}\n`)
}

function run(root) {
  const result = spawnSync(process.execPath, ['--', scorer, '--root', root, '--json'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const value = JSON.parse(result.stdout)
  delete value.ts
  return value
}

// 只看 D3:總分會被其他維度左右,結束碼(總分 ≥ 80 才回 0)在這裡不是被測的東西;但不准崩潰、不准有 stderr。
function d3(root) {
  const result = spawnSync(process.execPath, ['--', scorer, '--root', root, '--json'], { encoding: 'utf8' })
  assert.ok([0, 1].includes(result.status), `scorer crashed: status=${result.status} ${result.stderr}`)
  assert.equal(result.stderr, '')
  return JSON.parse(result.stdout).dimensions.filter(dimension => dimension.dim.startsWith('D3 '))
}

test('infra score reads canonical registry roots and remains byte-for-byte side-effect free', () => {
  const root = fixture()
  try {
    const before = snapshot(root)
    const baseline = run(root)
    assert.deepEqual(snapshot(root), before)
    assert.equal(existsSync(resolve(root, '.claude')), false)

    write(root, '.claude/skills/poison/SKILL.md', `${'poison\n'.repeat(1000)}`)
    write(root, '.claude/hooks/poison.sh', 'exit 99\n')
    write(root, '.claude/logs/infra-best-practice-score.jsonl', '{"finalScore":0}\n')
    chmodSync(resolve(root, '.claude/hooks/poison.sh'), 0o755)
    const poisonedBefore = snapshot(root)
    const poisoned = run(root)
    assert.deepEqual(poisoned, baseline, 'provider-owned poison must not influence canonical score')
    assert.deepEqual(snapshot(root), poisonedBefore, 'scoring must not append or rewrite runtime state')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// D3 數的是 MEMORY.md 的索引條目、上限讀 contract.json(和 CI 的 validate-memory-contract、SessionStart Check 8 同一個函式)。
// (a)(b) 兩組是「數檔、上限寫死 20」的舊數法會給出不同值與不同分數的情境;(c)(d) 是適用性與量具失效。
test('D3 counts MEMORY.md index entries against contract maxIndexEntries, not memory files', () => {
  const root = fixture()
  try {
    // (a) 索引 1 條,另有 25 個沒進索引的檔與 README.md → 1/20、100 分(舊數法:27/20、50 分)
    memory(root, { links: 1, unindexed: 25 })
    assert.deepEqual(d3(root).map(({ value, score }) => ({ value, score })), [{ value: '1/20', score: 100 }])

    // (b) 上限讀 contract:maxIndexEntries = 6 時各級距(上限 − 5 / 上限 / 上限 × 1.5 / 以上)
    for (const [links, value, score] of [[1, '1/6', 100], [2, '2/6', 80], [6, '6/6', 80], [7, '7/6', 50], [9, '9/6', 50], [10, '10/6', 20]]) {
      memory(root, { links, cap: 6 })
      assert.deepEqual(d3(root).map(dimension => ({ value: dimension.value, score: dimension.score })), [{ value, score }], `links=${links} cap=6`)
    }

    // (c) 沒有 contract.json → 本維度不適用、不出現(與 SessionStart Check 8 同判)
    memory(root, { links: 3, contract: false })
    assert.deepEqual(d3(root), [])

    // (d) 有 contract、索引檔不見 → 0 分並寫出量不到的原因,不當成沒超標
    memory(root, { links: 3, index: false })
    const [missing, ...rest] = d3(root)
    assert.deepEqual(rest, [])
    assert.equal(missing.score, 0)
    assert.match(missing.value, /^量不到:/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
