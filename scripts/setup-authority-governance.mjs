#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GOVERNANCE_CLOSED_PROJECT_NPM_CONFIG_LINES,
  GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION,
  runClosedBootstrapStep,
  runVerifiedGovernanceDependencyBootstrap,
  sanitizeGovernanceBootstrapEnvironment,
} from './lib/governance-dependency-bootstrap.mjs'
import {
  resolveExactNpmArtifact,
} from './lib/verified-exact-npm-runtime.mjs'
import {
  assertGitVisibleWorktreeUnchanged,
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'

export const AUTHORITY_SETUP_COMMAND = 'node scripts/setup-authority-governance.mjs'
export const AUTHORITY_DEPENDENCY_SETUP_COMMAND = 'node scripts/setup-authority-governance.mjs --dependencies-only'
export const AUTHORITY_RUNTIME_VERIFY_COMMAND = 'node scripts/setup-authority-governance.mjs --verify-runtime'
export const AUTHORITY_MINIMUM_NODE_VERSION = GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEPENDENCY_AUTHORITY_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  '.npmrc',
  'scripts/setup-authority-governance.mjs',
  'scripts/lib/governance-dependency-bootstrap.mjs',
  'scripts/lib/verified-exact-npm-runtime.mjs',
  'scripts/lib/worktree-fingerprint.mjs',
])
const AUTHORITY_PATHS = Object.freeze([
  ...DEPENDENCY_AUTHORITY_PATHS,
  'scripts/ensure-playwright-browsers.mjs',
  'scripts/governance-build-graph.mjs',
  'infra/governance/bin/run-harnesses.mjs',
  'infra/governance/lib/harness-registry.mjs',
  'infra/governance/lib/playwright-runtime.mjs',
  'infra/governance/providers/harness-registry.json',
  'infra/governance/providers/harness-source-inventory.json',
])

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-AUTHORITY-SETUP-001:${message}`)
}

function regularBytes(root, path) {
  const absolute = join(root, path)
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute, `authority path is unsafe:${path}`)
  return readFileSync(absolute)
}

function authoritySnapshot(root, paths = AUTHORITY_PATHS) {
  return paths.map((path) => ({ path, bytes: regularBytes(root, path) }))
}

function assertAuthoritySnapshot(root, snapshot) {
  for (const entry of snapshot) invariant(regularBytes(root, entry.path).equals(entry.bytes), `setup mutated committed authority:${entry.path}`)
}

function stableVersionAtLeast(candidateValue, minimumValue) {
  const parse = (value) => {
    const match = String(value).match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/)
    invariant(match, `invalid Node.js version:${String(value)}`)
    return match.slice(1, 4)
  }
  const candidate = parse(candidateValue)
  const minimum = parse(minimumValue)
  for (let index = 0; index < 3; index += 1) {
    if (candidate[index] === minimum[index]) continue
    return candidate[index].length !== minimum[index].length
      ? candidate[index].length > minimum[index].length
      : candidate[index] > minimum[index]
  }
  return true
}

export function verifyAuthorityRuntime({
  root: requestedRoot = ROOT,
  nodeVersion = process.versions.node,
} = {}) {
  const root = realpathSync(resolve(requestedRoot))
  invariant(
    stableVersionAtLeast(nodeVersion, AUTHORITY_MINIMUM_NODE_VERSION),
    `Node.js ${AUTHORITY_MINIMUM_NODE_VERSION} or newer is required; received ${String(nodeVersion)}`,
  )
  const manifest = JSON.parse(regularBytes(root, 'package.json').toString('utf8'))
  const lock = JSON.parse(regularBytes(root, 'package-lock.json').toString('utf8'))
  invariant(manifest.scripts?.['setup:dependencies'] === AUTHORITY_DEPENDENCY_SETUP_COMMAND, 'package.json authority dependency setup command drifted')
  invariant(
    manifest.packageManager === 'npm@11.18.0' && manifest.engines?.node === `>=${AUTHORITY_MINIMUM_NODE_VERSION}`,
    'authority runtime declaration drifted',
  )
  invariant(lock.lockfileVersion === 3 && lock.packages?.['']?.engines?.node === `>=${AUTHORITY_MINIMUM_NODE_VERSION}`, 'package-lock authority runtime declaration drifted')
  invariant(lock.packages?.['']?.devDependencies?.npm === '11.18.0', 'package-lock root npm runtime declaration drifted')
  const npmArtifact = resolveExactNpmArtifact(root)
  invariant(npmArtifact.version === '11.18.0', 'authority npm runtime must remain exactly 11.18.0')
  return Object.freeze({
    root,
    toolchain: Object.freeze({ node: String(nodeVersion), npm: npmArtifact.version }),
  })
}

function runStep(command, args, { root, env, runner, timeoutMs }) {
  return runClosedBootstrapStep(command, args, {
    root,
    environment: env,
    runner,
    errorPrefix: 'GOV-AUTHORITY-SETUP-001',
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })
}

export async function runAuthorityAllHarnessStep({ root: requestedRoot = ROOT, environment = process.env, runner = spawnSync } = {}) {
  const root = realpathSync(resolve(requestedRoot))
  // Keep the pre-install authority entrypoint dependency-free. The Harness contract loads only
  // after the exact locked dependency bootstrap has completed.
  const {
    deriveAuthorityAllHarnessTimeoutMs,
    readHarnessRegistry,
  } = await import('../infra/governance/lib/harness-registry.mjs')
  const registry = readHarnessRegistry(join(root, 'infra/governance/providers/harness-registry.json'))
  invariant(
    JSON.stringify(registry.runner?.command) === JSON.stringify(['node', 'infra/governance/bin/run-harnesses.mjs']),
    'Harness registry runner command drifted',
  )
  const timeoutMs = deriveAuthorityAllHarnessTimeoutMs(registry)
  return runStep(process.execPath, ['infra/governance/bin/run-harnesses.mjs'], { root, env: environment, runner, timeoutMs })
}

export async function runAuthorityDependencySetup({
  root: requestedRoot = ROOT,
  platform = process.platform,
  nodeVersion = process.versions.node,
  baseEnvironment = process.env,
  runner = spawnSync,
  runtimeFactory,
} = {}) {
  const root = realpathSync(resolve(requestedRoot))
  const callerWorktree = captureGitVisibleWorktree(root)
  return runVerifiedGovernanceDependencyBootstrap({
    root,
    platform,
    nodeVersion,
    baseEnvironment,
    runner,
    ...(runtimeFactory ? { runtimeFactory } : {}),
    authorityPaths: DEPENDENCY_AUTHORITY_PATHS,
    expectedNpmrcLines: GOVERNANCE_CLOSED_PROJECT_NPM_CONFIG_LINES,
    errorPrefix: 'GOV-AUTHORITY-SETUP-001',
    validateRoleRepository(authorityRoot) {
      const manifest = JSON.parse(regularBytes(authorityRoot, 'package.json').toString('utf8'))
      const lock = JSON.parse(regularBytes(authorityRoot, 'package-lock.json').toString('utf8'))
      invariant(manifest.scripts?.['setup:dependencies'] === AUTHORITY_DEPENDENCY_SETUP_COMMAND, 'package.json authority dependency setup command drifted')
      invariant(manifest.packageManager === 'npm@11.18.0' && manifest.engines?.node === `>=${AUTHORITY_MINIMUM_NODE_VERSION}`, 'authority runtime declaration drifted')
      invariant(lock.packages?.['']?.engines?.node === `>=${AUTHORITY_MINIMUM_NODE_VERSION}`, 'package-lock authority runtime declaration drifted')
      invariant(resolveExactNpmArtifact(authorityRoot).version === '11.18.0', 'authority npm runtime must remain exactly 11.18.0')
    },
    afterStage({ index }) {
      assertGitVisibleWorktreeUnchanged(root, callerWorktree, { label: `authority dependency stage ${index + 1}` })
    },
  })
}

export async function runAuthorityGovernanceSetup(options = {}) {
  const {
    root: requestedRoot = ROOT,
    platform = process.platform,
    baseEnvironment = process.env,
    runner = spawnSync,
  } = options
  const root = realpathSync(resolve(requestedRoot))
  const manifest = JSON.parse(regularBytes(root, 'package.json').toString('utf8'))
  invariant(manifest.scripts?.['setup:governance'] === AUTHORITY_SETUP_COMMAND, 'package.json authority setup command drifted')
  const snapshot = authoritySnapshot(root)
  const callerWorktree = captureGitVisibleWorktree(root)
  const dependencies = await runAuthorityDependencySetup({ ...options, root, platform, baseEnvironment, runner })
  assertAuthoritySnapshot(root, snapshot)
  assertGitVisibleWorktreeUnchanged(root, callerWorktree, { label: 'authority dependency setup' })
  const environment = sanitizeGovernanceBootstrapEnvironment(baseEnvironment)
  runStep(process.execPath, ['scripts/ensure-playwright-browsers.mjs', ...(platform === 'linux' ? ['--with-deps'] : [])], { root, env: environment, runner })
  assertGitVisibleWorktreeUnchanged(root, callerWorktree, { label: 'exact Playwright setup' })
  runStep(process.execPath, ['scripts/governance-build-graph.mjs', '--check'], { root, env: environment, runner })
  assertGitVisibleWorktreeUnchanged(root, callerWorktree, { label: 'authority governance check' })
  // Ordinary setup:all = bootstrap + deterministic drift check only. The complete
  // All-Harness certification run is a release-time gate (release:preflight / CI), not a
  // workspace-setup prerequisite; opt in explicitly when a full local certification pass
  // is wanted.
  const withAllHarnesses = options.withAllHarnesses === true
    || String(baseEnvironment?.DS_SETUP_ALL_HARNESS || '') === '1'
    || process.argv.includes('--with-all-harnesses')
  if (withAllHarnesses) {
    await runAuthorityAllHarnessStep({ root, environment, runner })
    assertAuthoritySnapshot(root, snapshot)
    assertGitVisibleWorktreeUnchanged(root, callerWorktree, { label: 'All-Harness setup' })
  }
  return {
    root,
    toolchain: dependencies.toolchain,
    steps: [
      ...dependencies.steps,
      'exact-playwright-runtime',
      'authority-governance-check',
      ...(withAllHarnesses ? ['all-registered-harnesses'] : []),
    ],
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2)
    invariant(
      args.length === 0
        || (args.length === 1 && (args[0] === '--dependencies-only' || args[0] === '--verify-runtime')),
      'usage: setup-authority-governance.mjs [--dependencies-only|--verify-runtime]',
    )
    const result = args[0] === '--dependencies-only'
      ? await runAuthorityDependencySetup()
      : args[0] === '--verify-runtime'
        ? verifyAuthorityRuntime()
        : await runAuthorityGovernanceSetup()
    const label = args[0] === '--dependencies-only'
      ? 'dependency setup'
      : args[0] === '--verify-runtime'
        ? 'runtime'
        : 'governance setup'
    console.log(`✅ DS-author ${label} verified:${result.root}`)
  } catch (error) {
    console.error(`❌ DS-author governance setup failed:${error.message}`)
    process.exit(1)
  }
}
