#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = () => spawnSync(process.execPath, ['--', 'scripts/repository-hygiene-invariant.mjs', '--profile=authority', '--check'], {
  encoding: 'utf8',
}).status ?? 1

const runFixture = (root) => spawnSync(process.execPath, [
  '--', 'scripts/repository-hygiene-invariant.mjs', '--profile=authority', '--check', '--root', root,
], { encoding: 'utf8' })

function makeSymlinkFixture({ missing = null, broken = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'repository-hygiene-symlink-'))
  const targets = [
    '.claude/commands',
    '.claude/hooks',
    '.claude/skills',
    'infra/governance/baseline/visual/targeted',
    'infra/governance/baseline/visual/curated',
  ]
  for (const target of targets) {
    if (broken === 'commands' && target === '.claude/commands') continue
    mkdirSync(join(root, target), { recursive: true })
  }
  const links = {
    '.claude/snapshots-baseline': '../infra/governance/baseline/visual/targeted',
    commands: '.claude/commands',
    'hooks/scripts': '../.claude/hooks',
    skills: '.claude/skills',
    'snapshots-baseline': 'infra/governance/baseline/visual/curated',
  }
  for (const [path, target] of Object.entries(links)) {
    if (path === missing) continue
    mkdirSync(join(root, path, '..'), { recursive: true })
    symlinkSync(target, join(root, path))
  }
  spawnSync('git', ['init', '--quiet', root], { encoding: 'utf8' })
  spawnSync('git', ['-C', root, 'add', '--all'], { encoding: 'utf8' })
  return root
}

const transient = '.tmp-repository-hygiene-meta-test.mjs'
const duplicateA = 'docs/repository-hygiene-meta-a.txt'
const duplicateB = 'docs/repository-hygiene-meta-b.txt'
for (const path of [transient, duplicateA, duplicateB]) {
  if (existsSync(path)) throw new Error(`refusing to overwrite meta-test path:${path}`)
}

if (run() !== 0) throw new Error('repository hygiene baseline must pass')

try {
  writeFileSync(transient, 'temporary meta-test artifact\n')
  if (run() === 0) throw new Error('transient repository artifact must fail closed')
} finally {
  rmSync(transient, { force: true })
}

try {
  writeFileSync(duplicateA, 'paired undeclared duplicate\n')
  writeFileSync(duplicateB, 'paired undeclared duplicate\n')
  if (run() === 0) throw new Error('undeclared exact-content duplicates must fail closed')
} finally {
  rmSync(duplicateA, { force: true })
  rmSync(duplicateB, { force: true })
}

if (run() !== 0) throw new Error('repository hygiene must pass after paired mutations are restored')

for (const fixtureCase of [
  { options: {}, expected: 0, label: 'declared symlink fixture baseline' },
  { options: { missing: 'commands' }, expected: 1, label: 'missing declared symlink' },
  { options: { broken: 'commands' }, expected: 1, label: 'broken declared symlink target' },
]) {
  const fixture = makeSymlinkFixture(fixtureCase.options)
  try {
    const result = runFixture(fixture)
    if ((result.status ?? 1) !== fixtureCase.expected) {
      throw new Error(`${fixtureCase.label} expected exit ${fixtureCase.expected}, got ${result.status}\n${result.stdout}\n${result.stderr}`)
    }
    if (fixtureCase.options.missing && !/declared repository symlink is missing/.test(result.stderr)) {
      throw new Error('missing declared symlink did not emit the R3 diagnostic')
    }
    if (fixtureCase.options.broken && !/declared symlink target is missing/.test(result.stderr)) {
      throw new Error('broken declared symlink target did not emit the R3 diagnostic')
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
console.log('✅ repository hygiene paired mutation PASS(transient + duplicate fail closed; restore PASS)')
