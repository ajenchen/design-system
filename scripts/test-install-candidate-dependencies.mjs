import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { diffAuditFindings, installCandidateDependencies, parseAuditFindings } from './install-candidate-dependencies.mjs'
import { resolveExactNpmRuntimeContract } from './lib/verified-exact-npm-runtime.mjs'
import { runVerifiedNpm } from './run-verified-npm.mjs'

const exactNpm = {
  version: '11.19.0',
  resolved: 'https://registry.npmjs.org/npm/-/npm-11.19.0.tgz',
  integrity: 'sha512-SDd/hHg3KqHE5Ht2NHWxNYNtqCQ2pXAPLl6OtQhPyED5PHsRfrOtO199MZTIG2cQoQ1ZRI9t28shrD+2cr3AAw==',
}
const exactOverlay = {
  alias: 'npm-runtime-brace-expansion-patch',
  spec: 'npm:brace-expansion@5.0.12',
  package: 'brace-expansion',
  version: '5.0.12',
  resolved: 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz',
  integrity: 'sha512-ScQ4IuvIEF1TMlP7Zt+vjJ//9zlPb2SDcxWxM3bk8s6t6GGdJ7KO1dCcTidOPJKePW30LE/2cT7wCyPho9/Wxg==',
}
const exactSecondaryOverlay = {
  alias: 'npm-runtime-tar-patch',
  spec: 'npm:tar@7.5.22',
  package: 'tar',
  version: '7.5.22',
  resolved: 'https://registry.npmjs.org/tar/-/tar-7.5.22.tgz',
  integrity: 'sha512-MFO/QzvtAOmJbkhOaCTvbGcFN9L9b+JunIsDwaKljSOdcLMea3NJ1k9Usz/rjdfSXTq4dfzfeS7W4p4YOAAHeA==',
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
      [exactSecondaryOverlay.alias]: exactSecondaryOverlay.spec,
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
          [exactSecondaryOverlay.alias]: exactSecondaryOverlay.spec,
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
      [`node_modules/${exactSecondaryOverlay.alias}`]: {
        name: exactSecondaryOverlay.package,
        version: exactSecondaryOverlay.version,
        resolved: exactSecondaryOverlay.resolved,
        integrity: exactSecondaryOverlay.integrity,
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
    secondaryAlias: runtimeOverlay.secondaryAlias,
    secondaryPackage: runtimeOverlay.secondaryPackage,
    secondaryVersion: runtimeOverlay.secondaryVersion,
    secondaryIntegrity: runtimeOverlay.secondaryIntegrity,
    secondaryTarget: runtimeOverlay.secondaryTarget,
    secondaryTreeDigest: 'c'.repeat(64),
    treeDigest: runtimeOverlay.treeDigest,
    auditClosureDigest: 'b'.repeat(64),
    auditClosure: Object.freeze([
      Object.freeze({ path: 'node_modules/npm/node_modules/brace-expansion', name: 'brace-expansion', version: '5.0.12', dependency: null }),
      Object.freeze({ path: 'node_modules/npm/node_modules/minimatch', name: 'minimatch', version: '10.2.5', dependency: Object.freeze({ name: 'brace-expansion', range: '^5.0.5' }) }),
      Object.freeze({ path: 'node_modules/npm/node_modules/tar', name: 'tar', version: '7.5.22', dependency: null }),
      Object.freeze({ path: 'node_modules/npm-runtime-brace-expansion-patch', name: 'brace-expansion', version: '5.0.12', dependency: null }),
      Object.freeze({ path: 'node_modules/npm-runtime-tar-patch', name: 'tar', version: '7.5.22', dependency: null }),
    ]),
  })
  const auditReport = JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {
      'brace-expansion': {
        name: 'brace-expansion',
        severity: 'high',
        isDirect: false,
        range: '4.0.0 - 5.0.11',
        nodes: ['node_modules/npm/node_modules/brace-expansion'],
        effects: [],
        via: [{
          source: 1130591,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
          severity: 'high',
          range: '>=4.0.0 <5.0.8',
        }, {
          source: 1130734,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895',
          severity: 'high',
          range: '>=4.0.0 <5.0.9',
        }, {
          source: 1240103,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr',
          severity: 'moderate',
          range: '>=4.0.0 <5.0.12',
        }, {
          source: 1240107,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-qhr7-859c-m2p7',
          severity: 'high',
          range: '>=4.0.0 <5.0.11',
        }, {
          source: 1240111,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-6j4f-fj2g-mc7p',
          severity: 'high',
          range: '>=4.0.0 <5.0.10',
        }],
      },
      npm: {
        name: 'npm',
        severity: 'high',
        isDirect: true,
        via: ['tar'],
        nodes: ['node_modules/npm'],
        effects: [],
        range: '<=10.9.8 || 11.0.0-pre.0 - 11.19.0 || >=12.0.0-pre.0.0',
      },
      tar: {
        name: 'tar',
        severity: 'high',
        isDirect: false,
        range: '<=7.5.20',
        nodes: ['node_modules/npm/node_modules/tar'],
        effects: ['npm'],
        via: [{
          source: 1145647,
          name: 'tar',
          dependency: 'tar',
          url: 'https://github.com/advisories/GHSA-r292-9mhp-454m',
          severity: 'high',
          range: '<=7.5.20',
        }],
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
  assert.equal(result.npm, '11.19.0')
  assert.equal(result.securityOverlay, installedOverlay)
  assert.equal(result.vulnerabilityAudit.status, 'passed')
  // 2026-09-29(OE6):候選與 base 跑同一份報告 → 三筆全是「繼承自 main」,零新增;receipt 記兩邊的原始稽核摘要
  assert.equal(result.vulnerabilityAudit.kind, 'candidate-differential-vulnerability-audit-receipt')
  assert.deepEqual(result.vulnerabilityAudit.introduced, [])
  assert.deepEqual(result.vulnerabilityAudit.inherited.map((item) => item.name), ['brace-expansion', 'npm', 'tar'])
  assert.deepEqual(result.vulnerabilityAudit.resolved, [])
  assert.equal(result.vulnerabilityAudit.base.findings, 3)
  assert.equal(result.vulnerabilityAudit.candidate.findings, 3)
  assert.equal(cleaned, 1)
  assert.deepEqual(events, [
    'ci --legacy-peer-deps --ignore-scripts --registry=https://registry.npmjs.org/',
    'apply-overlay',
    'verify-overlay',
    'audit signatures --registry=https://registry.npmjs.org/',
    'audit --audit-level=high --json --registry=https://registry.npmjs.org/',
    'audit --audit-level=high --json --registry=https://registry.npmjs.org/',
  ])
  assert.deepEqual(calls.map(({ args }) => args.slice(1)), [
    ['ci', '--legacy-peer-deps', '--ignore-scripts', '--registry=https://registry.npmjs.org/'],
    ['audit', 'signatures', '--registry=https://registry.npmjs.org/'],
    ['audit', '--audit-level=high', '--json', '--registry=https://registry.npmjs.org/'],
    ['audit', '--audit-level=high', '--json', '--registry=https://registry.npmjs.org/'],
  ])
  // 差集的兩趟稽核:先 base(trusted)、再候選;兩邊都是 pipe 回來的 JSON,不是 inherit
  assert.equal(calls.at(-2).options.cwd, realpathSync(trusted))
  assert.equal(calls.at(-1).options.cwd, realpathSync(candidate))
  assert.deepEqual(calls.at(-2).options.stdio, ['ignore', 'pipe', 'pipe'])
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
    /verified npm 11\.19\.0 capability with the exact security overlay is required/,
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
        range: '4.0.0 - 5.0.11',
        nodes: ['node_modules/npm/node_modules/brace-expansion'],
        effects: [],
        via: [{
          source: 1130591,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg',
          severity: 'high',
          range: '>=4.0.0 <5.0.8',
        }, {
          source: 1130734,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895',
          severity: 'high',
          range: '>=4.0.0 <5.0.9',
        }, {
          source: 1240103,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr',
          severity: 'moderate',
          range: '>=4.0.0 <5.0.12',
        }, {
          source: 1240107,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-qhr7-859c-m2p7',
          severity: 'high',
          range: '>=4.0.0 <5.0.11',
        }, {
          source: 1240111,
          name: 'brace-expansion',
          dependency: 'brace-expansion',
          url: 'https://github.com/advisories/GHSA-6j4f-fj2g-mc7p',
          severity: 'high',
          range: '>=4.0.0 <5.0.10',
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

// ── 差集式弱點稽核(2026-09-29,待辦總帳 OE6)的兩面對照 ─────────────────────────────────────
// 用已知的真實 advisory 當夾具(lodash GHSA-35jh-r3h4-6jhm / minimist GHSA-xvch-5gv4-984h);
// 「候選多一筆 → 必紅並點名」是這條規則存在的理由,「兩邊一樣 → 綠」「base 多一筆 → 綠(修掉了)」是它不該誤傷的兩面,
// 「任一邊報告壞掉 → 紅」是 M37:壞掉的 base 不得讀成「base 沒有弱點」(否則候選每一筆都變新增),也不得略過。
const advisoryReport = (findings) => JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: Object.fromEntries(findings.map(([name, severity, range, via]) => [name, {
    name, severity, isDirect: false, range, nodes: [`node_modules/${name}`], effects: [],
    via: via.map(([source, url, viaRange]) => ({ source, name, dependency: name, url, severity, range: viaRange })),
  }])),
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: findings.length, critical: 0, total: findings.length } },
})
const LODASH = ['lodash', 'high', '<4.17.21', [[1096305, 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm', '<4.17.21']]]
const MINIMIST = ['minimist', 'critical', '<1.2.6', [[1096466, 'https://github.com/advisories/GHSA-xvch-5gv4-984h', '<1.2.6']]]

function differentialFixture({ baseReport, candidateReport }) {
  const { workspace, trusted, candidate } = fixture()
  const trustedReal = realpathSync(trusted)
  const candidateReal = realpathSync(candidate)
  const audits = []
  const run = () => installCandidateDependencies({
    trustedRoot: trusted,
    workspaceRoot: workspace,
    candidatePath: 'candidate',
    environment: { PATH: process.env.PATH, GITHUB_WORKSPACE: workspace },
    runtimeFactory: async () => verifiedRuntime(trusted),
    runner(command, args, options) {
      const npmArgs = args.slice(1)
      if (npmArgs[0] !== 'audit' || npmArgs[1] !== '--audit-level=high') return { status: 0 }
      const side = options.cwd === trustedReal ? 'base' : options.cwd === candidateReal ? 'candidate' : 'unknown'
      audits.push(side)
      const stdout = side === 'base' ? baseReport : candidateReport
      return { status: stdout && stdout.includes('"high"') ? 1 : 0, stdout, stderr: '' }
    },
  })
  return { run, audits }
}

test('differential audit blocks a candidate that introduces an advisory protected main does not have, naming it', async () => {
  const { run, audits } = differentialFixture({ baseReport: advisoryReport([]), candidateReport: advisoryReport([LODASH]) })
  await assert.rejects(run(), (error) => {
    assert.match(error.message, /GOV-CANDIDATE-DEPS-002:candidate introduces 1 vulnerability finding/)
    assert.match(error.message, /lodash high <4\.17\.21\(package-not-vulnerable-in-base\)← https:\/\/github\.com\/advisories\/GHSA-35jh-r3h4-6jhm/)
    return true
  })
  assert.deepEqual(audits, ['base', 'candidate'])
})

test('differential audit blocks a new advisory on a package protected main already has a different advisory for', async () => {
  const lodashOld = ['lodash', 'high', '<4.17.19', [[1000001, 'https://github.com/advisories/GHSA-p6mc-m468-83gw', '<4.17.19']]]
  const lodashBoth = ['lodash', 'high', '<4.17.21', [[1000001, 'https://github.com/advisories/GHSA-p6mc-m468-83gw', '<4.17.19'], [1096305, 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm', '<4.17.21']]]
  const { run } = differentialFixture({ baseReport: advisoryReport([lodashOld]), candidateReport: advisoryReport([lodashBoth]) })
  await assert.rejects(run(), /lodash high <4\.17\.21\(new-advisory\)← https:\/\/github\.com\/advisories\/GHSA-35jh-r3h4-6jhm$/m)
})

test('differential audit passes when protected main has the same findings, and when the candidate fixed one', async () => {
  const same = await differentialFixture({ baseReport: advisoryReport([LODASH, MINIMIST]), candidateReport: advisoryReport([LODASH, MINIMIST]) }).run()
  assert.equal(same.vulnerabilityAudit.status, 'passed')
  assert.deepEqual(same.vulnerabilityAudit.inherited.map((item) => item.name), ['lodash', 'minimist'])
  assert.deepEqual(same.vulnerabilityAudit.introduced, [])
  const fixed = await differentialFixture({ baseReport: advisoryReport([LODASH, MINIMIST]), candidateReport: advisoryReport([LODASH]) }).run()
  assert.deepEqual(fixed.vulnerabilityAudit.resolved, ['minimist'])
  assert.deepEqual(fixed.vulnerabilityAudit.inherited.map((item) => item.name), ['lodash'])
})

test('differential audit fails closed when either side is not a valid audit report (a broken base is not an empty base)', async () => {
  await assert.rejects(
    differentialFixture({ baseReport: 'not json at all', candidateReport: advisoryReport([]) }).run(),
    /GOV-CANDIDATE-DEPS-002:protected-base npm audit did not produce JSON/,
  )
  await assert.rejects(
    differentialFixture({ baseReport: JSON.stringify({ message: '503 Service Unavailable - POST /security/advisories/bulk' }), candidateReport: advisoryReport([]) }).run(),
    /GOV-CANDIDATE-DEPS-002:protected-base npm audit advisory endpoint failed:503/,
  )
  await assert.rejects(
    differentialFixture({ baseReport: advisoryReport([]), candidateReport: JSON.stringify({ auditReportVersion: 1 }) }).run(),
    /GOV-CANDIDATE-DEPS-002:candidate npm audit JSON schema is unsupported/,
  )
})

test('pure diff: identical sets inherit, extra candidate advisory is introduced, extra base finding is resolved', () => {
  const base = parseAuditFindings(advisoryReport([LODASH, MINIMIST]), 'base')
  const head = parseAuditFindings(advisoryReport([LODASH, ['minimist', 'critical', '<1.2.6', [[1096466, 'https://github.com/advisories/GHSA-xvch-5gv4-984h', '<1.2.6'], [1, 'https://github.com/advisories/GHSA-fake-new-one', '<1.2.6']]]]), 'candidate')
  const diff = diffAuditFindings(base, head)
  assert.deepEqual(diff.inherited.map((item) => item.name), ['lodash'])
  assert.deepEqual(diff.introduced.map((item) => [item.name, item.reason, item.advisories]), [['minimist', 'new-advisory', ['https://github.com/advisories/GHSA-fake-new-one']]])
  assert.deepEqual(diffAuditFindings(head, base).resolved, [])
  assert.deepEqual(diffAuditFindings(base, parseAuditFindings(advisoryReport([]), 'candidate')).resolved, ['lodash', 'minimist'])
})
