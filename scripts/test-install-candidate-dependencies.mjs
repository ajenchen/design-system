import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installCandidateDependencies } from './install-candidate-dependencies.mjs'
import { resolveExactNpmRuntimeContract } from './lib/verified-exact-npm-runtime.mjs'
import { runVerifiedNpm } from './run-verified-npm.mjs'

const exactNpm = {
  version: '11.18.0',
  resolved: 'https://registry.npmjs.org/npm/-/npm-11.18.0.tgz',
  integrity: 'sha512-T67M4L5wNm0cZ7EBLErcEkY1SmzEW/WJ+SADBzsFUY1UdAPfFHXFQtZ6SEXiK0+vzXysCvAsepbMaBTwnrAD+w==',
}
const exactOverlay = {
  alias: 'npm-runtime-brace-expansion-patch',
  spec: 'npm:brace-expansion@5.0.8',
  package: 'brace-expansion',
  version: '5.0.8',
  resolved: 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.8.tgz',
  integrity: 'sha512-JZyDyq3D4AUifKTPOB7DELf6XsB3WdPuNxCtob1vFXPsSXhdAiHBWJ/tJ8HAc9aH84BK+5JFZLNkJKx3G9kzQg==',
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
}

function repository(path) {
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, '.gitignore'), 'node_modules/\n')
  writeFileSync(join(path, '.npmrc'), 'legacy-peer-deps=true\nignore-scripts=true\n')
  writeFileSync(join(path, 'package.json'), `${JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    devDependencies: {
      npm: exactNpm.version,
      [exactOverlay.alias]: exactOverlay.spec,
    },
  })}\n`)
  writeFileSync(join(path, 'package-lock.json'), `${JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'fixture',
        version: '1.0.0',
        devDependencies: {
          npm: exactNpm.version,
          [exactOverlay.alias]: exactOverlay.spec,
        },
      },
      'node_modules/npm': {
        ...exactNpm,
        dev: true,
        bin: { npm: 'bin/npm-cli.js' },
      },
      [`node_modules/${exactOverlay.alias}`]: {
        name: exactOverlay.package,
        version: exactOverlay.version,
        resolved: exactOverlay.resolved,
        integrity: exactOverlay.integrity,
        dev: true,
      },
    },
  })}\n`)
  git(path, ['init', '-q'])
  git(path, ['add', '.'])
  git(path, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'])
}

function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'candidate-deps-'))
  const trusted = join(workspace, 'trusted')
  const candidate = join(workspace, 'candidate')
  repository(trusted)
  repository(candidate)
  return { workspace, trusted, candidate }
}

function verifiedRuntime(root, {
  cleanup = () => {},
  applyInstalledSecurityOverlay,
  verifyInstalledSecurityOverlay,
} = {}) {
  const artifact = resolveExactNpmRuntimeContract(root)
  const securityOverlay = Object.freeze({
    schemaVersion: 1,
    kind: 'verified-npm-runtime-security-overlay-receipt',
    status: 'applied',
    ...artifact.securityOverlay,
    treeDigest: 'a'.repeat(64),
  })
  const installedOverlay = Object.freeze({
    schemaVersion: 1,
    kind: 'verified-installed-npm-security-overlay-receipt',
    status: 'verified',
    identityDigest: securityOverlay.identityDigest,
    treeDigest: securityOverlay.treeDigest,
    auditClosureDigest: 'b'.repeat(64),
    auditClosure: Object.freeze([]),
  })
  return {
    artifact,
    cli: join(root, 'verified-npm.cjs'),
    securityOverlay,
    toolchain: { npm: exactNpm.version },
    applyInstalledSecurityOverlay: applyInstalledSecurityOverlay || (() => installedOverlay),
    verifyInstalledSecurityOverlay: verifyInstalledSecurityOverlay || (() => installedOverlay),
    cleanup,
  }
}

test('candidate dependency install applies and verifies the exact runtime overlay before overlay-aware audit', async () => {
  const { workspace, trusted, candidate } = fixture()
  const calls = []
  const events = []
  let cleaned = 0
  const contract = resolveExactNpmRuntimeContract(trusted)
  const runtimeOverlay = Object.freeze({
    schemaVersion: 1,
    kind: 'verified-npm-runtime-security-overlay-receipt',
    status: 'applied',
    ...contract.securityOverlay,
    treeDigest: 'a'.repeat(64),
  })
  const installedOverlay = Object.freeze({
    schemaVersion: 1,
    kind: 'verified-installed-npm-security-overlay-receipt',
    status: 'verified',
    identityDigest: runtimeOverlay.identityDigest,
    npmVersion: runtimeOverlay.npmVersion,
    package: runtimeOverlay.package,
    version: runtimeOverlay.version,
    integrity: runtimeOverlay.integrity,
    target: runtimeOverlay.target,
    treeDigest: runtimeOverlay.treeDigest,
    auditClosureDigest: 'b'.repeat(64),
    auditClosure: Object.freeze([
      Object.freeze({ path: 'node_modules/brace-expansion', name: 'brace-expansion', version: '5.0.8', dependency: null }),
      Object.freeze({ path: 'node_modules/minimatch', name: 'minimatch', version: '10.2.5', dependency: Object.freeze({ name: 'brace-expansion', range: '^5.0.5' }) }),
      Object.freeze({ path: 'node_modules/npm-runtime-brace-expansion-patch', name: 'brace-expansion', version: '5.0.8', dependency: null }),
      Object.freeze({ path: 'node_modules/eslint', name: 'eslint', version: '10.8.0', dependency: Object.freeze({ name: 'minimatch', range: '^10.2.5' }) }),
    ]),
  })
  const auditReport = JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      'brace-expansion': {
        name: 'brace-expansion',
        severity: 'high',
        isDirect: false,
        range: '<=5.0.7',
        nodes: ['node_modules/npm/node_modules/brace-expansion'],
        effects: ['minimatch'],
        via: [{
          source: 1124334,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
          severity: 'high',
          range: '<=5.0.7',
        }],
      },
      minimatch: {
        name: 'minimatch',
        severity: 'high',
        isDirect: false,
        via: ['brace-expansion'],
        nodes: ['node_modules/minimatch'],
        effects: ['eslint'],
      },
      eslint: {
        name: 'eslint',
        severity: 'high',
        isDirect: true,
        via: ['minimatch'],
        nodes: ['node_modules/eslint'],
        effects: [],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 3, critical: 0, total: 3 },
    },
  })
  const result = await installCandidateDependencies({
    trustedRoot: trusted,
    workspaceRoot: workspace,
    candidatePath: 'candidate',
    environment: { PATH: process.env.PATH, GITHUB_WORKSPACE: workspace },
    runtimeFactory: async ({ repositoryRoot }) => {
      assert.equal(repositoryRoot, realpathSync(trusted))
      return {
        artifact: contract,
        cli: join(trusted, 'verified-npm.cjs'),
        securityOverlay: runtimeOverlay,
        toolchain: { npm: exactNpm.version },
        applyInstalledSecurityOverlay(repositoryRoot) {
          assert.equal(repositoryRoot, realpathSync(candidate))
          events.push('apply-overlay')
          return installedOverlay
        },
        verifyInstalledSecurityOverlay(repositoryRoot) {
          assert.equal(repositoryRoot, realpathSync(candidate))
          events.push('verify-overlay')
          return installedOverlay
        },
        cleanup: () => { cleaned += 1 },
      }
    },
    runner(command, args, options) {
      calls.push({ command, args, options })
      const npmArgs = args.slice(1)
      events.push(npmArgs.join(' '))
      return npmArgs[0] === 'audit' && npmArgs[1] === '--audit-level=high'
        ? { status: 1, stdout: auditReport, stderr: '' }
        : { status: 0 }
    },
  })
  assert.equal(result.npm, '11.18.0')
  assert.equal(result.securityOverlay, installedOverlay)
  assert.equal(result.vulnerabilityAudit.status, 'passed')
  assert.deepEqual(result.vulnerabilityAudit.remediatedFindings, ['brace-expansion', 'eslint', 'minimatch'])
  assert.equal(cleaned, 1)
  assert.deepEqual(events, [
    'ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
    'apply-overlay',
    'verify-overlay',
    'audit signatures --registry=https://registry.npmjs.org/',
    'audit --audit-level=high --json --registry=https://registry.npmjs.org/',
  ])
  assert.deepEqual(calls.map(({ args }) => args.slice(1)), [
    ['ci', '--legacy-peer-deps', '--ignore-scripts', '--registry=https://registry.npmjs.org/'],
    ['audit', 'signatures', '--registry=https://registry.npmjs.org/'],
    ['audit', '--audit-level=high', '--json', '--registry=https://registry.npmjs.org/'],
  ])
  for (const call of calls) {
    assert.equal(call.command, process.execPath)
    assert.equal(call.options.shell, false)
    assert.equal(call.options.env.NPM_CONFIG_IGNORE_SCRIPTS, 'true')
    assert.equal(call.options.env.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org/')
    assert.notEqual(call.options.env.NPM_CONFIG_USERCONFIG, undefined)
    assert.notEqual(call.options.env.NPM_CONFIG_GLOBALCONFIG, undefined)
  }
  assert.deepEqual(calls.at(-1).options.stdio, ['ignore', 'pipe', 'pipe'])
  assert.equal(calls.at(-1).options.encoding, 'utf8')
})

test('candidate dependency install rejects workspace escape and symlink substitution', async () => {
  const { workspace, trusted, candidate } = fixture()
  await assert.rejects(
    installCandidateDependencies({ trustedRoot: trusted, workspaceRoot: workspace, candidatePath: '../escape' }),
    /candidate escapes|ENOENT/,
  )
  symlinkSync(candidate, join(workspace, 'candidate-link'))
  await assert.rejects(
    installCandidateDependencies({ trustedRoot: trusted, workspaceRoot: workspace, candidatePath: 'candidate-link' }),
    /candidate must be a real directory/,
  )
})

test('candidate dependency install rejects a root shrinkwrap before acquiring or executing npm', async () => {
  const { workspace, trusted, candidate } = fixture()
  writeFileSync(join(candidate, 'npm-shrinkwrap.json'), '{"lockfileVersion":3,"packages":{}}\n')
  let runtimeFactoryCalled = false
  let runnerCalled = false
  await assert.rejects(
    installCandidateDependencies({
      trustedRoot: trusted,
      workspaceRoot: workspace,
      candidatePath: 'candidate',
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return null
      },
      runner: () => {
        runnerCalled = true
        return { status: 0 }
      },
    }),
    /npm-shrinkwrap\.json is forbidden/,
  )
  assert.equal(runtimeFactoryCalled, false)
  assert.equal(runnerCalled, false)
})

test('candidate dependency install rejects project npm config injection before acquiring npm', async () => {
  const { workspace, trusted, candidate } = fixture()
  writeFileSync(join(candidate, '.npmrc'), 'legacy-peer-deps=true\nignore-scripts=true\ncache=./candidate-controlled-cache\n')
  let runtimeFactoryCalled = false
  await assert.rejects(
    installCandidateDependencies({
      trustedRoot: trusted,
      workspaceRoot: workspace,
      candidatePath: 'candidate',
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return null
      },
    }),
    /\.npmrc must contain only the canonical settings/,
  )
  assert.equal(runtimeFactoryCalled, false)
})

test('candidate dependency install rejects a runtime without the exact security overlay and always cleans it', async () => {
  const { workspace, trusted } = fixture()
  let cleaned = 0
  await assert.rejects(
    installCandidateDependencies({
      trustedRoot: trusted,
      workspaceRoot: workspace,
      candidatePath: 'candidate',
      runtimeFactory: async () => ({
        artifact: { ...exactNpm, integrity: 'sha512-AAAAAAAA' },
        cli: '/tmp/npm.cjs',
        toolchain: { npm: exactNpm.version },
        cleanup: () => { cleaned += 1 },
      }),
      runner: () => ({ status: 0 }),
    }),
    /verified npm 11\.18\.0 capability with the exact security overlay is required/,
  )
  assert.equal(cleaned, 1)
})

test('verified npm prefix operations reject a target shrinkwrap before runtime acquisition', async () => {
  const { workspace, trusted, candidate } = fixture()
  writeFileSync(join(candidate, 'npm-shrinkwrap.json'), '{"lockfileVersion":3,"packages":{}}\n')
  let runtimeFactoryCalled = false
  let runnerCalled = false
  await assert.rejects(
    runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
      args: [
        'ci',
        '--prefix',
        candidate,
        '--ignore-scripts',
        '--legacy-peer-deps',
      ],
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return null
      },
      runner: () => {
        runnerCalled = true
        return { status: 0 }
      },
    }),
    /npm-shrinkwrap\.json is forbidden/,
  )
  assert.equal(runtimeFactoryCalled, false)
  assert.equal(runnerCalled, false)
})

test('verified npm rejects a prefix symlink escape before runtime acquisition', async () => {
  const { workspace, trusted } = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'verified-npm-outside-'))
  mkdirSync(join(outside, 'candidate'))
  symlinkSync(outside, join(workspace, 'escape'))
  let runtimeFactoryCalled = false
  let runnerCalled = false
  try {
    await assert.rejects(
      runVerifiedNpm({
        root: trusted,
        environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
        args: [
          'ci',
          '--prefix',
          join(workspace, 'escape', 'candidate'),
          '--ignore-scripts',
          '--legacy-peer-deps',
        ],
        runtimeFactory: async () => {
          runtimeFactoryCalled = true
          return null
        },
        runner: () => {
          runnerCalled = true
          return { status: 0 }
        },
      }),
      /prefix contains a symlink or escapes RUNNER_TEMP/,
    )
    assert.equal(runtimeFactoryCalled, false)
    assert.equal(runnerCalled, false)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('verified npm rejects RUNNER_TEMP itself as a prefix before runtime acquisition', async () => {
  const { workspace, trusted } = fixture()
  let runtimeFactoryCalled = false
  await assert.rejects(
    runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
      args: ['audit', '--prefix', workspace, '--audit-level=high'],
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return null
      },
    }),
    /prefix must be a strict RUNNER_TEMP descendant/,
  )
  assert.equal(runtimeFactoryCalled, false)
})

test('verified npm canonicalizes an allowed RUNNER_TEMP alias but rejects aliases below it', async () => {
  const { workspace, trusted, candidate } = fixture()
  const aliasParent = mkdtempSync(join(tmpdir(), 'verified-npm-alias-'))
  const runnerAlias = join(aliasParent, 'runner')
  symlinkSync(workspace, runnerAlias)
  const calls = []
  let cleaned = 0
  try {
    const result = await runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: runnerAlias },
      args: [
        'ci',
        '--prefix',
        join(runnerAlias, 'candidate'),
        '--ignore-scripts',
        '--legacy-peer-deps',
      ],
      runtimeFactory: async () => verifiedRuntime(trusted, {
        cleanup: () => { cleaned += 1 },
      }),
      runner(command, args, options) {
        calls.push({ command, args, options })
        return { status: 0 }
      },
    })
    assert.equal(result.status, 'passed')
    assert.equal(cleaned, 1)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].args[calls[0].args.indexOf('--prefix') + 1], realpathSync(candidate))
  } finally {
    rmSync(aliasParent, { recursive: true, force: true })
  }
})

test('verified npm ci and full install apply then independently verify the installed security overlay', async () => {
  const { workspace, trusted, candidate } = fixture()
  for (const command of ['ci', 'install']) {
    const events = []
    const result = await runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
      args: [
        command,
        '--prefix',
        candidate,
        '--ignore-scripts',
        '--legacy-peer-deps',
      ],
      runtimeFactory: async () => {
        const runtime = verifiedRuntime(trusted)
        return {
          ...runtime,
          applyInstalledSecurityOverlay(repositoryRoot) {
            assert.equal(repositoryRoot, realpathSync(candidate))
            events.push('apply-overlay')
            return runtime.applyInstalledSecurityOverlay(repositoryRoot)
          },
          verifyInstalledSecurityOverlay(repositoryRoot) {
            assert.equal(repositoryRoot, realpathSync(candidate))
            events.push('verify-overlay')
            return runtime.verifyInstalledSecurityOverlay(repositoryRoot)
          },
        }
      },
      runner(_executable, args) {
        events.push(args[1])
        return { status: 0 }
      },
    })
    assert.equal(result.status, 'passed')
    assert.equal(result.securityOverlay.status, 'verified')
    assert.deepEqual(events, [command, 'apply-overlay', 'verify-overlay'])
  }
})

test('verified npm package-lock-only install requires the exact runtime overlay without touching an absent installed tree', async () => {
  const { workspace, trusted, candidate } = fixture()
  let npmCalls = 0
  const result = await runVerifiedNpm({
    root: trusted,
    environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
    args: [
      'install',
      '--prefix',
      candidate,
      '--package-lock-only',
      '--ignore-scripts',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
    ],
    runtimeFactory: async () => verifiedRuntime(trusted, {
      applyInstalledSecurityOverlay: () => assert.fail('package-lock-only install must not apply an installed-tree overlay'),
      verifyInstalledSecurityOverlay: () => assert.fail('package-lock-only install must not verify an absent installed-tree overlay'),
    }),
    runner() {
      npmCalls += 1
      return { status: 0 }
    },
  })
  assert.equal(result.status, 'passed')
  assert.equal(result.securityOverlay, undefined)
  assert.equal(npmCalls, 1)
})

test('verified npm package-lock-only install rejects generated security-overlay lock drift', async () => {
  const { workspace, trusted, candidate } = fixture()
  await assert.rejects(
    runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
      args: [
        'install',
        '--prefix',
        candidate,
        '--package-lock-only',
        '--ignore-scripts',
        '--legacy-peer-deps',
        '--no-audit',
        '--no-fund',
      ],
      runtimeFactory: async () => verifiedRuntime(trusted),
      runner() {
        const lockPath = join(candidate, 'package-lock.json')
        const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
        lock.packages[`node_modules/${exactOverlay.alias}`].integrity = 'sha512-AAAA'
        writeFileSync(lockPath, `${JSON.stringify(lock)}\n`)
        return { status: 0 }
      },
    }),
    /security overlay|SHA-512/,
  )
})

test('verified npm rejects the install-only package-lock contract on ci before runtime acquisition', async () => {
  const { workspace, trusted, candidate } = fixture()
  let runtimeFactoryCalled = false
  await assert.rejects(
    runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
      args: [
        'ci',
        '--prefix',
        candidate,
        '--package-lock-only',
        '--ignore-scripts',
      ],
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return verifiedRuntime(trusted)
      },
    }),
    /install-only package-lock contract/,
  )
  assert.equal(runtimeFactoryCalled, false)
})

test('verified npm high audit verifies the installed overlay and uses the exact overlay-aware evaluator argv', async () => {
  const { workspace, trusted, candidate } = fixture()
  const events = []
  const calls = []
  const auditReport = JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      'brace-expansion': {
        name: 'brace-expansion',
        severity: 'high',
        isDirect: false,
        range: '<=5.0.7',
        nodes: ['node_modules/npm/node_modules/brace-expansion'],
        effects: [],
        via: [{
          source: 1124334,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
          severity: 'high',
          range: '<=5.0.7',
        }],
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
    },
  })
  const result = await runVerifiedNpm({
    root: trusted,
    environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
    args: ['audit', '--prefix', candidate, '--audit-level=high'],
    runtimeFactory: async () => {
      const runtime = verifiedRuntime(trusted)
      return {
        ...runtime,
        verifyInstalledSecurityOverlay(repositoryRoot) {
          assert.equal(repositoryRoot, realpathSync(candidate))
          events.push('verify-overlay')
          return runtime.verifyInstalledSecurityOverlay(repositoryRoot)
        },
      }
    },
    runner(command, args, options) {
      events.push('high-audit')
      calls.push({ command, args, options })
      return { status: 1, stdout: auditReport, stderr: '' }
    },
  })
  assert.deepEqual(events, ['verify-overlay', 'high-audit'])
  assert.equal(result.status, 'passed')
  assert.equal(result.securityOverlay.status, 'verified')
  assert.equal(result.vulnerabilityAudit.status, 'passed')
  assert.deepEqual(result.vulnerabilityAudit.remediatedFindings, ['brace-expansion'])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, process.execPath)
  assert.deepEqual(calls[0].args.slice(1), [
    'audit',
    '--audit-level=high',
    '--json',
    '--registry=https://registry.npmjs.org/',
  ])
  assert.equal(calls[0].options.cwd, realpathSync(candidate))
  assert.equal(calls[0].options.encoding, 'utf8')
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe'])
})

test('verified npm rejects a runtime without the exact security overlay and still cleans it', async () => {
  const { trusted } = fixture()
  mkdirSync(join(trusted, 'packages', 'design-system'), { recursive: true })
  mkdirSync(join(trusted, 'release-artifacts'))
  let cleaned = 0
  let runnerCalled = false
  await assert.rejects(
    runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH },
      args: [
        'pack',
        './packages/design-system',
        '--pack-destination',
        'release-artifacts',
        '--json',
        '--ignore-scripts',
      ],
      runtimeFactory: async () => ({
        artifact: exactNpm,
        cli: join(trusted, 'verified-npm.cjs'),
        toolchain: { npm: exactNpm.version },
        cleanup: () => { cleaned += 1 },
      }),
      runner: () => {
        runnerCalled = true
        return { status: 0 }
      },
    }),
    /runtime capability differs|security overlay is missing/,
  )
  assert.equal(cleaned, 1)
  assert.equal(runnerCalled, false)
})

test('verified npm pack rejects a missing or symlinked release destination before runtime acquisition', async () => {
  const { trusted } = fixture()
  mkdirSync(join(trusted, 'packages', 'design-system'), { recursive: true })
  const outside = mkdtempSync(join(tmpdir(), 'verified-npm-pack-outside-'))
  const args = [
    'pack',
    './packages/design-system',
    '--pack-destination',
    'release-artifacts',
    '--json',
    '--ignore-scripts',
  ]
  let runtimeFactoryCalled = false
  const options = {
    root: trusted,
    environment: { PATH: process.env.PATH },
    args,
    runtimeFactory: async () => {
      runtimeFactoryCalled = true
      return null
    },
  }
  try {
    await assert.rejects(runVerifiedNpm(options), /npm pack destination must exist as a real directory/)
    assert.equal(runtimeFactoryCalled, false)

    symlinkSync(outside, join(trusted, 'release-artifacts'))
    await assert.rejects(runVerifiedNpm(options), /npm pack destination must be a real non-symlink directory/)
    assert.equal(runtimeFactoryCalled, false)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('verified npm pack rejects symlinked sources and destination entries before runtime acquisition', async () => {
  const { trusted } = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'verified-npm-pack-entry-outside-'))
  mkdirSync(join(trusted, 'packages'), { recursive: true })
  mkdirSync(join(trusted, 'release-artifacts'))
  mkdirSync(join(outside, 'design-system'))
  writeFileSync(join(outside, 'archive.tgz'), 'outside\n')
  symlinkSync(join(outside, 'design-system'), join(trusted, 'packages', 'design-system'))
  const args = [
    'pack',
    './packages/design-system',
    '--pack-destination',
    'release-artifacts',
    '--json',
    '--ignore-scripts',
  ]
  let runtimeFactoryCalled = false
  const options = {
    root: trusted,
    environment: { PATH: process.env.PATH },
    args,
    runtimeFactory: async () => {
      runtimeFactoryCalled = true
      return null
    },
  }
  try {
    await assert.rejects(runVerifiedNpm(options), /npm pack source must be a real non-symlink directory/)
    assert.equal(runtimeFactoryCalled, false)

    rmSync(join(trusted, 'packages', 'design-system'))
    mkdirSync(join(trusted, 'packages', 'design-system'))
    symlinkSync(join(outside, 'archive.tgz'), join(trusted, 'release-artifacts', 'archive.tgz'))
    await assert.rejects(runVerifiedNpm(options), /npm pack destination contains an unsafe entry:archive\.tgz/)
    assert.equal(runtimeFactoryCalled, false)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('verified npm pack accepts only the canonical real release destination', async () => {
  const { trusted } = fixture()
  mkdirSync(join(trusted, 'packages', 'design-system'), { recursive: true })
  mkdirSync(join(trusted, 'release-artifacts'))
  const calls = []
  let cleaned = 0
  const result = await runVerifiedNpm({
    root: trusted,
    environment: { PATH: process.env.PATH },
    args: [
      'pack',
      './packages/design-system',
      '--pack-destination',
      'release-artifacts',
      '--json',
      '--ignore-scripts',
    ],
    runtimeFactory: async () => verifiedRuntime(trusted, {
      cleanup: () => { cleaned += 1 },
    }),
    runner(command, args, options) {
      calls.push({ command, args, options })
      return { status: 0 }
    },
  })
  assert.equal(result.status, 'passed')
  assert.equal(cleaned, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.cwd, realpathSync(trusted))
  assert.deepEqual(calls[0].args.slice(1), [
    'pack',
    './packages/design-system',
    '--pack-destination',
    'release-artifacts',
    '--json',
    '--ignore-scripts',
  ])
})
