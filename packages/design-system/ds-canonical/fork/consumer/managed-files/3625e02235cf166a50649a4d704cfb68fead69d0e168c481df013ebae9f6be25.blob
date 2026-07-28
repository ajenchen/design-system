#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  createIsolatedGovernanceNpmEnvironment,
  GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION,
  GOVERNANCE_DEPENDENCY_REGISTRY,
  runClosedBootstrapStep,
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ERROR_PREFIX = 'GOV-PROVIDER-CLI-TOOLCHAIN-001'
const AUTHORITY_MANIFEST_PATH = 'infra/governance/providers/provider-cli-toolchain.json'
const CONSUMER_MANIFEST_PATH = 'governance/provider-cli-toolchain.json'
const INSTALL_TIMEOUT_MS = 20 * 60 * 1_000
const AUDIT_TIMEOUT_MS = 10 * 60 * 1_000
const VERSION_TIMEOUT_MS = 30 * 1_000
const PACKAGE_CONTENT_PROTOCOL = 'npm-ustar-package-tree-v1'
const PACKAGE_CONTENT_MODE_POLICY = 'excluded-portable-content-only'
const PACKAGE_CONTENT_DIGEST_DOMAIN = 'qijenchen-provider-cli-package-content-v1'
const ACTIVE_PACKAGE_CONTENT_BINDING_DOMAIN = 'qijenchen-provider-cli-active-package-content-v1'
const RUNTIME_CONTENT_TARGET_PROTOCOL = 'content-v2'
const MAX_PROVIDER_PACKAGE_COMPRESSED_BYTES = 512 * 1024 * 1024
const MAX_PROVIDER_PACKAGE_EXPANDED_BYTES = 1024 * 1024 * 1024
const MAX_PROVIDER_PACKAGE_FILE_BYTES = 512 * 1024 * 1024
const MAX_PROVIDER_PACKAGE_FILE_COUNT = 100_000
const MAX_PROVIDER_PACKAGE_ENTRY_COUNT = 100_000
const MAX_PROVIDER_PACKAGE_PATH_BYTES = 4096
const MAX_PROVIDER_PACKAGE_PATH_DEPTH = 64
const MAX_PROVIDER_PACKAGE_SEGMENT_BYTES = 255
const SHA256 = /^[a-f0-9]{64}$/
const SHA512_INTEGRITY = /^sha512-([A-Za-z0-9+/]+={0,2})$/
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const EXACT_ALIAS = /^npm:(@[a-z0-9-]+\/[a-z0-9-]+)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?)$/
const SUPPORTED_PROVIDER_CLI_PLATFORMS = Object.freeze(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'])

export const PROVIDER_CLI_PACKAGE_CONTENT_CONTRACT = Object.freeze({
  digestDomain: PACKAGE_CONTENT_DIGEST_DOMAIN,
  maxCompressedBytes: MAX_PROVIDER_PACKAGE_COMPRESSED_BYTES,
  maxExpandedBytes: MAX_PROVIDER_PACKAGE_EXPANDED_BYTES,
  maxEntryCount: MAX_PROVIDER_PACKAGE_ENTRY_COUNT,
  maxFileBytes: MAX_PROVIDER_PACKAGE_FILE_BYTES,
  maxFileCount: MAX_PROVIDER_PACKAGE_FILE_COUNT,
  maxPathBytes: MAX_PROVIDER_PACKAGE_PATH_BYTES,
  maxPathDepth: MAX_PROVIDER_PACKAGE_PATH_DEPTH,
  maxSegmentBytes: MAX_PROVIDER_PACKAGE_SEGMENT_BYTES,
  modePolicy: PACKAGE_CONTENT_MODE_POLICY,
  protocol: PACKAGE_CONTENT_PROTOCOL,
  supportedPlatforms: SUPPORTED_PROVIDER_CLI_PLATFORMS,
})

export class ProviderCliControlPlaneUpdateRequiredError extends Error {
  constructor(message) {
    super(`${ERROR_PREFIX}:${message}`)
    this.name = 'ProviderCliControlPlaneUpdateRequiredError'
    this.code = 'GOV-PROVIDER-CLI-CONTROL-PLANE-UPDATE-REQUIRED'
  }
}

function invariant(condition, message) {
  if (!condition) throw new Error(`${ERROR_PREFIX}:${message}`)
}

function controlPlaneInvariant(condition, message) {
  if (!condition) throw new ProviderCliControlPlaneUpdateRequiredError(message)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sha512Integrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label} has an invalid or open shape`,
  )
}

function portableRepoPath(value, label) {
  invariant(
    typeof value === 'string'
      && value.length > 0
      && !isAbsolute(value)
      && !value.includes('\\')
      && !/[\0\n\r]/.test(value)
      && value.split('/').every(part => part && part !== '.' && part !== '..'),
    `${label} must be a portable repository-relative path`,
  )
  return value
}

function resolveContained(root, repoPath, label) {
  portableRepoPath(repoPath, label)
  const absolute = resolve(root, repoPath)
  const rel = relative(root, absolute)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes the repository`)
  return absolute
}

export function validateProviderCliFilesystemAuthority(metadata, {
  currentUid = typeof process.getuid === 'function' ? process.getuid() : null,
  label = 'provider CLI filesystem entry',
} = {}) {
  invariant(Number.isInteger(currentUid) && currentUid >= 0, `${label} requires one POSIX process uid`)
  const bigint = typeof metadata?.uid === 'bigint' || typeof metadata?.mode === 'bigint'
  const uid = bigint ? BigInt(metadata?.uid) : metadata?.uid
  const mode = bigint ? BigInt(metadata?.mode) : metadata?.mode
  const processUid = bigint ? BigInt(currentUid) : currentUid
  const rootUid = bigint ? 0n : 0
  const zero = bigint ? 0n : 0
  const writeMask = bigint ? 0o022n : 0o022
  const fileTypeMask = bigint ? 0o170000n : 0o170000
  const directoryType = bigint ? 0o040000n : 0o040000
  const stickyBit = bigint ? 0o1000n : 0o1000
  invariant(uid === processUid || uid === rootUid, `${label} must be owned by the current uid or root`)
  const writableByGroupOrOther = (mode & writeMask) !== zero
  const rootOwnedStickyDirectory = uid === rootUid
    && (mode & fileTypeMask) === directoryType
    && (mode & stickyBit) === stickyBit
  invariant(
    !writableByGroupOrOther || rootOwnedStickyDirectory,
    `${label} must not be writable by group or other users`,
  )
  // macOS CloudStorage providers commonly attach deny-only ACL entries (for example,
  // "everyone deny delete"). ACL presence is not itself replacement authority, so this
  // local POSIX gate intentionally evaluates owner/mode instead of rejecting an ACL marker.
  return true
}

function assertTrustedPathAuthority(path, label, { includeEntry = true } = {}) {
  let current = includeEntry ? resolve(path) : dirname(resolve(path))
  for (;;) {
    const info = lstatSync(current, { bigint: true })
    invariant(!info.isSymbolicLink(), `${label} authority chain must not contain a symbolic link:${current}`)
    invariant(realpathSync(current) === current, `${label} authority chain must not traverse a symbolic-link alias:${current}`)
    validateProviderCliFilesystemAuthority(info, { label: `${label} authority ${current}` })
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return path
}

function readRegularBytes(path, label, { optional = false } = {}) {
  let info
  try {
    info = lstatSync(path)
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null
    throw error
  }
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be one regular no-link file`)
  invariant(realpathSync(path) === path, `${label} must not traverse a symbolic-link alias`)
  assertTrustedPathAuthority(path, label)
  return readFileSync(path)
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`${ERROR_PREFIX}:${label} is invalid JSON:${error.message}`, { cause: error })
  }
}

function packageNameFromLockPath(lockPath) {
  const prefix = 'node_modules/'
  invariant(lockPath.startsWith(prefix), `package-lock entry is not below node_modules:${lockPath}`)
  const parts = lockPath.slice(prefix.length).split('/')
  if (parts[0].startsWith('@')) {
    invariant(parts.length === 2 && /^@[a-z0-9-]+$/.test(parts[0]) && /^[a-z0-9-]+$/.test(parts[1]), `package-lock path is not one flat scoped package:${lockPath}`)
    return `${parts[0]}/${parts[1]}`
  }
  invariant(parts.length === 1 && /^[a-z0-9-]+$/.test(parts[0]), `package-lock path is not one flat package:${lockPath}`)
  return parts[0]
}

function canonicalRegistryTarball(packageName, version) {
  const unscoped = packageName.split('/').at(-1)
  return `${GOVERNANCE_DEPENDENCY_REGISTRY}${packageName}/-/${unscoped}-${version}.tgz`
}

function validateIntegrity(value, label) {
  const match = String(value || '').match(SHA512_INTEGRITY)
  invariant(match, `${label} lacks canonical SHA-512 integrity`)
  const bytes = Buffer.from(match[1], 'base64')
  invariant(bytes.length === 64 && bytes.toString('base64') === match[1], `${label} SHA-512 integrity is not canonical base64`)
}

function validateDependencySpec(spec, label) {
  invariant(typeof spec === 'string' && spec.length > 0, `${label} dependency spec is invalid`)
  invariant(!/^(?:file:|link:|git(?:\+[^:]+)?:|github:|https?:)/i.test(spec), `${label} may not use file, link, git, GitHub, or URL dependencies`)
  invariant(EXACT_VERSION.test(spec) || EXACT_ALIAS.test(spec), `${label} must be one exact version or exact npm alias`)
}

function dependencySpecMatchesLockEntry(dependencyName, spec, entry) {
  const alias = spec.match(EXACT_ALIAS)
  const expectedName = alias ? alias[1] : dependencyName
  const expectedVersion = alias ? alias[2] : spec
  return (entry.name ?? dependencyName) === expectedName && entry.version === expectedVersion
}

function platformPackageName(tool, platform) {
  invariant(tool.platformPackage && typeof tool.platformPackage === 'object', `provider CLI tool ${tool.providerId} has no platform package contract`)
  const template = tool.platformPackage.nameTemplate
  invariant(typeof template === 'string' && (template.match(/\{platform\}/g) ?? []).length === 1, `provider CLI tool ${tool.providerId} platform package template is invalid`)
  const packageName = template.replace('{platform}', platform)
  invariant(/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(packageName), `provider CLI tool ${tool.providerId} platform package name is invalid:${packageName}`)
  return packageName
}

function validateToolchainManifest(manifest, { requirePackageContent = true } = {}) {
  invariant(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'provider CLI toolchain manifest must be an object')
  controlPlaneInvariant(manifest.$schema === '../schemas/provider-cli-toolchain.schema.json', 'provider CLI toolchain schema binding requires a reviewed control-plane update')
  controlPlaneInvariant(manifest.schemaVersion === 2 && manifest.kind === 'provider-cli-toolchain', 'provider CLI toolchain schema version or kind requires a reviewed control-plane update')
  const hasPackageContent = Object.hasOwn(manifest ?? {}, 'packageContent')
  invariant(hasPackageContent || !requirePackageContent, 'provider CLI package-content authority is required')
  exactKeys(
    manifest,
    ['$schema', 'schemaVersion', 'kind', 'registry', 'packageLock', ...(hasPackageContent ? ['packageContent'] : []), 'installPolicy', 'providerBindings', 'tools'],
    'provider CLI toolchain manifest',
  )
  invariant(manifest.registry === GOVERNANCE_DEPENDENCY_REGISTRY, 'provider CLI registry is not canonical')

  exactKeys(manifest.packageLock, ['path', 'consumerPath', 'sha256', 'lockfileVersion', 'rootName', 'rootVersion', 'packageCount'], 'provider CLI package-lock binding')
  invariant(manifest.packageLock.path === 'infra/governance/providers/provider-cli-toolchain.package-lock.json', 'authority provider CLI lock path is invalid')
  invariant(manifest.packageLock.consumerPath === 'governance/provider-cli-toolchain.package-lock.json', 'consumer provider CLI lock path is invalid')
  invariant(SHA256.test(manifest.packageLock.sha256), 'provider CLI package-lock digest is invalid')
  invariant(manifest.packageLock.lockfileVersion === 3, 'provider CLI package-lock version must be 3')
  invariant(manifest.packageLock.rootName === '@qijenchen/provider-cli-toolchain' && manifest.packageLock.rootVersion === '0.0.0', 'provider CLI package-lock root identity is invalid')
  invariant(Number.isInteger(manifest.packageLock.packageCount) && manifest.packageLock.packageCount >= 0, 'provider CLI package count is invalid')

  exactKeys(manifest.installPolicy, ['ignoreScripts', 'signatureAudit', 'auditLevel', 'runtimeDirectory', 'shimDirectory', 'supportedPlatforms'], 'provider CLI install policy')
  invariant(manifest.installPolicy.ignoreScripts === true && manifest.installPolicy.signatureAudit === true && manifest.installPolicy.auditLevel === 'high', 'provider CLI install policy diluted its hard gates')
  invariant(manifest.installPolicy.runtimeDirectory === 'node_modules/.provider-cli-toolchain', 'provider CLI runtime directory is invalid')
  invariant(manifest.installPolicy.shimDirectory === 'node_modules/.bin', 'provider CLI shim directory is invalid')
  invariant(
    JSON.stringify(manifest.installPolicy.supportedPlatforms) === JSON.stringify(SUPPORTED_PROVIDER_CLI_PLATFORMS),
    'provider CLI supported platform matrix is invalid',
  )

  if (hasPackageContent) {
    invariant(manifest.packageContent && typeof manifest.packageContent === 'object' && !Array.isArray(manifest.packageContent), 'provider CLI package-content authority must be an object')
    controlPlaneInvariant(manifest.packageContent.protocol === PACKAGE_CONTENT_PROTOCOL, 'provider CLI package-content protocol requires a reviewed control-plane update')
    controlPlaneInvariant(manifest.packageContent.modePolicy === PACKAGE_CONTENT_MODE_POLICY, 'provider CLI package-content mode policy requires a reviewed control-plane update')
    exactKeys(manifest.packageContent, ['protocol', 'modePolicy', 'packages'], 'provider CLI package-content authority')
    invariant(Array.isArray(manifest.packageContent.packages) && manifest.packageContent.packages.length > 0, 'provider CLI package-content authority is empty')
    const contentLockPaths = new Set()
    for (const [index, record] of manifest.packageContent.packages.entries()) {
      exactKeys(record, ['lockPath', 'platforms', 'treeSha256', 'fileCount', 'totalBytes'], `provider CLI package-content record ${index}`)
      portableRepoPath(record.lockPath, `provider CLI package-content record ${index} lockPath`)
      invariant(record.lockPath.startsWith('node_modules/'), `provider CLI package-content record ${index} must target node_modules`)
      packageNameFromLockPath(record.lockPath)
      invariant(!contentLockPaths.has(record.lockPath), `provider CLI package-content lockPath is duplicated:${record.lockPath}`)
      invariant(
        Array.isArray(record.platforms)
          && record.platforms.length > 0
          && record.platforms.every(platform => manifest.installPolicy.supportedPlatforms.includes(platform))
          && JSON.stringify([...new Set(record.platforms)].sort()) === JSON.stringify(record.platforms),
        `provider CLI package-content platforms are invalid:${record.lockPath}`,
      )
      invariant(SHA256.test(record.treeSha256), `provider CLI package-content digest is invalid:${record.lockPath}`)
      invariant(Number.isSafeInteger(record.fileCount) && record.fileCount >= 1 && record.fileCount <= MAX_PROVIDER_PACKAGE_FILE_COUNT, `provider CLI package-content file count is invalid:${record.lockPath}`)
      invariant(Number.isSafeInteger(record.totalBytes) && record.totalBytes >= 1 && record.totalBytes <= MAX_PROVIDER_PACKAGE_EXPANDED_BYTES, `provider CLI package-content total bytes are invalid:${record.lockPath}`)
      contentLockPaths.add(record.lockPath)
    }
    invariant(
      JSON.stringify([...contentLockPaths]) === JSON.stringify([...contentLockPaths].sort()),
      'provider CLI package-content records must be sorted by lockPath',
    )
  }

  invariant(Array.isArray(manifest.providerBindings) && manifest.providerBindings.length > 0, 'provider CLI provider bindings are missing')
  const bindingIds = new Set()
  const provisionedToolIds = new Set()
  for (const [index, binding] of manifest.providerBindings.entries()) {
    exactKeys(binding, ['providerId', 'provisioning', 'toolProviderId'], `provider CLI provider binding ${index}`)
    invariant(typeof binding.providerId === 'string' && /^[a-z][a-z0-9-]+$/.test(binding.providerId) && !bindingIds.has(binding.providerId), `provider CLI provider binding id is invalid or duplicated:${String(binding.providerId)}`)
    invariant(['repo-provisioned-cli', 'external-runtime'].includes(binding.provisioning), `provider CLI provider binding ${binding.providerId} provisioning is invalid`)
    if (binding.provisioning === 'repo-provisioned-cli') {
      invariant(typeof binding.toolProviderId === 'string' && /^[a-z][a-z0-9-]+$/.test(binding.toolProviderId), `provider CLI provider binding ${binding.providerId} lacks a tool id`)
      invariant(!provisionedToolIds.has(binding.toolProviderId), `provider CLI tool binding is duplicated:${binding.toolProviderId}`)
      provisionedToolIds.add(binding.toolProviderId)
    } else invariant(binding.toolProviderId === null, `external provider ${binding.providerId} may not claim a repo-provisioned CLI`)
    bindingIds.add(binding.providerId)
  }

  invariant(Array.isArray(manifest.tools), 'provider CLI tools must be an array')
  const toolIds = new Set()
  const packageNames = new Set()
  const executables = new Set()
  for (let index = 0; index < manifest.tools.length; index += 1) {
    const tool = manifest.tools[index]
    exactKeys(tool, ['providerId', 'packageName', 'version', 'executable', 'binKind', 'packageBin', 'platformPackage', 'versionProbe'], `provider CLI tool ${index}`)
    invariant(typeof tool.providerId === 'string' && /^[a-z][a-z0-9-]+$/.test(tool.providerId) && !toolIds.has(tool.providerId), `provider CLI tool providerId is invalid or duplicated:${String(tool.providerId)}`)
    invariant(typeof tool.packageName === 'string' && /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(tool.packageName) && !packageNames.has(tool.packageName), `provider CLI tool ${tool.providerId} packageName is invalid or duplicated`)
    invariant(typeof tool.executable === 'string' && /^[a-z][a-z0-9-]+$/.test(tool.executable) && !executables.has(tool.executable), `provider CLI tool ${tool.providerId} executable is invalid or duplicated`)
    invariant(['platform-native', 'node-entrypoint'].includes(tool.binKind), `provider CLI tool ${tool.providerId} bin kind is invalid`)
    portableRepoPath(tool.packageBin, `provider CLI tool ${tool.providerId} package bin`)
    invariant(EXACT_VERSION.test(tool.version), `provider CLI tool ${tool.providerId} version must be exact stable semver`)
    invariant(tool.versionProbe === 'exact-semver-token', `provider CLI tool ${tool.providerId} version probe is invalid`)
    invariant(tool.platformPackage === null || (tool.platformPackage && typeof tool.platformPackage === 'object' && !Array.isArray(tool.platformPackage)), `provider CLI tool ${tool.providerId} platform package contract is invalid`)
    if (tool.platformPackage !== null) {
      exactKeys(tool.platformPackage, ['nameTemplate', 'executablePath'], `provider CLI tool ${tool.providerId} platform package`)
      for (const supported of manifest.installPolicy.supportedPlatforms) platformPackageName(tool, supported)
      if (tool.platformPackage.executablePath !== null) portableRepoPath(tool.platformPackage.executablePath, `provider CLI tool ${tool.providerId} platform executable`)
    }
    invariant(tool.binKind !== 'platform-native' || typeof tool.platformPackage?.executablePath === 'string', `provider CLI tool ${tool.providerId} platform-native launcher lacks an executable path`)
    toolIds.add(tool.providerId)
    packageNames.add(tool.packageName)
    executables.add(tool.executable)
  }
  invariant(JSON.stringify([...toolIds].sort()) === JSON.stringify([...provisionedToolIds].sort()), 'provider CLI tools differ from the closed repo-provisioned provider bindings')
  return manifest
}

export function deriveActivePackageContentPlan(manifest, lock) {
  const requested = new Map()
  for (const tool of manifest.tools) {
    requested.set(`node_modules/${tool.packageName}`, [...manifest.installPolicy.supportedPlatforms])
    if (tool.platformPackage !== null) {
      for (const platform of manifest.installPolicy.supportedPlatforms) {
        requested.set(`node_modules/${platformPackageName(tool, platform)}`, [platform])
      }
    }
  }
  return Object.freeze([...requested.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([lockPath, platforms]) => {
      const entry = lock.packages[lockPath]
      invariant(entry, `provider CLI active package plan is absent from the lock:${lockPath}`)
      return Object.freeze({
        integrity: entry.integrity,
        lockPath,
        platforms: Object.freeze([...platforms]),
        resolved: entry.resolved,
      })
    }))
}

function validateToolchainLock(lock, manifest, { requirePackageContent = true } = {}) {
  exactKeys(lock, ['name', 'version', 'lockfileVersion', 'requires', 'packages'], 'provider CLI package-lock')
  invariant(lock.name === manifest.packageLock.rootName && lock.version === manifest.packageLock.rootVersion, 'provider CLI package-lock top-level identity drifted')
  invariant(lock.lockfileVersion === manifest.packageLock.lockfileVersion && lock.requires === true, 'provider CLI package-lock format is invalid')
  invariant(lock.packages && typeof lock.packages === 'object' && !Array.isArray(lock.packages), 'provider CLI package-lock package inventory is missing')
  const rows = Object.entries(lock.packages)
  invariant(rows.length - 1 === manifest.packageLock.packageCount, 'provider CLI package count differs from the manifest')
  const root = lock.packages['']
  exactKeys(root, ['name', 'version', 'dependencies'], 'provider CLI package-lock root')
  invariant(root.name === manifest.packageLock.rootName && root.version === manifest.packageLock.rootVersion, 'provider CLI package-lock root record drifted')
  const expectedDependencies = Object.fromEntries(manifest.tools.map(tool => [tool.packageName, tool.version]))
  invariant(JSON.stringify(root.dependencies) === JSON.stringify(expectedDependencies), 'provider CLI package-lock root dependencies differ from the manifest')

  for (const [lockPath, entry] of rows) {
    if (lockPath === '') continue
    invariant(entry && typeof entry === 'object' && !Array.isArray(entry), `provider CLI package-lock entry is invalid:${lockPath}`)
    invariant(!Object.hasOwn(entry, 'link'), `provider CLI package-lock may not contain link entries:${lockPath}`)
    const pathName = packageNameFromLockPath(lockPath)
    const packageName = entry.name ?? pathName
    invariant(/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(packageName), `provider CLI package name is invalid:${lockPath}`)
    invariant(EXACT_VERSION.test(entry.version), `provider CLI package version is not exact:${lockPath}`)
    invariant(entry.resolved === canonicalRegistryTarball(packageName, entry.version), `provider CLI package artifact is not the canonical registry tarball:${lockPath}`)
    validateIntegrity(entry.integrity, `provider CLI package ${lockPath}`)
    for (const field of ['dependencies', 'optionalDependencies']) {
      if (entry[field] === undefined) continue
      invariant(entry[field] && typeof entry[field] === 'object' && !Array.isArray(entry[field]), `provider CLI ${lockPath} ${field} is invalid`)
      for (const [dependency, spec] of Object.entries(entry[field])) validateDependencySpec(spec, `${lockPath} ${field}.${dependency}`)
    }
  }

  for (const tool of manifest.tools) {
    const entry = lock.packages[`node_modules/${tool.packageName}`]
    invariant(entry?.version === tool.version, `provider CLI lock lost ${tool.packageName}@${tool.version}`)
    invariant(entry.bin?.[tool.executable] === tool.packageBin, `provider CLI lock bin mapping drifted:${tool.providerId}`)
    if (tool.platformPackage !== null) {
      for (const platform of manifest.installPolicy.supportedPlatforms) {
        const packageName = platformPackageName(tool, platform)
        const platformEntry = lock.packages[`node_modules/${packageName}`]
        invariant(platformEntry && platformEntry.optional === true, `provider CLI lock lost optional platform package ${packageName}`)
        const [os, cpu] = platform.split('-')
        invariant(JSON.stringify(platformEntry.os) === JSON.stringify([os]) && JSON.stringify(platformEntry.cpu) === JSON.stringify([cpu]), `provider CLI platform package axes drifted:${packageName}`)
        invariant(Object.hasOwn(entry.optionalDependencies ?? {}, packageName), `provider CLI main package lost platform dependency ${packageName}`)
        const platformSpec = entry.optionalDependencies[packageName]
        validateDependencySpec(platformSpec, `${tool.packageName} optionalDependencies.${packageName}`)
        invariant(
          dependencySpecMatchesLockEntry(packageName, platformSpec, platformEntry),
          `provider CLI platform dependency does not bind its exact locked package:${packageName}`,
        )
      }
    }
  }

  const activePlan = deriveActivePackageContentPlan(manifest, lock)
  const activeLockPaths = new Set(activePlan.map(record => record.lockPath))
  for (const record of activePlan) {
    const entry = lock.packages[record.lockPath]
    for (const [dependencyName, spec] of Object.entries(entry.dependencies ?? {})) {
      invariant(/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(dependencyName), `provider CLI required dependency name is invalid:${record.lockPath}:${dependencyName}`)
      const dependencyLockPath = `node_modules/${dependencyName}`
      invariant(
        activeLockPaths.has(dependencyLockPath),
        `provider CLI required dependency escapes the content-authorized active closure:${record.lockPath}:${dependencyName}`,
      )
      const dependencyEntry = lock.packages[dependencyLockPath]
      invariant(
        dependencyEntry && dependencySpecMatchesLockEntry(dependencyName, spec, dependencyEntry),
        `provider CLI required dependency does not bind its exact locked package:${record.lockPath}:${dependencyName}`,
      )
    }
  }
  if (Object.hasOwn(manifest, 'packageContent')) {
    const expectedContent = new Map(activePlan.map(record => [record.lockPath, record.platforms]))
    invariant(
      manifest.packageContent.packages.length === expectedContent.size,
      'provider CLI package-content authority differs from the active main/platform package closure',
    )
    for (const record of manifest.packageContent.packages) {
      const expectedPlatforms = expectedContent.get(record.lockPath)
      invariant(expectedPlatforms, `provider CLI package-content authority contains an inactive package:${record.lockPath}`)
      invariant(
        JSON.stringify(record.platforms) === JSON.stringify(expectedPlatforms),
        `provider CLI package-content platform binding differs from the tool closure:${record.lockPath}`,
      )
      invariant(lock.packages[record.lockPath], `provider CLI package-content authority is absent from the lock:${record.lockPath}`)
    }
  } else {
    invariant(!requirePackageContent, 'provider CLI package-content authority is required')
  }
  return lock
}

function existingManifestCandidates(root) {
  return [AUTHORITY_MANIFEST_PATH, CONSUMER_MANIFEST_PATH]
    .map(path => ({ path, absolute: resolveContained(root, path, 'provider CLI manifest path') }))
    .map(candidate => ({ ...candidate, bytes: readRegularBytes(candidate.absolute, `provider CLI manifest ${candidate.path}`, { optional: true }) }))
    .filter(candidate => candidate.bytes !== null)
}

function resolveProviderCliToolchainAuthorityInternal(rootPath, { requirePackageContent }) {
  const root = realpathSync(resolve(rootPath))
  const manifests = existingManifestCandidates(root)
  invariant(manifests.length > 0, `provider CLI manifest is missing; expected ${AUTHORITY_MANIFEST_PATH} or ${CONSUMER_MANIFEST_PATH}`)
  if (manifests.length === 2) invariant(manifests[0].bytes.equals(manifests[1].bytes), 'authority and consumer provider CLI manifests differ')
  const selectedManifest = manifests.find(candidate => candidate.path === AUTHORITY_MANIFEST_PATH) ?? manifests[0]
  const manifest = validateToolchainManifest(
    parseJson(selectedManifest.bytes, 'provider CLI toolchain manifest'),
    { requirePackageContent },
  )

  const lockCandidates = [manifest.packageLock.path, manifest.packageLock.consumerPath]
    .map(path => ({ path, absolute: resolveContained(root, path, 'provider CLI package-lock path') }))
    .map(candidate => ({ ...candidate, bytes: readRegularBytes(candidate.absolute, `provider CLI package-lock ${candidate.path}`, { optional: true }) }))
    .filter(candidate => candidate.bytes !== null)
  invariant(lockCandidates.length > 0, 'provider CLI authority/consumer package-lock pair is missing')
  const requiredLockPath = selectedManifest.path === AUTHORITY_MANIFEST_PATH ? manifest.packageLock.path : manifest.packageLock.consumerPath
  invariant(lockCandidates.some(candidate => candidate.path === requiredLockPath), `provider CLI ${selectedManifest.path === AUTHORITY_MANIFEST_PATH ? 'authority' : 'consumer'} lock is missing:${requiredLockPath}`)
  if (lockCandidates.length === 2) invariant(lockCandidates[0].bytes.equals(lockCandidates[1].bytes), 'authority and consumer provider CLI package-lock bytes differ')
  const lockBytes = lockCandidates.find(candidate => candidate.path === requiredLockPath).bytes
  invariant(sha256(lockBytes) === manifest.packageLock.sha256, 'provider CLI package-lock digest differs from the manifest')
  const lock = validateToolchainLock(
    parseJson(lockBytes, 'provider CLI package-lock'),
    manifest,
    { requirePackageContent },
  )
  return Object.freeze({
    authorityDigest: sha256(selectedManifest.bytes),
    lockDigest: sha256(lockBytes),
    manifest,
    manifestBytes: Buffer.from(selectedManifest.bytes),
    manifestPath: selectedManifest.path,
    lock,
    lockBytes: Buffer.from(lockBytes),
    lockPath: requiredLockPath,
    role: selectedManifest.path === AUTHORITY_MANIFEST_PATH ? 'authority' : 'consumer',
    root,
  })
}

export function resolveProviderCliToolchainAuthority(rootPath = ROOT) {
  return resolveProviderCliToolchainAuthorityInternal(rootPath, { requirePackageContent: true })
}

export function resolveProviderCliToolchainCandidateAuthority(
  rootPath = ROOT,
  { requirePackageContent = false } = {},
) {
  invariant(typeof requirePackageContent === 'boolean', 'candidate package-content requirement must be boolean')
  return resolveProviderCliToolchainAuthorityInternal(rootPath, { requirePackageContent })
}

function ensureRealDirectory(path, label, { create = false } = {}) {
  if (create) mkdirSync(path, { recursive: true, mode: 0o755 })
  const info = lstatSync(path)
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} must be a real directory`)
  invariant(realpathSync(path) === path, `${label} must not traverse a symbolic-link alias`)
  assertTrustedPathAuthority(path, label)
  return path
}

function installedPackage(root, lock, lockPath, label) {
  const expected = lock.packages[lockPath]
  invariant(expected, `${label} is absent from the canonical lock`)
  const directory = resolve(root, lockPath)
  ensureRealDirectory(directory, `${label} directory`)
  const manifestPath = join(directory, 'package.json')
  const manifest = parseJson(readRegularBytes(manifestPath, `${label} package.json`), `${label} package.json`)
  const expectedName = expected.name ?? packageNameFromLockPath(lockPath)
  invariant(manifest.name === expectedName && manifest.version === expected.version, `${label} installed identity differs from the canonical lock`)
  return { directory, expected, manifest }
}

function installedExecutable(path, label, { executable = false } = {}) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be one regular no-link file`)
  invariant(realpathSync(path) === path, `${label} must not traverse a symbolic-link alias`)
  assertTrustedPathAuthority(path, label)
  if (executable) invariant((info.mode & 0o111) !== 0, `${label} is not executable`)
  return path
}

function readStableRegularBytes(path, label, { executable = false } = {}) {
  const before = lstatSync(path, { bigint: true })
  invariant(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, `${label} must be one regular no-link file`)
  invariant(realpathSync(path) === path, `${label} must not traverse a symbolic-link alias`)
  assertTrustedPathAuthority(path, label)
  if (executable) invariant((before.mode & 0o111n) !== 0n, `${label} is not executable`)
  let descriptor = null
  let opened
  let openedAfter
  let bytes
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    descriptor = openSync(path, fsConstants.O_RDONLY | noFollow)
    opened = fstatSync(descriptor, { bigint: true })
    invariant(
      opened.isFile()
        && opened.nlink === 1n
        && opened.dev === before.dev
        && opened.ino === before.ino
        && opened.mode === before.mode
        && opened.size === before.size,
      `${label} changed before read`,
    )
    bytes = readFileSync(descriptor)
    openedAfter = fstatSync(descriptor, { bigint: true })
  } finally {
    if (descriptor !== null) closeSync(descriptor)
  }
  const after = lstatSync(path, { bigint: true })
  invariant(
    BigInt(bytes.length) === before.size
      && openedAfter.isFile()
      && openedAfter.nlink === 1n
      && openedAfter.dev === opened.dev
      && openedAfter.ino === opened.ino
      && openedAfter.mode === opened.mode
      && openedAfter.size === opened.size
      && openedAfter.mtimeNs === opened.mtimeNs
      && openedAfter.ctimeNs === opened.ctimeNs
      && after.isFile()
      && !after.isSymbolicLink()
      && after.nlink === 1n
      && after.dev === before.dev
      && after.ino === before.ino
      && after.mode === before.mode
      && after.size === before.size
      && after.mtimeNs === before.mtimeNs
      && after.ctimeNs === before.ctimeNs,
    `${label} changed while reading`,
  )
  return bytes
}

function portablePackagePath(path, label) {
  portableRepoPath(path, label)
  invariant(Buffer.byteLength(path, 'utf8') === path.length && /^[\x20-\x7e]+$/.test(path), `${label} must contain ASCII only`)
  invariant(path === path.normalize('NFC'), `${label} must be NFC`)
  const parts = path.split('/')
  invariant(path.length <= MAX_PROVIDER_PACKAGE_PATH_BYTES, `${label} exceeds ${MAX_PROVIDER_PACKAGE_PATH_BYTES} bytes`)
  invariant(parts.length <= MAX_PROVIDER_PACKAGE_PATH_DEPTH, `${label} exceeds depth ${MAX_PROVIDER_PACKAGE_PATH_DEPTH}`)
  invariant(parts.every(part => part.length <= MAX_PROVIDER_PACKAGE_SEGMENT_BYTES), `${label} has a segment exceeding ${MAX_PROVIDER_PACKAGE_SEGMENT_BYTES} bytes`)
  return path
}

function recordPortablePackagePath(path, aliases, label) {
  portablePackagePath(path, label)
  const key = path.toLowerCase()
  invariant(!aliases.has(key), `${label} collides with portable alias:${aliases.get(key) ?? path}:${path}`)
  aliases.set(key, path)
  invariant(aliases.size <= MAX_PROVIDER_PACKAGE_ENTRY_COUNT, `${label} exceeds ${MAX_PROVIDER_PACKAGE_ENTRY_COUNT} entries`)
}

function canonicalPackageContent(lockPath, entries) {
  portableRepoPath(lockPath, 'provider CLI package-content lockPath')
  invariant(entries.length <= MAX_PROVIDER_PACKAGE_ENTRY_COUNT, `provider CLI package entries exceed ${MAX_PROVIDER_PACKAGE_ENTRY_COUNT}:${lockPath}`)
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  let fileCount = 0
  let totalBytes = 0
  for (const entry of entries) {
    if (entry.type !== 'file') continue
    fileCount += 1
    totalBytes += entry.size
    invariant(fileCount <= MAX_PROVIDER_PACKAGE_FILE_COUNT, `provider CLI package file count exceeds ${MAX_PROVIDER_PACKAGE_FILE_COUNT}:${lockPath}`)
    invariant(Number.isSafeInteger(totalBytes) && totalBytes <= MAX_PROVIDER_PACKAGE_EXPANDED_BYTES, `provider CLI package bytes exceed ${MAX_PROVIDER_PACKAGE_EXPANDED_BYTES}:${lockPath}`)
  }
  invariant(fileCount > 0 && totalBytes > 0, `provider CLI package content is empty:${lockPath}`)
  const binding = {
    entries,
    lockPath,
    modePolicy: PACKAGE_CONTENT_MODE_POLICY,
    protocol: PACKAGE_CONTENT_PROTOCOL,
  }
  return Object.freeze({
    fileCount,
    lockPath,
    totalBytes,
    treeSha256: sha256(Buffer.from(`${PACKAGE_CONTENT_DIGEST_DOMAIN}\0${JSON.stringify(binding)}`, 'utf8')),
  })
}

function tarAsciiField(header, offset, length, label) {
  const field = header.subarray(offset, offset + length)
  const zero = field.indexOf(0)
  const used = zero < 0 ? field : field.subarray(0, zero)
  if (zero >= 0) invariant(field.subarray(zero).every(byte => byte === 0), `${label} has nonzero bytes after NUL`)
  invariant(used.every(byte => byte >= 0x20 && byte <= 0x7e), `${label} must contain ASCII only`)
  return used.toString('ascii')
}

function tarOctalField(header, offset, length, label) {
  const field = header.subarray(offset, offset + length)
  invariant((field[0] & 0x80) === 0, `${label} may not use base-256 encoding`)
  const text = field.toString('ascii').replace(/[\0 ]+$/g, '').replace(/^ +/g, '')
  invariant(/^[0-7]+$/.test(text), `${label} is not canonical octal`)
  const value = Number.parseInt(text, 8)
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} exceeds the safe integer range`)
  return value
}

function assertTarChecksum(header, index) {
  const expected = tarOctalField(header, 148, 8, `provider CLI tar header ${index} checksum`)
  let actual = 0
  for (let offset = 0; offset < header.length; offset += 1) {
    actual += offset >= 148 && offset < 156 ? 0x20 : header[offset]
  }
  invariant(actual === expected, `provider CLI tar header ${index} checksum differs`)
}

function tarPackagePath(header, index) {
  const name = tarAsciiField(header, 0, 100, `provider CLI tar header ${index} name`)
  const prefix = tarAsciiField(header, 345, 155, `provider CLI tar header ${index} prefix`)
  const archivePath = prefix ? `${prefix}/${name}` : name
  invariant(archivePath === 'package' || archivePath.startsWith('package/'), `provider CLI tar entry is outside package/:${archivePath}`)
  const path = archivePath === 'package' ? '' : archivePath.slice('package/'.length).replace(/\/+$/g, '')
  if (path) portablePackagePath(path, `provider CLI tar entry ${index}`)
  return path
}

export function deriveLockedPackageContentFromTarball(tarballBytes, lockRecord) {
  invariant(Buffer.isBuffer(tarballBytes) || tarballBytes instanceof Uint8Array, 'provider CLI package tarball must be bytes')
  invariant(lockRecord && typeof lockRecord === 'object' && !Array.isArray(lockRecord), 'provider CLI package tarball lock record is invalid')
  const bytes = Buffer.from(tarballBytes)
  const lockPath = portableRepoPath(lockRecord.lockPath, 'provider CLI package tarball lockPath')
  invariant(lockPath.startsWith('node_modules/'), 'provider CLI package tarball lockPath must target node_modules')
  validateIntegrity(lockRecord.integrity, `provider CLI package tarball ${lockPath}`)
  invariant(bytes.length > 0 && bytes.length <= MAX_PROVIDER_PACKAGE_COMPRESSED_BYTES, `provider CLI package tarball compressed bytes exceed ${MAX_PROVIDER_PACKAGE_COMPRESSED_BYTES}:${lockPath}`)
  invariant(sha512Integrity(bytes) === lockRecord.integrity, `provider CLI package tarball SHA-512 differs from the exact lock:${lockPath}`)

  let archive
  try {
    archive = gunzipSync(bytes, { maxOutputLength: MAX_PROVIDER_PACKAGE_EXPANDED_BYTES })
  } catch (error) {
    throw new Error(`${ERROR_PREFIX}:provider CLI package tarball gzip is invalid or exceeds ${MAX_PROVIDER_PACKAGE_EXPANDED_BYTES}:${lockPath}:${error.message}`, { cause: error })
  }
  invariant(archive.length > 0 && archive.length % 512 === 0, `provider CLI package tar archive has an invalid block length:${lockPath}`)

  const aliases = new Map()
  const entriesByPath = new Map()
  const explicitPaths = new Set()
  const addDirectory = (path) => {
    if (!path) return
    const existing = entriesByPath.get(path)
    invariant(!existing || existing.type === 'directory', `provider CLI tar file/directory collision:${lockPath}:${path}`)
    if (!existing) {
      recordPortablePackagePath(path, aliases, `provider CLI tar path ${lockPath}`)
      entriesByPath.set(path, { path, type: 'directory' })
    }
  }
  const addParents = (path) => {
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index += 1) addDirectory(parts.slice(0, index).join('/'))
  }

  let offset = 0
  let headerIndex = 0
  let endMarkers = 0
  while (offset < archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) {
      endMarkers += 1
      offset += 512
      if (endMarkers >= 2) {
        invariant(archive.subarray(offset).every(byte => byte === 0), `provider CLI tar has a concatenated or nonzero tail:${lockPath}`)
        offset = archive.length
      }
      continue
    }
    invariant(endMarkers === 0, `provider CLI tar has data after an end marker:${lockPath}`)
    headerIndex += 1
    invariant(headerIndex <= MAX_PROVIDER_PACKAGE_ENTRY_COUNT, `provider CLI tar entries exceed ${MAX_PROVIDER_PACKAGE_ENTRY_COUNT}:${lockPath}`)
    assertTarChecksum(header, headerIndex)
    invariant(header.subarray(257, 263).equals(Buffer.from('ustar\0')) && header.subarray(263, 265).equals(Buffer.from('00')), `provider CLI tar header is not strict ustar:${lockPath}:${headerIndex}`)
    const typeByte = header[156]
    const type = typeByte === 0 || typeByte === 0x30 ? 'file' : typeByte === 0x35 ? 'directory' : 'unsupported'
    invariant(type !== 'unsupported', `provider CLI tar contains a link, special, PAX, or extension entry:${lockPath}:${headerIndex}:${String.fromCharCode(typeByte || 0)}`)
    const path = tarPackagePath(header, headerIndex)
    const size = tarOctalField(header, 124, 12, `provider CLI tar header ${headerIndex} size`)
    invariant(size <= MAX_PROVIDER_PACKAGE_FILE_BYTES, `provider CLI tar entry exceeds ${MAX_PROVIDER_PACKAGE_FILE_BYTES}:${lockPath}:${path}`)
    invariant(type !== 'directory' || size === 0, `provider CLI tar directory has content bytes:${lockPath}:${path}`)
    invariant(!explicitPaths.has(path), `provider CLI tar contains a duplicate path:${lockPath}:${path || '.'}`)
    explicitPaths.add(path)
    if (!path) invariant(type === 'directory' && size === 0, `provider CLI tar package root entry must be an empty directory:${lockPath}`)
    if (path) {
      addParents(path)
      if (type === 'directory') addDirectory(path)
      else {
        invariant(!entriesByPath.has(path), `provider CLI tar file/directory collision:${lockPath}:${path}`)
        recordPortablePackagePath(path, aliases, `provider CLI tar path ${lockPath}`)
        const bodyStart = offset + 512
        const bodyEnd = bodyStart + size
        invariant(bodyEnd <= archive.length, `provider CLI tar entry exceeds archive bounds:${lockPath}:${path}`)
        const body = archive.subarray(bodyStart, bodyEnd)
        entriesByPath.set(path, { path, sha256: sha256(body), size, type: 'file' })
      }
    }
    const paddedSize = Math.ceil(size / 512) * 512
    const padding = archive.subarray(offset + 512 + size, offset + 512 + paddedSize)
    invariant(padding.every(byte => byte === 0), `provider CLI tar entry padding is nonzero:${lockPath}:${path}`)
    offset += 512 + paddedSize
  }
  invariant(endMarkers >= 2, `provider CLI tar lacks two end markers:${lockPath}`)
  return canonicalPackageContent(lockPath, [...entriesByPath.values()])
}

function deriveInstalledPackageContent(directory, lockPath) {
  const root = realpathSync(resolve(directory))
  invariant(root === resolve(directory), `provider CLI installed package root traverses a symbolic-link alias:${lockPath}`)
  const rootInfo = lstatSync(root, { bigint: true })
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), `provider CLI installed package root is not one real directory:${lockPath}`)
  assertTrustedPathAuthority(root, `provider CLI installed package root ${lockPath}`)
  const aliases = new Map()
  const entries = []

  const visit = (current) => {
    const before = lstatSync(current, { bigint: true })
    invariant(before.isDirectory() && !before.isSymbolicLink() && realpathSync(current) === current, `provider CLI package directory is unsafe:${lockPath}:${relative(root, current) || '.'}`)
    validateProviderCliFilesystemAuthority(before, {
      label: `provider CLI package directory authority:${lockPath}:${relative(root, current) || '.'}`,
    })
    const names = readdirSync(current).sort()
    for (const name of names) {
      const absolute = join(current, name)
      const path = relative(root, absolute).split(sep).join('/')
      recordPortablePackagePath(path, aliases, `provider CLI installed package path ${lockPath}`)
      const entryBefore = lstatSync(absolute, { bigint: true })
      if (entryBefore.isDirectory() && !entryBefore.isSymbolicLink()) {
        validateProviderCliFilesystemAuthority(entryBefore, {
          label: `provider CLI package directory authority:${lockPath}:${path}`,
        })
        invariant(realpathSync(absolute) === absolute, `provider CLI package directory traverses a symbolic-link alias:${lockPath}:${path}`)
        entries.push({ path, type: 'directory' })
        visit(absolute)
        continue
      }
      invariant(entryBefore.isFile() && !entryBefore.isSymbolicLink(), `provider CLI package contains a link or unsupported filesystem entry:${lockPath}:${path}`)
      validateProviderCliFilesystemAuthority(entryBefore, {
        label: `provider CLI package file authority:${lockPath}:${path}`,
      })
      invariant(entryBefore.nlink === 1n, `provider CLI package file must have exactly one link:${lockPath}:${path}`)
      invariant(entryBefore.size <= BigInt(MAX_PROVIDER_PACKAGE_FILE_BYTES), `provider CLI package file exceeds ${MAX_PROVIDER_PACKAGE_FILE_BYTES}:${lockPath}:${path}`)
      invariant(realpathSync(absolute) === absolute, `provider CLI package file traverses a symbolic-link alias:${lockPath}:${path}`)
      let descriptor = null
      let opened
      let openedAfter
      let bytes
      try {
        const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
        descriptor = openSync(absolute, fsConstants.O_RDONLY | noFollow)
        opened = fstatSync(descriptor, { bigint: true })
        invariant(opened.isFile() && opened.nlink === 1n && opened.dev === entryBefore.dev && opened.ino === entryBefore.ino && opened.size === entryBefore.size, `provider CLI package file changed before read:${lockPath}:${path}`)
        bytes = readFileSync(descriptor)
        openedAfter = fstatSync(descriptor, { bigint: true })
      } finally {
        if (descriptor !== null) closeSync(descriptor)
      }
      const entryAfter = lstatSync(absolute, { bigint: true })
      invariant(
        bytes.length === Number(entryBefore.size)
          && openedAfter.isFile()
          && openedAfter.nlink === 1n
          && openedAfter.dev === opened.dev
          && openedAfter.ino === opened.ino
          && openedAfter.mode === opened.mode
          && openedAfter.size === opened.size
          && openedAfter.mtimeNs === opened.mtimeNs
          && openedAfter.ctimeNs === opened.ctimeNs
          && entryAfter.isFile()
          && !entryAfter.isSymbolicLink()
          && entryAfter.nlink === 1n
          && entryAfter.dev === entryBefore.dev
          && entryAfter.ino === entryBefore.ino
          && entryAfter.mode === entryBefore.mode
          && entryAfter.size === entryBefore.size
          && entryAfter.mtimeNs === entryBefore.mtimeNs
          && entryAfter.ctimeNs === entryBefore.ctimeNs,
        `provider CLI package file changed while hashing:${lockPath}:${path}`,
      )
      entries.push({ path, sha256: sha256(bytes), size: bytes.length, type: 'file' })
    }
    const namesAfter = readdirSync(current).sort()
    const after = lstatSync(current, { bigint: true })
    invariant(
      after.isDirectory()
        && !after.isSymbolicLink()
        && after.dev === before.dev
        && after.ino === before.ino
        && after.mode === before.mode
        && after.mtimeNs === before.mtimeNs
        && after.ctimeNs === before.ctimeNs
        && JSON.stringify(namesAfter) === JSON.stringify(names),
      `provider CLI package directory changed while hashing:${lockPath}:${relative(root, current).split(sep).join('/') || '.'}`,
    )
  }
  visit(root)
  return canonicalPackageContent(lockPath, entries)
}

function platformKey(platform, arch) {
  invariant(['darwin', 'linux'].includes(platform), `unsupported provider CLI platform:${String(platform)}`)
  invariant(['arm64', 'x64'].includes(arch), `unsupported provider CLI architecture:${String(arch)}`)
  return `${platform}-${arch}`
}

function detectLinuxLibc() {
  const value = process.report?.getReport?.()?.header?.glibcVersionRuntime
  return typeof value === 'string' && value.length > 0 ? 'glibc' : 'musl-or-unknown'
}

function activePackageContentRecords(authority, platformId) {
  const records = authority.manifest.packageContent.packages
    .filter(record => record.platforms.includes(platformId))
  const expectedCount = authority.manifest.tools.reduce(
    (count, tool) => count + (tool.platformPackage === null ? 1 : 2),
    0,
  )
  invariant(records.length === expectedCount, `provider CLI active package-content closure is incomplete:${platformId}`)
  return records
}

function activePackageContentDigest(authority, platformId) {
  const binding = {
    packages: activePackageContentRecords(authority, platformId).map(record => ({
      fileCount: record.fileCount,
      lockPath: record.lockPath,
      totalBytes: record.totalBytes,
      treeSha256: record.treeSha256,
    })),
    platform: platformId,
    protocol: authority.manifest.packageContent.protocol,
  }
  return sha256(Buffer.from(`${ACTIVE_PACKAGE_CONTENT_BINDING_DOMAIN}\0${JSON.stringify(binding)}`, 'utf8'))
}

function stagingProjectManifest(authority) {
  const root = authority.lock.packages['']
  return {
    name: root.name,
    version: root.version,
    private: true,
    dependencies: root.dependencies,
  }
}

function assertRuntimeScaffold(target, authority) {
  const expectedNames = ['.npmrc', 'node_modules', 'package-lock.json', 'package.json']
  const names = readdirSync(target).sort()
  invariant(JSON.stringify(names) === JSON.stringify(expectedNames), 'provider CLI runtime root inventory is not closed')
  const packageBytes = Buffer.from(`${JSON.stringify(stagingProjectManifest(authority), null, 2)}\n`, 'utf8')
  invariant(readRegularBytes(join(target, 'package.json'), 'installed provider CLI root package.json').equals(packageBytes), 'installed provider CLI root package.json differs from authority')
  invariant(readRegularBytes(join(target, '.npmrc'), 'installed provider CLI root .npmrc').equals(Buffer.from('ignore-scripts=true\nstrict-ssl=true\nalways-auth=false\n')), 'installed provider CLI root .npmrc differs from authority')
}

function assertClosedInstalledPackageInventory(target, records) {
  const modules = join(target, 'node_modules')
  ensureRealDirectory(modules, 'provider CLI installed node_modules')
  const expected = records.map(record => record.lockPath).sort()
  const actual = []
  const aliases = new Map()
  for (const scope of readdirSync(modules).sort()) {
    recordPortablePackagePath(scope, aliases, 'provider CLI installed package scope')
    invariant(scope.startsWith('@'), `provider CLI installed node_modules contains unsupported metadata or package:${scope}`)
    const scopeRoot = join(modules, scope)
    ensureRealDirectory(scopeRoot, `provider CLI installed package scope ${scope}`)
    for (const name of readdirSync(scopeRoot).sort()) {
      const lockPath = `node_modules/${scope}/${name}`
      recordPortablePackagePath(`${scope}/${name}`, aliases, 'provider CLI installed package inventory')
      ensureRealDirectory(join(scopeRoot, name), `provider CLI installed package ${lockPath}`)
      actual.push(lockPath)
    }
  }
  actual.sort()
  invariant(
    JSON.stringify(actual) === JSON.stringify(expected),
    `provider CLI installed package inventory differs from authority:${actual.join(',')}`,
  )
}

function assertInstalledPackageContent(target, records) {
  for (const expected of records) {
    const actual = deriveInstalledPackageContent(join(target, expected.lockPath), expected.lockPath)
    invariant(
      actual.treeSha256 === expected.treeSha256
        && actual.fileCount === expected.fileCount
        && actual.totalBytes === expected.totalBytes,
      `provider CLI installed package content differs from authority:${expected.lockPath}`,
    )
  }
}

function inspectInstalledRuntime(target, authority, { platform, arch, libc }) {
  ensureRealDirectory(target, 'provider CLI runtime')
  assertRuntimeScaffold(target, authority)
  const installedLock = readRegularBytes(join(target, 'package-lock.json'), 'installed provider CLI package-lock')
  invariant(installedLock.equals(authority.lockBytes), 'installed provider CLI package-lock differs from canonical authority')
  const key = platformKey(platform, arch)
  invariant(authority.manifest.installPolicy.supportedPlatforms.includes(key), `provider CLI platform is not registered:${key}`)
  if (platform === 'linux') invariant(libc === 'glibc', `provider CLI Linux runtime requires glibc; received ${String(libc)}`)
  const activeRecords = activePackageContentRecords(authority, key)
  assertClosedInstalledPackageInventory(target, activeRecords)
  assertInstalledPackageContent(target, activeRecords)

  const runtime = {}
  for (const tool of authority.manifest.tools) {
    const main = installedPackage(target, authority.lock, `node_modules/${tool.packageName}`, `${tool.providerId} main package`)
    let platformPackage = null
    if (tool.platformPackage !== null) {
      const packageName = platformPackageName(tool, key)
      platformPackage = installedPackage(target, authority.lock, `node_modules/${packageName}`, `${tool.providerId} platform package`)
    }
    const targetPath = tool.binKind === 'platform-native'
      ? join(platformPackage.directory, ...tool.platformPackage.executablePath.split('/'))
      : join(main.directory, ...tool.packageBin.split('/'))
    const executable = installedExecutable(targetPath, `${tool.providerId} locked executable`, { executable: true })
    runtime[tool.executable] = Object.freeze({
      command: tool.binKind === 'node-entrypoint' ? process.execPath : executable,
      argsPrefix: tool.binKind === 'node-entrypoint' ? [executable] : [],
      target: executable,
      tool,
    })
  }
  return Object.freeze(runtime)
}

function runVersionProbe(command, args, { root, environment, runner, label, expectedVersion }) {
  const result = runner(command, args, {
    cwd: root,
    env: environment,
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: VERSION_TIMEOUT_MS,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(result?.status === 0, `${label} --version failed with exit ${String(result?.status)}`)
  const output = `${String(result.stdout || '')}\n${String(result.stderr || '')}`
  const escaped = expectedVersion.replaceAll('.', '\\.')
  invariant(new RegExp(`(^|[^0-9A-Za-z])${escaped}(?=$|[^0-9A-Za-z.-])`).test(output), `${label} --version did not report exact token ${expectedVersion}`)
  return output.trim()
}

function probeDirectRuntime(runtime, { root, environment, runner }) {
  const versions = {}
  for (const [name, capability] of Object.entries(runtime)) {
    versions[name] = runVersionProbe(
      capability.command,
      [...capability.argsPrefix, '--version'],
      { root, environment, runner, label: capability.tool.providerId, expectedVersion: capability.tool.version },
    )
  }
  return versions
}

function shimSource(executable, relativeTarget) {
  // Dynamic imports keep the generated program valid in both CommonJS and ESM package scopes,
  // without trusting the consumer's package.json `type`. The verifier rehashes the
  // authority-selected package trees on every invocation before any provider byte executes.
  return `#!/usr/bin/env node
Promise.all([import('node:child_process'), import('node:path'), import('node:url')]).then(async ([child, path, url]) => {
  const modules = path.resolve(path.dirname(process.argv[1]), '..')
  const root = path.resolve(modules, '..')
  const expectedExecutable = path.resolve(modules, ${JSON.stringify(relativeTarget)})
  const verifierUrl = url.pathToFileURL(path.join(root, 'scripts/setup-provider-cli-toolchain.mjs')).href
  const verifier = await import(verifierUrl)
  const capability = verifier.verifyProviderCliRuntimeForShim({
    executable: ${JSON.stringify(executable)},
    expectedExecutable,
    rootPath: root,
  })
  const result = child.spawnSync(capability.command, [...capability.argsPrefix, ...process.argv.slice(2)], { cwd: process.cwd(), env: process.env, shell: false, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.signal) process.kill(process.pid, result.signal)
  process.exit(Number.isInteger(result.status) ? result.status : 1)
}).catch(error => { console.error(error.message); process.exit(1) })
`
}

function expectedShimBytes(authority, runtime) {
  const modulesRoot = resolve(authority.root, 'node_modules')
  const values = {}
  for (const [name, capability] of Object.entries(runtime)) {
    const relativeTarget = relative(modulesRoot, capability.target).split(sep).join('/')
    invariant(relativeTarget && !relativeTarget.startsWith('../') && !isAbsolute(relativeTarget), `provider CLI ${name} shim target escapes node_modules`)
    values[name] = Buffer.from(shimSource(name, relativeTarget), 'utf8')
  }
  return values
}

function atomicRegularExecutable(path, bytes) {
  assertTrustedPathAuthority(path, 'provider CLI shim replacement ancestor', { includeEntry: false })
  let currentInfo = null
  try {
    currentInfo = lstatSync(path)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  if (currentInfo?.isFile() && !currentInfo.isSymbolicLink() && currentInfo.nlink === 1) {
    invariant(realpathSync(path) === path, `provider CLI shim must not traverse a symbolic-link alias:${path}`)
    validateProviderCliFilesystemAuthority(currentInfo, { label: `provider CLI shim authority ${path}` })
    const current = readFileSync(path)
    if (current.equals(bytes)) {
      invariant((currentInfo.mode & 0o111) !== 0, `provider CLI shim is not executable:${path}`)
      return false
    }
  }
  invariant(
    currentInfo === null || currentInfo.isFile() || currentInfo.isSymbolicLink(),
    `provider CLI shim target must be absent, a regular file, or a symbolic link:${path}`,
  )
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`
  let descriptor = null
  try {
    descriptor = openSync(temporary, 'wx', 0o755)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    chmodSync(temporary, 0o755)
    renameSync(temporary, path)
    const installed = readRegularBytes(path, `provider CLI shim ${path}`)
    invariant(installed.equals(bytes), `provider CLI shim atomic readback failed:${path}`)
    invariant((lstatSync(path).mode & 0o111) !== 0, `provider CLI shim readback is not executable:${path}`)
    return true
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    try { unlinkSync(temporary) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
}

function installOrCheckShims(authority, target, runtime, { check }) {
  const shimDirectory = resolveContained(authority.root, authority.manifest.installPolicy.shimDirectory, 'provider CLI shim directory')
  ensureRealDirectory(shimDirectory, 'provider CLI shim directory', { create: !check })
  const expected = expectedShimBytes(authority, runtime)
  const paths = {}
  for (const tool of authority.manifest.tools) {
    const path = join(shimDirectory, tool.executable)
    const bytes = expected[tool.executable]
    if (check) {
      const actual = readStableRegularBytes(path, `provider CLI ${tool.executable} shim`, { executable: true })
      invariant(actual.equals(bytes), `provider CLI ${tool.executable} shim differs from authority`)
    } else atomicRegularExecutable(path, bytes)
    paths[tool.executable] = path
  }
  return paths
}

function probeShims(authority, shimPaths, { environment, runner }) {
  const versions = {}
  for (const tool of authority.manifest.tools) {
    versions[tool.executable] = runVersionProbe(
      process.execPath,
      [shimPaths[tool.executable], '--version'],
      { root: authority.root, environment, runner, label: `${tool.providerId} controlled shim`, expectedVersion: tool.version },
    )
  }
  return versions
}

function writeStagingProject(staging, authority) {
  const manifest = stagingProjectManifest(authority)
  writeFileSync(join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  writeFileSync(join(staging, 'package-lock.json'), authority.lockBytes, { flag: 'wx', mode: 0o600 })
  writeFileSync(join(staging, '.npmrc'), 'ignore-scripts=true\nstrict-ssl=true\nalways-auth=false\n', { flag: 'wx', mode: 0o600 })
}

function removeNpmGeneratedRuntimeMetadata(staging) {
  rmSync(join(staging, 'node_modules/.bin'), { recursive: true, force: true })
  try {
    unlinkSync(join(staging, 'node_modules/.package-lock.json'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

function targetPath(authority, platformId) {
  invariant(/^(?:darwin|linux)-(?:arm64|x64)$/.test(platformId), `provider CLI runtime address platform is invalid:${platformId}`)
  invariant(SHA256.test(authority.authorityDigest), 'provider CLI runtime address authority digest is invalid')
  const base = resolveContained(authority.root, authority.manifest.installPolicy.runtimeDirectory, 'provider CLI runtime directory')
  const protocolBase = join(base, RUNTIME_CONTENT_TARGET_PROTOCOL)
  const platformBase = join(protocolBase, platformId)
  return {
    base,
    platformBase,
    protocolBase,
    target: join(platformBase, authority.authorityDigest),
  }
}

export function verifyProviderCliRuntimeForShim({
  rootPath = ROOT,
  executable,
  expectedExecutable,
  platform = process.platform,
  arch = process.arch,
  libc = platform === 'linux' ? detectLinuxLibc() : null,
} = {}) {
  invariant(typeof executable === 'string' && /^[a-z][a-z0-9-]+$/.test(executable), 'provider CLI shim executable identity is invalid')
  invariant(typeof expectedExecutable === 'string' && isAbsolute(expectedExecutable), 'provider CLI shim expected executable path is invalid')
  const authority = resolveProviderCliToolchainAuthority(rootPath)
  const platformId = platformKey(platform, arch)
  invariant(authority.manifest.installPolicy.supportedPlatforms.includes(platformId), `provider CLI shim platform is not supported:${platformId}`)
  if (platform === 'linux') invariant(libc === 'glibc', `provider CLI Linux runtime requires glibc; received ${String(libc)}`)
  const { target } = targetPath(authority, platformId)
  invariant(existingRuntime(target), `provider CLI toolchain is not installed:${target}`)
  const runtime = inspectInstalledRuntime(target, authority, { platform, arch, libc })
  const capability = runtime[executable]
  invariant(capability, `provider CLI shim executable is not registered:${executable}`)
  invariant(capability.target === resolve(expectedExecutable), `provider CLI shim target differs from authority:${executable}`)
  // A non-cooperative process with the same uid can race any pathname-based check. That hostile-host
  // condition is outside repository authority; protected hooks-off CI never treats provider CLI or
  // model output as its hard gate. This verifier closes persisted accidental/stale mutation.
  return Object.freeze({
    argsPrefix: Object.freeze([...capability.argsPrefix]),
    command: capability.command,
    target: capability.target,
  })
}

export function verifyProviderCliRuntimeForCertification({
  rootPath = ROOT,
  executable,
  platform = process.platform,
  arch = process.arch,
  libc = platform === 'linux' ? detectLinuxLibc() : null,
  ...unsupported
} = {}) {
  invariant(Object.keys(unsupported).length === 0, `provider CLI certification options are unsupported:${Object.keys(unsupported).sort().join(',')}`)
  invariant(typeof executable === 'string' && /^[a-z][a-z0-9-]+$/.test(executable), 'provider CLI certification executable identity is invalid')
  const authority = resolveProviderCliToolchainAuthority(rootPath)
  const { platformId, target, runtime } = verifyStaticResolvedAuthority(authority, { platform, arch, libc })
  const capability = runtime[executable]
  invariant(capability, `provider CLI certification executable is not registered:${executable}`)

  const expectedShim = expectedShimBytes(authority, runtime)[executable]
  const shimDirectory = resolveContained(authority.root, authority.manifest.installPolicy.shimDirectory, 'provider CLI certification shim directory')
  ensureRealDirectory(shimDirectory, 'provider CLI certification shim directory')
  const shimPath = join(shimDirectory, executable)
  const actualShim = readStableRegularBytes(shimPath, `provider CLI certification shim ${executable}`, { executable: true })
  invariant(actualShim.equals(expectedShim), `provider CLI certification shim differs from authority:${executable}`)
  const targetBytes = readStableRegularBytes(capability.target, `provider CLI certification target ${executable}`, { executable: true })
  const shimRelative = relative(authority.root, shimPath).split(sep).join('/')
  const targetRelative = relative(authority.root, capability.target).split(sep).join('/')
  portableRepoPath(shimRelative, `provider CLI certification shim path ${executable}`)
  portableRepoPath(targetRelative, `provider CLI certification target path ${executable}`)

  const binding = Object.freeze({
    activePackageContentDigest: activePackageContentDigest(authority, platformId),
    authorityDigest: authority.authorityDigest,
    executable,
    lockDigest: authority.lockDigest,
    packageContentProtocol: authority.manifest.packageContent.protocol,
    platform: platformId,
    shimPath: shimRelative,
    shimSha256: sha256(actualShim),
    targetPath: targetRelative,
    targetSha256: sha256(targetBytes),
  })
  return Object.freeze({
    argsPrefix: Object.freeze([shimPath]),
    binding,
    command: process.execPath,
    target: capability.target,
  })
}

function existingRuntime(target) {
  try {
    const info = lstatSync(target)
    invariant(info.isDirectory() && !info.isSymbolicLink() && realpathSync(target) === target, 'provider CLI digest target is not one real directory')
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function staticVerificationResult(authority, target, runtime, platformId) {
  installOrCheckShims(authority, target, runtime, { check: true })
  return Object.freeze({
    authorityDigest: authority.authorityDigest,
    executablesProbed: false,
    lockDigest: authority.lockDigest,
    platform: platformId,
    role: authority.role,
    staticVerified: true,
    status: 'static-verified',
    target,
    versions: null,
  })
}

function verifyStaticResolvedAuthority(authority, { platform, arch, libc }) {
  const platformId = platformKey(platform, arch)
  invariant(authority.manifest.installPolicy.supportedPlatforms.includes(platformId), `provider CLI static verification platform is not supported:${platformId}`)
  if (platform === 'linux') invariant(libc === 'glibc', `provider CLI Linux runtime requires glibc; received ${String(libc)}`)
  const { target } = targetPath(authority, platformId)
  invariant(existingRuntime(target), `provider CLI toolchain is not installed:${target}`)
  const runtime = inspectInstalledRuntime(target, authority, { platform, arch, libc })
  const result = staticVerificationResult(authority, target, runtime, platformId)
  return { platformId, result, runtime, target }
}

export function verifyProviderCliToolchainStatic({
  root: rootPath = ROOT,
  platform = process.platform,
  arch = process.arch,
  libc = platform === 'linux' ? detectLinuxLibc() : null,
  ...unsupported
} = {}) {
  invariant(Object.keys(unsupported).length === 0, `provider CLI static verification options are unsupported:${Object.keys(unsupported).sort().join(',')}`)
  const authority = resolveProviderCliToolchainAuthority(rootPath)
  return verifyStaticResolvedAuthority(authority, { platform, arch, libc }).result
}

export async function setupProviderCliToolchain({
  root: rootPath = ROOT,
  check = false,
  probeExecutables = true,
  platform = process.platform,
  arch = process.arch,
  libc = platform === 'linux' ? detectLinuxLibc() : null,
  baseEnvironment = process.env,
  runner = spawnSync,
  runtimeFactory = prepareVerifiedExactNpmRuntime,
} = {}) {
  invariant(typeof check === 'boolean', 'provider CLI check option must be boolean')
  invariant(typeof probeExecutables === 'boolean', 'provider CLI executable-probe option must be boolean')
  const authority = resolveProviderCliToolchainAuthority(rootPath)
  const platformId = platformKey(platform, arch)
  invariant(authority.manifest.installPolicy.supportedPlatforms.includes(platformId), `provider CLI platform is not supported:${platformId}`)
  if (platform === 'linux') invariant(libc === 'glibc', `provider CLI Linux runtime requires glibc; received ${String(libc)}`)
  const callerWorktree = captureGitVisibleWorktree(authority.root)
  const expectedNpm = resolveExactNpmRuntimeContract(authority.root)
  invariant(expectedNpm.version === GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION, `caller lock must bind npm ${GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION}`)
  const isolated = createIsolatedGovernanceNpmEnvironment(baseEnvironment, { errorPrefix: ERROR_PREFIX })
  const { base, platformBase, protocolBase, target } = targetPath(authority, platformId)
  let staging = null
  let npmRuntime = null
  try {
    const environment = isolated.env
    if (existingRuntime(target)) {
      const runtime = inspectInstalledRuntime(target, authority, { platform, arch, libc })
      const shimPaths = installOrCheckShims(authority, target, runtime, { check })
      const versions = probeExecutables ? probeShims(authority, shimPaths, { environment, runner }) : null
      const staticResult = staticVerificationResult(authority, target, runtime, platformId)
      assertGitVisibleWorktreeUnchanged(authority.root, callerWorktree, { label: 'provider CLI idempotent readback' })
      return Object.freeze({
        ...staticResult,
        executablesProbed: probeExecutables,
        status: 'ready',
        versions,
      })
    }
    invariant(!check, `provider CLI toolchain is not installed:${target}`)

    const modules = resolve(authority.root, 'node_modules')
    ensureRealDirectory(modules, 'caller node_modules', { create: true })
    ensureRealDirectory(base, 'provider CLI runtime base', { create: true })
    ensureRealDirectory(protocolBase, 'provider CLI runtime protocol base', { create: true })
    ensureRealDirectory(platformBase, 'provider CLI runtime platform base', { create: true })
    staging = mkdtempSync(join(platformBase, '.stage-'))
    ensureRealDirectory(staging, 'provider CLI staging directory')
    writeStagingProject(staging, authority)

    npmRuntime = await runtimeFactory({ repositoryRoot: authority.root, env: environment, runner })
    assertVerifiedExactNpmRuntimeCapability(npmRuntime, expectedNpm)
    assertGitVisibleWorktreeUnchanged(authority.root, callerWorktree, { label: 'provider CLI exact npm materialization' })
    const npmSteps = [
      { args: ['ci', '--ignore-scripts', '--no-bin-links', '--legacy-peer-deps', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`], timeoutMs: INSTALL_TIMEOUT_MS },
      { args: ['audit', 'signatures', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`], timeoutMs: AUDIT_TIMEOUT_MS },
      { args: ['audit', '--audit-level=high', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`], timeoutMs: AUDIT_TIMEOUT_MS },
    ]
    for (const [index, step] of npmSteps.entries()) {
      runClosedBootstrapStep(process.execPath, [npmRuntime.cli, ...step.args], {
        root: staging,
        environment,
        runner,
        errorPrefix: ERROR_PREFIX,
        timeoutMs: step.timeoutMs,
      })
      invariant(readRegularBytes(join(staging, 'package-lock.json'), 'staged provider CLI package-lock').equals(authority.lockBytes), 'provider CLI npm stage mutated the canonical lock copy')
      assertGitVisibleWorktreeUnchanged(authority.root, callerWorktree, { label: `provider CLI npm stage ${index + 1}` })
    }

    removeNpmGeneratedRuntimeMetadata(staging)
    const stagedRuntime = inspectInstalledRuntime(staging, authority, { platform, arch, libc })
    if (probeExecutables) probeDirectRuntime(stagedRuntime, { root: staging, environment, runner })
    assertGitVisibleWorktreeUnchanged(authority.root, callerWorktree, {
      label: probeExecutables ? 'provider CLI staged version readback' : 'provider CLI staged static verification',
    })
    try {
      renameSync(staging, target)
      staging = null
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code) || !existingRuntime(target)) throw error
    }
    const runtime = inspectInstalledRuntime(target, authority, { platform, arch, libc })
    const shimPaths = installOrCheckShims(authority, target, runtime, { check: false })
    const versions = probeExecutables ? probeShims(authority, shimPaths, { environment, runner }) : null
    const staticResult = staticVerificationResult(authority, target, runtime, platformId)
    assertGitVisibleWorktreeUnchanged(authority.root, callerWorktree, { label: 'provider CLI atomic installation' })
    return Object.freeze({
      ...staticResult,
      executablesProbed: probeExecutables,
      status: 'installed',
      versions,
    })
  } finally {
    try { npmRuntime?.cleanup?.() } finally {
      try { isolated.cleanup() } finally {
        if (staging !== null) rmSync(staging, { recursive: true, force: true })
      }
    }
  }
}

function isMain() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) }
  catch { return false }
}

if (isMain()) {
  const args = process.argv.slice(2)
  if (!(args.length === 0 || (args.length === 1 && args[0] === '--check'))) {
    console.error('Usage: node scripts/setup-provider-cli-toolchain.mjs [--check]')
    process.exitCode = 2
  } else {
    try {
      const result = await setupProviderCliToolchain({ check: args[0] === '--check' })
      console.log(`✅ provider CLI toolchain ${result.status}:${result.platform}:sha256:${result.authorityDigest}`)
    } catch (error) {
      console.error(`❌ provider CLI toolchain failed:${error.message}`)
      process.exitCode = 1
    }
  }
}
