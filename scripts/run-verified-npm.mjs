#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertNoRootNpmShrinkwrap,
  runVerifiedHighVulnerabilityAudit,
  sanitizeGovernanceBootstrapEnvironment,
} from './lib/governance-dependency-bootstrap.mjs'
import { isContainedPath } from './lib/canonical-path-containment.mjs'
import {
  assertVerifiedExactNpmRuntimeCapability,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmRuntimeContract,
} from './lib/verified-exact-npm-runtime.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = 'https://registry.npmjs.org/'

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-VERIFIED-NPM-001:${message}`)
}

function canonicalDirectory(path, label, { allowSymlinkAlias = false } = {}) {
  let metadata
  let canonical
  let canonicalMetadata
  try {
    metadata = lstatSync(path)
    canonical = realpathSync(path)
    canonicalMetadata = lstatSync(canonical)
  } catch {
    invariant(false, `${label} must exist as a real directory`)
  }
  invariant(
    canonicalMetadata.isDirectory()
      && (allowSymlinkAlias ? (metadata.isDirectory() || metadata.isSymbolicLink()) : metadata.isDirectory() && !metadata.isSymbolicLink()),
    `${label} must be a real non-symlink directory`,
  )
  return canonical
}

function validatePackPaths(args, root) {
  const source = resolve(root, args[1])
  invariant(isContainedPath(root, source), 'npm pack source escapes the repository')
  const canonicalSource = canonicalDirectory(source, 'npm pack source')
  invariant(canonicalSource === source, 'npm pack source contains a symlink or filesystem alias')

  const destination = resolve(root, args[3])
  invariant(isContainedPath(root, destination), 'npm pack destination escapes the repository')
  const canonicalDestination = canonicalDirectory(destination, 'npm pack destination')
  invariant(canonicalDestination === destination, 'npm pack destination contains a symlink or filesystem alias')
  for (const entry of readdirSync(destination, { withFileTypes: true })) {
    const entryPath = resolve(destination, entry.name)
    const metadata = lstatSync(entryPath)
    invariant(entry.isFile() && !entry.isSymbolicLink() && metadata.nlink === 1, `npm pack destination contains an unsafe entry:${entry.name}`)
    invariant(realpathSync(entryPath) === entryPath, `npm pack destination entry contains a filesystem alias:${entry.name}`)
  }
}

function validatePrefix(args, environment, command) {
  const prefixIndexes = args.flatMap((value, index) => value === '--prefix' ? [index] : [])
  invariant(prefixIndexes.length === 1 && typeof environment.RUNNER_TEMP === 'string' && environment.RUNNER_TEMP.length > 0, `npm ${command} requires exactly one RUNNER_TEMP prefix`)
  const prefixIndex = prefixIndexes[0]
  const suppliedPrefix = args[prefixIndex + 1]
  invariant(typeof suppliedPrefix === 'string' && isAbsolute(suppliedPrefix), `npm ${command} prefix must be absolute`)

  const runnerTempLexical = resolve(environment.RUNNER_TEMP)
  const prefixLexical = resolve(suppliedPrefix)
  invariant(prefixLexical === suppliedPrefix, `npm ${command} prefix must be normalized`)
  invariant(isContainedPath(runnerTempLexical, prefixLexical), `npm ${command} prefix must be a strict RUNNER_TEMP descendant`)

  const runnerTemp = canonicalDirectory(runnerTempLexical, 'RUNNER_TEMP', { allowSymlinkAlias: true })
  const canonicalPrefix = canonicalDirectory(prefixLexical, `npm ${command} prefix`)
  const lexicalSuffix = prefixLexical.slice(runnerTempLexical.length + 1)
  const expectedCanonicalPrefix = resolve(runnerTemp, lexicalSuffix)
  invariant(
    canonicalPrefix === expectedCanonicalPrefix && isContainedPath(runnerTemp, canonicalPrefix),
    `npm ${command} prefix contains a symlink or escapes RUNNER_TEMP`,
  )
  return { canonicalPrefix, prefixIndex, suppliedPrefix }
}

function validateArgs(args, environment, root) {
  invariant(args.length > 0 && args.every((value) => typeof value === 'string' && value.length > 0 && !/[\0\n\r]/.test(value)), 'npm argv is empty or unsafe')
  const [command] = args
  invariant(!['publish', 'dist-tag', 'stage', 'token', 'owner', 'access'].includes(command), `privileged npm command must use its dedicated authority:${command}`)
  if (command === 'pack') {
    invariant(
      args.length === 6
        && /^\.\/packages\/(?:design-system|storybook-config|governance)$/.test(args[1])
        && args[2] === '--pack-destination'
        && args[3] === 'release-artifacts'
        && args[4] === '--json'
        && args[5] === '--ignore-scripts',
      'npm pack argv differs from the closed release archive contract',
    )
    validatePackPaths(args, root)
    return [...args]
  }
  if (command === 'sbom') {
    invariant(JSON.stringify(args) === JSON.stringify(['sbom', '--workspaces', '--package-lock-only', '--sbom-format=cyclonedx']), 'npm sbom argv differs from the deterministic release contract')
    return [...args]
  }
  if (command === 'view') {
    invariant(
      args.length === 5
        && /^@qijenchen\/(?:design-system|storybook-config)@\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/.test(args[1])
        && args[2] === 'dist.integrity'
        && args[3] === '--json'
        && args[4] === `--registry=${REGISTRY}`,
      'npm view argv differs from the closed mirror readback contract',
    )
    return [...args]
  }
  invariant(['install', 'ci', 'audit'].includes(command), `npm command is outside the verified allowlist:${command}`)
  const { canonicalPrefix, prefixIndex, suppliedPrefix } = validatePrefix(args, environment, command)
  const allowed = new Set([
    'install', 'ci', 'audit', 'signatures', '--prefix', suppliedPrefix, '--package-lock-only',
    '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--audit-level=high',
    `--registry=${REGISTRY}`,
  ])
  invariant(args.every((value) => allowed.has(value)), `npm ${command} contains an unreviewed option`)
  invariant(args.includes('--ignore-scripts') || command === 'audit', `npm ${command} must disable lifecycle scripts`)
  invariant(command === 'install' || !args.includes('--package-lock-only'), `npm ${command} cannot use the install-only package-lock contract`)
  if (command === 'audit') {
    const auditModes = args.filter((value) => value === 'signatures' || value === '--audit-level=high')
    invariant(auditModes.length === 1, 'npm audit must select exactly one closed audit mode')
    const optionalRegistryCount = args.filter((value) => value === `--registry=${REGISTRY}`).length
    invariant(
      optionalRegistryCount <= 1 && args.length === 4 + optionalRegistryCount,
      'npm audit argv differs from the closed signature or high-vulnerability contract',
    )
  }
  const normalized = [...args]
  normalized[prefixIndex + 1] = canonicalPrefix
  return normalized
}

function installedTreeTarget(args) {
  const prefixIndex = args.indexOf('--prefix')
  return prefixIndex >= 0 ? args[prefixIndex + 1] : null
}

function assertInstalledOverlayReceipt(runtime, receipt) {
  invariant(
    receipt?.status === 'verified'
      && receipt.identityDigest === runtime.securityOverlay.identityDigest
      && /^[a-f0-9]{64}$/.test(runtime.securityOverlay.treeDigest || '')
      && receipt.treeDigest === runtime.securityOverlay.treeDigest
      && /^[a-f0-9]{64}$/.test(receipt.auditClosureDigest || '')
      && Array.isArray(receipt.auditClosure),
    'installed npm security overlay receipt is missing, stale, or substituted',
  )
  return receipt
}

export async function runVerifiedNpm({
  args,
  root: rootPath = ROOT,
  environment = process.env,
  runner = spawnSync,
  runtimeFactory = prepareVerifiedExactNpmRuntime,
} = {}) {
  const root = realpathSync(resolve(rootPath))
  let verifiedArgs = validateArgs(args, environment, root)
  assertNoRootNpmShrinkwrap(root, { errorPrefix: 'GOV-VERIFIED-NPM-001' })
  const prefixIndex = verifiedArgs.indexOf('--prefix')
  if (prefixIndex >= 0) {
    assertNoRootNpmShrinkwrap(verifiedArgs[prefixIndex + 1], { errorPrefix: 'GOV-VERIFIED-NPM-001' })
  }
  const sanitized = sanitizeGovernanceBootstrapEnvironment(environment)
  const npmEnvironment = {
    ...sanitized,
    NPM_CONFIG_REGISTRY: REGISTRY,
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_STRICT_SSL: 'true',
  }
  const expectedRuntime = resolveExactNpmRuntimeContract(root)
  let runtime = null
  try {
    runtime = await runtimeFactory({ repositoryRoot: root, env: sanitized, runner })
    assertVerifiedExactNpmRuntimeCapability(runtime, expectedRuntime)
    invariant(realpathSync(resolve(rootPath)) === root, 'repository root changed before npm execution')
    verifiedArgs = validateArgs(args, environment, root)
    const verifiedPrefixIndex = verifiedArgs.indexOf('--prefix')
    if (verifiedPrefixIndex >= 0) {
      assertNoRootNpmShrinkwrap(verifiedArgs[verifiedPrefixIndex + 1], { errorPrefix: 'GOV-VERIFIED-NPM-001' })
    }
    const command = verifiedArgs[0]
    const target = installedTreeTarget(verifiedArgs)
    let installedOverlayReceipt = null
    if (command === 'audit') {
      installedOverlayReceipt = assertInstalledOverlayReceipt(
        runtime,
        runtime.verifyInstalledSecurityOverlay(target),
      )
    }
    if (command === 'audit' && verifiedArgs.includes('--audit-level=high')) {
      const vulnerabilityAudit = runVerifiedHighVulnerabilityAudit(
        process.execPath,
        [
          runtime.cli,
          'audit',
          '--audit-level=high',
          '--json',
          `--registry=${REGISTRY}`,
        ],
        {
          root: target,
          environment: npmEnvironment,
          runner,
          npmRuntime: runtime,
          installedOverlayReceipt,
          errorPrefix: 'GOV-VERIFIED-NPM-001',
          timeoutMs: 30 * 60 * 1_000,
        },
      )
      return {
        command,
        npm: runtime.toolchain.npm,
        securityOverlay: installedOverlayReceipt,
        status: 'passed',
        vulnerabilityAudit,
      }
    }
    const result = runner(process.execPath, [runtime.cli, ...verifiedArgs], {
      cwd: root,
      env: npmEnvironment,
      shell: false,
      stdio: 'inherit',
      timeout: 30 * 60 * 1_000,
      windowsHide: true,
    })
    if (result?.error) throw result.error
    invariant(Number.isInteger(result?.status) && result.status === 0, `verified npm command failed with exit ${String(result?.status)}`)
    if (command === 'ci' || command === 'install') {
      const postInstallArgs = validateArgs(args, environment, root)
      invariant(
        JSON.stringify(postInstallArgs) === JSON.stringify(verifiedArgs),
        `npm ${command} target changed during execution`,
      )
      assertNoRootNpmShrinkwrap(target, { errorPrefix: 'GOV-VERIFIED-NPM-001' })
    }
    if (command === 'install' && verifiedArgs.includes('--package-lock-only')) {
      const generatedContract = resolveExactNpmRuntimeContract(target)
      invariant(
        generatedContract.version === expectedRuntime.version
          && generatedContract.integrity === expectedRuntime.integrity
          && generatedContract.securityOverlay.identityDigest === expectedRuntime.securityOverlay.identityDigest,
        'package-lock-only install produced a stale or substituted npm security overlay contract',
      )
    } else if (command === 'ci' || command === 'install') {
      assertInstalledOverlayReceipt(runtime, runtime.applyInstalledSecurityOverlay(target))
      installedOverlayReceipt = assertInstalledOverlayReceipt(
        runtime,
        runtime.verifyInstalledSecurityOverlay(target),
      )
    }
    return {
      command,
      npm: runtime.toolchain.npm,
      ...(installedOverlayReceipt ? { securityOverlay: installedOverlayReceipt } : {}),
      status: 'passed',
    }
  } finally {
    runtime?.cleanup?.()
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const separator = process.argv.indexOf('--')
    invariant(separator === 2 && process.argv.length > 3, 'usage: run-verified-npm.mjs -- <closed npm argv>')
    await runVerifiedNpm({ args: process.argv.slice(separator + 1) })
  } catch (error) {
    console.error(`❌ verified npm failed:${error.message}`)
    process.exit(1)
  }
}
