#!/usr/bin/env node

// Protected-base verifier for credential-free consumer upgrades.
//
// The certifier job may execute the authenticated incoming checker, but its receipt is never a
// writer trust root. Before a writer token exists, this protected-base implementation installs the
// exact incoming release with scripts disabled in a disposable copy of the protected base, verifies
// npm/SLSA/immutable-Release provenance, validates both fork corpora and their lifecycle transition,
// and materializes the expected tree with the protected-base materializer. Only a byte-identical
// patch/tree/operation receipt may then be applied to the writer checkout.

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertNoSymlinkPath,
  authorizeDisposableProviderRefreshTransaction,
  canonicalRepositoryRoot,
  refreshLaunchers,
  validateInstalledForkCorpus,
  validateInstalledProviderTransition,
} from './refresh-fork-launchers.mjs'
import {
  validateUpgradeTrustPolicy,
  verifyUpgradeProvenance,
} from './verify-upgrade-provenance.mjs'
import {
  assertNoRootNpmShrinkwrap,
  runVerifiedHighVulnerabilityAudit,
} from './lib/governance-dependency-bootstrap.mjs'
import {
  assertVerifiedExactNpmRuntimeCapability,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmRuntimeContract,
} from './lib/verified-exact-npm-runtime.mjs'
import {
  REVIEWED_CONTROL_PLANE_UPDATE_ROUTE,
  packageScriptsAreIdentical,
  requiresReviewedControlPlaneUpdate,
} from './lib/consumer-control-plane-policy.mjs'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'baseSha', 'version', 'patchSha256', 'treeSha256', 'paths', 'operations',
  'previousCorpus', 'incomingCorpus', 'provenance', 'authoritySha256', 'toolchain',
])
const CORPUS_EVIDENCE_KEYS = Object.freeze([
  'releaseVersion', 'consumerBomSha256', 'forkCorpusLockSha256', 'manifestSha256', 'providerLifecycleSha256',
])
const PROVENANCE_KEYS = Object.freeze([
  'repository', 'workflow', 'tag', 'tagObject', 'gitCommit', 'gitTree',
  'bomSha256', 'releaseAssetDigest', 'releaseSetSha256',
  'finalizationReceiptSha256', 'releaseTrustEvidenceSha256', 'packages',
])
const TOOLCHAIN_KEYS = Object.freeze(['node', 'npm'])
const OPERATION_KEYS = Object.freeze(['path', 'status'])
const AUTHORITY_KEYS = Object.freeze([
  'schemaVersion', 'previousCorpus', 'incomingCorpus', 'provenance', 'toolchain',
  'previousMaterialization', 'incomingMaterialization', 'retirementDeletes',
])
const MATERIALIZATION_KEYS = Object.freeze(['exactPaths', 'pathPrefixes'])
const SHA256 = /^[a-f0-9]{64}$/
const GIT_OBJECT = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const NPM_REGISTRY = 'https://registry.npmjs.org/'

const invariant = (condition, message) => { if (!condition) throw new Error(message) }
const sha256 = value => createHash('sha256').update(value).digest('hex')
const exactKeys = (value, keys, label) => {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  invariant(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has an open or incomplete shape`)
  return value
}

function regularFile(path, label) {
  const stat = lstatSync(path)
  invariant(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, `${label} must be one regular unaliased file`)
  return path
}

function run(command, args, { cwd, input = undefined, env = process.env, encoding = 'utf8', label = command } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    env,
    encoding,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : String(result.stdout || '')
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr || '')
    throw new Error(`${label} failed(exit ${result.status}):${stderr.trim() || stdout.trim() || '<no output>'}`)
  }
  return result.stdout
}

function git(repository, args, options = {}) {
  const {
    encoding = 'utf8',
    gitIdentity,
    input,
  } = options
  const cwd = resolve(repository)
  if (args[0] !== 'init') assertClosedGitLocalConfiguration(cwd)
  const result = runClosedGit(args, {
    cwd,
    gitIdentity,
    input,
    maxOutputBytes: 64 * 1024 * 1024,
    output: encoding === null ? 'buffer' : 'capture',
    timeoutMs: 30_000,
  })
  if (result.error || result.signal !== null || result.status !== 0) {
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : String(result.stdout || '')
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr || '')
    throw new Error(`git ${args.join(' ')} failed(exit ${result.status}):${stderr.trim() || stdout.trim() || result.error?.message || '<no output>'}`)
  }
  return result.stdout
}

function normalizedPath(path) {
  invariant(typeof path === 'string' && path.length > 0 && path.length <= 512, 'GOV-UPGRADE-PATH-005: receipt path is invalid')
  invariant(!isAbsolute(path) && !path.includes('\\') && !path.includes('\0') && !path.includes('\n') && !path.includes('\r'), `GOV-UPGRADE-PATH-005: unsafe receipt path: ${JSON.stringify(path)}`)
  const normalized = path.split('/').filter(part => part !== '').join('/')
  invariant(normalized === path && path.split('/').every(part => part !== '.' && part !== '..'), `GOV-UPGRADE-PATH-005: non-canonical receipt path: ${path}`)
  invariant(path !== '.git' && !path.startsWith('.git/'), `GOV-UPGRADE-PATH-005: git metadata path is forbidden: ${path}`)
  return path
}

function canonicalCorpusEvidence(value, label) {
  exactKeys(value, CORPUS_EVIDENCE_KEYS, label)
  invariant(VERSION.test(value.releaseVersion || ''), `${label}.releaseVersion is invalid`)
  for (const key of CORPUS_EVIDENCE_KEYS.filter(key => key !== 'releaseVersion')) {
    invariant(SHA256.test(value[key] || ''), `${label}.${key} is invalid`)
  }
  return Object.fromEntries(CORPUS_EVIDENCE_KEYS.map(key => [key, value[key]]))
}

function canonicalPackages(packages, label) {
  invariant(Array.isArray(packages) && packages.length === 2, `${label} must contain the exact upgrade package pair`)
  const normalized = packages.map((item, index) => {
    exactKeys(item, ['name', 'version', 'integrity'], `${label}[${index}]`)
    invariant(['@qijenchen/design-system', '@qijenchen/storybook-config'].includes(item.name), `${label}[${index}].name is invalid`)
    invariant(VERSION.test(item.version || '') && typeof item.integrity === 'string' && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity), `${label}[${index}] identity is invalid`)
    return { name: item.name, version: item.version, integrity: item.integrity }
  })
  invariant(JSON.stringify(normalized.map(item => item.name)) === JSON.stringify(['@qijenchen/design-system', '@qijenchen/storybook-config']), `${label} order/set is invalid`)
  return normalized
}

function canonicalProvenance(value, label = 'upgrade provenance') {
  exactKeys(value, PROVENANCE_KEYS, label)
  invariant(value.repository === 'ajenchen/design-system', `${label}.repository is invalid`)
  invariant(value.workflow === '.github/workflows/release.yml', `${label}.workflow is invalid`)
  const packages = canonicalPackages(value.packages, `${label}.packages`)
  invariant(packages.every(item => item.version === packages[0].version), `${label}.packages do not bind one exact release version`)
  invariant(typeof value.tag === 'string' && value.tag === `v${packages[0].version}`, `${label}.tag is invalid`)
  invariant(GIT_OBJECT.test(value.tagObject || ''), `${label}.tagObject is invalid`)
  invariant(GIT_OBJECT.test(value.gitCommit || ''), `${label}.gitCommit is invalid`)
  invariant(GIT_OBJECT.test(value.gitTree || ''), `${label}.gitTree is invalid`)
  invariant(SHA256.test(value.bomSha256 || '') && value.releaseAssetDigest === `sha256:${value.bomSha256}`, `${label} immutable Release BOM binding is invalid`)
  invariant(SHA256.test(value.releaseSetSha256 || ''), `${label}.releaseSetSha256 is invalid`)
  // 兩個 finalizer evidence 資產屬 opt-in 高保證車道 —— 已 retired ceremony,標準 six-file
  // release 不產生(producer 端 verify-upgrade-provenance.mjs:657-658 即輸出 null,並將其排除
  // 出 releaseSetSha256)。契約:**有值 → 必為 sha256(present-but-wrong 仍 fail-closed);
  // 無值 → 必為 null(key 不得缺席,exactKeys 守閉合 shape);且兩者必成對**(對齊 producer
  // 配對律)。2026-08-05 修:原本無條件要求 sha256 → 標準 release 的 consumer 自動升級
  // 永遠不可能通過(WM 長期只能手動同步的真因)。
  for (const field of ['finalizationReceiptSha256', 'releaseTrustEvidenceSha256']) {
    invariant(value[field] === null || SHA256.test(value[field] || ''), `${label}.${field} is invalid`)
  }
  invariant((value.finalizationReceiptSha256 === null) === (value.releaseTrustEvidenceSha256 === null),
    `${label} finalization receipt requires its paired release trust evidence`)
  return {
    repository: value.repository,
    workflow: value.workflow,
    tag: value.tag,
    tagObject: value.tagObject,
    gitCommit: value.gitCommit,
    gitTree: value.gitTree,
    bomSha256: value.bomSha256,
    releaseAssetDigest: value.releaseAssetDigest,
    releaseSetSha256: value.releaseSetSha256,
    finalizationReceiptSha256: value.finalizationReceiptSha256,
    releaseTrustEvidenceSha256: value.releaseTrustEvidenceSha256,
    packages,
  }
}

function canonicalToolchain(value, label = 'upgrade toolchain') {
  exactKeys(value, TOOLCHAIN_KEYS, label)
  invariant(/^v\d+\.\d+\.\d+$/.test(value.node || ''), `${label}.node is invalid`)
  invariant(/^\d+\.\d+\.\d+$/.test(value.npm || ''), `${label}.npm is invalid`)
  return { node: value.node, npm: value.npm }
}

function canonicalMaterialization(value, label) {
  exactKeys(value, MATERIALIZATION_KEYS, label)
  invariant(Array.isArray(value.exactPaths) && Array.isArray(value.pathPrefixes), `${label} is invalid`)
  const exactPaths = value.exactPaths.map(normalizedPath)
  const pathPrefixes = value.pathPrefixes.map(prefix => {
    invariant(typeof prefix === 'string' && prefix.endsWith('/'), `${label} prefix must end in slash`)
    return `${normalizedPath(prefix.slice(0, -1))}/`
  })
  invariant(JSON.stringify(exactPaths) === JSON.stringify([...new Set(exactPaths)].sort()), `${label}.exactPaths must be sorted and unique`)
  invariant(JSON.stringify(pathPrefixes) === JSON.stringify([...new Set(pathPrefixes)].sort()), `${label}.pathPrefixes must be sorted and unique`)
  for (const exact of exactPaths) for (const prefix of pathPrefixes) {
    invariant(!exact.startsWith(prefix), `${label} exact path overlaps a tree prefix:${exact}:${prefix}`)
  }
  for (let left = 0; left < pathPrefixes.length; left += 1) for (let right = left + 1; right < pathPrefixes.length; right += 1) {
    invariant(!pathPrefixes[right].startsWith(pathPrefixes[left]), `${label} tree prefixes overlap:${pathPrefixes[left]}:${pathPrefixes[right]}`)
  }
  return { exactPaths, pathPrefixes }
}

function canonicalOperations(operations, label = 'upgrade operations') {
  invariant(Array.isArray(operations) && operations.length > 0, `${label} must be a non-empty array`)
  const normalized = operations.map((item, index) => {
    exactKeys(item, OPERATION_KEYS, `${label}[${index}]`)
    invariant(['A', 'M', 'D'].includes(item.status), `${label}[${index}].status is unsupported`)
    return { path: normalizedPath(item.path), status: item.status }
  })
  invariant(new Set(normalized.map(item => item.path)).size === normalized.length, `${label} contains duplicate paths`)
  invariant(JSON.stringify(normalized) === JSON.stringify([...normalized].sort((left, right) => compareUtf8Bytes(left.path, right.path))), `${label} must be sorted by path`)
  return normalized
}

function policyAllows(policy, path) {
  return policy.exactPaths.includes(path) || policy.pathPrefixes.some(prefix => path.startsWith(prefix))
}

function retirementAllows(retirements, path) {
  return retirements.some(surface => surface.kind === 'file' ? surface.path === path : path === surface.path || path.startsWith(`${surface.path}/`))
}

export function requiresReviewedBootstrap(path) {
  const normalized = normalizedPath(path)
  return requiresReviewedControlPlaneUpdate(normalized)
}

export function validateUpgradeOperations(operations, authority) {
  exactKeys(authority, AUTHORITY_KEYS, 'upgrade mutation authority')
  invariant(authority.schemaVersion === 1, 'upgrade mutation authority schema is unsupported')
  const previous = canonicalMaterialization(authority.previousMaterialization, 'previous materialization')
  const incoming = canonicalMaterialization(authority.incomingMaterialization, 'incoming materialization')
  invariant(Array.isArray(authority.retirementDeletes), 'upgrade retirement deletion authority is invalid')
  const retirements = authority.retirementDeletes.map((surface, index) => {
    exactKeys(surface, ['kind', 'path', 'sha256'], `retirement deletion[${index}]`)
    invariant(['file', 'tree'].includes(surface.kind) && SHA256.test(surface.sha256 || ''), `retirement deletion[${index}] is invalid`)
    return { kind: surface.kind, path: normalizedPath(surface.path), sha256: surface.sha256 }
  })
  invariant(JSON.stringify(retirements) === JSON.stringify([...retirements].sort((left, right) => compareUtf8Bytes(left.path, right.path))), 'retirement deletions must be sorted')
  const normalized = canonicalOperations(operations)
  for (const operation of normalized) {
    invariant(
      !requiresReviewedBootstrap(operation.path),
      `GOV-UPGRADE-BOOTSTRAP-001: ordinary upgrade cannot change protected control-plane path; ${REVIEWED_CONTROL_PLANE_UPDATE_ROUTE}: ${operation.path}`,
    )
    const before = policyAllows(previous, operation.path)
    const after = policyAllows(incoming, operation.path)
    const retired = retirementAllows(retirements, operation.path)
    if (operation.status === 'A') invariant(after, `GOV-UPGRADE-PATH-007: added path is outside incoming authority: ${operation.path}`)
    else if (operation.status === 'M') invariant(before && after, `GOV-UPGRADE-PATH-007: modified path is not retained governance authority: ${operation.path}`)
    else invariant((before && after) || retired, `GOV-UPGRADE-PATH-007: deleted path has no retained authority or current retirement tombstone: ${operation.path}`)
  }
  return normalized
}

export function buildUpgradeAuthority({ previousCorpus, incomingCorpus, provenance, toolchain, providerTransition = null }) {
  const transition = providerTransition || validateInstalledProviderTransition(previousCorpus, incomingCorpus)
  invariant(transition.mode === 'upgrade', 'upgrade authority requires one monotonic lifecycle transition')
  const retirementDeletes = transition.retirements
    .flatMap(retirement => retirement.surfaces.map(surface => ({ kind: surface.kind, path: normalizedPath(surface.path), sha256: surface.sha256 })))
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
  invariant(new Set(retirementDeletes.map(item => item.path)).size === retirementDeletes.length, 'upgrade authority retirement paths are duplicated')
  return {
    schemaVersion: 1,
    previousCorpus: canonicalCorpusEvidence(previousCorpus.evidence, 'previous corpus evidence'),
    incomingCorpus: canonicalCorpusEvidence(incomingCorpus.evidence, 'incoming corpus evidence'),
    provenance: canonicalProvenance(provenance),
    toolchain: canonicalToolchain(toolchain),
    previousMaterialization: canonicalMaterialization(previousCorpus.manifest.consumer.materialization, 'previous materialization'),
    incomingMaterialization: canonicalMaterialization(incomingCorpus.manifest.consumer.materialization, 'incoming materialization'),
    retirementDeletes,
  }
}

export function upgradeAuthoritySha256(authority) {
  exactKeys(authority, AUTHORITY_KEYS, 'upgrade mutation authority')
  return sha256(JSON.stringify(authority))
}

export function validateUpgradeReceipt({
  receipt,
  patchBytes,
  expectedBaseSha,
  expectedVersion,
  expectedPatchSha256 = null,
  expectedTreeSha = null,
  expectedAuthoritySha256 = null,
  authority = null,
}) {
  exactKeys(receipt, RECEIPT_KEYS, 'GOV-UPGRADE-EVIDENCE-001: receipt')
  invariant(receipt.schemaVersion === 2, 'GOV-UPGRADE-EVIDENCE-001: unsupported receipt version')
  invariant(GIT_OBJECT.test(expectedBaseSha || '') && receipt.baseSha === expectedBaseSha, 'GOV-UPGRADE-EVIDENCE-002: receipt base SHA mismatch')
  invariant(VERSION.test(expectedVersion || '') && receipt.version === expectedVersion, 'GOV-UPGRADE-EVIDENCE-003: receipt version mismatch')
  invariant(SHA256.test(receipt.patchSha256 || '') && sha256(patchBytes) === receipt.patchSha256, 'GOV-UPGRADE-EVIDENCE-004: patch digest mismatch')
  if (expectedPatchSha256 !== null) invariant(SHA256.test(expectedPatchSha256) && receipt.patchSha256 === expectedPatchSha256, 'GOV-UPGRADE-EVIDENCE-004: receipt differs from certifier patch output')
  invariant(GIT_OBJECT.test(receipt.treeSha256 || ''), 'GOV-UPGRADE-EVIDENCE-005: tree identity is invalid')
  if (expectedTreeSha !== null) invariant(GIT_OBJECT.test(expectedTreeSha) && receipt.treeSha256 === expectedTreeSha, 'GOV-UPGRADE-EVIDENCE-005: receipt differs from certifier tree output')
  const operations = canonicalOperations(receipt.operations, 'receipt operations')
  const paths = receipt.paths.map(normalizedPath)
  invariant(JSON.stringify(paths) === JSON.stringify(operations.map(item => item.path)), 'GOV-UPGRADE-PATH-005: receipt paths differ from its closed operations')
  canonicalCorpusEvidence(receipt.previousCorpus, 'receipt previous corpus')
  canonicalCorpusEvidence(receipt.incomingCorpus, 'receipt incoming corpus')
  canonicalProvenance(receipt.provenance, 'receipt provenance')
  canonicalToolchain(receipt.toolchain, 'receipt toolchain')
  invariant(SHA256.test(receipt.authoritySha256 || ''), 'receipt authority digest is invalid')
  if (expectedAuthoritySha256 !== null) invariant(SHA256.test(expectedAuthoritySha256) && receipt.authoritySha256 === expectedAuthoritySha256, 'receipt differs from certifier authority output')
  if (authority !== null) {
    const digest = upgradeAuthoritySha256(authority)
    invariant(receipt.authoritySha256 === digest, 'receipt authority differs from protected-base reconstruction')
    invariant(JSON.stringify(receipt.previousCorpus) === JSON.stringify(authority.previousCorpus), 'receipt previous corpus differs from protected-base reconstruction')
    invariant(JSON.stringify(receipt.incomingCorpus) === JSON.stringify(authority.incomingCorpus), 'receipt incoming corpus differs from protected-base reconstruction')
    invariant(JSON.stringify(receipt.provenance) === JSON.stringify(authority.provenance), 'receipt provenance differs from protected-base reconstruction')
    invariant(JSON.stringify(receipt.toolchain) === JSON.stringify(authority.toolchain), 'receipt toolchain differs from protected-base reconstruction')
    validateUpgradeOperations(operations, authority)
  }
  return { ...receipt, paths, operations }
}

export function stagedUpgradeOperations(repository) {
  const raw = git(repository, ['diff', '--cached', '--name-status', '-z', '--no-renames'], { encoding: null })
  const tokens = raw.toString('utf8').split('\0')
  if (tokens.at(-1) === '') tokens.pop()
  invariant(tokens.length > 0 && tokens.length % 2 === 0, 'GOV-UPGRADE-PATH-003: staged name-status inventory is malformed or empty')
  const operations = []
  for (let index = 0; index < tokens.length; index += 2) {
    const status = tokens[index]
    invariant(['A', 'M', 'D'].includes(status), `GOV-UPGRADE-PATH-004: staged path has unsupported type/status:${status}`)
    operations.push({ path: normalizedPath(tokens[index + 1]), status })
  }
  return canonicalOperations(operations)
}

function stagedPatch(repository) {
  return git(repository, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames'], { encoding: null })
}

function assertNoChangedSymlinkOrSubmodule(repository) {
  const summary = git(repository, ['diff', '--cached', '--summary', '--no-renames'])
  invariant(!/(?:create|mode change) mode (?:120000|160000)/.test(summary), 'GOV-UPGRADE-PATH-004: evidence contains a symlink/submodule mutation')
  const raw = git(repository, ['diff', '--cached', '--raw', '-z', '--no-renames'], { encoding: null }).toString('utf8')
  invariant(!/(?:^|\s)(?:120000|160000)\s/.test(raw), 'GOV-UPGRADE-PATH-004: evidence raw diff contains a symlink/submodule')
}

function stagedTree(repository) {
  return git(repository, ['write-tree']).trim()
}

function assertProtectedBase(repository, expectedBaseSha) {
  invariant(git(repository, ['rev-parse', 'HEAD']).trim() === expectedBaseSha, 'GOV-UPGRADE-SOURCE-003: checkout does not match the protected base')
  invariant(git(repository, ['diff', '--cached', '--name-only', '-z'], { encoding: null }).length === 0, 'GOV-UPGRADE-SOURCE-004: protected base index is dirty')
  const status = git(repository, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none', '--no-renames'], { encoding: null })
  invariant(status.length === 0, 'GOV-UPGRADE-SOURCE-004: protected base worktree or untracked inventory is dirty')
}

export function assertLiveProtectedMain(repository, expectedBaseSha, remote = 'origin') {
  invariant(typeof remote === 'string' && /^[A-Za-z0-9._-]+$/.test(remote), 'GOV-UPGRADE-SOURCE-006: live-main remote is invalid')
  const remoteUrls = git(repository, [
    'config',
    '--local',
    '--no-includes',
    '--get-all',
    `remote.${remote}.url`,
  ]).trim().split(/\r?\n/).filter(Boolean)
  invariant(remoteUrls.length === 1, 'GOV-UPGRADE-SOURCE-006: live-main remote URL must resolve exactly once')
  let parsedRemote
  try {
    parsedRemote = new URL(remoteUrls[0])
  } catch {
    throw new Error('GOV-UPGRADE-SOURCE-006: live-main remote URL is invalid')
  }
  invariant(
    parsedRemote.protocol === 'https:'
      && parsedRemote.hostname.toLowerCase() === 'github.com'
      && !parsedRemote.username
      && !parsedRemote.password
      && !parsedRemote.port
      && !parsedRemote.search
      && !parsedRemote.hash
      && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(parsedRemote.pathname),
    'GOV-UPGRADE-SOURCE-006: live-main remote must be one credential-free canonical GitHub HTTPS URL',
  )
  const canonicalRemote = `https://github.com/${parsedRemote.pathname.replace(/^\/+/, '').replace(/\.git$/, '')}.git`
  const output = git(repository, ['ls-remote', '--exit-code', canonicalRemote, 'refs/heads/main']).trim()
  const lines = output.split(/\r?\n/).filter(Boolean)
  invariant(lines.length === 1, 'GOV-UPGRADE-SOURCE-006: live protected main did not resolve exactly once')
  const [sha, ref, ...extra] = lines[0].split(/\s+/)
  invariant(extra.length === 0 && ref === 'refs/heads/main' && GIT_OBJECT.test(sha || ''), 'GOV-UPGRADE-SOURCE-006: live protected main response is malformed')
  invariant(sha === expectedBaseSha, `GOV-UPGRADE-SOURCE-006: protected main moved after reconstruction:${expectedBaseSha}:${sha}`)
  return sha
}

export function assertProtectedPackageScripts(repository, expectedBaseSha, incomingRepository = repository) {
  const base = JSON.parse(git(repository, ['show', `${expectedBaseSha}:package.json`]))
  const incoming = JSON.parse(readFileSync(regularFile(join(incomingRepository, 'package.json'), 'upgrade package manifest'), 'utf8'))
  invariant(
    packageScriptsAreIdentical(base, incoming, {
      previousLabel: 'protected-base package manifest',
      incomingLabel: 'incoming package manifest',
    }),
    `GOV-UPGRADE-BOOTSTRAP-002: ordinary upgrade cannot change package scripts executed by protected workflows; ${REVIEWED_CONTROL_PLANE_UPDATE_ROUTE}`,
  )
}

function readEvidence(evidenceDirectory) {
  const evidence = realpathSync(evidenceDirectory)
  const entries = readdirSync(evidence).sort()
  invariant(JSON.stringify(entries) === JSON.stringify(['receipt.json', 'upgrade.patch']), 'GOV-UPGRADE-EVIDENCE-006: evidence inventory must contain exactly receipt.json and upgrade.patch')
  const receiptPath = regularFile(join(evidence, 'receipt.json'), 'receipt')
  const patchPath = regularFile(join(evidence, 'upgrade.patch'), 'patch')
  return {
    evidence,
    receipt: JSON.parse(readFileSync(receiptPath, 'utf8')),
    patchBytes: readFileSync(patchPath),
  }
}

function isolatedNpmEnvironment(root) {
  const configRoot = join(root, '.npm-config')
  const cacheRoot = join(root, '.npm-cache')
  const homeRoot = join(root, '.npm-home')
  const temporaryRoot = join(root, '.npm-tmp')
  mkdirSync(configRoot, { mode: 0o700 })
  mkdirSync(cacheRoot, { mode: 0o700 })
  mkdirSync(homeRoot, { mode: 0o700 })
  mkdirSync(temporaryRoot, { mode: 0o700 })
  const user = join(configRoot, 'user.npmrc')
  const global = join(configRoot, 'global.npmrc')
  const config = [
    `registry=${NPM_REGISTRY}`,
    'provenance=true',
    'ignore-scripts=true',
    'strict-ssl=true',
    'fund=false',
    'update-notifier=false',
    'color=false',
    'progress=false',
    '',
  ].join('\n')
  writeFileSync(user, config, { flag: 'wx', mode: 0o600 })
  writeFileSync(global, config, { flag: 'wx', mode: 0o600 })
  chmodSync(user, 0o600)
  chmodSync(global, 0o600)
  return Object.freeze({
    HOME: homeRoot,
    LANG: 'C',
    LC_ALL: 'C',
    LOGNAME: 'governance',
    NO_COLOR: '1',
    PATH: process.platform === 'win32'
      ? String(process.env.SystemRoot || 'C:\\Windows') + '\\System32'
      : '/usr/bin:/bin',
    TMPDIR: temporaryRoot,
    TZ: 'UTC',
    USER: 'governance',
    NPM_CONFIG_CACHE: cacheRoot,
    NPM_CONFIG_COLOR: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_USERCONFIG: user,
    NPM_CONFIG_GLOBALCONFIG: global,
    NPM_CONFIG_REGISTRY: NPM_REGISTRY,
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_PROGRESS: 'false',
    NPM_CONFIG_PROVENANCE: 'true',
    NPM_CONFIG_STRICT_SSL: 'true',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    ...(process.platform === 'darwin' ? { __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0' } : {}),
  })
}

function prepareSandboxFromProtectedBase(repository, sandbox, expectedBaseSha) {
  mkdirSync(sandbox, { recursive: true, mode: 0o700 })
  git(repository, ['checkout-index', '--all', '--force', `--prefix=${sandbox}${sep}`])
  git(sandbox, ['init', '--quiet'])
  mkdirSync(join(sandbox, '.git', 'info'), { recursive: true })
  writeFileSync(join(sandbox, '.git', 'info', 'exclude'), 'node_modules/\n.governance-upgrade-journal.json\n')
  git(sandbox, ['config', 'core.autocrlf', 'false'])
  git(sandbox, ['config', 'core.filemode', 'true'])
  git(sandbox, ['add', '-A', '--', '.'])
  const baseTree = stagedTree(sandbox)
  const expectedTree = git(repository, ['rev-parse', `${expectedBaseSha}^{tree}`]).trim()
  invariant(baseTree === expectedTree, 'GOV-UPGRADE-SOURCE-005: disposable protected-base tree differs from the source commit')
  const commit = git(sandbox, ['commit-tree', baseTree, '-m', 'protected base'], {
    gitIdentity: {
      authorName: 'Governance verifier',
      authorEmail: 'governance-verifier@example.invalid',
      committerName: 'Governance verifier',
      committerEmail: 'governance-verifier@example.invalid',
      authorDate: '2000-01-01T00:00:00Z',
      committerDate: '2000-01-01T00:00:00Z',
    },
  }).trim()
  git(sandbox, ['symbolic-ref', 'HEAD', 'refs/heads/protected-base'])
  git(sandbox, ['update-ref', 'refs/heads/protected-base', commit])
  git(sandbox, ['reset', '--quiet', '--mixed', commit])
}

function exactInstalledUpgradePackages(repository, version, policy) {
  const lock = JSON.parse(readFileSync(regularFile(join(repository, 'package-lock.json'), 'reconstructed package lock'), 'utf8'))
  invariant(lock.lockfileVersion === 3 && lock.packages && typeof lock.packages === 'object' && !Array.isArray(lock.packages), 'reconstructed npm lock must use closed lockfileVersion 3')
  return policy.upgradePackages.map(name => {
    const entry = lock.packages[`node_modules/${name}`]
    const expectedTarball = `${NPM_REGISTRY}${name}/-/${name.split('/').at(-1)}-${version}.tgz`
    invariant(entry?.version === version && entry?.resolved === expectedTarball, `${name}: reconstructed lock is not the exact canonical npm artifact`)
    invariant(typeof entry.integrity === 'string', `${name}: reconstructed lock lacks integrity`)
    return { name, version: entry.version, integrity: entry.integrity }
  })
}

function temporaryRefreshCapability(projectDir, verifiedCorpus, providerTransition) {
  return authorizeDisposableProviderRefreshTransaction({
    projectDir,
    verifiedCorpus,
    providerTransition,
  })
}

export async function reconstructExpectedUpgrade({
  repository,
  expectedBaseSha,
  expectedVersion,
  releaseLookup = undefined,
  captureMaterialized = undefined,
  runtimeFactory = prepareVerifiedExactNpmRuntime,
}) {
  const repo = canonicalRepositoryRoot(repository)
  assertNoRootNpmShrinkwrap(repo, { errorPrefix: 'GOV-UPGRADE-LOCK-001' })
  assertProtectedBase(repo, expectedBaseSha)
  const expectedNpmArtifact = resolveExactNpmRuntimeContract(repo)
  const trustPolicy = validateUpgradeTrustPolicy(JSON.parse(readFileSync(regularFile(join(repo, 'governance/lock.json'), 'protected-base governance lock'), 'utf8')).upgradeTrust)
  const temporaryRoot = realpathSync(mkdtempSync(join(tmpdir(), 'governance-upgrade-reconstruct-')))
  const sandbox = join(temporaryRoot, 'repository')
  let npmRuntime = null
  try {
    prepareSandboxFromProtectedBase(repo, sandbox, expectedBaseSha)
    assertNoRootNpmShrinkwrap(sandbox, { errorPrefix: 'GOV-UPGRADE-LOCK-001' })
    const npmEnv = isolatedNpmEnvironment(temporaryRoot)
    invariant(typeof runtimeFactory === 'function', 'verified exact npm runtime factory must be a function')
    npmRuntime = await runtimeFactory({
      repositoryRoot: repo,
      parentDirectory: temporaryRoot,
      env: npmEnv,
    })
    try {
      assertVerifiedExactNpmRuntimeCapability(npmRuntime, expectedNpmArtifact)
    } catch {
      invariant(false, 'verified exact npm runtime factory returned an invalid overlay-bound capability')
    }
    const { cli, toolchain } = npmRuntime
    // Reconstruct the previous corpus from the protected commit and its committed lock. The host
    // checkout's ignored node_modules (including npm itself) is intentionally never an authority.
    run(process.execPath, [
      cli, 'ci', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund',
      `--registry=${NPM_REGISTRY}`,
    ], { cwd: sandbox, env: npmEnv, label: 'verified exact npm protected-base reconstruction' })
    const previousCorpus = validateInstalledForkCorpus(sandbox)
    run(process.execPath, [
      cli, 'install',
      `@qijenchen/design-system@${expectedVersion}`,
      `@qijenchen/storybook-config@${expectedVersion}`,
      '--save-exact', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund',
      `--registry=${NPM_REGISTRY}`,
    ], { cwd: sandbox, env: npmEnv, label: 'protected-base exact npm install in disposable reconstruction' })
    const installedOverlayReceipt = npmRuntime.applyInstalledSecurityOverlay(sandbox)
    const signatureJson = run(process.execPath, [
      cli, 'audit', 'signatures', '--json', `--registry=${NPM_REGISTRY}`,
    ], { cwd: sandbox, env: npmEnv, label: 'protected-base npm signature audit' })
    let auditReport
    try { auditReport = JSON.parse(signatureJson) } catch { throw new Error('protected-base npm signature audit did not produce closed JSON') }
    runVerifiedHighVulnerabilityAudit(process.execPath, [
      cli, 'audit', '--audit-level=high', '--json', `--registry=${NPM_REGISTRY}`,
    ], {
      root: sandbox,
      environment: npmEnv,
      npmRuntime,
      installedOverlayReceipt,
      errorPrefix: 'GOV-UPGRADE-DEPENDENCY-001',
      timeoutMs: 30 * 60 * 1_000,
    })
    const packages = exactInstalledUpgradePackages(sandbox, expectedVersion, trustPolicy)
    const provenance = await verifyUpgradeProvenance({
      auditReport,
      packages,
      version: expectedVersion,
      policy: trustPolicy,
      // Consumer 升級走 ordinary 車道:tag→commit→tree + BOM + npm SLSA provenance;
      // GitHub-verified 簽章與 finalizer evidence 屬 opt-in 高保證 finalizer(RELEASE_HIGH_ASSURANCE)。
      ordinaryRelease: true,
      ...(releaseLookup ? { releaseLookup } : {}),
    })
    const incomingCorpus = validateInstalledForkCorpus(sandbox)
    invariant(incomingCorpus.evidence.releaseVersion === expectedVersion, 'reconstructed incoming corpus release differs from requested exact version')
    const providerTransition = validateInstalledProviderTransition(previousCorpus, incomingCorpus)
    const transactionCapability = temporaryRefreshCapability(sandbox, incomingCorpus, providerTransition)
    const refresh = refreshLaunchers(sandbox, {
      dryRun: false,
      verifiedCorpus: incomingCorpus,
      providerTransition,
      transactionCapability,
    })
    invariant(!refresh?.error && !refresh?.skipped, `protected-base materializer did not converge:${refresh?.error || refresh?.skipped}`)
    assertProtectedPackageScripts(repo, expectedBaseSha, sandbox)
    git(sandbox, ['add', '-A', '--', '.'])
    assertNoChangedSymlinkOrSubmodule(sandbox)
    const operations = stagedUpgradeOperations(sandbox)
    const authority = buildUpgradeAuthority({ previousCorpus, incomingCorpus, provenance, toolchain, providerTransition })
    validateUpgradeOperations(operations, authority)
    if (captureMaterialized !== undefined) {
      invariant(typeof captureMaterialized === 'function', 'protected-base materialization capture must be a function')
      await captureMaterialized({
        sandbox,
        previousCorpus,
        incomingCorpus,
        providerTransition,
        provenance,
        toolchain,
        authority,
        operations,
      })
    }
    return {
      authority,
      authoritySha256: upgradeAuthoritySha256(authority),
      operations,
      paths: operations.map(item => item.path),
      patchBytes: stagedPatch(sandbox),
      treeSha256: stagedTree(sandbox),
    }
  } finally {
    try { npmRuntime?.cleanup?.() } finally { rmSync(temporaryRoot, { recursive: true, force: true }) }
  }
}

function verifyStagedTree({ repository, receipt, patchBytes, authority = null }) {
  assertNoChangedSymlinkOrSubmodule(repository)
  const operations = stagedUpgradeOperations(repository)
  invariant(JSON.stringify(operations) === JSON.stringify(receipt.operations), 'GOV-UPGRADE-PATH-003: applied operations differ from certified receipt')
  if (authority) validateUpgradeOperations(operations, authority)
  invariant(stagedTree(repository) === receipt.treeSha256, 'GOV-UPGRADE-TREE-002: independently applied tree differs from receipt')
  invariant(stagedPatch(repository).equals(patchBytes), 'GOV-UPGRADE-EVIDENCE-007: independently applied patch bytes differ from receipt artifact')
}

function applyVerifiedPatchTransaction({
  repository,
  expectedBaseSha,
  receipt,
  patchBytes,
  authority = null,
}) {
  let applied = false
  try {
    git(repository, ['apply', '--binary', '--index', '-'], { input: patchBytes, encoding: null })
    applied = true
    verifyStagedTree({ repository, receipt, patchBytes, authority })
  } catch (error) {
    if (!applied) throw error
    try {
      git(repository, ['apply', '--reverse', '--binary', '--index', '-'], { input: patchBytes, encoding: null })
      assertProtectedBase(repository, expectedBaseSha)
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `GOV-UPGRADE-ROLLBACK-001: applied evidence failed post-verification and rollback did not restore the protected base; verification=${error.message}; rollback=${rollbackError.message}`,
      )
    }
    throw error
  }
}

export function upgradeVerificationSha256(receipt, patchBytes) {
  exactKeys(receipt, RECEIPT_KEYS, 'verified upgrade receipt')
  invariant(Buffer.isBuffer(patchBytes), 'verified upgrade patch must be bytes')
  const canonicalReceipt = Object.fromEntries(RECEIPT_KEYS.map(key => [key, receipt[key]]))
  return sha256(Buffer.concat([
    Buffer.from('protected-base-upgrade-verification-v1\0'),
    Buffer.from(JSON.stringify(canonicalReceipt)),
    Buffer.from('\0'),
    patchBytes,
  ]))
}

export async function verifyAndApplyUpgradeEvidence({
  repository,
  evidenceDirectory,
  expectedBaseSha,
  expectedVersion,
  expectedPatchSha256,
  expectedTreeSha,
  expectedAuthoritySha256,
  reconstruct = reconstructExpectedUpgrade,
  verificationOnly = false,
  liveMainRemote = null,
  liveMainVerifier = assertLiveProtectedMain,
}) {
  invariant(typeof liveMainVerifier === 'function', 'GOV-UPGRADE-SOURCE-006: live-main verifier must be callable')
  const repo = canonicalRepositoryRoot(repository)
  assertProtectedBase(repo, expectedBaseSha)
  const { receipt: rawReceipt, patchBytes } = readEvidence(evidenceDirectory)
  const basic = validateUpgradeReceipt({
    receipt: rawReceipt,
    patchBytes,
    expectedBaseSha,
    expectedVersion,
    expectedPatchSha256,
    expectedTreeSha,
    expectedAuthoritySha256,
  })
  const reconstructed = await reconstruct({ repository: repo, expectedBaseSha, expectedVersion })
  invariant(reconstructed.treeSha256 === basic.treeSha256, 'GOV-UPGRADE-TREE-003: certifier tree differs from protected-base reconstruction')
  invariant(reconstructed.patchBytes.equals(patchBytes), 'GOV-UPGRADE-EVIDENCE-007: certifier patch differs from protected-base reconstruction')
  invariant(JSON.stringify(reconstructed.operations) === JSON.stringify(basic.operations), 'GOV-UPGRADE-PATH-003: certifier operations differ from protected-base reconstruction')
  const receipt = validateUpgradeReceipt({
    receipt: basic,
    patchBytes,
    expectedBaseSha,
    expectedVersion,
    expectedPatchSha256,
    expectedTreeSha,
    expectedAuthoritySha256,
    authority: reconstructed.authority,
  })
  // Reconstruction can take many minutes. Re-prove both the local checkout and the live default
  // branch after it completes and before applying bytes or handing anything to a writer job.
  assertProtectedBase(repo, expectedBaseSha)
  if (liveMainRemote !== null) liveMainVerifier(repo, expectedBaseSha, liveMainRemote)
  const verificationSha256 = upgradeVerificationSha256(receipt, patchBytes)
  if (!verificationOnly) {
    applyVerifiedPatchTransaction({
      repository: repo,
      expectedBaseSha,
      receipt,
      patchBytes,
      authority: reconstructed.authority,
    })
  }
  return { ...receipt, verificationSha256 }
}

export function applyPreverifiedUpgradeEvidence({
  repository,
  evidenceDirectory,
  expectedBaseSha,
  expectedVersion,
  expectedPatchSha256,
  expectedTreeSha,
  expectedAuthoritySha256,
  expectedVerificationSha256,
  liveMainRemote,
  liveMainVerifier = assertLiveProtectedMain,
}) {
  const repo = canonicalRepositoryRoot(repository)
  assertProtectedBase(repo, expectedBaseSha)
  invariant(SHA256.test(expectedVerificationSha256 || ''), 'GOV-UPGRADE-EVIDENCE-008: trusted verification digest is invalid')
  invariant(typeof liveMainRemote === 'string', 'GOV-UPGRADE-SOURCE-006: apply mode requires a live-main remote')
  invariant(typeof liveMainVerifier === 'function', 'GOV-UPGRADE-SOURCE-006: live-main verifier must be callable')
  const { receipt: rawReceipt, patchBytes } = readEvidence(evidenceDirectory)
  const receipt = validateUpgradeReceipt({
    receipt: rawReceipt,
    patchBytes,
    expectedBaseSha,
    expectedVersion,
    expectedPatchSha256,
    expectedTreeSha,
    expectedAuthoritySha256,
  })
  invariant(
    upgradeVerificationSha256(receipt, patchBytes) === expectedVerificationSha256,
    'GOV-UPGRADE-EVIDENCE-008: evidence differs from the protected-base verification job',
  )
  assertProtectedBase(repo, expectedBaseSha)
  liveMainVerifier(repo, expectedBaseSha, liveMainRemote)
  applyVerifiedPatchTransaction({
    repository: repo,
    expectedBaseSha,
    receipt,
    patchBytes,
  })
  return { ...receipt, verificationSha256: expectedVerificationSha256 }
}

function syncReportIdentity(report, expectedVersion) {
  invariant(report && report.ok === true && report.mode === 'apply' && report.mutationAuthorized === true, 'certifier sync-all report is not a successful mutation receipt')
  invariant(report.target?.designSystem === expectedVersion && report.target?.storybook === expectedVersion, 'certifier sync-all report target differs from requested release')
  return {
    provenance: canonicalProvenance(report.provenance, 'certifier sync-all provenance'),
    toolchain: canonicalToolchain(report.toolchain, 'certifier sync-all toolchain'),
  }
}

export function certifyStagedUpgradeEvidence({
  repository,
  evidenceDirectory,
  previousRoot,
  syncReportPath,
  expectedBaseSha,
  expectedVersion,
}) {
  const repo = canonicalRepositoryRoot(repository)
  invariant(git(repo, ['rev-parse', 'HEAD']).trim() === expectedBaseSha, 'certifier checkout does not match protected base')
  const previousCorpus = validateInstalledForkCorpus(previousRoot)
  const incomingCorpus = validateInstalledForkCorpus(repo)
  invariant(incomingCorpus.evidence.releaseVersion === expectedVersion, 'certifier incoming corpus release differs from requested exact version')
  const identity = syncReportIdentity(JSON.parse(readFileSync(regularFile(syncReportPath, 'sync-all report'), 'utf8')), expectedVersion)
  const providerTransition = validateInstalledProviderTransition(previousCorpus, incomingCorpus)
  const authority = buildUpgradeAuthority({ previousCorpus, incomingCorpus, providerTransition, ...identity })
  assertProtectedPackageScripts(repo, expectedBaseSha)
  const operations = stagedUpgradeOperations(repo)
  validateUpgradeOperations(operations, authority)
  assertNoChangedSymlinkOrSubmodule(repo)
  const patchBytes = stagedPatch(repo)
  invariant(patchBytes.length > 0, 'certifier produced an empty upgrade patch')
  const receipt = {
    schemaVersion: 2,
    baseSha: expectedBaseSha,
    version: expectedVersion,
    patchSha256: sha256(patchBytes),
    treeSha256: stagedTree(repo),
    paths: operations.map(item => item.path),
    operations,
    previousCorpus: authority.previousCorpus,
    incomingCorpus: authority.incomingCorpus,
    provenance: authority.provenance,
    authoritySha256: upgradeAuthoritySha256(authority),
    toolchain: authority.toolchain,
  }
  validateUpgradeReceipt({ receipt, patchBytes, expectedBaseSha, expectedVersion, authority })
  const output = resolve(evidenceDirectory)
  invariant(!existsSync(output) || readdirSync(output).length === 0, 'certifier evidence output must be absent or empty')
  mkdirSync(output, { recursive: true, mode: 0o700 })
  assertNoSymlinkPath(dirname(output), output, 'certifier evidence directory', { allowMissing: false })
  writeFileSync(join(output, 'upgrade.patch'), patchBytes, { flag: 'wx', mode: 0o600 })
  writeFileSync(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return receipt
}

function parseCli(args) {
  const flags = new Set(['--certify-staged', '--verify-only', '--apply-preverified'])
  const values = new Set([
    '--repo', '--evidence', '--previous-root', '--sync-report', '--base-sha', '--version',
    '--expected-patch-sha256', '--expected-tree-sha', '--expected-authority-sha256',
    '--expected-verification-sha256', '--live-main-remote',
  ])
  const parsed = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    invariant(flags.has(token) || values.has(token), `unknown or positional option:${token}`)
    invariant(!parsed.has(token), `duplicate option:${token}`)
    if (flags.has(token)) parsed.set(token, true)
    else {
      const value = args[index + 1]
      invariant(value && !value.startsWith('--'), `missing ${token}`)
      parsed.set(token, value)
      index += 1
    }
  }
  const modes = ['--certify-staged', '--verify-only', '--apply-preverified'].filter(flag => parsed.has(flag))
  invariant(modes.length === 1, 'exactly one evidence mode is required')
  const required = parsed.has('--certify-staged')
    ? ['--repo', '--evidence', '--previous-root', '--sync-report', '--base-sha', '--version']
    : [
        '--repo', '--evidence', '--base-sha', '--version', '--expected-patch-sha256',
        '--expected-tree-sha', '--expected-authority-sha256', '--live-main-remote',
        ...(parsed.has('--apply-preverified') ? ['--expected-verification-sha256'] : []),
      ]
  for (const flag of required) invariant(parsed.has(flag), `missing ${flag}`)
  if (!parsed.has('--certify-staged')) {
    invariant(!parsed.has('--previous-root') && !parsed.has('--sync-report'), 'writer mode may not accept certifier-only inputs')
  } else {
    invariant(
      !parsed.has('--expected-patch-sha256') && !parsed.has('--expected-tree-sha')
        && !parsed.has('--expected-authority-sha256') && !parsed.has('--expected-verification-sha256')
        && !parsed.has('--live-main-remote'),
      'certifier mode may not accept writer output bindings',
    )
  }
  if (parsed.has('--verify-only')) invariant(!parsed.has('--expected-verification-sha256'), 'verification mode may not accept a preverified digest')
  return parsed
}

async function main() {
  const args = parseCli(process.argv.slice(2))
  const common = {
    repository: resolve(args.get('--repo')),
    evidenceDirectory: resolve(args.get('--evidence')),
    expectedBaseSha: args.get('--base-sha'),
    expectedVersion: args.get('--version').replace(/^v/, ''),
  }
  const expected = {
    expectedPatchSha256: args.get('--expected-patch-sha256'),
    expectedTreeSha: args.get('--expected-tree-sha'),
    expectedAuthoritySha256: args.get('--expected-authority-sha256'),
  }
  const result = args.has('--certify-staged')
    ? certifyStagedUpgradeEvidence({
        ...common,
        previousRoot: resolve(args.get('--previous-root')),
        syncReportPath: resolve(args.get('--sync-report')),
      })
    : args.has('--verify-only')
      ? await verifyAndApplyUpgradeEvidence({
          ...common,
          ...expected,
          verificationOnly: true,
          liveMainRemote: args.get('--live-main-remote'),
        })
      : applyPreverifiedUpgradeEvidence({
          ...common,
          ...expected,
          expectedVerificationSha256: args.get('--expected-verification-sha256'),
          liveMainRemote: args.get('--live-main-remote'),
        })
  if (process.env.GITHUB_OUTPUT) {
    const output = regularFile(process.env.GITHUB_OUTPUT, 'GitHub step output')
    const lines = [
      `base_sha=${result.baseSha}`,
      `version=${result.version}`,
      `patch_sha256=${result.patchSha256}`,
      `tree_sha256=${result.treeSha256}`,
      `authority_sha256=${result.authoritySha256}`,
      ...(result.verificationSha256 ? [`verification_sha256=${result.verificationSha256}`] : []),
    ]
    writeFileSync(output, `${lines.join('\n')}\n`, { flag: 'a' })
  }
  const action = args.has('--certify-staged')
    ? 'upgrade evidence certified'
    : args.has('--verify-only')
      ? 'upgrade evidence independently reconstructed and verified'
      : 'preverified upgrade evidence applied'
  console.log(`${action} (${result.paths.length} paths)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  Promise.resolve(main()).catch(error => { console.error(error.message); process.exit(1) })
}
