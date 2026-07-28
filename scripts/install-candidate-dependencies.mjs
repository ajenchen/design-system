#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstatSync, realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertClosedProjectNpmConfig,
  assertNoRootNpmShrinkwrap,
  createIsolatedGovernanceNpmEnvironment,
  runVerifiedHighVulnerabilityAudit,
} from './lib/governance-dependency-bootstrap.mjs'
import {
  assertVerifiedExactNpmRuntimeCapability,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmRuntimeContract,
} from './lib/verified-exact-npm-runtime.mjs'
import {
  assertGitVisibleWorktreeUnchanged,
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'

const TRUSTED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = 'https://registry.npmjs.org/'

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-CANDIDATE-DEPS-001:${message}`)
}

function inside(parent, child) {
  return child !== parent && child.startsWith(`${parent}${sep}`)
}

function runNpm(cli, args, { candidate, environment, runner }) {
  const result = runner(process.execPath, [cli, ...args], {
    cwd: candidate,
    env: {
      ...environment,
      NPM_CONFIG_REGISTRY: REGISTRY,
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      NPM_CONFIG_STRICT_SSL: 'true',
    },
    shell: false,
    stdio: 'inherit',
    timeout: 30 * 60 * 1_000,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(Number.isInteger(result?.status) && result.status === 0, `verified npm ${args.join(' ')} failed with exit ${String(result?.status)}`)
}

export async function installCandidateDependencies({
  trustedRoot: requestedTrustedRoot = TRUSTED_ROOT,
  workspaceRoot: requestedWorkspaceRoot = process.env.GITHUB_WORKSPACE,
  candidatePath,
  environment = process.env,
  runner = spawnSync,
  runtimeFactory = prepareVerifiedExactNpmRuntime,
} = {}) {
  invariant(typeof requestedWorkspaceRoot === 'string' && requestedWorkspaceRoot.length > 0, 'GITHUB_WORKSPACE is required')
  invariant(typeof candidatePath === 'string' && candidatePath.length > 0 && !candidatePath.includes('\0'), 'candidate path is required')
  const trustedRoot = realpathSync(resolve(requestedTrustedRoot))
  const workspaceRoot = realpathSync(resolve(requestedWorkspaceRoot))
  const candidateLexical = resolve(workspaceRoot, candidatePath)
  const candidateInfo = lstatSync(candidateLexical)
  const candidate = realpathSync(candidateLexical)
  invariant(candidateInfo.isDirectory() && !candidateInfo.isSymbolicLink() && candidate === candidateLexical, 'candidate must be a real directory with no symlink ancestry')
  invariant(inside(workspaceRoot, candidate), 'candidate escapes GITHUB_WORKSPACE')
  invariant(candidate !== trustedRoot, 'candidate must be distinct from trusted verifier source')
  assertNoRootNpmShrinkwrap(candidate, { errorPrefix: 'GOV-CANDIDATE-DEPS-001' })
  assertClosedProjectNpmConfig(
    candidate,
    ['legacy-peer-deps=true', 'ignore-scripts=true'],
    { errorPrefix: 'GOV-CANDIDATE-DEPS-001' },
  )

  const trustedBefore = captureGitVisibleWorktree(trustedRoot)
  const candidateBefore = captureGitVisibleWorktree(candidate)
  const expectedNpm = resolveExactNpmRuntimeContract(trustedRoot)
  const isolated = createIsolatedGovernanceNpmEnvironment(environment, {
    errorPrefix: 'GOV-CANDIDATE-DEPS-001',
  })
  let runtime = null
  let installedOverlayReceipt = null
  let auditReceipt = null
  try {
    runtime = await runtimeFactory({ repositoryRoot: trustedRoot, env: isolated.env, runner })
    try {
      assertVerifiedExactNpmRuntimeCapability(runtime, expectedNpm)
    } catch {
      invariant(false, `verified npm ${expectedNpm.version} capability with the exact security overlay is required`)
    }
    runNpm(runtime.cli, ['ci', '--legacy-peer-deps', '--ignore-scripts', `--registry=${REGISTRY}`], { candidate, environment: isolated.env, runner })
    runtime.applyInstalledSecurityOverlay(candidate)
    installedOverlayReceipt = runtime.verifyInstalledSecurityOverlay(candidate)
    assertClosedProjectNpmConfig(candidate, ['legacy-peer-deps=true', 'ignore-scripts=true'], { errorPrefix: 'GOV-CANDIDATE-DEPS-001' })
    assertGitVisibleWorktreeUnchanged(trustedRoot, trustedBefore, { label: 'trusted verifier after candidate install' })
    assertGitVisibleWorktreeUnchanged(candidate, candidateBefore, { label: 'candidate after dependency install' })
    runNpm(runtime.cli, ['audit', 'signatures', `--registry=${REGISTRY}`], { candidate, environment: isolated.env, runner })
    auditReceipt = runVerifiedHighVulnerabilityAudit(
      process.execPath,
      [runtime.cli, 'audit', '--audit-level=high', '--json', `--registry=${REGISTRY}`],
      {
        root: candidate,
        environment: isolated.env,
        runner,
        npmRuntime: runtime,
        installedOverlayReceipt,
        errorPrefix: 'GOV-CANDIDATE-DEPS-001',
        timeoutMs: 30 * 60 * 1_000,
      },
    )
    assertClosedProjectNpmConfig(candidate, ['legacy-peer-deps=true', 'ignore-scripts=true'], { errorPrefix: 'GOV-CANDIDATE-DEPS-001' })
    assertGitVisibleWorktreeUnchanged(trustedRoot, trustedBefore, { label: 'trusted verifier after candidate audit' })
    assertGitVisibleWorktreeUnchanged(candidate, candidateBefore, { label: 'candidate after dependency audit' })
    return {
      candidate,
      npm: runtime.toolchain.npm,
      securityOverlay: installedOverlayReceipt,
      vulnerabilityAudit: auditReceipt,
      status: 'passed',
    }
  } finally {
    try { runtime?.cleanup?.() } finally { isolated.cleanup() }
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2)
    invariant(args.length === 2 && args[0] === '--candidate', 'usage: install-candidate-dependencies.mjs --candidate <workspace-relative-path>')
    const result = await installCandidateDependencies({ candidatePath: args[1] })
    console.log(`✅ candidate dependencies verified with npm ${result.npm}`)
  } catch (error) {
    console.error(`❌ candidate dependency verification failed:${error.message}`)
    process.exit(1)
  }
}
