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
  write(root, 'governance/memory/entry.md', '# Memory\n')
  write(root, '.github/workflows/ci.yml', 'name: ci\n')
  write(root, '.storybook/main.ts', 'export default {}\n')
  write(root, 'scripts/audit-content-quality.mjs', 'process.exit(0)\n')
  return root
}

function run(root) {
  const result = spawnSync(process.execPath, ['--', scorer, '--root', root, '--json'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const value = JSON.parse(result.stdout)
  delete value.ts
  return value
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
