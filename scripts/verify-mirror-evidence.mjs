#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { appendFileSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateReleaseBom } from './release-bom-contract.mjs'
import {
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  validateProductTemplateScaffoldLock,
  verifyProductTemplateScaffold,
} from './product-template-scaffold-lock.mjs'
import {
  MIRROR_PROVIDER_POLICY,
  deriveManagedSurfaceMirrorPolicy,
  loadVerifiedForkSurfaceAuthority,
} from './lib/published-template-provider-surfaces.mjs'
import { assertCommittedSetupSnapshot } from './setup-governance.mjs'
import { validateMirrorActivationBoundaryProof } from './verify-mirror-activation-boundary.mjs'

const ACTIVATION_BOUNDARY_PROOF_ASSET = 'mirror-activation-boundary-proof.json'
const RECEIPT_KEYS = [
  'schemaVersion',
  'sourceSha',
  'sourceTree',
  'version',
  'archiveSha256',
  'treeSha256',
  'releaseBomSha256',
  'scaffoldLockSha256',
  'activationBoundaryProofSha256',
]
const POLICY_V1_KEYS = ['schemaVersion', 'exactPaths', 'generatedExactPaths', 'pathPrefixes']
const POLICY_V2_KEYS = [...POLICY_V1_KEYS, 'providerSurfaceAuthority']
const PROVIDER_AUTHORITY_KEYS = ['derivationPolicy', 'lockPath', 'manifestPath']
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const SHA256 = /^[a-f0-9]{64}$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/
const invariant = (condition, message) => { if (!condition) throw new Error(message) }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const comparePathBytes = (left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

function regular(path, label) {
  const stat = lstatSync(path)
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`)
  return stat
}

function normalizePath(path, { prefix = false } = {}) {
  invariant(typeof path === 'string' && path && !isAbsolute(path) && !path.includes('\\') && !/[\0\r\n]/.test(path), `MIRROR-PATH-001: unsafe path ${JSON.stringify(path)}`)
  const body = prefix && path.endsWith('/') ? path.slice(0, -1) : path
  invariant(body && body.split('/').every(part => part && part !== '.' && part !== '..') && `${body}${prefix ? '/' : ''}` === path, `MIRROR-PATH-001: non-canonical path ${path}`)
  invariant(body !== '.git' && !body.startsWith('.git/'), `MIRROR-PATH-001: git metadata is forbidden: ${path}`)
  return path
}

function inventory(root, { allowRootGitMetadata = false } = {}) {
  const files = []
  const visit = directory => {
    for (const name of readdirSync(directory).sort(comparePathBytes)) {
      if (allowRootGitMetadata && directory === root && name === '.git') continue
      const absolute = join(directory, name)
      const stat = lstatSync(absolute)
      const path = normalizePath(relative(root, absolute).replaceAll('\\', '/'))
      invariant(!stat.isSymbolicLink(), `MIRROR-PATH-002: mirror contains symlink ${path}`)
      if (stat.isDirectory()) visit(absolute)
      else {
        invariant(stat.isFile(), `MIRROR-PATH-002: mirror contains special file ${path}`)
        files.push({ path, mode: (stat.mode & 0o777).toString(8), sha256: sha256(readFileSync(absolute)) })
      }
    }
  }
  visit(root)
  return files.sort((left, right) => comparePathBytes(left.path, right.path))
}

export function resolvePublishedTemplateMirrorPolicy({ policy, authorityRoot = null }) {
  const expectedKeys = policy?.schemaVersion === 2 ? POLICY_V2_KEYS : POLICY_V1_KEYS
  invariant(exactKeys(policy, expectedKeys) && [1, 2].includes(policy.schemaVersion), 'MIRROR-POLICY-001: protected-base mirror policy has an open or invalid shape')
  invariant(Array.isArray(policy.exactPaths) && Array.isArray(policy.generatedExactPaths) && Array.isArray(policy.pathPrefixes), 'MIRROR-POLICY-001: mirror policy arrays are missing')
  const exactPaths = policy.exactPaths.map(path => normalizePath(path))
  const generatedExactPaths = policy.generatedExactPaths.map(path => normalizePath(path))
  const pathPrefixes = policy.pathPrefixes.map(path => normalizePath(path, { prefix: true }))
  const requiredPathPrefixes = []
  if (policy.schemaVersion === 2) {
    invariant(exactKeys(policy.providerSurfaceAuthority, PROVIDER_AUTHORITY_KEYS), 'MIRROR-POLICY-001: provider surface authority has an open or invalid shape')
    invariant(policy.providerSurfaceAuthority.derivationPolicy === MIRROR_PROVIDER_POLICY, 'MIRROR-POLICY-001: provider surface derivation policy is unsupported')
    invariant(authorityRoot, 'MIRROR-POLICY-001: provider surface policy requires its protected authority root')
    const authority = loadVerifiedForkSurfaceAuthority({ authorityRoot, ...policy.providerSurfaceAuthority })
    const derived = deriveManagedSurfaceMirrorPolicy(authority)
    exactPaths.push(...derived.exactPaths)
    pathPrefixes.push(...derived.pathPrefixes)
    requiredPathPrefixes.push(...derived.requiredPathPrefixes)
  }
  const exact = new Set(exactPaths)
  const generated = new Set(generatedExactPaths)
  invariant(exact.size === exactPaths.length && generated.size === generatedExactPaths.length && new Set(pathPrefixes).size === pathPrefixes.length, 'MIRROR-POLICY-001: mirror policy paths are duplicated across static and provider-derived authority')
  invariant([...exact].every(path => !generated.has(path)), 'MIRROR-POLICY-001: a mirror path cannot be both static/provider-managed and post-release generated')
  for (const path of [...exact, ...generated]) invariant(!pathPrefixes.some(prefix => path.startsWith(prefix)), `MIRROR-POLICY-001: exact mirror path overlaps a tree policy:${path}`)
  for (let left = 0; left < pathPrefixes.length; left += 1) for (let right = left + 1; right < pathPrefixes.length; right += 1) {
    invariant(!pathPrefixes[right].startsWith(pathPrefixes[left]) && !pathPrefixes[left].startsWith(pathPrefixes[right]), `MIRROR-POLICY-001: mirror tree policies overlap:${pathPrefixes[left]}:${pathPrefixes[right]}`)
  }
  return { exact, generated, prefixes: pathPrefixes, requiredPathPrefixes }
}

export function validateMirrorInventory({ files, policy, requireGenerated = true, authorityRoot = null }) {
  const { exact, generated, prefixes, requiredPathPrefixes } = resolvePublishedTemplateMirrorPolicy({ policy, authorityRoot })
  const seen = new Set()
  for (const item of files) {
    const path = normalizePath(item.path)
    invariant(!seen.has(path), `MIRROR-PATH-003: duplicate mirror path ${path}`)
    seen.add(path)
    invariant(exact.has(path) || generated.has(path) || prefixes.some(prefix => path.startsWith(prefix)), `MIRROR-PATH-004: mirror path is outside protected-base allowlist: ${path}`)
  }
  for (const path of exact) invariant(seen.has(path), `MIRROR-PATH-005: required mirror path is missing: ${path}`)
  if (requireGenerated) for (const path of generated) invariant(seen.has(path), `MIRROR-PATH-005: required generated mirror path is missing: ${path}`)
  for (const prefix of requiredPathPrefixes) invariant([...seen].some(path => path.startsWith(prefix)), `MIRROR-PATH-005: required provider mirror tree is missing or empty: ${prefix}`)
  return true
}

export function validateMirrorRoot({ mirrorRoot, policy, requireGenerated = true, allowRootGitMetadata = false, authorityRoot = null }) {
  const requestedRoot = resolve(mirrorRoot)
  const requestedStat = lstatSync(requestedRoot)
  invariant(requestedStat.isDirectory() && !requestedStat.isSymbolicLink(), 'MIRROR-PATH-002: mirror root must be a real directory')
  const files = inventory(realpathSync(requestedRoot), { allowRootGitMetadata })
  validateMirrorInventory({ files, policy, requireGenerated, authorityRoot })
  return files
}

export function verifyMirrorEvidenceEnvelope({
  evidenceDirectory,
  expectedSourceSha,
  expectedSourceTree,
  expectedVersion = null,
  expectedArchiveSha256 = null,
  expectedTreeSha256 = null,
  expectedReleaseBomSha256 = null,
  expectedScaffoldLockSha256 = null,
  expectedActivationBoundaryProofSha256 = null,
}) {
  const evidence = realpathSync(evidenceDirectory)
  const evidenceFiles = [
    'mirror.tar',
    ACTIVATION_BOUNDARY_PROOF_ASSET,
    PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
    'receipt.json',
    'release-bom.json',
  ].sort()
  invariant(JSON.stringify(readdirSync(evidence).sort()) === JSON.stringify(evidenceFiles), 'MIRROR-EVIDENCE-001: evidence must contain exactly mirror.tar, mirror-activation-boundary-proof.json, receipt.json, release-bom.json, and the scaffold lock')
  const archive = join(evidence, 'mirror.tar')
  const receiptPath = join(evidence, 'receipt.json')
  const bomPath = join(evidence, 'release-bom.json')
  const scaffoldLockPath = join(evidence, PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET)
  const activationBoundaryProofPath = join(evidence, ACTIVATION_BOUNDARY_PROOF_ASSET)
  regular(archive, 'mirror archive'); regular(receiptPath, 'mirror receipt')
  const bomStat = regular(bomPath, 'release BOM'); const scaffoldStat = regular(scaffoldLockPath, 'scaffold lock')
  regular(activationBoundaryProofPath, 'mirror activation-boundary proof')
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  invariant(exactKeys(receipt, RECEIPT_KEYS) && receipt.schemaVersion === 4, 'MIRROR-EVIDENCE-002: receipt has an open or invalid shape')
  invariant(SHA.test(expectedSourceSha ?? '') && receipt.sourceSha === expectedSourceSha, 'MIRROR-EVIDENCE-003: receipt source is not the protected triggering commit')
  invariant(SHA.test(expectedSourceTree ?? '') && receipt.sourceTree === expectedSourceTree, 'MIRROR-EVIDENCE-003: receipt tree is not the immutable release tree')
  invariant(VERSION.test(receipt.version ?? '') && [
    receipt.archiveSha256,
    receipt.treeSha256,
    receipt.releaseBomSha256,
    receipt.scaffoldLockSha256,
    receipt.activationBoundaryProofSha256,
  ].every(value => SHA256.test(value ?? '')), 'MIRROR-EVIDENCE-002: receipt identity is invalid')
  for (const [label, expected, actual, pattern] of [
    ['version', expectedVersion, receipt.version, VERSION],
    ['archive digest', expectedArchiveSha256, receipt.archiveSha256, SHA256],
    ['tree digest', expectedTreeSha256, receipt.treeSha256, SHA256],
    ['release BOM digest', expectedReleaseBomSha256, receipt.releaseBomSha256, SHA256],
    ['scaffold lock digest', expectedScaffoldLockSha256, receipt.scaffoldLockSha256, SHA256],
    ['activation-boundary proof digest', expectedActivationBoundaryProofSha256, receipt.activationBoundaryProofSha256, SHA256],
  ]) {
    if (expected !== null) invariant(pattern.test(expected ?? '') && actual === expected, `MIRROR-EVIDENCE-007: receipt ${label} differs from the credential-free job output`)
  }
  invariant(sha256(readFileSync(archive)) === receipt.archiveSha256, 'MIRROR-EVIDENCE-004: archive digest mismatch')
  const bomBytes = readFileSync(bomPath)
  const scaffoldLockBytes = readFileSync(scaffoldLockPath)
  const activationBoundaryProofBytes = readFileSync(activationBoundaryProofPath)
  invariant(sha256(bomBytes) === receipt.releaseBomSha256, 'MIRROR-EVIDENCE-006: release BOM digest mismatch')
  invariant(sha256(scaffoldLockBytes) === receipt.scaffoldLockSha256, 'MIRROR-EVIDENCE-006: scaffold lock digest mismatch')
  invariant(sha256(activationBoundaryProofBytes) === receipt.activationBoundaryProofSha256, 'MIRROR-EVIDENCE-008: activation-boundary proof digest mismatch')
  const bom = validateReleaseBom(JSON.parse(bomBytes.toString('utf8')), { requireSbom: true })
  const scaffoldLock = validateProductTemplateScaffoldLock(JSON.parse(scaffoldLockBytes.toString('utf8')))
  let activationBoundaryProof
  try {
    activationBoundaryProof = JSON.parse(activationBoundaryProofBytes.toString('utf8'))
  } catch (error) {
    throw new Error(`MIRROR-EVIDENCE-008: activation-boundary proof is not valid JSON: ${error.message}`, { cause: error })
  }
  try {
    validateMirrorActivationBoundaryProof(activationBoundaryProof, { now: new Date() })
  } catch (error) {
    throw new Error(`MIRROR-EVIDENCE-008: activation-boundary proof is invalid: ${error.message}`, { cause: error })
  }
  invariant(
    activationBoundaryProof.release.commit === receipt.sourceSha
      && activationBoundaryProof.release.tree === receipt.sourceTree,
    'MIRROR-EVIDENCE-008: activation-boundary proof release differs from the receipt source commit/tree',
  )
  const scaffoldBinding = bom.governance.productTemplateScaffold
  invariant(
    bom.releaseVersion === receipt.version
      && bom.source.gitCommit === receipt.sourceSha
      && bom.source.gitTree === receipt.sourceTree
      && scaffoldBinding.path === PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET
      && scaffoldBinding.size === scaffoldStat.size
      && scaffoldBinding.sha256 === receipt.scaffoldLockSha256
      && scaffoldBinding.schemaVersion === scaffoldLock.schemaVersion
      && scaffoldBinding.releaseVersion === scaffoldLock.releaseVersion
      && scaffoldBinding.staticTreeSha256 === scaffoldLock.staticTreeSha256
      && scaffoldBinding.publishedPathCount === scaffoldLock.publishedPathCount,
    'MIRROR-EVIDENCE-006: release BOM does not bind the exact scaffold lock bytes/inventory',
  )
  invariant(bomStat.size === bomBytes.length, 'MIRROR-EVIDENCE-006: release BOM size changed during readback')
  return { receipt, bom, scaffoldLock, activationBoundaryProof, evidence }
}

export function verifyMirrorEvidence({
  evidenceDirectory,
  mirrorRoot,
  policyPath,
  expectedSourceSha,
  expectedSourceTree,
  expectedVersion = null,
  expectedArchiveSha256 = null,
  expectedTreeSha256 = null,
  expectedReleaseBomSha256 = null,
  expectedScaffoldLockSha256 = null,
  expectedActivationBoundaryProofSha256 = null,
  allowRootGitMetadata = false,
}) {
  const { receipt, bom, scaffoldLock } = verifyMirrorEvidenceEnvelope({
    evidenceDirectory,
    expectedSourceSha,
    expectedSourceTree,
    expectedVersion,
    expectedArchiveSha256,
    expectedTreeSha256,
    expectedReleaseBomSha256,
    expectedScaffoldLockSha256,
    expectedActivationBoundaryProofSha256,
  })
  const mirror = resolve(mirrorRoot)
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  const authorityRoot = policy.schemaVersion === 2 ? resolve(dirname(resolve(policyPath)), '..') : null
  const files = validateMirrorRoot({ mirrorRoot: mirror, policy, requireGenerated: true, allowRootGitMetadata, authorityRoot })
  verifyProductTemplateScaffold({ root: mirror, lock: scaffoldLock, phase: 'published', releaseBom: bom, allowRootGitMetadata })
  const treeBody = files.map(item => `${item.mode} ${item.sha256} ./${item.path}\n`).join('')
  invariant(sha256(Buffer.from(treeBody)) === receipt.treeSha256, 'MIRROR-EVIDENCE-005: extracted tree differs from receipt')
  // A source-scaffold is intentionally incomplete: the credential-free release job is the sole
  // producer of package-lock.json. Only the receipt-bound published tree may cross the Day-0
  // boundary, and it must already satisfy the exact setup snapshot contract without installing.
  assertCommittedSetupSnapshot(mirror)
  return receipt
}

function arg(args, flag) {
  const at = args.indexOf(flag)
  invariant(at >= 0 && args[at + 1] && !args[at + 1].startsWith('--'), `missing ${flag}`)
  return args[at + 1]
}

function main() {
  const args = process.argv.slice(2)
  const expected = {
    evidenceDirectory: resolve(arg(args, '--evidence')),
    expectedSourceSha: arg(args, '--source-sha'),
    expectedSourceTree: arg(args, '--source-tree'),
    expectedVersion: arg(args, '--version'),
    expectedArchiveSha256: arg(args, '--archive-sha256'),
    expectedTreeSha256: arg(args, '--tree-sha256'),
    expectedReleaseBomSha256: arg(args, '--release-bom-sha256'),
    expectedScaffoldLockSha256: arg(args, '--scaffold-lock-sha256'),
    expectedActivationBoundaryProofSha256: arg(args, '--activation-boundary-proof-sha256'),
  }
  if (args.includes('--pre-extract')) {
    verifyMirrorEvidenceEnvelope(expected)
    console.log('mirror evidence envelope verified before archive extraction')
    return
  }
  const receipt = verifyMirrorEvidence({
    ...expected,
    mirrorRoot: resolve(arg(args, '--mirror')),
    policyPath: resolve(arg(args, '--policy')),
    allowRootGitMetadata: args.includes('--allow-git-metadata'),
  })
  if (process.env.GITHUB_OUTPUT) {
    regular(process.env.GITHUB_OUTPUT, 'GitHub step output')
    appendFileSync(process.env.GITHUB_OUTPUT, `source_sha=${receipt.sourceSha}\nsource_tree=${receipt.sourceTree}\nversion=${receipt.version}\narchive_sha256=${receipt.archiveSha256}\ntree_sha256=${receipt.treeSha256}\nrelease_bom_sha256=${receipt.releaseBomSha256}\nscaffold_lock_sha256=${receipt.scaffoldLockSha256}\nactivation_boundary_proof_sha256=${receipt.activationBoundaryProofSha256}\n`)
  }
  console.log('published-day0 mirror evidence independently verified against protected-base inventory and setup contracts')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main() } catch (error) { console.error(error.message); process.exit(1) }
}
