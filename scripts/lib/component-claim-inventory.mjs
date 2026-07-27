import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import {
  buildComponentDependencySourceInventory,
  compareUtf8Bytes,
} from './component-dependency-source-inventory.mjs'

function fail(message) {
  throw new Error(`component claim inventory blocked:${message}`)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort(compareUtf8Bytes).map((key) => [key, stable(value[key])]))
}

function sourcePath(path) {
  return /(?:\.spec\.md|\.stories\.tsx|(?:^|\/)README\.md|(?:^|\/)index\.(?:ts|tsx))$/.test(path)
}

function safeFile(root, path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || isAbsolute(path)
    || path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`claim source path is unsafe:${String(path)}`)
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`claim source escapes repository:${path}`)
  let cursor = root
  for (const segment of rel.split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) fail(`claim source is missing or crosses a symbolic link:${path}`)
  }
  const info = lstatSync(target)
  if (!info.isFile() || info.nlink !== 1) fail(`claim source is not a unique regular file:${path}`)
  return target
}

export function buildComponentClaimInventory({ repoRoot, manifest, component, dependencyRoot = repoRoot } = {}) {
  const root = realpathSync(resolve(repoRoot))
  const record = manifest?.components?.find((item) => item.name === component)
  if (!record) fail(`component is absent from frozen manifest:${String(component)}`)
  const inventoryByPath = new Map(manifest.inventory.map((row) => [row.path, row]))
  const dependencySourceInventory = buildComponentDependencySourceInventory({
    repoRoot: root,
    dependencyRoot,
    manifest,
    component,
  })
  const supportingSourceSetDigest = dependencySourceInventory.dependencySourceInventoryDigest
  const claims = []
  for (const path of record.paths.filter(sourcePath).sort(compareUtf8Bytes)) {
    const row = inventoryByPath.get(path)
    if (!row || row.kind !== 'file') fail(`claim source is not a frozen file:${path}`)
    const bytes = readFileSync(safeFile(root, path))
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) fail(`claim source differs from frozen manifest:${path}`)
    const lines = bytes.toString('utf8').split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index].trim()
      if (!text) continue
      const textSha256 = sha256(text)
      claims.push({
        claimId: sha256(`${path}\0${index + 1}\0${textSha256}`),
        claimClass: 'claim-source-line',
        path,
        line: index + 1,
        textSha256,
        supportingSourceSetDigest,
      })
    }
  }
  if (claims.length === 0) fail(`component has no deterministic public-claim source lines:${component}`)
  const claimInventoryDigest = sha256(JSON.stringify(stable(claims)))
  return {
    component,
    claimInventoryDigest,
    claimCount: claims.length,
    supportingSourceSetDigest,
    supportingSourceCount: dependencySourceInventory.sourceCount,
    dependencySourceStatus: dependencySourceInventory.status,
    dependencySourceFindingCount: dependencySourceInventory.findings.length,
    dependencySourceFindingsDigest: sha256(JSON.stringify(stable(dependencySourceInventory.findings))),
    dependencySourceInventory,
    claims,
  }
}

export function buildComponentClaimReceipt({ claimInventory, claimVerdicts, falseClaims } = {}) {
  if (!claimInventory || !Array.isArray(claimVerdicts) || !Array.isArray(falseClaims)) fail('claim receipt inputs are invalid')
  const expectedIds = claimInventory.claims.map((claim) => claim.claimId)
  const verdictIds = claimVerdicts.map((verdict) => verdict?.claimId)
  if (new Set(verdictIds).size !== verdictIds.length
    || JSON.stringify([...verdictIds].sort(compareUtf8Bytes)) !== JSON.stringify([...expectedIds].sort(compareUtf8Bytes))) {
    fail('claim verdicts do not close over the exact deterministic claim inventory')
  }
  const byId = new Map(claimVerdicts.map((verdict) => [verdict.claimId, verdict]))
  for (const verdict of claimVerdicts) {
    if (!verdict || Object.keys(verdict).sort(compareUtf8Bytes).join(',') !== 'claimId,status'
      || !['verified', 'false', 'unverifiable'].includes(verdict.status)) fail('claim verdict has an invalid or open shape')
  }
  const falseIds = falseClaims.map((claim) => claim?.claimId)
  if (new Set(falseIds).size !== falseIds.length
    || falseIds.some((id) => byId.get(id)?.status !== 'false')
    || verdictIds.filter((id) => byId.get(id).status === 'false').some((id) => !falseIds.includes(id))) {
    fail('false-claim findings do not match false verdicts exactly once')
  }
  const orderedVerdicts = [...claimVerdicts].sort((left, right) => compareUtf8Bytes(left.claimId, right.claimId))
  const falseCount = orderedVerdicts.filter((verdict) => verdict.status === 'false').length
  const unverifiableCount = orderedVerdicts.filter((verdict) => verdict.status === 'unverifiable').length
  if (claimInventory.dependencySourceStatus !== 'verified' && unverifiableCount === 0) {
    fail('untrusted, missing, or opaque dependency source cannot produce an all-verified claim receipt')
  }
  return {
    schemaVersion: 1,
    status: unverifiableCount === 0 && claimInventory.dependencySourceStatus === 'verified' ? 'verified' : 'unverifiable',
    claimInventoryDigest: claimInventory.claimInventoryDigest,
    claimCount: claimInventory.claimCount,
    verdictDigest: sha256(JSON.stringify(stable(orderedVerdicts))),
    verifiedCount: claimInventory.claimCount - falseCount - unverifiableCount,
    falseCount,
    unverifiableCount,
    supportingSourceSetDigest: claimInventory.supportingSourceSetDigest,
    supportingSourceCount: claimInventory.supportingSourceCount,
    dependencySourceFindingsDigest: claimInventory.dependencySourceFindingsDigest,
    dependencySourceFindingCount: claimInventory.dependencySourceFindingCount,
  }
}
