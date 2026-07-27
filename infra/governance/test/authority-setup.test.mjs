import assert from 'node:assert/strict'
import { basename, delimiter, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveClosedPrivateRuntimeBase } from '../../../scripts/lib/closed-tool-execution.mjs'
import { resolveExactNpmArtifact } from '../../../scripts/lib/verified-exact-npm-runtime.mjs'
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
  const artifact = resolveExactNpmArtifact(root)
  return async () => ({
    cli: '/verified/npm-cli.js',
    artifact,
    toolchain: { node: process.versions.node, npm: artifact.version },
    cleanup() {},
  })
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
      return { status: 0 }
    },
  })
  assert.equal(result.toolchain.npm, '11.18.0')
  assert.deepEqual(result.steps, [
    'verified-exact-npm-runtime',
    'locked-install',
    'signature-audit',
    'vulnerability-audit',
    'exact-playwright-runtime',
    'authority-governance-check',
    'all-registered-harnesses',
  ])
  assert.equal(calls.length, 10)
  assertClosedPrerequisiteCalls(calls.slice(0, 4), 'darwin')
  assert.ok(calls.slice(4).every((call) => call.command === process.execPath && call.shell === false && call.cwd === ROOT))
  assert.deepEqual(calls.slice(4, 7).map((call) => call.args[1]), ['ci', 'audit', 'audit'])
  assert.deepEqual(calls.slice(7).map((call) => call.args), [
    ['scripts/ensure-playwright-browsers.mjs'],
    ['scripts/governance-build-graph.mjs', '--check'],
    ['infra/governance/bin/run-harnesses.mjs'],
  ])
  for (const call of calls) {
    for (const hostile of [
      'PLAYWRIGHT_BROWSERS_PATH', 'HTTPS_PROXY', 'SSL_CERT_FILE', 'NODE_TLS_REJECT_UNAUTHORIZED',
      'LD_PRELOAD', 'BASH_ENV', 'GIT_CONFIG_GLOBAL', 'ANTHROPIC_API_KEY',
    ]) assert.equal(Object.hasOwn(call.environment, hostile), false, `${hostile} leaked to ${call.command}`)
  }
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
      return { status: 0 }
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
      return { status: 0 }
    },
  })
  assert.deepEqual(calls[7].args, ['scripts/ensure-playwright-browsers.mjs', '--with-deps'])
  assert.ok(calls.slice(4).every((call) => call.command === process.execPath && call.shell === false))
}

await assert.rejects(
  () => runAuthorityGovernanceSetup({
    root: ROOT,
    platform: 'darwin',
    nodeVersion: '22.11.9',
    runtimeFactory: runtimeFactory(ROOT),
    runner: () => ({ status: 0 }),
  }),
  /Node\.js 22\.12\.0 or newer is required/,
)

await assert.rejects(
  () => runAuthorityGovernanceSetup({
    root: ROOT,
    platform: 'win32',
    nodeVersion: AUTHORITY_MINIMUM_NODE_VERSION,
    runtimeFactory: runtimeFactory(ROOT),
    runner: () => ({ status: 0 }),
  }),
  /native Windows is unsupported/,
)

console.log('✓ DS-author setup is one exact-runtime command with closed install, browser, governance and Harness stages')
