import assert from 'node:assert/strict'
import { basename, delimiter, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveClosedPrivateRuntimeBase } from '../../../scripts/lib/closed-tool-execution.mjs'
import { resolveExactNpmRuntimeContract } from '../../../scripts/lib/verified-exact-npm-runtime.mjs'
import {
  AUTHORITY_DEPENDENCY_SETUP_COMMAND,
  AUTHORITY_MINIMUM_NODE_VERSION,
  runAuthorityDependencySetup,
  runAuthorityGovernanceSetup,
} from '../../../scripts/setup-authority-governance.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PREREQUISITE_EXECUTABLES = Object.freeze(['bash', 'git', 'jq', 'python3'])

function assertClosedPrerequisiteCalls(calls, platform) {
  assert.equal(calls.length, PREREQUISITE_EXECUTABLES.length)
  const toolRoot = dirname(calls[0].command)
  const temporaryRelative = relative(resolveClosedPrivateRuntimeBase(platform), toolRoot)
  assert.ok(isAbsolute(toolRoot))
  assert.match(basename(toolRoot), /^qijenchen-closed-hook-tools-[A-Za-z0-9_-]+$/)
  assert.ok(
    temporaryRelative !== ''
      && temporaryRelative !== '..'
      && !temporaryRelative.startsWith(`..${sep}`)
      && !isAbsolute(temporaryRelative),
  )
  calls.forEach((call, index) => {
    assert.equal(call.command, resolve(toolRoot, PREREQUISITE_EXECUTABLES[index]))
    assert.equal(call.shell, false)
    assert.equal(call.environment.PATH.split(delimiter)[0], toolRoot)
  })
}

function runtimeFactory(root) {
  const artifact = resolveExactNpmRuntimeContract(root)
  const securityOverlay = {
    schemaVersion: 1,
    kind: 'verified-npm-runtime-security-overlay-receipt',
    status: 'applied',
    identityDigest: artifact.securityOverlay.identityDigest,
    npmVersion: artifact.version,
    package: artifact.securityOverlay.package,
    version: artifact.securityOverlay.version,
    integrity: artifact.securityOverlay.integrity,
    target: artifact.securityOverlay.target,
    replacedVersion: artifact.securityOverlay.replacedVersion,
    consumer: artifact.securityOverlay.consumer,
    consumerVersion: artifact.securityOverlay.consumerVersion,
    treeDigest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }
  const installedOverlay = {
    schemaVersion: 1,
    kind: 'verified-installed-npm-security-overlay-receipt',
    status: 'verified',
    identityDigest: securityOverlay.identityDigest,
    npmVersion: securityOverlay.npmVersion,
    package: securityOverlay.package,
    version: securityOverlay.version,
    integrity: securityOverlay.integrity,
    target: securityOverlay.target,
    treeDigest: securityOverlay.treeDigest,
    auditClosureDigest: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    auditClosure: [
      { path: 'node_modules/brace-expansion', name: 'brace-expansion', version: '5.0.8', dependency: null },
      { path: 'node_modules/minimatch', name: 'minimatch', version: '10.2.5', dependency: { name: 'brace-expansion', range: '^5.0.5' } },
      { path: 'node_modules/npm-runtime-brace-expansion-patch', name: 'brace-expansion', version: '5.0.8', dependency: null },
      { path: 'node_modules/eslint', name: 'eslint', version: '10.8.0', dependency: { name: 'minimatch', range: '^10.2.5' } },
    ],
  }
  return async () => ({
    cli: '/verified/npm-cli.js',
    artifact,
    securityOverlay,
    toolchain: { node: process.versions.node, npm: artifact.version },
    applyInstalledSecurityOverlay() { return installedOverlay },
    verifyInstalledSecurityOverlay() { return installedOverlay },
    cleanup() {},
  })
}

function successfulRunnerResult(args) {
  if (args?.includes('--audit-level=high')) {
    return {
      status: 0,
      stdout: JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
          dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 },
        },
      }),
      stderr: '',
    }
  }
  return { status: 0 }
}

{
  const calls = []
  const result = await runAuthorityGovernanceSetup({
    root: ROOT,
    platform: 'darwin',
    nodeVersion: AUTHORITY_MINIMUM_NODE_VERSION,
    baseEnvironment: {
      PATH: process.env.PATH,
      PLAYWRIGHT_BROWSERS_PATH: '/unreviewed/cache',
      HTTPS_PROXY: 'https://attacker.invalid',
      SSL_CERT_FILE: '/tmp/attacker.pem',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      LD_PRELOAD: '/tmp/attacker.so',
      BASH_ENV: '/tmp/attacker.sh',
      GIT_CONFIG_GLOBAL: '/tmp/attacker.gitconfig',
      NPM_CONFIG_USERCONFIG: '/tmp/attacker.npmrc',
      ANTHROPIC_API_KEY: 'secret',
    },
    runtimeFactory: runtimeFactory(ROOT),
    runner(command, args, options) {
      calls.push({ command, args, shell: options.shell, cwd: options.cwd, environment: options.env })
      return successfulRunnerResult(args)
    },
  })
  assert.equal(result.toolchain.npm, '11.19.0')
  // Ordinary setup ends at the deterministic governance check; the complete All-Harness
  // is release-time (or explicit opt-in via withAllHarnesses / DS_SETUP_ALL_HARNESS=1).
  assert.deepEqual(result.steps, [
    'verified-exact-npm-runtime',
    'locked-install',
    'signature-audit',
    'vulnerability-audit',
    'exact-playwright-runtime',
    'authority-governance-check',
  ])
  assert.equal(calls.length, 9)
  assertClosedPrerequisiteCalls(calls.slice(0, 4), 'darwin')
  assert.ok(calls.slice(4).every((call) => call.command === process.execPath && call.shell === false && call.cwd === ROOT))
  assert.deepEqual(calls.slice(4, 7).map((call) => call.args[1]), ['ci', 'audit', 'audit'])
  assert.deepEqual(calls.slice(7).map((call) => call.args), [
    ['scripts/ensure-playwright-browsers.mjs'],
    ['scripts/governance-build-graph.mjs', '--check'],
  ])
  for (const call of calls) {
    for (const hostile of [
      'PLAYWRIGHT_BROWSERS_PATH', 'HTTPS_PROXY', 'SSL_CERT_FILE', 'NODE_TLS_REJECT_UNAUTHORIZED',
      'LD_PRELOAD', 'BASH_ENV', 'GIT_CONFIG_GLOBAL', 'ANTHROPIC_API_KEY',
    ]) assert.equal(Object.hasOwn(call.environment, hostile), false, `${hostile} leaked to ${call.command}`)
  }
}

{
  // Explicit opt-in still runs the timeout-derived All-Harness step as the final stage.
  const calls = []
  const result = await runAuthorityGovernanceSetup({
    root: ROOT,
    platform: 'darwin',
    nodeVersion: AUTHORITY_MINIMUM_NODE_VERSION,
    baseEnvironment: { PATH: process.env.PATH },
    withAllHarnesses: true,
    runtimeFactory: runtimeFactory(ROOT),
    runner(command, args, options) {
      calls.push({ command, args, shell: options.shell })
      return successfulRunnerResult(args)
    },
  })
  assert.deepEqual(result.steps.slice(-3), [
    'exact-playwright-runtime',
    'authority-governance-check',
    'all-registered-harnesses',
  ])
  assert.deepEqual(calls.at(-1).args, ['infra/governance/bin/run-harnesses.mjs'])
}

{
  assert.equal(AUTHORITY_DEPENDENCY_SETUP_COMMAND, 'node scripts/setup-authority-governance.mjs --dependencies-only')
  const calls = []
  const result = await runAuthorityDependencySetup({
    root: ROOT,
    platform: 'linux',
    nodeVersion: AUTHORITY_MINIMUM_NODE_VERSION,
    runtimeFactory: runtimeFactory(ROOT),
    runner(command, args, options) {
      calls.push({ command, args, shell: options.shell, environment: options.env })
      return successfulRunnerResult(args)
    },
  })
  assert.deepEqual(result.steps, ['verified-exact-npm-runtime', 'locked-install', 'signature-audit', 'vulnerability-audit'])
  assert.equal(calls.length, 7)
  assertClosedPrerequisiteCalls(calls.slice(0, 4), 'linux')
  assert.ok(calls.slice(4).every((call) => call.command === process.execPath && call.shell === false))
}

{
  const calls = []
  await runAuthorityGovernanceSetup({
    root: ROOT,
    platform: 'linux',
    nodeVersion: AUTHORITY_MINIMUM_NODE_VERSION,
    runtimeFactory: runtimeFactory(ROOT),
    runner(command, args, options) {
      calls.push({ command, args, shell: options.shell })
      return successfulRunnerResult(args)
    },
  })
  assert.deepEqual(calls[7].args, ['scripts/ensure-playwright-browsers.mjs', '--with-deps'])
  assert.ok(calls.slice(4).every((call) => call.command === process.execPath && call.shell === false))
}

await assert.rejects(
  () => runAuthorityGovernanceSetup({
    root: ROOT,
    platform: 'darwin',
    nodeVersion: '22.12.9',
    runtimeFactory: runtimeFactory(ROOT),
    runner: (_command, args) => successfulRunnerResult(args),
  }),
  /Node\.js 22\.13\.0 or newer is required/,
)

await assert.rejects(
  () => runAuthorityGovernanceSetup({
    root: ROOT,
    platform: 'win32',
    nodeVersion: AUTHORITY_MINIMUM_NODE_VERSION,
    runtimeFactory: runtimeFactory(ROOT),
    runner: (_command, args) => successfulRunnerResult(args),
  }),
  /native Windows is unsupported/,
)

console.log('✓ DS-author setup is one exact-runtime command with closed install, browser, governance and Harness stages')
