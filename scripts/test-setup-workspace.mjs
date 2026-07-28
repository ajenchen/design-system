import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  WORKSPACE_SETUP_ASSURANCE,
  formatWorkspaceSetupResult,
  runWorkspaceSetup,
} from './setup-workspace.mjs'
import { runAuthorityAllHarnessStep } from './setup-authority-governance.mjs'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
}

function fixture(governanceCommand) {
  const root = mkdtempSync(join(tmpdir(), 'setup-all-'))
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n')
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: 'fixture',
    scripts: {
      'setup:all': 'node scripts/setup-workspace.mjs',
      'setup:governance': governanceCommand,
      ...(governanceCommand === 'node scripts/setup-authority-governance.mjs'
        ? { 'setup:hooks': 'node scripts/setup-governance-hooks.mjs' }
        : {}),
    },
  }, null, 2)}\n`)
  for (const path of ['setup-workspace.mjs', 'setup-authority-governance.mjs', 'setup-governance.mjs', 'setup-governance-hooks.mjs', 'setup-provider-cli-toolchain.mjs']) {
    writeFileSync(join(root, 'scripts', path), '# fixture\n')
  }
  git(root, ['init', '-q'])
  git(root, ['add', '.'])
  git(root, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'])
  return root
}

for (const [role, command, expected] of [
  ['authority', 'node scripts/setup-authority-governance.mjs', 'setup-authority-governance.mjs'],
  ['product', 'node scripts/setup-governance.mjs', 'setup-governance.mjs'],
]) {
  test(`setup:all closes ${role} governance then provider CLI under one command`, () => {
    const root = fixture(command)
    const calls = []
    const result = runWorkspaceSetup({
      root,
      environment: { PATH: process.env.PATH },
      runner(executable, args, options) { calls.push({ executable, args, options }) },
    })
    assert.equal(result.roleSetup, `scripts/${expected}`)
    assert.equal(result.scope, 'local-bootstrap')
    assert.equal(result.providerCertification, 'not-checked')
    assert.equal(result.externalActivationRequired, false)
    assert.deepEqual(
      {
        scope: result.scope,
        providerCertification: result.providerCertification,
        externalActivationRequired: result.externalActivationRequired,
      },
      WORKSPACE_SETUP_ASSURANCE,
    )
    const output = formatWorkspaceSetupResult(result)
    assert.match(output, /^✅ local workspace bootstrap verified:/)
    assert.match(output, /^scope=local-bootstrap$/m)
    assert.match(output, /^providerCertification=not-checked$/m)
    assert.match(output, /^externalActivationRequired=false$/m)
    assert.doesNotMatch(output, /cloud[- ]?ready|provider[- ]?certified|complete workspace setup/i)
    assert.deepEqual(
      calls.map(({ args }) => args[0].split('/').at(-1)),
      role === 'authority'
        ? ['setup-governance-hooks.mjs', expected, 'setup-provider-cli-toolchain.mjs']
        : [expected, 'setup-provider-cli-toolchain.mjs'],
    )
    for (const call of calls) {
      assert.equal(call.executable, process.execPath)
      assert.equal(call.options.shell, false)
      assert.equal(call.options.cwd.endsWith(root.split('/').at(-1)), true)
    }
  })
}

test('setup:all rejects an unregistered role setup instead of executing package data', () => {
  const root = fixture('node attacker.mjs')
  assert.throws(() => runWorkspaceSetup({ root, runner: () => assert.fail('runner must not execute') }), /unknown role-specific governance setup/)
})

test('authority All-Harness uses the registry-derived aggregate deadline instead of the old 15-minute default', async () => {
  const authoritySource = readFileSync(join(REPOSITORY_ROOT, 'scripts/setup-authority-governance.mjs'), 'utf8')
  assert.doesNotMatch(authoritySource, /^import[\s\S]*?from ['"]\.\.\/infra\/governance\/lib\/harness-registry\.mjs['"]/m)
  assert.match(authoritySource, /await import\('\.\.\/infra\/governance\/lib\/harness-registry\.mjs'\)/)
  const simulatedDurationMs = 16 * 60 * 1_000
  let observedTimeoutMs = null
  const result = await runAuthorityAllHarnessStep({
    root: REPOSITORY_ROOT,
    environment: { PATH: process.env.PATH },
    runner(command, args, options) {
      assert.equal(command, process.execPath)
      assert.deepEqual(args, ['infra/governance/bin/run-harnesses.mjs'])
      observedTimeoutMs = options.timeout
      if (simulatedDurationMs > options.timeout) return { error: new Error('simulated timeout') }
      return { status: 0 }
    },
  })
  assert.equal(result.status, 0)
  assert.ok(simulatedDurationMs > 15 * 60 * 1_000)
  assert.ok(observedTimeoutMs > simulatedDurationMs)
})
