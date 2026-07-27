import { createHash, verify as verifySignature } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  RELEASE_PACKAGE_NAMES,
  validateReleaseBom,
} from '../../../scripts/release-bom-contract.mjs'
import {
  validateProductTemplateScaffoldLock,
  verifyProductTemplateScaffold,
} from '../../../scripts/product-template-scaffold-lock.mjs'
import {
  assertClosedGitLocalConfiguration,
  compareUtf8Bytes,
  deepEqual,
  invariant,
  normalizeRepoPath,
  resolveOwnership,
  runClosedGit,
  sha256,
  stableStringify,
  validateInventory,
} from './common.mjs'
import {
  loadConsumerUpgradeProtocol,
  protocolSourceDigests,
  upgradeProfile,
  validateConsumerBootstrapReadback,
  validateConsumerControlPlaneUpdateReadback,
} from './consumer-upgrade-protocol.mjs'
import { validateCandidateRelease } from './release-evidence.mjs'
import { validateAttestationPolicy } from './attestation.mjs'
import {
  issuerRegistryDigest,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
} from './issuer-registry.mjs'
import {
  packageScriptsAreIdentical,
  PROTECTED_CONTROL_PLANE_EXACT_PATHS,
  PROTECTED_CONTROL_PLANE_PATH_PREFIXES,
  requiresReviewedControlPlaneUpdate,
} from '../../../scripts/lib/consumer-control-plane-policy.mjs'

const LIB_ROOT = dirname(fileURLToPath(import.meta.url))
const IMPLEMENTATION_PATH = fileURLToPath(import.meta.url)
const CONTROL_PLANE_POLICY_PATH = fileURLToPath(
  new URL('../../../scripts/lib/consumer-control-plane-policy.mjs', import.meta.url),
)

export const CONSUMER_BOOTSTRAP_PLAN_SCHEMA = 'https://qijenchen.dev/schemas/consumer-bootstrap-plan-v1.schema.json'
export const CONSUMER_BOOTSTRAP_SNAPSHOT_VERIFICATION_SCHEMA = 'https://qijenchen.dev/schemas/consumer-bootstrap-snapshot-verification-v1.schema.json'
export const CONSUMER_BOOTSTRAP_READBACK_VERIFICATION_SCHEMA = 'https://qijenchen.dev/schemas/consumer-bootstrap-readback-verification-v1.schema.json'
export const CONSUMER_BOOTSTRAP_PROMOTION_PROPOSAL_SCHEMA = 'https://qijenchen.dev/schemas/consumer-bootstrap-promotion-proposal-v1.schema.json'
export const CONSUMER_CONTROL_PLANE_UPDATE_PLAN_SCHEMA = 'https://qijenchen.dev/schemas/consumer-control-plane-update-plan-v1.schema.json'
export const CONSUMER_CONTROL_PLANE_UPDATE_SNAPSHOT_VERIFICATION_SCHEMA = 'https://qijenchen.dev/schemas/consumer-control-plane-update-snapshot-verification-v1.schema.json'
export const CONSUMER_CONTROL_PLANE_UPDATE_READBACK_SCHEMA = 'https://qijenchen.dev/schemas/consumer-control-plane-update-readback-v1.schema.json'
export const CONSUMER_CONTROL_PLANE_UPDATE_READBACK_VERIFICATION_SCHEMA = 'https://qijenchen.dev/schemas/consumer-control-plane-update-readback-verification-v1.schema.json'
export const CONSUMER_CONTROL_PLANE_UPDATE_ACCEPTANCE_PROPOSAL_SCHEMA = 'https://qijenchen.dev/schemas/consumer-control-plane-update-acceptance-proposal-v1.schema.json'
export const CONSUMER_CONTROL_PLANE_BASELINE_RECEIPT_SCHEMA = 'https://qijenchen.dev/schemas/consumer-control-plane-baseline-receipt-v1.schema.json'

const PLAN_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-bootstrap-plan.schema.json')
const SNAPSHOT_VERIFICATION_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-bootstrap-snapshot-verification.schema.json')
const READBACK_VERIFICATION_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-bootstrap-readback-verification.schema.json')
const PROMOTION_PROPOSAL_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-bootstrap-promotion-proposal.schema.json')
const CONTROL_PLANE_PLAN_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-control-plane-update-plan.schema.json')
const CONTROL_PLANE_SNAPSHOT_VERIFICATION_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-control-plane-update-snapshot-verification.schema.json')
const CONTROL_PLANE_READBACK_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-control-plane-update-readback.schema.json')
const CONTROL_PLANE_READBACK_VERIFICATION_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-control-plane-update-readback-verification.schema.json')
const CONTROL_PLANE_ACCEPTANCE_PROPOSAL_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-control-plane-update-acceptance-proposal.schema.json')
const CONTROL_PLANE_BASELINE_RECEIPT_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-control-plane-baseline-receipt.schema.json')
const MANAGED_REPOS_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/managed-repos.schema.json')
const REPOSITORY_ROOT = resolve(LIB_ROOT, '../../..')

const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const BASE64URL_SIGNATURE = /^[A-Za-z0-9_-]{86}$/
const MAX_CONTROL_PLANE_PLAN_CANONICAL_BYTES = 16 * 1024 * 1024
const RESERVED_ROOT_NAMES = new Set(['.git', 'node_modules'])
const REVIEW_REQUIREMENTS = Object.freeze([
  'review-full-snapshot-diff',
  'verify-independent-readback',
  'merge-protected-inventory-pr',
])

const clone = value => structuredClone(value)
const comparePath = (left, right) => left < right ? -1 : left > right ? 1 : 0

function loadBoundSchema(path, label, { strict = true, additionalSchemas = [] } = {}) {
  const { bytes } = readBoundRegularFile(path, label)
  let schema
  try {
    schema = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error })
  }
  const ajv = new Ajv2020({ allErrors: true, strict })
  for (const additional of additionalSchemas) ajv.addSchema(additional)
  return {
    bytes,
    sha256: sha256(bytes),
    validate: ajv.compile(schema),
  }
}

const PLAN_SCHEMA_SOURCE = loadBoundSchema(PLAN_SCHEMA_PATH, 'consumer bootstrap plan schema')
const SNAPSHOT_VERIFICATION_SCHEMA_SOURCE = loadBoundSchema(SNAPSHOT_VERIFICATION_SCHEMA_PATH, 'consumer bootstrap snapshot verification schema')
const READBACK_VERIFICATION_SCHEMA_SOURCE = loadBoundSchema(READBACK_VERIFICATION_SCHEMA_PATH, 'consumer bootstrap readback verification schema')
const CONTROL_PLANE_PLAN_SCHEMA_SOURCE = loadBoundSchema(CONTROL_PLANE_PLAN_SCHEMA_PATH, 'consumer control-plane update plan schema')
const CONTROL_PLANE_SNAPSHOT_VERIFICATION_SCHEMA_SOURCE = loadBoundSchema(CONTROL_PLANE_SNAPSHOT_VERIFICATION_SCHEMA_PATH, 'consumer control-plane update snapshot verification schema')
const CONTROL_PLANE_READBACK_SCHEMA_SOURCE = loadBoundSchema(CONTROL_PLANE_READBACK_SCHEMA_PATH, 'consumer control-plane update readback schema')
const CONTROL_PLANE_READBACK_VERIFICATION_SCHEMA_SOURCE = loadBoundSchema(CONTROL_PLANE_READBACK_VERIFICATION_SCHEMA_PATH, 'consumer control-plane update readback verification schema')
const CONTROL_PLANE_BASELINE_RECEIPT_SCHEMA_SOURCE = loadBoundSchema(CONTROL_PLANE_BASELINE_RECEIPT_SCHEMA_PATH, 'consumer control-plane baseline receipt schema')
const MANAGED_REPOS_SCHEMA_SOURCE = loadBoundSchema(MANAGED_REPOS_SCHEMA_PATH, 'managed repository inventory schema', { strict: false })
const PROMOTION_PROPOSAL_SCHEMA_SOURCE = loadBoundSchema(
  PROMOTION_PROPOSAL_SCHEMA_PATH,
  'consumer bootstrap promotion proposal schema',
  {
    strict: false,
    additionalSchemas: [JSON.parse(MANAGED_REPOS_SCHEMA_SOURCE.bytes.toString('utf8'))],
  },
)
const CONTROL_PLANE_ACCEPTANCE_PROPOSAL_SCHEMA_SOURCE = loadBoundSchema(
  CONTROL_PLANE_ACCEPTANCE_PROPOSAL_SCHEMA_PATH,
  'consumer control-plane update acceptance proposal schema',
  {
    strict: false,
    additionalSchemas: [JSON.parse(MANAGED_REPOS_SCHEMA_SOURCE.bytes.toString('utf8'))],
  },
)
const validatePlanSchema = PLAN_SCHEMA_SOURCE.validate
const validateSnapshotVerificationSchema = SNAPSHOT_VERIFICATION_SCHEMA_SOURCE.validate
const validateReadbackVerificationSchema = READBACK_VERIFICATION_SCHEMA_SOURCE.validate
const validatePromotionProposalSchema = PROMOTION_PROPOSAL_SCHEMA_SOURCE.validate
const validateControlPlanePlanSchema = CONTROL_PLANE_PLAN_SCHEMA_SOURCE.validate
const validateControlPlaneSnapshotVerificationSchema = CONTROL_PLANE_SNAPSHOT_VERIFICATION_SCHEMA_SOURCE.validate
const validateControlPlaneReadbackSchema = CONTROL_PLANE_READBACK_SCHEMA_SOURCE.validate
const validateControlPlaneReadbackVerificationSchema = CONTROL_PLANE_READBACK_VERIFICATION_SCHEMA_SOURCE.validate
const validateControlPlaneAcceptanceProposalSchema = CONTROL_PLANE_ACCEPTANCE_PROPOSAL_SCHEMA_SOURCE.validate
const validateControlPlaneBaselineReceiptSchema = CONTROL_PLANE_BASELINE_RECEIPT_SCHEMA_SOURCE.validate
const validateManagedReposSchema = MANAGED_REPOS_SCHEMA_SOURCE.validate

function schemaInvariant(validator, value, label) {
  invariant(
    validator(value),
    `${label} schema validation failed: ${validator.errors?.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`,
  )
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

function asBytes(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value)
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') return Buffer.from(value)
  throw new Error(`${label} must be exact bytes or a UTF-8 string`)
}

function parseJsonBytes(value, label) {
  const bytes = asBytes(value, label)
  let parsed
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error })
  }
  return { bytes, value: parsed }
}

function domainDigest(domain, value) {
  return createHash('sha256').update(domain).update('\0').update(stableStringify(value, 0)).digest('hex')
}

function digestWithout(value, field, domain) {
  const projected = clone(value)
  delete projected[field]
  return domainDigest(domain, projected)
}

function assertRepoPath(repoPath, label = 'repository path') {
  invariant(typeof repoPath === 'string' && repoPath.length > 0, `${label} must be non-empty`)
  invariant(!isAbsolute(repoPath) && !repoPath.includes('\\') && !/[\u0000-\u001f\u007f]/u.test(repoPath), `${label} is unsafe: ${JSON.stringify(repoPath)}`)
  const segments = repoPath.split('/')
  invariant(segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..'), `${label} contains an unsafe segment: ${repoPath}`)
  invariant(normalizeRepoPath(repoPath) === repoPath, `${label} is not canonical: ${repoPath}`)
  return repoPath
}

function pathWithin(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function modeString(stat) {
  return `0${Number(stat.mode & 0o777n).toString(8).padStart(3, '0')}`
}

function sameOpenedFile(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function assertRegularFileStat(stat, label) {
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${label} is not a regular file`)
  invariant(stat.nlink === 1n, `${label} is hard-linked; bootstrap sources require link count 1`)
  invariant((stat.mode & 0o7000n) === 0n, `${label} has unsupported special permission bits`)
  invariant(stat.size <= BigInt(Number.MAX_SAFE_INTEGER), `${label} is too large to bind safely`)
}

function readBoundRegularFile(path, label) {
  invariant(typeof constants.O_NOFOLLOW === 'number', 'The host does not provide O_NOFOLLOW; bootstrap materialization fails closed')
  const before = lstatSync(path, { bigint: true })
  invariant(!before.isSymbolicLink(), `${label} is a symbolic link`)
  assertRegularFileStat(before, label)
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = fstatSync(fd, { bigint: true })
    assertRegularFileStat(opened, label)
    invariant(sameOpenedFile(before, opened), `${label} changed while it was opened`)
    const bytes = readFileSync(fd)
    const afterRead = fstatSync(fd, { bigint: true })
    invariant(sameOpenedFile(opened, afterRead) && BigInt(bytes.length) === afterRead.size, `${label} changed while it was read`)
    const afterPath = lstatSync(path, { bigint: true })
    invariant(sameOpenedFile(afterRead, afterPath), `${label} was substituted while it was read`)
    return {
      bytes,
      entry: {
        mode: modeString(opened),
        size: bytes.length,
        sha256: sha256(bytes),
      },
    }
  } finally {
    closeSync(fd)
  }
}

function canonicalDirectoryRoot(root, label) {
  invariant(typeof root === 'string' && root.length > 0, `${label} root must be a non-empty path`)
  const requested = resolve(root)
  const stat = lstatSync(requested, { bigint: true })
  invariant(!stat.isSymbolicLink() && stat.isDirectory(), `${label} root must be a real directory, not a symlink or unsupported type`)
  return realpathSync(requested)
}

function manifestTreeDigest(entries) {
  return domainDigest('consumer-bootstrap-file-tree-v1', entries)
}

function gitSha1Object(type, body) {
  return createHash('sha1').update(`${type} ${body.length}\0`).update(body).digest()
}

function materializedGitTreeSha1(root, entries) {
  const tree = new Map()
  for (const entry of entries) {
    let node = tree
    const segments = entry.path.split('/')
    const name = segments.pop()
    for (const segment of segments) {
      if (!node.has(segment)) node.set(segment, { kind: 'tree', entries: new Map() })
      const child = node.get(segment)
      invariant(child.kind === 'tree', `Materialized Git tree topology collides at ${entry.path}`)
      node = child.entries
    }
    const bytes = readExpectedSource(root, entry, 'materialized consumer control-plane Git tree')
    node.set(name, {
      kind: 'blob',
      mode: entry.mode === '0755' ? '100755' : '100644',
      oid: gitSha1Object('blob', bytes),
    })
  }
  const hashTree = node => {
    const records = [...node.entries()].sort(([leftName, left], [rightName, right]) => Buffer.compare(
      Buffer.from(`${leftName}${left.kind === 'tree' ? '/' : '\0'}`, 'utf8'),
      Buffer.from(`${rightName}${right.kind === 'tree' ? '/' : '\0'}`, 'utf8'),
    )).map(([name, item]) => {
      const mode = item.kind === 'tree' ? '40000' : item.mode
      const oid = item.kind === 'tree' ? hashTree(item.entries) : item.oid
      return Buffer.concat([Buffer.from(`${mode} ${name}\0`, 'utf8'), oid])
    })
    return gitSha1Object('tree', Buffer.concat(records))
  }
  return hashTree(tree).toString('hex')
}

function assertManifestTopology(entries, label) {
  const seen = new Set()
  for (const entry of entries) {
    assertRepoPath(entry.path, `${label} entry path`)
    invariant(!seen.has(entry.path), `${label} contains duplicate path ${entry.path}`)
    const segments = entry.path.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      invariant(!seen.has(segments.slice(0, index).join('/')), `${label} has a file/directory topology collision at ${entry.path}`)
    }
    seen.add(entry.path)
  }
}

function scanSnapshotRoot(root, label, { excludeReserved = true } = {}) {
  const canonicalRoot = canonicalDirectoryRoot(root, label)
  const entries = []

  const visit = (absoluteDirectory, relativeDirectory) => {
    const before = lstatSync(absoluteDirectory, { bigint: true })
    invariant(!before.isSymbolicLink() && before.isDirectory(), `${label} contains a symbolic link or unsupported directory at ${relativeDirectory || '.'}`)
    const expectedReal = relativeDirectory ? join(canonicalRoot, ...relativeDirectory.split('/')) : canonicalRoot
    invariant(realpathSync(absoluteDirectory) === expectedReal, `${label} directory path was substituted at ${relativeDirectory || '.'}`)
    const names = readdirSync(absoluteDirectory).sort(comparePath)
    for (const name of names) {
      const repoPath = relativeDirectory ? `${relativeDirectory}/${name}` : name
      assertRepoPath(repoPath, `${label} path`)
      const absolute = join(absoluteDirectory, name)
      const stat = lstatSync(absolute, { bigint: true })
      if (RESERVED_ROOT_NAMES.has(name)) {
        invariant(!stat.isSymbolicLink(), `${label} reserved path ${repoPath} is a symbolic link`)
        if (excludeReserved) {
          invariant(stat.isDirectory() || (name === '.git' && stat.isFile()), `${label} reserved path ${repoPath} has an unsupported type`)
          continue
        }
        throw new Error(`${label} materialized snapshot contains reserved path ${repoPath}`)
      }
      invariant(!stat.isSymbolicLink(), `${label} contains symbolic link ${repoPath}`)
      if (stat.isDirectory()) {
        visit(absolute, repoPath)
        continue
      }
      invariant(stat.isFile(), `${label} contains unsupported path type at ${repoPath}`)
      const read = readBoundRegularFile(absolute, `${label}:${repoPath}`)
      entries.push({ path: repoPath, ...read.entry })
    }
    const after = lstatSync(absoluteDirectory, { bigint: true })
    invariant(before.dev === after.dev && before.ino === after.ino && before.mode === after.mode, `${label} directory changed while it was scanned at ${relativeDirectory || '.'}`)
  }

  visit(canonicalRoot, '')
  entries.sort((left, right) => comparePath(left.path, right.path))
  assertManifestTopology(entries, label)
  return {
    canonicalRoot,
    manifest: {
      treeSha256: manifestTreeDigest(entries),
      entryCount: entries.length,
      entries,
    },
  }
}

function runReadOnlyGit(root, args, label) {
  assertClosedGitLocalConfiguration(root, { maxOutputBytes: 4 * 1024 * 1024 })
  const result = runClosedGit(args, {
    cwd: root,
    maxOutputBytes: 64 * 1024 * 1024,
    output: 'buffer',
    timeoutMs: 30_000,
  })
  invariant(!result.error && result.status === 0, `${label} Git object inspection failed: ${Buffer.from(result.stderr ?? '').toString('utf8').trim() || result.error?.message || 'unknown git error'}`)
  return Buffer.from(result.stdout ?? '')
}

function gitObjectDigest(bytes, algorithm) {
  return createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

function sensitiveSnapshotPath(repoPath) {
  const name = repoPath.split('/').at(-1).toLowerCase()
  if (/^\.env(?:\.|$)/.test(name) && !/\.(?:example|sample|template)$/.test(name)) return true
  if (['id_rsa', 'id_ed25519', '.git-credentials'].includes(name)) return true
  return /^(?:credentials|secrets?)\.json$/.test(name)
}

export function inspectConsumerControlPlaneGitSnapshot(root, label = 'consumer control-plane Git snapshot') {
  const canonicalRoot = canonicalDirectoryRoot(root, label)
  const gitMetadata = lstatSync(join(canonicalRoot, '.git'), { bigint: true })
  invariant(
    !gitMetadata.isSymbolicLink()
      && (gitMetadata.isDirectory() || (gitMetadata.isFile() && gitMetadata.nlink === 1n)),
    `${label} Git metadata entry is a symlink, hardlink, or unsupported type`,
  )
  const topLevel = runReadOnlyGit(canonicalRoot, ['rev-parse', '--show-toplevel'], label).toString('utf8').trim()
  invariant(realpathSync(topLevel) === canonicalRoot, `${label} root must be the exact Git worktree top level`)
  const objectFormat = runReadOnlyGit(canonicalRoot, ['rev-parse', '--show-object-format'], label).toString('utf8').trim()
  invariant(['sha1', 'sha256'].includes(objectFormat), `${label} uses unsupported Git object format ${objectFormat}`)
  const status = runReadOnlyGit(
    canonicalRoot,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching'],
    label,
  )
  invariant(status.length === 0, `${label} must be a clean tracked-only snapshot with no staged, modified, untracked, or ignored paths`)
  const commit = runReadOnlyGit(canonicalRoot, ['rev-parse', '--verify', 'HEAD^{commit}'], label).toString('utf8').trim()
  const tree = runReadOnlyGit(canonicalRoot, ['rev-parse', '--verify', 'HEAD^{tree}'], label).toString('utf8').trim()
  invariant(GIT_OID.test(commit) && GIT_OID.test(tree), `${label} HEAD commit/tree identity is invalid`)
  const treeRecords = runReadOnlyGit(canonicalRoot, ['ls-tree', '-rz', '--full-tree', 'HEAD'], label)
    .subarray(0, -1)
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
  const entries = []
  for (const record of treeRecords) {
    const tab = record.indexOf('\t')
    invariant(tab > 0, `${label} contains an invalid Git tree record`)
    const metadata = record.slice(0, tab).split(' ')
    invariant(metadata.length === 3, `${label} contains an invalid Git tree record`)
    const [gitMode, type, objectId] = metadata
    const repoPath = assertRepoPath(record.slice(tab + 1), `${label} tracked path`)
    invariant(!sensitiveSnapshotPath(repoPath), `${label} contains a forbidden secret-bearing tracked path: ${repoPath}`)
    invariant(type === 'blob' && ['100644', '100755'].includes(gitMode), `${label} contains a symlink, submodule, or unsupported Git mode at ${repoPath}`)
    invariant(GIT_OID.test(objectId), `${label} contains an invalid Git blob object at ${repoPath}`)
    const absolute = join(canonicalRoot, ...repoPath.split('/'))
    invariant(realpathSync(absolute) === absolute, `${label} tracked path contains a symbolic-link substitution: ${repoPath}`)
    const read = readBoundRegularFile(absolute, `${label}:${repoPath}`)
    invariant(
      !/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/u.test(read.bytes.toString('utf8')),
      `${label} contains private-key material in a tracked path: ${repoPath}`,
    )
    const expectedMode = gitMode === '100755' ? '0755' : '0644'
    invariant(read.entry.mode === expectedMode, `${label} tracked path mode differs from its Git object mode: ${repoPath}`)
    invariant(gitObjectDigest(read.bytes, objectFormat) === objectId, `${label} tracked path bytes differ from its Git blob object: ${repoPath}`)
    entries.push({ path: repoPath, ...read.entry })
  }
  entries.sort((left, right) => comparePath(left.path, right.path))
  assertManifestTopology(entries, label)
  const finalStatus = runReadOnlyGit(
    canonicalRoot,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching'],
    label,
  )
  const finalCommit = runReadOnlyGit(canonicalRoot, ['rev-parse', '--verify', 'HEAD^{commit}'], label).toString('utf8').trim()
  const finalTree = runReadOnlyGit(canonicalRoot, ['rev-parse', '--verify', 'HEAD^{tree}'], label).toString('utf8').trim()
  invariant(
    finalStatus.length === 0 && finalCommit === commit && finalTree === tree,
    `${label} Git HEAD or worktree changed while its tracked object snapshot was inspected`,
  )
  return {
    canonicalRoot,
    git: { objectFormat, commit, tree },
    manifest: {
      treeSha256: manifestTreeDigest(entries),
      entryCount: entries.length,
      entries,
    },
  }
}

function controlPlaneEngineClosure() {
  const pending = [
    IMPLEMENTATION_PATH,
    fileURLToPath(new URL('./consumer-upgrade-protocol.mjs', import.meta.url)),
    fileURLToPath(new URL('../consumer-upgrade-protocol.json', import.meta.url)),
    fileURLToPath(new URL('../schemas/consumer-upgrade-protocol.schema.json', import.meta.url)),
    CONTROL_PLANE_POLICY_PATH,
    PLAN_SCHEMA_PATH,
    SNAPSHOT_VERIFICATION_SCHEMA_PATH,
    READBACK_VERIFICATION_SCHEMA_PATH,
    PROMOTION_PROPOSAL_SCHEMA_PATH,
    CONTROL_PLANE_PLAN_SCHEMA_PATH,
    CONTROL_PLANE_SNAPSHOT_VERIFICATION_SCHEMA_PATH,
    CONTROL_PLANE_READBACK_SCHEMA_PATH,
    CONTROL_PLANE_READBACK_VERIFICATION_SCHEMA_PATH,
    CONTROL_PLANE_ACCEPTANCE_PROPOSAL_SCHEMA_PATH,
    CONTROL_PLANE_BASELINE_RECEIPT_SCHEMA_PATH,
    MANAGED_REPOS_SCHEMA_PATH,
    resolve(REPOSITORY_ROOT, 'package.json'),
    resolve(REPOSITORY_ROOT, 'package-lock.json'),
  ]
  const visited = new Set()
  const entries = []
  while (pending.length > 0) {
    const path = resolve(pending.pop())
    if (visited.has(path)) continue
    invariant(pathWithin(REPOSITORY_ROOT, path), `Consumer control-plane engine dependency escapes the authority repository: ${path}`)
    const read = readBoundRegularFile(path, `consumer control-plane engine dependency ${relative(REPOSITORY_ROOT, path)}`)
    visited.add(path)
    const repoPath = relative(REPOSITORY_ROOT, path).split(sep).join('/')
    entries.push({ path: repoPath, sha256: read.entry.sha256 })
    if (!path.endsWith('.mjs') && !path.endsWith('.js')) continue
    const source = read.bytes.toString('utf8')
    const importPattern = /(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/gu
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1]
      invariant(!specifier.includes('?') && !specifier.includes('#'), `Consumer control-plane engine import is not a closed filesystem dependency: ${specifier}`)
      pending.push(resolve(dirname(path), specifier))
    }
  }
  entries.sort((left, right) => comparePath(left.path, right.path))
  return {
    entries,
    sha256: domainDigest('consumer-control-plane-engine-closure-v1', entries),
  }
}

function validateManifest(manifest, label) {
  invariant(manifest.entryCount === manifest.entries.length, `${label} entry count is stale`)
  const sorted = [...manifest.entries].sort((left, right) => comparePath(left.path, right.path))
  invariant(deepEqual(sorted, manifest.entries), `${label} entries are not canonically sorted`)
  assertManifestTopology(manifest.entries, label)
  invariant(manifest.treeSha256 === manifestTreeDigest(manifest.entries), `${label} tree digest is stale`)
  return manifest
}

function manifestMap(manifest) {
  return new Map(manifest.entries.map(entry => [entry.path, entry]))
}

function sameState(left, right) {
  return deepEqual(left, right)
}

function statesFor(path, maps) {
  return {
    base: clone(maps.base.get(path) ?? null),
    current: clone(maps.current.get(path) ?? null),
    incoming: clone(maps.incoming.get(path) ?? null),
  }
}

function loadProtocolBinding(protocolLoaded = loadConsumerUpgradeProtocol()) {
  exactKeys(protocolLoaded, ['implementationBytes', 'protocol', 'protocolBytes', 'schemaBytes'], 'loaded consumer upgrade protocol')
  const exactProtocol = JSON.parse(asBytes(protocolLoaded.protocolBytes, 'consumer upgrade protocol bytes').toString('utf8'))
  invariant(deepEqual(exactProtocol, protocolLoaded.protocol), 'consumer upgrade protocol object differs from its exact source bytes')
  const protocolSchema = JSON.parse(asBytes(protocolLoaded.schemaBytes, 'consumer upgrade protocol schema bytes').toString('utf8'))
  const validateProtocol = new Ajv2020({ allErrors: true, strict: true }).compile(protocolSchema)
  schemaInvariant(validateProtocol, protocolLoaded.protocol, 'consumer upgrade protocol')
  const sourceDigests = protocolSourceDigests(protocolLoaded)
  const engineClosure = controlPlaneEngineClosure()
  return {
    loaded: protocolLoaded,
    protocol: protocolLoaded.protocol,
    sourceDigests,
    bootstrapImplementationSha256: readBoundRegularFile(IMPLEMENTATION_PATH, 'consumer bootstrap implementation').entry.sha256,
    bootstrapPlanSchemaSha256: PLAN_SCHEMA_SOURCE.sha256,
    bootstrapSnapshotVerificationSchemaSha256: SNAPSHOT_VERIFICATION_SCHEMA_SOURCE.sha256,
    bootstrapReadbackVerificationSchemaSha256: READBACK_VERIFICATION_SCHEMA_SOURCE.sha256,
    bootstrapPromotionProposalSchemaSha256: PROMOTION_PROPOSAL_SCHEMA_SOURCE.sha256,
    controlPlaneImplementationSha256: readBoundRegularFile(IMPLEMENTATION_PATH, 'consumer reviewed snapshot implementation').entry.sha256,
    controlPlanePolicySha256: readBoundRegularFile(CONTROL_PLANE_POLICY_PATH, 'consumer control-plane path policy').entry.sha256,
    controlPlanePlanSchemaSha256: CONTROL_PLANE_PLAN_SCHEMA_SOURCE.sha256,
    controlPlaneSnapshotVerificationSchemaSha256: CONTROL_PLANE_SNAPSHOT_VERIFICATION_SCHEMA_SOURCE.sha256,
    controlPlaneReadbackSchemaSha256: CONTROL_PLANE_READBACK_SCHEMA_SOURCE.sha256,
    controlPlaneReadbackVerificationSchemaSha256: CONTROL_PLANE_READBACK_VERIFICATION_SCHEMA_SOURCE.sha256,
    controlPlaneAcceptanceProposalSchemaSha256: CONTROL_PLANE_ACCEPTANCE_PROPOSAL_SCHEMA_SOURCE.sha256,
    controlPlaneBaselineReceiptSchemaSha256: CONTROL_PLANE_BASELINE_RECEIPT_SCHEMA_SOURCE.sha256,
    managedReposSchemaSha256: MANAGED_REPOS_SCHEMA_SOURCE.sha256,
    engineClosure,
  }
}

function loadReleaseBoundConsumerBindings({
  inventoryBytes,
  repoId,
  candidateRelease,
  releaseBomBytes,
  requiredChecksDigest,
  protocolLoaded,
}) {
  const inventorySource = parseJsonBytes(inventoryBytes, 'managed repository inventory')
  schemaInvariant(validateManagedReposSchema, inventorySource.value, 'managed repository inventory')
  validateInventory(inventorySource.value)
  invariant(typeof repoId === 'string' && repoId.length > 0, 'consumer repository id is missing')
  const repository = inventorySource.value.repositories.find(item => item.id === repoId)
  invariant(repository, `Unknown managed repository ${repoId}`)

  const protocolBinding = loadProtocolBinding(protocolLoaded)
  const profile = upgradeProfile(protocolBinding.protocol, repository.upgradeProtocolProfile)
  invariant(repository.role !== 'authority', `Repository ${repository.id} is not a governed template or product repository`)
  validateCandidateRelease(candidateRelease)
  const bomSource = parseJsonBytes(releaseBomBytes, 'release BOM')
  validateReleaseBom(bomSource.value)
  const releaseBomSha256 = sha256(bomSource.bytes)
  invariant(candidateRelease.bomSha256 === releaseBomSha256, 'Candidate release does not bind the exact release BOM bytes')
  invariant(
    bomSource.value.releaseVersion === candidateRelease.version
      && bomSource.value.source.repository === candidateRelease.id.slice(0, candidateRelease.id.lastIndexOf('@v'))
      && bomSource.value.source.gitCommit === candidateRelease.sourceCommit
      && bomSource.value.source.gitTree === candidateRelease.sourceTree
      && bomSource.value.source.tag === `v${candidateRelease.version}`,
    'Candidate release identity differs from the release BOM',
  )
  const bomPackageProjection = bomSource.value.packages.map(item => ({ name: item.name, version: item.version, integrity: item.integrity }))
  invariant(deepEqual(bomPackageProjection, candidateRelease.packages), 'Candidate npm package evidence differs from the exact release BOM')
  invariant(deepEqual(bomSource.value.packages.map(item => item.name), RELEASE_PACKAGE_NAMES), 'Release BOM package order is not canonical')
  if (requiredChecksDigest !== undefined) invariant(SHA256.test(requiredChecksDigest || ''), 'Required checks digest must be SHA-256')

  return {
    inventory: inventorySource.value,
    inventorySha256: sha256(inventorySource.bytes),
    repository,
    profile,
    candidateRelease,
    candidateReleaseSha256: sha256(stableStringify(candidateRelease, 0)),
    releaseBom: bomSource.value,
    releaseBomSha256,
    requiredChecksDigest,
    ...protocolBinding,
  }
}

function loadBootstrapBindings(input) {
  const binding = loadReleaseBoundConsumerBindings(input)
  invariant(binding.repository.role === 'product-consumer', `Repository ${binding.repository.id} is not a product consumer`)
  invariant(SHA256.test(binding.requiredChecksDigest || ''), 'Consumer bootstrap requires a SHA-256 required checks digest')
  invariant(
    binding.profile.bootstrapRequired === true
      && binding.profile.entryMode === 'one-time-reviewed-full-snapshot-pr'
      && binding.profile.bootstrapEvidenceContract === 'consumer-governance-bootstrap-readback-v1'
      && typeof binding.profile.postAcceptanceProfile === 'string',
    `Repository ${binding.repository.id} is not assigned to the legacy reviewed full-snapshot bootstrap profile`,
  )
  invariant(binding.repository.acceptedBootstrapReadbackSha256 === undefined, `Legacy repository ${binding.repository.id} already claims an accepted bootstrap readback`)
  invariant(binding.repository.acceptedControlPlaneUpdate === undefined, `Legacy repository ${binding.repository.id} already claims an accepted control-plane update`)
  const postAcceptanceProfile = upgradeProfile(binding.protocol, binding.profile.postAcceptanceProfile)
  invariant(postAcceptanceProfile.acceptedBootstrapBindingRequired === true, 'Bootstrap post-acceptance profile does not require an accepted readback binding')
  return {
    ...binding,
    postAcceptanceProfile: binding.profile.postAcceptanceProfile,
  }
}

function loadControlPlaneUpdateBindings(input) {
  const binding = loadReleaseBoundConsumerBindings(input)
  invariant(
    ['template-mirror', 'product-consumer'].includes(binding.repository.role),
    `Repository ${binding.repository.id} is not eligible for recurring reviewed control-plane updates`,
  )
  invariant(input.requiredChecksDigest === undefined, 'Recurring control-plane updates do not accept a caller-supplied required checks digest')
  invariant(input.now instanceof Date && Number.isFinite(input.now.getTime()), 'Recurring control-plane updates require an explicit trustworthy verification time')
  validateAttestationPolicy(input.attestationPolicy, {
    issuerRegistry: input.issuerRegistry,
    now: input.now,
    allowUnactivated: false,
  })
  const updatePolicy = binding.protocol.reviewedControlPlaneUpdate
  const eligibleProfiles = [...updatePolicy.entryProfiles, ...updatePolicy.establishedProfiles]
  invariant(
    eligibleProfiles.includes(binding.repository.upgradeProtocolProfile)
      && binding.profile.bootstrapRequired === false
      && binding.profile.controlPlaneUpdateMode === updatePolicy.mode
      && binding.profile.controlPlaneUpdateEvidenceContract === updatePolicy.evidenceContract
      && typeof binding.profile.postControlPlaneUpdateProfile === 'string',
    `Repository ${binding.repository.id} is not assigned to the recurring reviewed control-plane update protocol`,
  )
  const prior = binding.repository.acceptedControlPlaneUpdate ?? null
  invariant(
    (prior !== null) === binding.profile.controlPlaneUpdateBindingRequired,
    `Repository ${binding.repository.id} accepted control-plane update binding does not match profile ${binding.repository.upgradeProtocolProfile}`,
  )
  if (prior !== null) {
    invariant(
      prior.issuerRegistryDigest === issuerRegistryDigest(input.issuerRegistry)
        && prior.issuerRegistryDigest === input.attestationPolicy.issuerRegistryDigest,
      'Recurring control-plane update issuer-registry lineage differs from the accepted chain head',
    )
  }
  const postProfile = upgradeProfile(binding.protocol, binding.profile.postControlPlaneUpdateProfile)
  invariant(
    postProfile.controlPlaneUpdateBindingRequired === true
      && postProfile.postControlPlaneUpdateProfile === binding.profile.postControlPlaneUpdateProfile,
    'Control-plane update post profile is not a recurring chain-bound profile',
  )
  invariant(
    postProfile.acceptedBootstrapBindingRequired === binding.profile.acceptedBootstrapBindingRequired,
    'Control-plane update profile transition would change the legacy bootstrap trust lineage',
  )
  return {
    ...binding,
    priorControlPlaneUpdate: prior,
    postControlPlaneUpdateProfile: binding.profile.postControlPlaneUpdateProfile,
    sequence: prior === null ? 1 : prior.sequence + 1,
    predecessorReadbackSha256: prior === null ? null : prior.readbackSha256,
  }
}

function canonicalUtc(value, label) {
  const parsed = new Date(value)
  invariant(typeof value === 'string' && Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be canonical UTC`)
  return parsed
}

function externalReceiptDomain(receipt) {
  if (receipt?.kind === 'consumer-control-plane-baseline-observer-receipt') return 'consumer-control-plane-baseline-observer-receipt-v1'
  if (receipt?.kind === 'consumer-governance-control-plane-update-readback') return 'consumer-control-plane-github-observer-readback-v1'
  throw new Error('Consumer control-plane external receipt kind is unsupported')
}

export function consumerControlPlaneExternalReceiptSigningPayload(receipt) {
  const unsigned = clone(receipt)
  delete unsigned.signatures
  return Buffer.from(`${externalReceiptDomain(receipt)}\0${stableStringify(unsigned, 0)}`, 'utf8')
}

export function consumerControlPlaneExternalReceiptSha256(receipt) {
  return domainDigest(externalReceiptDomain(receipt), receipt)
}

function validateExternalObserverEnvelope(receipt, {
  attestationPolicy,
  issuerRegistry,
  now,
  label,
}) {
  invariant(receipt.issuerRegistryDigest === issuerRegistryDigest(issuerRegistry), `${label} issuer registry digest is stale`)
  invariant(receipt.issuerRegistryDigest === attestationPolicy.issuerRegistryDigest, `${label} does not bind the active issuer policy`)
  invariant(receipt.quorum === attestationPolicy.completionAttestationQuorum, `${label} quorum differs from the active completion policy`)
  const observedAt = canonicalUtc(receipt.observedAt, `${label} observedAt`)
  const issuedAt = canonicalUtc(receipt.issuedAt, `${label} issuedAt`)
  const expiresAt = canonicalUtc(receipt.expiresAt, `${label} expiresAt`)
  const skewMs = attestationPolicy.clockSkewSeconds * 1000
  invariant(observedAt <= issuedAt, `${label} was issued before its observation completed`)
  invariant(expiresAt > issuedAt, `${label} expiry must follow issuance`)
  invariant(
    expiresAt.getTime() - issuedAt.getTime() <= attestationPolicy.maxCompletionTtlMinutes * 60_000,
    `${label} exceeds the completion evidence TTL`,
  )
  invariant(now.getTime() + skewMs >= issuedAt.getTime(), `${label} is not valid yet`)
  invariant(now.getTime() - skewMs <= expiresAt.getTime(), `${label} is expired`)
  invariant(typeof receipt.nonce === 'string' && /^[A-Za-z0-9._:-]{16,128}$/.test(receipt.nonce), `${label} nonce is invalid`)
  invariant(
    Array.isArray(receipt.signatures)
      && receipt.signatures.length === receipt.quorum
      && receipt.signatures.length <= 5,
    `${label} signatures do not satisfy the exact quorum`,
  )
  const sorted = [...receipt.signatures].sort((left, right) => comparePath(left.signerKeyId, right.signerKeyId))
  invariant(deepEqual(sorted, receipt.signatures), `${label} signatures are not canonically sorted`)
  const keyIds = new Set()
  const subjects = new Set()
  const payload = consumerControlPlaneExternalReceiptSigningPayload(receipt)
  for (const signature of receipt.signatures) {
    exactKeys(signature, ['signature', 'signerKeyId', 'subject'], `${label} signature`)
    invariant(!keyIds.has(signature.signerKeyId), `${label} repeats signer key ${signature.signerKeyId}`)
    invariant(!subjects.has(signature.subject), `${label} repeats signer subject ${signature.subject}`)
    invariant(BASE64URL_SIGNATURE.test(signature.signature || ''), `${label} signature encoding is invalid`)
    const encoded = Buffer.from(signature.signature, 'base64url')
    invariant(encoded.length === 64 && encoded.toString('base64url') === signature.signature, `${label} signature is not canonical Ed25519 base64url`)
    const issuer = resolvePolicyIssuer(attestationPolicy, issuerRegistry, signature.signerKeyId, {
      role: 'completion-attestor',
      at: issuedAt,
      validThrough: expiresAt,
    })
    invariant(signature.subject === issuer.subject, `${label} signer subject is stale`)
    invariant(verifySignature(null, payload, publicKeyFromIssuer(issuer), encoded), `${label} signature is invalid`)
    keyIds.add(signature.signerKeyId)
    subjects.add(signature.subject)
  }
  return true
}

function validateFirstBaselineReceipt(receipt, binding, baseSnapshot, input) {
  invariant(receipt, 'GOV-UPGRADE-BASELINE-001: first recurring control-plane update requires a verifiable signed baseline receipt')
  schemaInvariant(validateControlPlaneBaselineReceiptSchema, receipt, 'consumer control-plane baseline receipt')
  validateExternalObserverEnvelope(receipt, {
    attestationPolicy: input.attestationPolicy,
    issuerRegistry: input.issuerRegistry,
    now: input.now,
    label: 'Consumer control-plane baseline receipt',
  })
  invariant(
    receipt.repositoryId === binding.repository.id
      && receipt.repository === binding.repository.github
      && receipt.baseGitCommit === baseSnapshot.git.commit
      && receipt.baseGitTree === baseSnapshot.git.tree
      && receipt.baseSnapshotTreeSha256 === baseSnapshot.manifest.treeSha256,
    'GOV-UPGRADE-BASELINE-002: signed baseline receipt does not bind the exact clean base Git snapshot',
  )
  return {
    kind: 'signed-external-baseline-receipt',
    evidenceSha256: consumerControlPlaneExternalReceiptSha256(receipt),
    baseSnapshotTreeSha256: receipt.baseSnapshotTreeSha256,
  }
}

function candidateCorpusReceipt(binding, incomingRoot, scaffoldLockBytes) {
  const source = parseJsonBytes(scaffoldLockBytes, 'product-template scaffold lock')
  const lock = validateProductTemplateScaffoldLock(source.value)
  const expected = binding.releaseBom.governance.productTemplateScaffold
  invariant(
    expected.path === 'product-template-scaffold.lock.json'
      && expected.sha256 === sha256(source.bytes)
      && expected.size === source.bytes.length
      && expected.schemaVersion === lock.schemaVersion
      && expected.releaseVersion === lock.releaseVersion
      && expected.staticTreeSha256 === lock.staticTreeSha256
      && expected.publishedPathCount === lock.publishedPathCount,
    'Candidate product-template scaffold lock differs from the exact release BOM asset binding',
  )
  invariant(lock.releaseVersion === binding.candidateRelease.version, 'Candidate scaffold lock version differs from the immutable candidate release')
  verifyProductTemplateScaffold({
    root: incomingRoot,
    lock,
    phase: 'source',
    releaseBom: binding.releaseBom,
    allowRootGitMetadata: true,
  })
  const consumerLockPath = join(canonicalDirectoryRoot(incomingRoot, 'incoming candidate corpus'), 'governance/lock.json')
  const consumerLockSource = readBoundRegularFile(consumerLockPath, 'incoming candidate governance lock')
  invariant(
    consumerLockSource.entry.sha256 === binding.releaseBom.governance.consumer.sha256,
    'Incoming candidate governance lock differs from the exact release BOM consumer binding',
  )
  const consumerLock = parseJsonBytes(consumerLockSource.bytes, 'incoming candidate governance lock').value
  invariant(
    consumerLock?.payload?.forkCorpusLockSha256 === binding.releaseBom.governance.forkCorpus.sha256,
    'Incoming candidate governance lock does not bind the release BOM fork corpus',
  )
  const entries = lock.entries.map(entry => ({
    path: assertRepoPath(entry.path, 'candidate scaffold entry path'),
    mode: `0${entry.mode}`,
    size: entry.size,
    sha256: entry.sha256,
  }))
  validateManifest({
    treeSha256: manifestTreeDigest(entries),
    entryCount: entries.length,
    entries,
  }, 'BOM-bound incoming candidate corpus')
  const receipt = {
    schemaVersion: 1,
    kind: 'bom-bound-product-template-candidate-corpus',
    candidateReleaseSha256: binding.candidateReleaseSha256,
    releaseBomSha256: binding.releaseBomSha256,
    scaffoldLockSha256: sha256(source.bytes),
    templateStaticTreeSha256: lock.staticTreeSha256,
    consumerLockSha256: consumerLockSource.entry.sha256,
    forkCorpusLockSha256: consumerLock.payload.forkCorpusLockSha256,
    incomingSnapshotTreeSha256: manifestTreeDigest(entries),
    entryCount: entries.length,
  }
  return {
    manifest: {
      treeSha256: receipt.incomingSnapshotTreeSha256,
      entryCount: entries.length,
      entries,
    },
    receipt,
    receiptSha256: domainDigest('consumer-control-plane-candidate-corpus-receipt-v1', receipt),
  }
}

function buildDecisions(policy, manifests) {
  const maps = {
    current: manifestMap(manifests.current),
    base: manifestMap(manifests.base),
    incoming: manifestMap(manifests.incoming),
  }
  const paths = [...new Set([...maps.current.keys(), ...maps.base.keys(), ...maps.incoming.keys()])].sort(comparePath)
  const actions = []
  const conflicts = []
  const preserved = []

  for (const path of paths) {
    const states = statesFor(path, maps)
    let ownership
    try {
      ownership = resolveOwnership(policy, path)
    } catch (error) {
      conflicts.push({
        path,
        ownershipMode: 'ambiguous',
        owner: null,
        reason: 'ambiguous-ownership',
        ...states,
      })
      continue
    }

    if (ownership.mode === 'consumer-owned' || ownership.mode === 'authority') {
      if (!sameState(states.base, states.incoming)) {
        conflicts.push({
          path,
          ownershipMode: ownership.mode,
          owner: ownership.owner,
          reason: 'incoming-touches-non-upstream-owned-path',
          ...states,
        })
      } else {
        preserved.push({
          path,
          ownershipMode: ownership.mode,
          owner: ownership.owner,
          reason: 'consumer-or-authority-owned',
          ...states,
        })
      }
      continue
    }

    if (ownership.mode === 'generated' || ownership.mode === 'upstream-managed') {
      if (sameState(states.current, states.incoming)) {
        preserved.push({
          path,
          ownershipMode: ownership.mode,
          owner: ownership.owner,
          reason: 'already-at-reviewed-snapshot',
          ...states,
        })
      } else {
        actions.push({
          path,
          ownershipMode: ownership.mode,
          owner: ownership.owner,
          operation: states.incoming === null ? 'delete' : 'replace',
          reason: 'reviewed-full-snapshot-replacement',
          ...states,
        })
      }
      continue
    }

    invariant(ownership.mode === 'three-way', `Unsupported ownership mode ${ownership.mode} for ${path}`)
    if (sameState(states.current, states.incoming)) {
      preserved.push({
        path,
        ownershipMode: ownership.mode,
        owner: ownership.owner,
        reason: 'already-at-reviewed-snapshot',
        ...states,
      })
    } else if (sameState(states.current, states.base)) {
      actions.push({
        path,
        ownershipMode: ownership.mode,
        owner: ownership.owner,
        operation: states.incoming === null ? 'delete' : 'replace',
        reason: 'three-way-incoming-change',
        ...states,
      })
    } else if (sameState(states.incoming, states.base)) {
      preserved.push({
        path,
        ownershipMode: ownership.mode,
        owner: ownership.owner,
        reason: 'three-way-consumer-only-change',
        ...states,
      })
    } else {
      conflicts.push({
        path,
        ownershipMode: ownership.mode,
        owner: ownership.owner,
        reason: 'three-way-content-conflict',
        ...states,
      })
    }
  }

  return { actions, conflicts, preserved }
}

function expectedManifest(currentManifest, actions) {
  const expected = manifestMap(currentManifest)
  for (const action of actions) {
    if (action.operation === 'delete') expected.delete(action.path)
    else expected.set(action.path, clone(action.incoming))
  }
  const entries = [...expected.values()].sort((left, right) => comparePath(left.path, right.path))
  assertManifestTopology(entries, 'expected materialized snapshot')
  return {
    treeSha256: manifestTreeDigest(entries),
    entryCount: entries.length,
    entries,
  }
}

function planDigest(plan) {
  return digestWithout(plan, 'planDigest', 'consumer-bootstrap-materialization-plan-v1')
}

export function createConsumerBootstrapMaterializationPlan({
  inventoryBytes,
  repoId,
  roots,
  candidateRelease,
  releaseBomBytes,
  requiredChecksDigest,
  protocolLoaded,
} = {}) {
  exactKeys(roots, ['base', 'current', 'incoming'], 'consumer bootstrap roots')
  const binding = loadBootstrapBindings({ inventoryBytes, repoId, candidateRelease, releaseBomBytes, requiredChecksDigest, protocolLoaded })
  const scanned = {
    current: scanSnapshotRoot(roots.current, 'current consumer snapshot'),
    base: scanSnapshotRoot(roots.base, 'base consumer snapshot'),
    incoming: scanSnapshotRoot(roots.incoming, 'incoming reviewed snapshot'),
  }
  const rootPaths = Object.values(scanned).map(item => item.canonicalRoot)
  for (let left = 0; left < rootPaths.length; left += 1) {
    for (let right = left + 1; right < rootPaths.length; right += 1) {
      invariant(!pathWithin(rootPaths[left], rootPaths[right]) && !pathWithin(rootPaths[right], rootPaths[left]), 'Consumer bootstrap current/base/incoming roots must be distinct and non-overlapping')
    }
  }
  const manifests = Object.fromEntries(Object.entries(scanned).map(([name, item]) => [name, item.manifest]))
  const policy = binding.inventory.ownershipPolicies[binding.repository.ownershipPolicy]
  const decisions = buildDecisions(policy, manifests)
  const expectedSnapshot = expectedManifest(manifests.current, decisions.actions)
  const plan = {
    $schema: CONSUMER_BOOTSTRAP_PLAN_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-governance-reviewed-bootstrap-materialization-plan',
    readOnly: true,
    mutationAuthorized: false,
    candidateCodeExecutionAllowed: false,
    repository: {
      id: binding.repository.id,
      github: binding.repository.github,
      inventorySha256: binding.inventorySha256,
      ownershipPolicy: binding.repository.ownershipPolicy,
      profileId: binding.repository.upgradeProtocolProfile,
      postAcceptanceProfile: binding.postAcceptanceProfile,
    },
    candidate: {
      id: binding.candidateRelease.id,
      version: binding.candidateRelease.version,
      sourceCommit: binding.candidateRelease.sourceCommit,
      sourceTree: binding.candidateRelease.sourceTree,
      candidateReleaseSha256: binding.candidateReleaseSha256,
      releaseBomSha256: binding.releaseBomSha256,
      consumerLockSha256: binding.releaseBom.governance.consumer.sha256,
      forkCorpusLockSha256: binding.releaseBom.governance.forkCorpus.sha256,
      templateStaticTreeSha256: binding.releaseBom.governance.productTemplateScaffold.staticTreeSha256,
      requiredChecksDigest: binding.requiredChecksDigest,
    },
    protocol: {
      protocolId: binding.protocol.protocolId,
      specificationSha256: binding.sourceDigests.specificationSha256,
      schemaSha256: binding.sourceDigests.schemaSha256,
      implementationSha256: binding.sourceDigests.implementationSha256,
      bootstrapImplementationSha256: binding.bootstrapImplementationSha256,
      bootstrapPlanSchemaSha256: binding.bootstrapPlanSchemaSha256,
      bootstrapSnapshotVerificationSchemaSha256: binding.bootstrapSnapshotVerificationSchemaSha256,
      bootstrapReadbackVerificationSchemaSha256: binding.bootstrapReadbackVerificationSchemaSha256,
      bootstrapPromotionProposalSchemaSha256: binding.bootstrapPromotionProposalSchemaSha256,
      managedReposSchemaSha256: binding.managedReposSchemaSha256,
      entryMode: binding.profile.entryMode,
      bootstrapEvidenceContract: binding.profile.bootstrapEvidenceContract,
    },
    roots: manifests,
    ...decisions,
    expectedSnapshot,
    summary: {
      actions: decisions.actions.length,
      conflicts: decisions.conflicts.length,
      preserved: decisions.preserved.length,
      expectedEntries: expectedSnapshot.entryCount,
    },
    reviewReady: decisions.conflicts.length === 0,
    planDigest: '',
  }
  plan.planDigest = planDigest(plan)
  return validateConsumerBootstrapMaterializationPlan(plan)
}

function validateDecisionState(record, maps, label) {
  for (const stateName of ['base', 'current', 'incoming']) {
    const expected = maps[stateName].get(record.path) ?? null
    invariant(deepEqual(record[stateName], expected), `${label} ${record.path} has stale ${stateName} state`)
  }
}

export function validateConsumerBootstrapMaterializationPlan(plan) {
  schemaInvariant(validatePlanSchema, plan, 'consumer bootstrap materialization plan')
  for (const name of ['current', 'base', 'incoming']) validateManifest(plan.roots[name], `${name} bootstrap root`)
  validateManifest(plan.expectedSnapshot, 'expected bootstrap snapshot')
  const maps = {
    current: manifestMap(plan.roots.current),
    base: manifestMap(plan.roots.base),
    incoming: manifestMap(plan.roots.incoming),
  }
  const allPaths = [...new Set([...maps.current.keys(), ...maps.base.keys(), ...maps.incoming.keys()])].sort(comparePath)
  const decidedPaths = new Set()
  for (const [label, records] of [['action', plan.actions], ['conflict', plan.conflicts], ['preserved decision', plan.preserved]]) {
    const sorted = [...records].sort((left, right) => comparePath(left.path, right.path))
    invariant(deepEqual(records, sorted), `Consumer bootstrap ${label} records are not canonically sorted`)
    for (const record of records) {
      invariant(!decidedPaths.has(record.path), `Consumer bootstrap path ${record.path} has more than one decision`)
      decidedPaths.add(record.path)
      validateDecisionState(record, maps, label)
    }
  }
  invariant(deepEqual([...decidedPaths].sort(comparePath), allPaths), 'Consumer bootstrap decisions do not close over the full current/base/incoming path set')
  for (const action of plan.actions) {
    invariant(action.operation === (action.incoming === null ? 'delete' : 'replace'), `Consumer bootstrap action ${action.path} operation is stale`)
  }
  const expected = expectedManifest(plan.roots.current, plan.actions)
  invariant(deepEqual(plan.expectedSnapshot, expected), 'Consumer bootstrap expected snapshot differs from full current+actions closure')
  invariant(
    deepEqual(plan.summary, {
      actions: plan.actions.length,
      conflicts: plan.conflicts.length,
      preserved: plan.preserved.length,
      expectedEntries: plan.expectedSnapshot.entryCount,
    }),
    'Consumer bootstrap summary is stale',
  )
  invariant(plan.reviewReady === (plan.conflicts.length === 0), 'Consumer bootstrap reviewReady claim differs from conflicts')
  invariant(plan.planDigest === planDigest(plan), 'Consumer bootstrap materialization plan digest is stale')
  return plan
}

function contextPlan(input) {
  const recomputed = createConsumerBootstrapMaterializationPlan(input)
  invariant(input.expectedPlanDigest === input.plan?.planDigest, 'Expected consumer bootstrap plan digest does not match the supplied plan')
  invariant(input.expectedPlanDigest === recomputed.planDigest, 'Consumer bootstrap plan is stale for the exact roots or governance sources')
  invariant(deepEqual(input.plan, recomputed), 'Consumer bootstrap plan was substituted despite its digest binding')
  invariant(recomputed.reviewReady && recomputed.conflicts.length === 0, 'Consumer bootstrap plan is not ready for reviewed materialization')
  return recomputed
}

function freshOutputTarget(outputRoot, sourceRoots) {
  invariant(typeof outputRoot === 'string' && outputRoot.length > 0, 'Consumer bootstrap output root is missing')
  const requested = resolve(outputRoot)
  const parent = dirname(requested)
  const parentStat = lstatSync(parent, { bigint: true })
  invariant(!parentStat.isSymbolicLink() && parentStat.isDirectory(), 'Consumer bootstrap output parent must be an existing real directory')
  const target = join(realpathSync(parent), basename(requested))
  try {
    lstatSync(target)
    throw new Error(`Consumer bootstrap output already exists: ${target}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  for (const sourceRoot of sourceRoots) {
    const source = canonicalDirectoryRoot(sourceRoot, 'consumer bootstrap source')
    invariant(!pathWithin(source, target) && !pathWithin(target, source), 'Consumer bootstrap output must be outside every source root and may never be a live source repository')
  }
  return target
}

function ensureOutputDirectory(outputRoot, repoDirectory, createdDirectories) {
  if (!repoDirectory) return outputRoot
  assertRepoPath(repoDirectory, 'materialized output directory')
  let current = outputRoot
  let currentRepoPath = ''
  for (const segment of repoDirectory.split('/')) {
    current = join(current, segment)
    currentRepoPath = currentRepoPath ? `${currentRepoPath}/${segment}` : segment
    try {
      const stat = lstatSync(current, { bigint: true })
      invariant(!stat.isSymbolicLink() && stat.isDirectory(), `Materialized output path ${currentRepoPath} is not a real directory`)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      mkdirSync(current, { mode: 0o700 })
      createdDirectories.push(current)
    }
  }
  return current
}

function readExpectedSource(root, entry, label) {
  const canonicalRoot = canonicalDirectoryRoot(root, label)
  const absolute = join(canonicalRoot, ...entry.path.split('/'))
  invariant(pathWithin(canonicalRoot, absolute), `${label} path escapes its root: ${entry.path}`)
  invariant(realpathSync(absolute) === absolute, `${label} path contains a symbolic-link substitution: ${entry.path}`)
  const read = readBoundRegularFile(absolute, `${label}:${entry.path}`)
  invariant(deepEqual({ path: entry.path, ...read.entry }, entry), `${label} path is stale for the reviewed plan: ${entry.path}`)
  return read.bytes
}

function writeExclusiveFile(path, bytes, mode) {
  invariant(typeof constants.O_NOFOLLOW === 'number', 'The host does not provide O_NOFOLLOW; bootstrap materialization fails closed')
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeFileSync(fd, bytes)
    fchmodSync(fd, Number.parseInt(mode, 8))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function materializeConsumerBootstrapSnapshot(input = {}) {
  validateConsumerBootstrapMaterializationPlan(input.plan)
  const recomputed = contextPlan(input)
  const sourceRoots = [input.roots.current, input.roots.base, input.roots.incoming]
  const outputRoot = freshOutputTarget(input.outputRoot, sourceRoots)
  const actionPaths = new Set(recomputed.actions.map(action => action.path))
  let created = false
  try {
    mkdirSync(outputRoot, { mode: 0o700 })
    created = true
    const createdDirectories = []
    for (const entry of recomputed.expectedSnapshot.entries) {
      const sourceRoot = actionPaths.has(entry.path) ? input.roots.incoming : input.roots.current
      const sourceLabel = actionPaths.has(entry.path) ? 'incoming reviewed snapshot' : 'current consumer snapshot'
      const bytes = readExpectedSource(sourceRoot, entry, sourceLabel)
      ensureOutputDirectory(outputRoot, dirname(entry.path) === '.' ? '' : dirname(entry.path), createdDirectories)
      writeExclusiveFile(join(outputRoot, ...entry.path.split('/')), bytes, entry.mode)
    }
    for (const directory of createdDirectories.reverse()) chmodSync(directory, 0o755)
    chmodSync(outputRoot, 0o755)
    return verifyMaterializedConsumerBootstrapSnapshot({ plan: recomputed, materializedRoot: outputRoot })
  } catch (error) {
    if (created) rmSync(outputRoot, { recursive: true, force: true })
    throw error
  }
}

function snapshotVerificationDigest(verification) {
  return digestWithout(verification, 'verificationDigest', 'consumer-bootstrap-snapshot-verification-v1')
}

export function verifyMaterializedConsumerBootstrapSnapshot({ plan, materializedRoot } = {}) {
  validateConsumerBootstrapMaterializationPlan(plan)
  invariant(plan.reviewReady && plan.conflicts.length === 0, 'Cannot verify a materialized snapshot for a conflicted bootstrap plan')
  const materialized = scanSnapshotRoot(materializedRoot, 'materialized consumer bootstrap snapshot', { excludeReserved: false }).manifest
  invariant(deepEqual(materialized.entries, plan.expectedSnapshot.entries), 'Materialized consumer bootstrap snapshot differs from the full current+actions path/mode/hash closure')
  invariant(materialized.treeSha256 === plan.expectedSnapshot.treeSha256, 'Materialized consumer bootstrap tree digest differs from the reviewed plan')
  const verification = {
    $schema: CONSUMER_BOOTSTRAP_SNAPSHOT_VERIFICATION_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-bootstrap-materialized-snapshot-verification',
    readOnly: true,
    mutationAuthorized: false,
    candidateCodeExecuted: false,
    planDigest: plan.planDigest,
    currentTreeSha256: plan.roots.current.treeSha256,
    actionsDigest: domainDigest('consumer-bootstrap-actions-v1', plan.actions),
    expectedSnapshotTreeSha256: plan.expectedSnapshot.treeSha256,
    materializedSnapshotTreeSha256: materialized.treeSha256,
    entryCount: materialized.entryCount,
    verificationDigest: '',
  }
  verification.verificationDigest = snapshotVerificationDigest(verification)
  schemaInvariant(validateSnapshotVerificationSchema, verification, 'consumer bootstrap snapshot verification')
  return verification
}

export function consumerBootstrapReadbackSha256(readback) {
  // This is the canonical no-trailing-newline artifact address used by staged-rollout
  // evidence references, so the accepted inventory binding and rollout ledger join exactly.
  return sha256(stableStringify(readback, 0))
}

function readbackVerificationDigest(verification) {
  return digestWithout(verification, 'verificationDigest', 'consumer-bootstrap-independent-readback-verification-v1')
}

export function validateIndependentConsumerBootstrapReadback(readback, input = {}) {
  validateConsumerBootstrapMaterializationPlan(input.plan)
  const recomputed = contextPlan(input)
  const binding = loadBootstrapBindings(input)
  const snapshotVerification = verifyMaterializedConsumerBootstrapSnapshot({
    plan: recomputed,
    materializedRoot: input.materializedRoot,
  })
  validateConsumerBootstrapReadback(readback, {
    repository: binding.repository,
    candidateRelease: binding.candidateRelease,
    releaseBom: binding.releaseBom,
    protocol: binding.protocol,
    sourceDigests: binding.sourceDigests,
  })
  invariant(readback.fullSnapshotPlanDigest === recomputed.planDigest, 'Consumer bootstrap readback binds a stale or substituted materialization plan')
  invariant(readback.materializedGovernanceTreeSha256 === snapshotVerification.materializedSnapshotTreeSha256, 'Consumer bootstrap readback binds a stale or substituted materialized snapshot')
  invariant(readback.requiredChecksDigest === binding.requiredChecksDigest, 'Consumer bootstrap readback binds stale required checks')
  const verification = {
    $schema: CONSUMER_BOOTSTRAP_READBACK_VERIFICATION_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-bootstrap-independent-readback-verification',
    readOnly: true,
    mutationAuthorized: false,
    candidateCodeExecuted: false,
    repositoryId: binding.repository.id,
    inventorySha256: binding.inventorySha256,
    candidateReleaseSha256: binding.candidateReleaseSha256,
    releaseBomSha256: binding.releaseBomSha256,
    protocolId: binding.protocol.protocolId,
    protocolSpecificationSha256: binding.sourceDigests.specificationSha256,
    protocolSchemaSha256: binding.sourceDigests.schemaSha256,
    protocolImplementationSha256: binding.sourceDigests.implementationSha256,
    bootstrapImplementationSha256: binding.bootstrapImplementationSha256,
    bootstrapPlanSchemaSha256: binding.bootstrapPlanSchemaSha256,
    bootstrapSnapshotVerificationSchemaSha256: binding.bootstrapSnapshotVerificationSchemaSha256,
    bootstrapReadbackVerificationSchemaSha256: binding.bootstrapReadbackVerificationSchemaSha256,
    bootstrapPromotionProposalSchemaSha256: binding.bootstrapPromotionProposalSchemaSha256,
    managedReposSchemaSha256: binding.managedReposSchemaSha256,
    planDigest: recomputed.planDigest,
    snapshotVerificationDigest: snapshotVerification.verificationDigest,
    materializedSnapshotTreeSha256: snapshotVerification.materializedSnapshotTreeSha256,
    requiredChecksDigest: binding.requiredChecksDigest,
    acceptedBootstrapReadbackSha256: consumerBootstrapReadbackSha256(readback),
    verificationDigest: '',
  }
  verification.verificationDigest = readbackVerificationDigest(verification)
  schemaInvariant(validateReadbackVerificationSchema, verification, 'independent consumer bootstrap readback verification')
  return verification
}

function promotionProposalDigest(proposal) {
  return digestWithout(proposal, 'proposalDigest', 'consumer-bootstrap-inventory-promotion-proposal-v1')
}

function buildPromotionProposal(readback, input) {
  const readbackVerification = validateIndependentConsumerBootstrapReadback(readback, input)
  const binding = loadBootstrapBindings(input)
  const proposedInventory = clone(binding.inventory)
  const repository = proposedInventory.repositories.find(item => item.id === binding.repository.id)
  repository.upgradeProtocolProfile = binding.postAcceptanceProfile
  repository.acceptedBootstrapReadbackSha256 = readbackVerification.acceptedBootstrapReadbackSha256
  schemaInvariant(validateManagedReposSchema, proposedInventory, 'proposed managed repository inventory')
  validateInventory(proposedInventory)
  const promotedProfile = upgradeProfile(binding.protocol, repository.upgradeProtocolProfile)
  invariant(promotedProfile.acceptedBootstrapBindingRequired === true, 'Proposed bootstrap profile does not require the accepted readback binding')
  invariant(repository.acceptedBootstrapReadbackSha256 === readbackVerification.acceptedBootstrapReadbackSha256, 'Proposed inventory does not bind the independently accepted bootstrap readback')
  const proposedInventorySha256 = sha256(stableStringify(proposedInventory, 0))
  const proposal = {
    $schema: CONSUMER_BOOTSTRAP_PROMOTION_PROPOSAL_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-bootstrap-inventory-promotion-proposal',
    mode: 'closed-no-mutation-proposal',
    readOnly: true,
    mutationAuthorized: false,
    repositoryId: binding.repository.id,
    before: {
      inventorySha256: binding.inventorySha256,
      upgradeProtocolProfile: binding.repository.upgradeProtocolProfile,
      acceptedBootstrapReadbackSha256: null,
    },
    binding: {
      acceptedBootstrapReadbackSha256: readbackVerification.acceptedBootstrapReadbackSha256,
      independentReadbackVerificationDigest: readbackVerification.verificationDigest,
      planDigest: readbackVerification.planDigest,
      materializedSnapshotTreeSha256: readbackVerification.materializedSnapshotTreeSha256,
      candidateReleaseSha256: readbackVerification.candidateReleaseSha256,
      releaseBomSha256: readbackVerification.releaseBomSha256,
      protocolId: readbackVerification.protocolId,
    },
    proposedInventory,
    proposedInventorySha256,
    reviewRequirements: [...REVIEW_REQUIREMENTS],
    proposalDigest: '',
  }
  proposal.proposalDigest = promotionProposalDigest(proposal)
  return proposal
}

export function createConsumerBootstrapPromotionProposal(readback, input = {}) {
  const proposal = buildPromotionProposal(readback, input)
  schemaInvariant(validatePromotionProposalSchema, proposal, 'consumer bootstrap inventory promotion proposal')
  return proposal
}

export function validateConsumerBootstrapPromotionProposal(proposal, readback, input = {}) {
  schemaInvariant(validatePromotionProposalSchema, proposal, 'consumer bootstrap inventory promotion proposal')
  invariant(proposal.proposalDigest === promotionProposalDigest(proposal), 'Consumer bootstrap inventory promotion proposal digest is stale')
  schemaInvariant(validateManagedReposSchema, proposal.proposedInventory, 'consumer bootstrap proposed inventory')
  validateInventory(proposal.proposedInventory)
  invariant(proposal.proposedInventorySha256 === sha256(stableStringify(proposal.proposedInventory, 0)), 'Consumer bootstrap proposed inventory digest is stale')
  const expected = buildPromotionProposal(readback, input)
  invariant(deepEqual(proposal, expected), 'Consumer bootstrap inventory promotion proposal is stale or substituted')
  return proposal
}

const CONTROL_PLANE_REVIEW_REQUIREMENTS = Object.freeze([
  'review-full-control-plane-snapshot-diff',
  'verify-independent-control-plane-readback',
  'merge-protected-inventory-pr',
])

function controlPlanePlanDigest(plan) {
  return digestWithout(plan, 'planDigest', 'consumer-control-plane-update-plan-v1')
}

function scanReviewedRoots(roots, label, binding, input) {
  exactKeys(roots, ['base', 'current', 'incoming'], `${label} roots`)
  const scanned = {
    current: inspectConsumerControlPlaneGitSnapshot(roots.current, `current ${label} snapshot`),
    base: inspectConsumerControlPlaneGitSnapshot(roots.base, `base ${label} snapshot`),
  }
  const incoming = candidateCorpusReceipt(binding, roots.incoming, input.scaffoldLockBytes)
  const incomingRoot = canonicalDirectoryRoot(roots.incoming, `incoming reviewed ${label} snapshot`)
  const rootPaths = [scanned.current.canonicalRoot, scanned.base.canonicalRoot, incomingRoot]
  for (let left = 0; left < rootPaths.length; left += 1) {
    for (let right = left + 1; right < rootPaths.length; right += 1) {
      invariant(
        !pathWithin(rootPaths[left], rootPaths[right]) && !pathWithin(rootPaths[right], rootPaths[left]),
        `${label} current/base/incoming roots must be distinct and non-overlapping`,
      )
    }
  }
  let lineage
  if (binding.priorControlPlaneUpdate === null) {
    lineage = validateFirstBaselineReceipt(input.baselineReceipt, binding, scanned.base, input)
  } else {
    invariant(input.baselineReceipt === undefined || input.baselineReceipt === null, 'A recurring control-plane chain must use its accepted predecessor, not a substituted first-baseline receipt')
    invariant(
      scanned.base.manifest.treeSha256 === binding.priorControlPlaneUpdate.incomingSnapshotTreeSha256,
      'GOV-UPGRADE-LINEAGE-001: next base snapshot does not equal the previous accepted incoming candidate corpus',
    )
    lineage = {
      kind: 'accepted-control-plane-predecessor',
      evidenceSha256: binding.priorControlPlaneUpdate.readbackSha256,
      baseSnapshotTreeSha256: binding.priorControlPlaneUpdate.incomingSnapshotTreeSha256,
    }
  }
  return {
    manifests: {
      current: scanned.current.manifest,
      base: scanned.base.manifest,
      incoming: incoming.manifest,
    },
    sourceBindings: {
      currentGit: scanned.current.git,
      baseGit: scanned.base.git,
      baseline: lineage,
      candidateCorpus: {
        ...incoming.receipt,
        receiptSha256: incoming.receiptSha256,
      },
    },
  }
}

function protectedPathClass(path) {
  const exact = PROTECTED_CONTROL_PLANE_EXACT_PATHS.find(candidate => path === candidate)
  if (exact) return exact
  return PROTECTED_CONTROL_PLANE_PATH_PREFIXES.find(prefix => path.startsWith(prefix)) ?? null
}

function packageJsonAt(root, manifest, label) {
  const entry = manifest.entries.find(item => item.path === 'package.json')
  if (!entry) return null
  const source = readExpectedSource(root, entry, label)
  return parseJsonBytes(source, label).value
}

function classifyProtectedControlPlaneChanges(roots, manifests) {
  const maps = {
    current: manifestMap(manifests.current),
    incoming: manifestMap(manifests.incoming),
  }
  const records = new Map()
  for (const path of [...new Set([...maps.current.keys(), ...maps.incoming.keys()])].sort(comparePath)) {
    if (sameState(maps.current.get(path) ?? null, maps.incoming.get(path) ?? null)) continue
    if (!requiresReviewedControlPlaneUpdate(path)) continue
    const pathClass = protectedPathClass(path)
    invariant(pathClass, `Protected control-plane path ${path} has no canonical class`)
    records.set(`protected-path:${pathClass}`, { kind: 'protected-path', path: pathClass })
  }
  const currentPackage = packageJsonAt(roots.current, manifests.current, 'current consumer package manifest')
  const incomingPackage = packageJsonAt(roots.incoming, manifests.incoming, 'incoming reviewed package manifest')
  if (currentPackage === null || incomingPackage === null || !packageScriptsAreIdentical(currentPackage, incomingPackage, {
    previousLabel: 'current consumer package manifest',
    incomingLabel: 'incoming reviewed package manifest',
  })) {
    records.set('package-scripts:package.json#scripts', { kind: 'package-scripts', path: 'package.json#scripts' })
  }
  return [...records.values()].sort((left, right) => compareUtf8Bytes(`${left.kind}:${left.path}`, `${right.kind}:${right.path}`))
}

export function createConsumerControlPlaneUpdatePlan({
  inventoryBytes,
  repoId,
  roots,
  candidateRelease,
  releaseBomBytes,
  scaffoldLockBytes,
  baselineReceipt,
  issuerRegistry,
  attestationPolicy,
  now,
  protocolLoaded,
} = {}) {
  const binding = loadControlPlaneUpdateBindings({
    inventoryBytes,
    repoId,
    candidateRelease,
    releaseBomBytes,
    scaffoldLockBytes,
    baselineReceipt,
    issuerRegistry,
    attestationPolicy,
    now,
    protocolLoaded,
  })
  const scanned = scanReviewedRoots(roots, 'consumer control-plane update', binding, {
    scaffoldLockBytes,
    baselineReceipt,
    issuerRegistry,
    attestationPolicy,
    now,
  })
  const { manifests, sourceBindings } = scanned
  const policy = binding.inventory.ownershipPolicies[binding.repository.ownershipPolicy]
  const decisions = buildDecisions(policy, manifests)
  const protectedControlPlaneChanges = classifyProtectedControlPlaneChanges(roots, manifests)
  invariant(
    protectedControlPlaneChanges.length > 0,
    'GOV-UPGRADE-CONTROL-PLANE-ROUTE-001: reviewed control-plane update has no protected control-plane change; use ordinary sync-all',
  )
  const expectedSnapshot = expectedManifest(manifests.current, decisions.actions)
  const plan = {
    $schema: CONSUMER_CONTROL_PLANE_UPDATE_PLAN_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-governance-reviewed-control-plane-update-plan',
    readOnly: true,
    mutationAuthorized: false,
    repeatable: true,
    candidateCodeExecutionAllowed: false,
    repository: {
      id: binding.repository.id,
      github: binding.repository.github,
      inventorySha256: binding.inventorySha256,
      ownershipPolicy: binding.repository.ownershipPolicy,
      sourceProfile: binding.repository.upgradeProtocolProfile,
      postUpdateProfile: binding.postControlPlaneUpdateProfile,
      acceptedBootstrapReadbackSha256: binding.repository.acceptedBootstrapReadbackSha256 ?? null,
      acceptedControlPlaneUpdate: clone(binding.priorControlPlaneUpdate),
      nextSequence: binding.sequence,
      predecessorReadbackSha256: binding.predecessorReadbackSha256,
    },
    candidate: {
      id: binding.candidateRelease.id,
      version: binding.candidateRelease.version,
      sourceCommit: binding.candidateRelease.sourceCommit,
      sourceTree: binding.candidateRelease.sourceTree,
      candidateReleaseSha256: binding.candidateReleaseSha256,
      releaseBomSha256: binding.releaseBomSha256,
      consumerLockSha256: binding.releaseBom.governance.consumer.sha256,
      forkCorpusLockSha256: binding.releaseBom.governance.forkCorpus.sha256,
      templateStaticTreeSha256: binding.releaseBom.governance.productTemplateScaffold.staticTreeSha256,
      candidateCorpusReceiptSha256: sourceBindings.candidateCorpus.receiptSha256,
    },
    protocol: {
      protocolId: binding.protocol.protocolId,
      specificationSha256: binding.sourceDigests.specificationSha256,
      schemaSha256: binding.sourceDigests.schemaSha256,
      implementationSha256: binding.sourceDigests.implementationSha256,
      controlPlaneImplementationSha256: binding.controlPlaneImplementationSha256,
      controlPlanePolicySha256: binding.controlPlanePolicySha256,
      controlPlanePlanSchemaSha256: binding.controlPlanePlanSchemaSha256,
      controlPlaneSnapshotVerificationSchemaSha256: binding.controlPlaneSnapshotVerificationSchemaSha256,
      controlPlaneReadbackSchemaSha256: binding.controlPlaneReadbackSchemaSha256,
      controlPlaneReadbackVerificationSchemaSha256: binding.controlPlaneReadbackVerificationSchemaSha256,
      controlPlaneAcceptanceProposalSchemaSha256: binding.controlPlaneAcceptanceProposalSchemaSha256,
      controlPlaneBaselineReceiptSchemaSha256: binding.controlPlaneBaselineReceiptSchemaSha256,
      managedReposSchemaSha256: binding.managedReposSchemaSha256,
      engineClosureSha256: binding.engineClosure.sha256,
      updateMode: binding.profile.controlPlaneUpdateMode,
      evidenceContract: binding.profile.controlPlaneUpdateEvidenceContract,
    },
    sourceBindings,
    roots: manifests,
    ...decisions,
    protectedControlPlaneChanges,
    expectedSnapshot,
    summary: {
      actions: decisions.actions.length,
      conflicts: decisions.conflicts.length,
      preserved: decisions.preserved.length,
      protectedControlPlaneChanges: protectedControlPlaneChanges.length,
      expectedEntries: expectedSnapshot.entryCount,
    },
    reviewReady: decisions.conflicts.length === 0,
    planDigest: '',
  }
  plan.planDigest = controlPlanePlanDigest(plan)
  return validateConsumerControlPlaneUpdatePlan(plan)
}

export function validateConsumerControlPlaneUpdatePlan(plan) {
  schemaInvariant(validateControlPlanePlanSchema, plan, 'consumer control-plane update plan')
  invariant(
    Buffer.byteLength(stableStringify(plan, 0), 'utf8') <= MAX_CONTROL_PLANE_PLAN_CANONICAL_BYTES,
    `Consumer control-plane update plan exceeds the ${MAX_CONTROL_PLANE_PLAN_CANONICAL_BYTES}-byte canonical artifact limit`,
  )
  for (const name of ['current', 'base', 'incoming']) validateManifest(plan.roots[name], `${name} control-plane update root`)
  validateManifest(plan.expectedSnapshot, 'expected control-plane update snapshot')
  for (const name of ['currentGit', 'baseGit']) {
    const git = plan.sourceBindings[name]
    invariant(['sha1', 'sha256'].includes(git.objectFormat) && GIT_OID.test(git.commit) && GIT_OID.test(git.tree), `Consumer control-plane update ${name} object identity is invalid`)
  }
  invariant(
    plan.sourceBindings.baseline.baseSnapshotTreeSha256 === plan.roots.base.treeSha256,
    'Consumer control-plane update baseline evidence does not bind the exact base manifest',
  )
  const candidateCorpus = clone(plan.sourceBindings.candidateCorpus)
  const candidateCorpusReceiptSha256 = candidateCorpus.receiptSha256
  delete candidateCorpus.receiptSha256
  invariant(
    candidateCorpusReceiptSha256 === domainDigest('consumer-control-plane-candidate-corpus-receipt-v1', candidateCorpus)
      && candidateCorpus.incomingSnapshotTreeSha256 === plan.roots.incoming.treeSha256
      && candidateCorpus.candidateReleaseSha256 === plan.candidate.candidateReleaseSha256
      && candidateCorpus.releaseBomSha256 === plan.candidate.releaseBomSha256
      && candidateCorpusReceiptSha256 === plan.candidate.candidateCorpusReceiptSha256,
    'Consumer control-plane update candidate corpus receipt is stale or substituted',
  )
  const maps = {
    current: manifestMap(plan.roots.current),
    base: manifestMap(plan.roots.base),
    incoming: manifestMap(plan.roots.incoming),
  }
  const allPaths = [...new Set([...maps.current.keys(), ...maps.base.keys(), ...maps.incoming.keys()])].sort(comparePath)
  const decidedPaths = new Set()
  for (const [label, records] of [['action', plan.actions], ['conflict', plan.conflicts], ['preserved decision', plan.preserved]]) {
    const sorted = [...records].sort((left, right) => comparePath(left.path, right.path))
    invariant(deepEqual(records, sorted), `Consumer control-plane update ${label} records are not canonically sorted`)
    for (const record of records) {
      invariant(!decidedPaths.has(record.path), `Consumer control-plane update path ${record.path} has more than one decision`)
      decidedPaths.add(record.path)
      validateDecisionState(record, maps, label)
    }
  }
  invariant(deepEqual([...decidedPaths].sort(comparePath), allPaths), 'Consumer control-plane update decisions do not close over the full current/base/incoming path set')
  for (const action of plan.actions) {
    invariant(action.operation === (action.incoming === null ? 'delete' : 'replace'), `Consumer control-plane update action ${action.path} operation is stale`)
  }
  const expected = expectedManifest(plan.roots.current, plan.actions)
  invariant(deepEqual(plan.expectedSnapshot, expected), 'Consumer control-plane update expected snapshot differs from full current+actions closure')
  const protectedKeys = plan.protectedControlPlaneChanges.map(item => `${item.kind}:${item.path}`)
  invariant(
    deepEqual(protectedKeys, [...new Set(protectedKeys)].sort(comparePath)),
    'Consumer control-plane update protected-change records are not unique and canonical',
  )
  invariant(plan.protectedControlPlaneChanges.length > 0, 'Consumer control-plane update lacks a protected control-plane change')
  const prior = plan.repository.acceptedControlPlaneUpdate
  invariant(
    plan.repository.nextSequence === (prior === null ? 1 : prior.sequence + 1)
      && plan.repository.predecessorReadbackSha256 === (prior === null ? null : prior.readbackSha256),
    'Consumer control-plane update plan does not extend its exact accepted chain head',
  )
  invariant(
    prior === null
      ? plan.sourceBindings.baseline.kind === 'signed-external-baseline-receipt'
      : plan.sourceBindings.baseline.kind === 'accepted-control-plane-predecessor'
        && plan.sourceBindings.baseline.evidenceSha256 === prior.readbackSha256
        && plan.roots.base.treeSha256 === prior.incomingSnapshotTreeSha256,
    'Consumer control-plane update base lineage is not closed by signed baseline or exact accepted predecessor evidence',
  )
  invariant(
    deepEqual(plan.summary, {
      actions: plan.actions.length,
      conflicts: plan.conflicts.length,
      preserved: plan.preserved.length,
      protectedControlPlaneChanges: plan.protectedControlPlaneChanges.length,
      expectedEntries: plan.expectedSnapshot.entryCount,
    }),
    'Consumer control-plane update summary is stale',
  )
  invariant(plan.reviewReady === (plan.conflicts.length === 0), 'Consumer control-plane update reviewReady claim differs from conflicts')
  invariant(plan.planDigest === controlPlanePlanDigest(plan), 'Consumer control-plane update plan digest is stale')
  return plan
}

function contextControlPlanePlan(input) {
  const recomputed = createConsumerControlPlaneUpdatePlan(input)
  invariant(input.expectedPlanDigest === input.plan?.planDigest, 'Expected consumer control-plane update plan digest does not match the supplied plan')
  invariant(input.expectedPlanDigest === recomputed.planDigest, 'Consumer control-plane update plan is stale for the exact roots or governance sources')
  invariant(deepEqual(input.plan, recomputed), 'Consumer control-plane update plan was substituted despite its digest binding')
  invariant(recomputed.reviewReady && recomputed.conflicts.length === 0, 'Consumer control-plane update plan is not ready for reviewed materialization')
  return recomputed
}

function controlPlaneSnapshotVerificationDigest(verification) {
  return digestWithout(verification, 'verificationDigest', 'consumer-control-plane-update-snapshot-verification-v1')
}

export function verifyMaterializedConsumerControlPlaneUpdateSnapshot({ plan, materializedRoot } = {}) {
  validateConsumerControlPlaneUpdatePlan(plan)
  invariant(plan.reviewReady && plan.conflicts.length === 0, 'Cannot verify a materialized snapshot for a conflicted control-plane update plan')
  const materialized = scanSnapshotRoot(materializedRoot, 'materialized consumer control-plane update snapshot', { excludeReserved: false }).manifest
  invariant(deepEqual(materialized.entries, plan.expectedSnapshot.entries), 'Materialized consumer control-plane update snapshot differs from the reviewed full-tree closure')
  invariant(materialized.treeSha256 === plan.expectedSnapshot.treeSha256, 'Materialized consumer control-plane update tree digest differs from the reviewed plan')
  const materializedGitTreeSha = materializedGitTreeSha1(materializedRoot, materialized.entries)
  const verification = {
    $schema: CONSUMER_CONTROL_PLANE_UPDATE_SNAPSHOT_VERIFICATION_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-control-plane-update-materialized-snapshot-verification',
    readOnly: true,
    mutationAuthorized: false,
    candidateCodeExecuted: false,
    planDigest: plan.planDigest,
    currentTreeSha256: plan.roots.current.treeSha256,
    actionsDigest: domainDigest('consumer-control-plane-update-actions-v1', plan.actions),
    expectedSnapshotTreeSha256: plan.expectedSnapshot.treeSha256,
    materializedSnapshotTreeSha256: materialized.treeSha256,
    materializedGitTreeSha,
    entryCount: materialized.entryCount,
    verificationDigest: '',
  }
  verification.verificationDigest = controlPlaneSnapshotVerificationDigest(verification)
  schemaInvariant(validateControlPlaneSnapshotVerificationSchema, verification, 'consumer control-plane update snapshot verification')
  return verification
}

export function verifyContextualConsumerControlPlaneUpdateSnapshot(input = {}) {
  validateConsumerControlPlaneUpdatePlan(input.plan)
  const recomputed = contextControlPlanePlan(input)
  return verifyMaterializedConsumerControlPlaneUpdateSnapshot({
    plan: recomputed,
    materializedRoot: input.materializedRoot,
  })
}

export function materializeConsumerControlPlaneUpdateSnapshot(input = {}) {
  validateConsumerControlPlaneUpdatePlan(input.plan)
  const recomputed = contextControlPlanePlan(input)
  const sourceRoots = [input.roots.current, input.roots.base, input.roots.incoming]
  const outputRoot = freshOutputTarget(input.outputRoot, sourceRoots)
  const actionPaths = new Set(recomputed.actions.map(action => action.path))
  let created = false
  let createdRootIdentity = null
  try {
    mkdirSync(outputRoot, { mode: 0o700 })
    created = true
    createdRootIdentity = lstatSync(outputRoot, { bigint: true })
    invariant(
      createdRootIdentity.isDirectory()
        && !createdRootIdentity.isSymbolicLink()
        && realpathSync(outputRoot) === outputRoot,
      'Consumer control-plane output root was substituted during creation',
    )
    const createdDirectories = []
    for (const entry of recomputed.expectedSnapshot.entries) {
      const currentRootIdentity = lstatSync(outputRoot, { bigint: true })
      invariant(
        currentRootIdentity.dev === createdRootIdentity.dev
          && currentRootIdentity.ino === createdRootIdentity.ino
          && currentRootIdentity.mode === createdRootIdentity.mode,
        'Consumer control-plane output root changed during materialization',
      )
      const sourceRoot = actionPaths.has(entry.path) ? input.roots.incoming : input.roots.current
      const sourceLabel = actionPaths.has(entry.path) ? 'incoming reviewed control-plane snapshot' : 'current consumer snapshot'
      const bytes = readExpectedSource(sourceRoot, entry, sourceLabel)
      ensureOutputDirectory(outputRoot, dirname(entry.path) === '.' ? '' : dirname(entry.path), createdDirectories)
      writeExclusiveFile(join(outputRoot, ...entry.path.split('/')), bytes, entry.mode)
    }
    for (const directory of createdDirectories.reverse()) chmodSync(directory, 0o755)
    chmodSync(outputRoot, 0o755)
    return verifyMaterializedConsumerControlPlaneUpdateSnapshot({ plan: recomputed, materializedRoot: outputRoot })
  } catch (error) {
    if (created && createdRootIdentity) {
      try {
        const observed = lstatSync(outputRoot, { bigint: true })
        if (
          observed.isDirectory()
          && !observed.isSymbolicLink()
          && observed.dev === createdRootIdentity.dev
          && observed.ino === createdRootIdentity.ino
        ) rmSync(outputRoot, { recursive: true, force: true })
      } catch {
        // Fail closed without recursively deleting a substituted output path.
      }
    }
    throw error
  }
}

export function consumerControlPlaneUpdateReadbackSha256(readback) {
  return consumerControlPlaneExternalReceiptSha256(readback)
}

function controlPlaneReadbackVerificationDigest(verification) {
  return digestWithout(verification, 'verificationDigest', 'consumer-control-plane-update-independent-readback-verification-v1')
}

export function validateIndependentConsumerControlPlaneUpdateReadback(readback, input = {}) {
  validateConsumerControlPlaneUpdatePlan(input.plan)
  const recomputed = contextControlPlanePlan(input)
  const binding = loadControlPlaneUpdateBindings(input)
  const snapshotVerification = verifyMaterializedConsumerControlPlaneUpdateSnapshot({
    plan: recomputed,
    materializedRoot: input.materializedRoot,
  })
  schemaInvariant(validateControlPlaneReadbackSchema, readback, 'consumer control-plane update readback')
  validateConsumerControlPlaneUpdateReadback(readback, {
    repository: binding.repository,
    candidateRelease: binding.candidateRelease,
    releaseBom: binding.releaseBom,
    protocol: binding.protocol,
    sourceDigests: binding.sourceDigests,
  })
  const planProtocolBindings = {
    controlPlaneImplementationSha256: readback.controlPlaneImplementationSha256,
    controlPlanePolicySha256: readback.controlPlanePolicySha256,
    controlPlanePlanSchemaSha256: readback.controlPlanePlanSchemaSha256,
    controlPlaneSnapshotVerificationSchemaSha256: readback.controlPlaneSnapshotVerificationSchemaSha256,
    controlPlaneReadbackSchemaSha256: readback.controlPlaneReadbackSchemaSha256,
    controlPlaneReadbackVerificationSchemaSha256: readback.controlPlaneReadbackVerificationSchemaSha256,
    controlPlaneAcceptanceProposalSchemaSha256: readback.controlPlaneAcceptanceProposalSchemaSha256,
    controlPlaneBaselineReceiptSchemaSha256: readback.controlPlaneBaselineReceiptSchemaSha256,
    managedReposSchemaSha256: readback.managedReposSchemaSha256,
    engineClosureSha256: readback.engineClosureSha256,
  }
  invariant(
    deepEqual(planProtocolBindings, {
      controlPlaneImplementationSha256: recomputed.protocol.controlPlaneImplementationSha256,
      controlPlanePolicySha256: recomputed.protocol.controlPlanePolicySha256,
      controlPlanePlanSchemaSha256: recomputed.protocol.controlPlanePlanSchemaSha256,
      controlPlaneSnapshotVerificationSchemaSha256: recomputed.protocol.controlPlaneSnapshotVerificationSchemaSha256,
      controlPlaneReadbackSchemaSha256: recomputed.protocol.controlPlaneReadbackSchemaSha256,
      controlPlaneReadbackVerificationSchemaSha256: recomputed.protocol.controlPlaneReadbackVerificationSchemaSha256,
      controlPlaneAcceptanceProposalSchemaSha256: recomputed.protocol.controlPlaneAcceptanceProposalSchemaSha256,
      controlPlaneBaselineReceiptSchemaSha256: recomputed.protocol.controlPlaneBaselineReceiptSchemaSha256,
      managedReposSchemaSha256: recomputed.protocol.managedReposSchemaSha256,
      engineClosureSha256: recomputed.protocol.engineClosureSha256,
    }),
    'Consumer control-plane update readback implementation or schema bindings are stale',
  )
  invariant(
    readback.fullSnapshotPlanDigest === recomputed.planDigest
      && readback.currentSnapshotTreeSha256 === recomputed.roots.current.treeSha256
      && readback.baseSnapshotTreeSha256 === recomputed.roots.base.treeSha256
      && readback.incomingSnapshotTreeSha256 === recomputed.roots.incoming.treeSha256
      && readback.candidateReleaseSha256 === recomputed.candidate.candidateReleaseSha256
      && readback.releaseBomSha256 === recomputed.candidate.releaseBomSha256
      && readback.candidateCorpusReceiptSha256 === recomputed.candidate.candidateCorpusReceiptSha256
      && readback.baseDefaultBranchHeadSha === recomputed.sourceBindings.currentGit.commit,
    'Consumer control-plane update readback binds a stale or substituted materialization plan',
  )
  invariant(
    readback.materializedGovernanceTreeSha256 === snapshotVerification.materializedSnapshotTreeSha256
      && readback.snapshotVerificationDigest === snapshotVerification.verificationDigest
      && readback.mergeTreeSha === snapshotVerification.materializedGitTreeSha,
    'Consumer control-plane update readback binds a stale or substituted materialized snapshot',
  )
  validateExternalObserverEnvelope(readback, {
    attestationPolicy: input.attestationPolicy,
    issuerRegistry: input.issuerRegistry,
    now: input.now,
    label: 'Consumer control-plane GitHub observer readback',
  })
  const verification = {
    $schema: CONSUMER_CONTROL_PLANE_UPDATE_READBACK_VERIFICATION_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-control-plane-update-independent-readback-verification',
    readOnly: true,
    mutationAuthorized: false,
    candidateCodeExecuted: false,
    repositoryId: binding.repository.id,
    inventorySha256: binding.inventorySha256,
    candidateReleaseSha256: binding.candidateReleaseSha256,
    releaseBomSha256: binding.releaseBomSha256,
    protocolId: binding.protocol.protocolId,
    protocolSpecificationSha256: binding.sourceDigests.specificationSha256,
    protocolSchemaSha256: binding.sourceDigests.schemaSha256,
    protocolImplementationSha256: binding.sourceDigests.implementationSha256,
    ...planProtocolBindings,
    sourceProfile: binding.repository.upgradeProtocolProfile,
    postUpdateProfile: binding.postControlPlaneUpdateProfile,
    sequence: binding.sequence,
    predecessorReadbackSha256: binding.predecessorReadbackSha256,
    planDigest: recomputed.planDigest,
    snapshotVerificationDigest: snapshotVerification.verificationDigest,
    materializedSnapshotTreeSha256: snapshotVerification.materializedSnapshotTreeSha256,
    materializedGitTreeSha: snapshotVerification.materializedGitTreeSha,
    baseSnapshotTreeSha256: recomputed.roots.base.treeSha256,
    incomingSnapshotTreeSha256: recomputed.roots.incoming.treeSha256,
    baselineEvidenceSha256: recomputed.sourceBindings.baseline.evidenceSha256,
    candidateCorpusReceiptSha256: recomputed.candidate.candidateCorpusReceiptSha256,
    mergeCommitSha: readback.mergeCommitSha,
    mergeTreeSha: readback.mergeTreeSha,
    issuerRegistryDigest: readback.issuerRegistryDigest,
    observerNonce: readback.nonce,
    acceptedControlPlaneReadbackSha256: consumerControlPlaneUpdateReadbackSha256(readback),
    verificationDigest: '',
  }
  verification.verificationDigest = controlPlaneReadbackVerificationDigest(verification)
  schemaInvariant(validateControlPlaneReadbackVerificationSchema, verification, 'independent consumer control-plane update readback verification')
  return verification
}

function controlPlaneAcceptanceProposalDigest(proposal) {
  return digestWithout(proposal, 'proposalDigest', 'consumer-control-plane-update-inventory-acceptance-proposal-v1')
}

function buildControlPlaneAcceptanceProposal(readback, input) {
  const readbackVerification = validateIndependentConsumerControlPlaneUpdateReadback(readback, input)
  const binding = loadControlPlaneUpdateBindings(input)
  const proposedInventory = clone(binding.inventory)
  const repository = proposedInventory.repositories.find(item => item.id === binding.repository.id)
  repository.upgradeProtocolProfile = binding.postControlPlaneUpdateProfile
  repository.acceptedControlPlaneUpdate = {
    sequence: readbackVerification.sequence,
    readbackSha256: readbackVerification.acceptedControlPlaneReadbackSha256,
    predecessorReadbackSha256: readbackVerification.predecessorReadbackSha256,
    candidateReleaseSha256: readbackVerification.candidateReleaseSha256,
    version: binding.candidateRelease.version,
    baselineEvidenceSha256: readbackVerification.baselineEvidenceSha256,
    baseSnapshotTreeSha256: readbackVerification.baseSnapshotTreeSha256,
    incomingSnapshotTreeSha256: readbackVerification.incomingSnapshotTreeSha256,
    materializedSnapshotTreeSha256: readbackVerification.materializedSnapshotTreeSha256,
    candidateCorpusReceiptSha256: readbackVerification.candidateCorpusReceiptSha256,
    mergeCommitSha: readbackVerification.mergeCommitSha,
    mergeTreeSha: readbackVerification.mergeTreeSha,
    issuerRegistryDigest: readbackVerification.issuerRegistryDigest,
  }
  schemaInvariant(validateManagedReposSchema, proposedInventory, 'proposed managed repository inventory')
  validateInventory(proposedInventory)
  const promotedProfile = upgradeProfile(binding.protocol, repository.upgradeProtocolProfile)
  invariant(promotedProfile.controlPlaneUpdateBindingRequired === true, 'Proposed control-plane update profile does not require the accepted chain head')
  invariant(
    repository.acceptedControlPlaneUpdate.sequence === binding.sequence
      && repository.acceptedControlPlaneUpdate.predecessorReadbackSha256 === binding.predecessorReadbackSha256,
    'Proposed control-plane update inventory does not extend the exact prior chain head',
  )
  const proposedInventorySha256 = sha256(stableStringify(proposedInventory, 0))
  const proposal = {
    $schema: CONSUMER_CONTROL_PLANE_UPDATE_ACCEPTANCE_PROPOSAL_SCHEMA,
    schemaVersion: 1,
    kind: 'consumer-control-plane-update-inventory-acceptance-proposal',
    mode: 'closed-no-mutation-proposal',
    readOnly: true,
    mutationAuthorized: false,
    repositoryId: binding.repository.id,
    before: {
      inventorySha256: binding.inventorySha256,
      upgradeProtocolProfile: binding.repository.upgradeProtocolProfile,
      acceptedControlPlaneUpdate: clone(binding.priorControlPlaneUpdate),
    },
    binding: {
      acceptedControlPlaneReadbackSha256: readbackVerification.acceptedControlPlaneReadbackSha256,
      independentReadbackVerificationDigest: readbackVerification.verificationDigest,
      planDigest: readbackVerification.planDigest,
      materializedSnapshotTreeSha256: readbackVerification.materializedSnapshotTreeSha256,
      baselineEvidenceSha256: readbackVerification.baselineEvidenceSha256,
      baseSnapshotTreeSha256: readbackVerification.baseSnapshotTreeSha256,
      incomingSnapshotTreeSha256: readbackVerification.incomingSnapshotTreeSha256,
      candidateCorpusReceiptSha256: readbackVerification.candidateCorpusReceiptSha256,
      candidateReleaseSha256: readbackVerification.candidateReleaseSha256,
      releaseBomSha256: readbackVerification.releaseBomSha256,
      mergeCommitSha: readbackVerification.mergeCommitSha,
      mergeTreeSha: readbackVerification.mergeTreeSha,
      issuerRegistryDigest: readbackVerification.issuerRegistryDigest,
      protocolId: readbackVerification.protocolId,
      sourceProfile: readbackVerification.sourceProfile,
      postUpdateProfile: readbackVerification.postUpdateProfile,
      sequence: readbackVerification.sequence,
      predecessorReadbackSha256: readbackVerification.predecessorReadbackSha256,
    },
    proposedInventory,
    proposedInventorySha256,
    reviewRequirements: [...CONTROL_PLANE_REVIEW_REQUIREMENTS],
    proposalDigest: '',
  }
  proposal.proposalDigest = controlPlaneAcceptanceProposalDigest(proposal)
  return proposal
}

export function createConsumerControlPlaneUpdateAcceptanceProposal(readback, input = {}) {
  const proposal = buildControlPlaneAcceptanceProposal(readback, input)
  schemaInvariant(validateControlPlaneAcceptanceProposalSchema, proposal, 'consumer control-plane update acceptance proposal')
  return proposal
}

export function validateConsumerControlPlaneUpdateAcceptanceProposal(proposal, readback, input = {}) {
  schemaInvariant(validateControlPlaneAcceptanceProposalSchema, proposal, 'consumer control-plane update acceptance proposal')
  invariant(proposal.proposalDigest === controlPlaneAcceptanceProposalDigest(proposal), 'Consumer control-plane update acceptance proposal digest is stale')
  schemaInvariant(validateManagedReposSchema, proposal.proposedInventory, 'consumer control-plane update proposed inventory')
  validateInventory(proposal.proposedInventory)
  invariant(proposal.proposedInventorySha256 === sha256(stableStringify(proposal.proposedInventory, 0)), 'Consumer control-plane update proposed inventory digest is stale')
  const expected = buildControlPlaneAcceptanceProposal(readback, input)
  invariant(deepEqual(proposal, expected), 'Consumer control-plane update acceptance proposal is stale or substituted')
  return proposal
}
