#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ensureRuntimeEvidenceDirectory,
  ensureRuntimeEvidenceRoot,
  prepareRuntimeEvidenceFile,
  resolveProviderTelemetryStatePath,
  resolveProviderTelemetryStateRoot,
  resolveRuntimeEvidencePath,
  resolveRuntimeEvidenceRoot,
} from './lib/governance-runtime-evidence.mjs'

const SCRIPTS_ROOT = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPTS_ROOT, '..')
const SCRIPT = resolve(SCRIPTS_ROOT, 'lib/governance-runtime-evidence.mjs')

function repositoryFiles(root, relativeRoot = '', files = []) {
  const absoluteRoot = join(root, relativeRoot)
  if (!existsSync(absoluteRoot)) return files
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (!relativeRoot && entry.name === '.git') continue
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name
    if (entry.isDirectory() && !entry.isSymbolicLink()) repositoryFiles(root, relativePath, files)
    else files.push(relativePath)
  }
  return files.sort()
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'governance-evidence-'))
  execFileSync('git', ['init', '-q', root])
  const canonicalRoot = realpathSync(root)
  const gitDirectory = realpathSync(join(root, '.git'))
  const runtime = join(gitDirectory, 'governance-runtime')
  const evidence = join(runtime, 'evidence')
  return { root, canonicalRoot, gitDirectory, runtime, evidence }
}

{
  const data = fixture()
  try {
    assert.equal(resolveRuntimeEvidenceRoot({ repoRoot: data.root }), data.evidence)
    assert.equal(
      resolveRuntimeEvidencePath({ repoRoot: data.root, relativePath: 'deep-audit/judgment/codex/dim-6.json' }),
      join(data.evidence, 'deep-audit/judgment/codex/dim-6.json'),
    )
    assert.equal(
      resolveRuntimeEvidenceRoot({ repoRoot: data.root, explicitRoot: 'visual/custom' }),
      join(data.evidence, 'visual/custom'),
    )
    assert.equal(resolveRuntimeEvidenceRoot({ repoRoot: data.root, explicitRoot: data.evidence }), data.evidence)
    const file = prepareRuntimeEvidenceFile({ repoRoot: data.root, relativePath: 'audit/report.json' })
    writeFileSync(file, '{}\n')
    assert.equal(
      ensureRuntimeEvidenceDirectory({ repoRoot: data.root, relativePath: 'deep-audit/deterministic' }),
      join(data.evidence, 'deep-audit/deterministic'),
    )
    assert.equal(
      ensureRuntimeEvidenceRoot({ repoRoot: data.root, explicitRoot: 'custom-root' }),
      join(data.evidence, 'custom-root'),
    )
    assert.equal(existsSync(join(data.root, 'infra/governance/runtime')), false)
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
}

for (const bad of ['/tmp/escape', '../escape', 'audit/../escape', 'audit\\escape', 'audit//escape', 'audit/\0escape']) {
  const data = fixture()
  try {
    assert.throws(() => resolveRuntimeEvidencePath({ repoRoot: data.root, relativePath: bad }), /blocked/)
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
}

{
  const data = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'governance-evidence-outside-'))
  try {
    assert.throws(
      () => resolveRuntimeEvidenceRoot({ repoRoot: data.root, explicitRoot: join(data.root, 'infra/governance/runtime') }),
      /Git-owned evidence root or its child/,
    )
    assert.throws(
      () => resolveRuntimeEvidenceRoot({ repoRoot: data.root, explicitRoot: '../runtime-escape' }),
      /Git-owned evidence root or its child/,
    )
    assert.throws(
      () => resolveRuntimeEvidenceRoot({ repoRoot: data.root, explicitRoot: outside }),
      /Git-owned evidence root or its child/,
    )
  } finally {
    rmSync(data.root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const data = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'governance-evidence-symlink-'))
  try {
    mkdirSync(data.runtime, { recursive: true })
    symlinkSync(outside, data.evidence)
    assert.throws(() => resolveRuntimeEvidenceRoot({ repoRoot: data.root }), /symbolic link/)
  } finally {
    rmSync(data.root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const data = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'governance-evidence-child-symlink-'))
  try {
    mkdirSync(data.evidence, { recursive: true })
    symlinkSync(outside, join(data.evidence, 'poison'))
    assert.throws(
      () => resolveRuntimeEvidencePath({ repoRoot: data.root, relativePath: 'poison/report.json' }),
      /symbolic link/,
    )
    symlinkSync(join(outside, 'missing'), join(data.evidence, 'dangling'))
    assert.throws(
      () => resolveRuntimeEvidencePath({ repoRoot: data.root, relativePath: 'dangling/report.json' }),
      /symbolic link/,
    )
  } finally {
    rmSync(data.root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const data = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'governance-evidence-hardlink-'))
  try {
    mkdirSync(join(data.evidence, 'audit'), { recursive: true })
    const outsideFile = join(outside, 'outside.json')
    const linkedFile = join(data.evidence, 'audit/hardlink.json')
    writeFileSync(outsideFile, 'do-not-touch\n')
    linkSync(outsideFile, linkedFile)
    assert.throws(
      () => resolveRuntimeEvidencePath({ repoRoot: data.root, relativePath: 'audit/hardlink.json' }),
      /hard-link alias/,
    )
    assert.throws(
      () => prepareRuntimeEvidenceFile({ repoRoot: data.root, relativePath: 'audit/hardlink.json' }),
      /hard-link alias/,
    )
  } finally {
    rmSync(data.root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const data = fixture()
  try {
    const ok = execFileSync(process.execPath, ['--', SCRIPT, '--repo-root', data.root, '--path', 'audit/cli.json'], { encoding: 'utf8' }).trim()
    assert.equal(ok, join(data.evidence, 'audit/cli.json'))
    const prepared = execFileSync(process.execPath, ['--', SCRIPT, '--repo-root', data.root, '--path', 'audit/prepared.json', '--prepare-file'], { encoding: 'utf8' }).trim()
    writeFileSync(prepared, '{}\n')
    const narrowed = execFileSync(process.execPath, ['--', SCRIPT, '--repo-root', data.root, '--root', 'nested', '--path', 'result.json'], { encoding: 'utf8' }).trim()
    assert.equal(narrowed, join(data.evidence, 'nested/result.json'))
    const telemetry = execFileSync(process.execPath, ['--', SCRIPT, '--repo-root', data.root, '--telemetry', '--path', 'hook-fires.jsonl'], { encoding: 'utf8' }).trim()
    assert.equal(telemetry, join(data.runtime, 'hook-fires.jsonl'))
    const badTelemetry = spawnSync(process.execPath, ['--', SCRIPT, '--repo-root', data.root, '--telemetry', '--root', 'nested', '--path', 'hook-fires.jsonl'], { encoding: 'utf8' })
    assert.equal(badTelemetry.status, 2)
    assert.match(badTelemetry.stderr, /read-only/)
    const bad = spawnSync(process.execPath, ['--', SCRIPT, '--repo-root', data.root, '--path', '../../escape'], { encoding: 'utf8' })
    assert.equal(bad.status, 2)
    assert.equal(bad.stdout, '')
    assert.match(bad.stderr, /blocked/)
    const cliAlias = join(data.root, 'resolver-alias.mjs')
    symlinkSync(SCRIPT, cliAlias)
    const aliased = execFileSync(process.execPath, ['--', cliAlias, '--repo-root', data.root, '--path', 'audit/alias.json'], { encoding: 'utf8' }).trim()
    assert.equal(aliased, join(data.evidence, 'audit/alias.json'))
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
}

{
  const data = fixture()
  try {
    assert.equal(existsSync(data.runtime), false)
    const telemetry = execFileSync(process.execPath, ['--', SCRIPT, '--repo-root', data.root, '--telemetry', '--path', 'hook-fires.jsonl'], { encoding: 'utf8' }).trim()
    assert.equal(telemetry, join(data.runtime, 'hook-fires.jsonl'))
    assert.equal(existsSync(data.runtime), false, 'read-only telemetry CLI must not create runtime state')
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
}

{
  const data = fixture()
  try {
    const previous = process.env.GOVERNANCE_READ_ONLY
    process.env.GOVERNANCE_READ_ONLY = '1'
    try {
      assert.throws(() => ensureRuntimeEvidenceRoot({ repoRoot: data.root }), /READ_ONLY/)
      assert.throws(
        () => ensureRuntimeEvidenceDirectory({ repoRoot: data.root, relativePath: 'audit/read-only' }),
        /READ_ONLY/,
      )
      assert.throws(
        () => prepareRuntimeEvidenceFile({ repoRoot: data.root, relativePath: 'audit/read-only.json' }),
        /READ_ONLY/,
      )
      assert.equal(existsSync(data.runtime), false)
    } finally {
      if (previous === undefined) delete process.env.GOVERNANCE_READ_ONLY
      else process.env.GOVERNANCE_READ_ONLY = previous
    }
  } finally {
    rmSync(data.root, { recursive: true, force: true })
  }
}

{
  const data = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'governance-telemetry-outside-'))
  try {
    assert.equal(
      resolveProviderTelemetryStateRoot({ repoRoot: data.root, stateRoot: join(data.runtime, 'audit-reader') }),
      join(data.runtime, 'audit-reader'),
    )
    assert.equal(
      resolveProviderTelemetryStateRoot({ repoRoot: data.root, stateRoot: 'audit-reader' }),
      join(data.runtime, 'audit-reader'),
    )
    assert.throws(
      () => resolveProviderTelemetryStateRoot({ repoRoot: data.root, runtimeRoot: join(data.root, 'infra/governance/runtime') }),
      /does not match/,
    )
    const state = join(data.runtime, 'audit-reader')
    mkdirSync(state, { recursive: true })
    const telemetryFile = join(state, 'self-audit-baseline-counts.jsonl')
    writeFileSync(telemetryFile, '{"trigger":1,"topic":1}\n')
    assert.equal(
      resolveProviderTelemetryStatePath({
        repoRoot: data.root,
        stateRoot: state,
        relativePath: 'self-audit-baseline-counts.jsonl',
      }),
      telemetryFile,
    )
    assert.throws(
      () => resolveProviderTelemetryStatePath({ repoRoot: data.root, stateRoot: state, relativePath: '../escape' }),
      /blocked/,
    )
    const outsideFile = join(outside, 'outside.jsonl')
    writeFileSync(outsideFile, '{}\n')
    linkSync(outsideFile, join(state, 'hardlink.jsonl'))
    assert.throws(
      () => resolveProviderTelemetryStatePath({ repoRoot: data.root, stateRoot: state, relativePath: 'hardlink.jsonl' }),
      /hard-link alias/,
    )
    symlinkSync(outside, join(state, 'nested'))
    assert.throws(
      () => resolveProviderTelemetryStatePath({ repoRoot: data.root, stateRoot: state, relativePath: 'nested/file.jsonl' }),
      /symbolic link/,
    )
    mkdirSync(data.runtime, { recursive: true })
    symlinkSync(outside, join(data.runtime, 'poison'))
    assert.throws(
      () => resolveProviderTelemetryStateRoot({ repoRoot: data.root, stateRoot: join(data.runtime, 'poison') }),
      /symbolic link/,
    )
  } finally {
    rmSync(data.root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const root = mkdtempSync(join(tmpdir(), 'governance-benchmark-runtime-'))
  const stubRoot = mkdtempSync(join(tmpdir(), 'governance-benchmark-curl-'))
  try {
    execFileSync('git', ['init', '-q', root])
    for (const relativePath of [
      '.gitignore',
      'infra/governance/runtime/.gitignore',
      'governance/benchmarks/README.md',
      'governance/benchmarks/fetch.sh',
    ]) {
      const destination = join(root, relativePath)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, readFileSync(join(REPO_ROOT, relativePath)))
    }
    execFileSync('git', ['-C', root, 'add', '--', '.gitignore', 'infra/governance/runtime/.gitignore', 'governance/benchmarks'])
    execFileSync('git', [
      '-C', root,
      '-c', 'user.name=Governance Harness',
      '-c', 'user.email=governance-harness@example.invalid',
      'commit', '-q', '-m', 'fixture',
    ])

    const ignored = (relativePath) => spawnSync(
      'git',
      ['-C', root, 'check-ignore', '--no-index', '--quiet', '--', relativePath],
      { encoding: 'utf8' },
    )
    for (const relativePath of [
      '.claude/benchmarks/last-fetch.txt',
      'infra/governance/runtime/benchmarks/last-fetch.txt',
    ]) {
      assert.equal(ignored(relativePath).status, 0, `runtime cache must be ignored:${relativePath}`)
    }
    for (const relativePath of [
      'governance/benchmarks/README.md',
      'governance/benchmarks/fetch.sh',
      'infra/governance/runtime/.gitignore',
    ]) {
      assert.equal(ignored(relativePath).status, 1, `canonical policy source must remain versionable:${relativePath}`)
    }

    const curlStub = join(stubRoot, 'curl')
    writeFileSync(curlStub, `#!/bin/sh
out=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then
    shift
    out="$1"
  fi
  shift
done
[ -n "$out" ] || exit 2
mkdir -p "$(dirname "$out")"
printf 'offline benchmark fixture\\n' > "$out"
`)
    chmodSync(curlStub, 0o755)
    const beforeOutsideRuntime = repositoryFiles(root)
      .filter(relativePath => !relativePath.startsWith('infra/governance/runtime/'))
    const fetched = spawnSync('/bin/bash', ['governance/benchmarks/fetch.sh'], {
      cwd: root,
      env: {
        ...process.env,
        GOVERNANCE_PROJECT_DIR: root,
        PATH: `${stubRoot}:/usr/bin:/bin`,
      },
      encoding: 'utf8',
    })
    assert.equal(fetched.status, 0, fetched.stderr || fetched.stdout)
    for (const relativePath of [
      'infra/governance/runtime/benchmarks/claude-code-features.md',
      'infra/governance/runtime/benchmarks/codex-changelog.html',
      'infra/governance/runtime/benchmarks/external-ds-snapshots/polaris-components.html',
      'infra/governance/runtime/benchmarks/external-ds-snapshots/material3-foundations.html',
      'infra/governance/runtime/benchmarks/external-ds-snapshots/atlassian-components.html',
      'infra/governance/runtime/benchmarks/last-fetch.txt',
    ]) {
      assert.equal(existsSync(join(root, relativePath)), true, `benchmark fetcher omitted runtime artifact:${relativePath}`)
    }
    assert.equal(existsSync(join(root, '.claude/benchmarks')), false, 'benchmark fetcher revived the retired provider cache')
    const afterOutsideRuntime = repositoryFiles(root)
      .filter(relativePath => !relativePath.startsWith('infra/governance/runtime/'))
    assert.deepEqual(afterOutsideRuntime, beforeOutsideRuntime, 'benchmark fetcher wrote outside the runtime boundary')
    assert.equal(
      execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }),
      '',
      'benchmark fetcher dirtied a clean clone',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(stubRoot, { recursive: true, force: true })
  }
}

console.log('✓ Git-owned governance evidence resolver rejects workspace roots, escape, poison, hardlinks, and read-only writes')
