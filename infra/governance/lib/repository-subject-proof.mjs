import { resolve } from 'node:path'
import { compareUtf8Bytes, invariant, runClosedGit, sha256, stableStringify } from './common.mjs'

const SHA1 = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const RELATIONSHIPS = new Set(['self', 'ancestor'])
const CHANGE_STATUSES = new Set(['added', 'modified', 'removed'])

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant([Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be a plain object`)
  const actual = Object.keys(value).sort(compareUtf8Bytes)
  const wanted = [...expected].sort(compareUtf8Bytes)
  invariant(
    actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
    `${label} has an invalid or open shape`,
  )
}

function repositoryCoordinates(repository) {
  invariant(typeof repository?.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(repository.id), 'Repository subject proof requires a valid inventory repository id')
  invariant(typeof repository.github === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.github), `Repository subject proof requires a valid GitHub slug for ${repository.id}`)
  invariant(typeof repository.defaultBranch === 'string' && repository.defaultBranch.length > 0, `Repository subject proof requires a default branch for ${repository.id}`)
  return {
    repositoryId: repository.id,
    repository: repository.github,
    protectedDefaultBranch: repository.defaultBranch,
  }
}

export function repositorySubjectObjectReadbackDigest(repository, { subjectCommit, subjectTree }) {
  return sha256(stableStringify({
    schemaVersion: 1,
    kind: 'repository-subject-object-readback',
    ...repositoryCoordinates(repository),
    subjectCommit,
    subjectTree,
  }, 0))
}

export function repositorySubjectAncestryReadbackDigest(repository, {
  subjectCommit,
  subjectTree,
  carrierCommit,
  carrierTree,
  relationship,
  changedFiles,
  changedFilesSha256,
  changedPaths,
  changedPathsSha256,
}) {
  return sha256(stableStringify({
    schemaVersion: 1,
    kind: 'protected-default-branch-subject-ancestry-readback',
    ...repositoryCoordinates(repository),
    subjectCommit,
    subjectTree,
    carrierCommit,
    carrierTree,
    relationship,
    changedFiles,
    changedFilesSha256,
    changedPaths,
    changedPathsSha256,
  }, 0))
}

export function repositorySubjectChangedPathsDigest(changedPaths) {
  invariant(Array.isArray(changedPaths), 'Repository subject proof changedPaths must be an array')
  return sha256(stableStringify(changedPaths, 0))
}

export function repositorySubjectChangedFilesDigest(changedFiles) {
  invariant(Array.isArray(changedFiles), 'Repository subject proof changedFiles must be an array')
  return sha256(stableStringify(changedFiles, 0))
}

function normalizeChangedFiles(changedFiles) {
  invariant(Array.isArray(changedFiles), 'Repository subject proof changedFiles must be an array')
  const normalized = changedFiles.map((file, index) => {
    exactKeys(file, ['path', 'status'], `Repository subject proof changedFiles[${index}]`)
    invariant(typeof file.path === 'string' && file.path.length > 0, `Repository subject proof changedFiles[${index}] path is invalid`)
    invariant(CHANGE_STATUSES.has(file.status), `Repository subject proof changedFiles[${index}] status is invalid`)
    return { path: file.path, status: file.status }
  })
  invariant(new Set(normalized.map(file => file.path)).size === normalized.length, 'Repository subject proof changedFiles contains duplicate paths')
  const sorted = [...normalized].sort((left, right) => compareUtf8Bytes(left.path, right.path))
  invariant(JSON.stringify(normalized) === JSON.stringify(sorted), 'Repository subject proof changedFiles must be path-sorted')
  return normalized
}

export function buildRepositorySubjectProof(repository, {
  subjectCommit,
  subjectTree,
  carrierCommit,
  carrierTree,
  relationship = subjectCommit === carrierCommit ? 'self' : 'ancestor',
  changedFiles = [],
}) {
  for (const [name, value] of Object.entries({ subjectCommit, subjectTree, carrierCommit, carrierTree })) {
    invariant(SHA1.test(value ?? ''), `Repository subject proof ${name} is invalid`)
  }
  invariant(RELATIONSHIPS.has(relationship), 'Repository subject proof relationship is invalid')
  invariant((relationship === 'self') === (subjectCommit === carrierCommit), 'Repository subject proof self/ancestor relationship contradicts its commits')
  if (relationship === 'self') invariant(subjectTree === carrierTree, 'Repository subject proof self relationship has different subject/carrier trees')
  const normalizedChangedFiles = normalizeChangedFiles(changedFiles)
  const changedPaths = normalizedChangedFiles.map(file => file.path)
  invariant((relationship === 'self') === (changedPaths.length === 0), 'Repository subject proof changedPaths contradict its self/ancestor relationship')
  const claims = {
    subjectCommit,
    subjectTree,
    carrierCommit,
    carrierTree,
    relationship,
    changedFiles: normalizedChangedFiles,
    changedFilesSha256: repositorySubjectChangedFilesDigest(normalizedChangedFiles),
    changedPaths,
    changedPathsSha256: repositorySubjectChangedPathsDigest(changedPaths),
  }
  return {
    ...claims,
    objectReadbackSha256: repositorySubjectObjectReadbackDigest(repository, claims),
    ancestryReadbackSha256: repositorySubjectAncestryReadbackDigest(repository, claims),
  }
}

function globToRegExp(pattern) {
  invariant(typeof pattern === 'string' && pattern.length > 0, 'Repository certification carrier path pattern is invalid')
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*' && pattern[index + 1] === '*') {
      source += '.*'
      index += 1
    } else if (char === '*') source += '[^/]*'
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }
  return new RegExp(`${source}$`)
}

function validateCarrierPolicy(proof, carrierPolicy, repository) {
  exactKeys(carrierPolicy, ['relationship', 'allowedChangedPaths'], `Certification carrier policy ${repository.role}`)
  invariant(['exact-subject', 'ledger-carrier-descendant'].includes(carrierPolicy.relationship), `Certification carrier policy relationship is invalid for ${repository.role}`)
  invariant(Array.isArray(carrierPolicy.allowedChangedPaths), `Certification carrier policy allowedChangedPaths must be an array for ${repository.role}`)
  invariant(new Set(carrierPolicy.allowedChangedPaths).size === carrierPolicy.allowedChangedPaths.length, `Certification carrier policy allowedChangedPaths contains duplicates for ${repository.role}`)
  if (carrierPolicy.relationship === 'exact-subject') {
    invariant(proof.relationship === 'self' && proof.changedPaths.length === 0, `Repository certification subject must exactly equal the carrier for ${repository.id}`)
    invariant(carrierPolicy.allowedChangedPaths.length === 0, `Exact-subject certification carrier policy cannot allow changed paths for ${repository.role}`)
    return
  }
  invariant(carrierPolicy.allowedChangedPaths.length > 0, `Ledger-carrier certification policy must enumerate changed paths for ${repository.role}`)
  const matchers = carrierPolicy.allowedChangedPaths.map(globToRegExp)
  for (const path of proof.changedPaths) {
    invariant(matchers.some(matcher => matcher.test(path)), `Repository certification carrier changed forbidden path ${path} for ${repository.id}`)
  }
}

export function validateRepositorySubjectProofShape(repository, repositoryIdentity, subjectCommit) {
  exactKeys(repositoryIdentity, ['gitCommit', 'gitTree', 'subjectProofs'], `Repository identity ${repository?.id ?? '<unknown>'}`)
  invariant(SHA1.test(repositoryIdentity.gitCommit ?? '') && SHA1.test(repositoryIdentity.gitTree ?? ''), `Repository identity commit/tree is invalid for ${repository.id}`)
  invariant(repositoryIdentity.subjectProofs && typeof repositoryIdentity.subjectProofs === 'object' && !Array.isArray(repositoryIdentity.subjectProofs), `Repository identity subject proofs are missing for ${repository.id}`)
  invariant(SHA1.test(subjectCommit ?? ''), `Repository certification subject commit is invalid for ${repository.id}`)
  const proof = repositoryIdentity.subjectProofs[subjectCommit]
  invariant(proof, `Repository certification subject ${subjectCommit} is missing protected ancestry/object readback for ${repository.id}`)
  exactKeys(proof, [
    'subjectCommit', 'subjectTree', 'carrierCommit', 'carrierTree', 'relationship',
    'changedFiles', 'changedFilesSha256', 'changedPaths', 'changedPathsSha256',
    'objectReadbackSha256', 'ancestryReadbackSha256',
  ], `Repository subject proof ${repository.id}/${subjectCommit}`)
  for (const [name, value] of Object.entries({
    subjectCommit: proof.subjectCommit,
    subjectTree: proof.subjectTree,
    carrierCommit: proof.carrierCommit,
    carrierTree: proof.carrierTree,
  })) invariant(SHA1.test(value ?? ''), `Repository subject proof ${repository.id}/${name} is invalid`)
  invariant(RELATIONSHIPS.has(proof.relationship), `Repository subject proof relationship is invalid for ${repository.id}`)
  normalizeChangedFiles(proof.changedFiles)
  invariant(Array.isArray(proof.changedPaths) && proof.changedPaths.every(path => typeof path === 'string' && path.length > 0), `Repository subject proof changedPaths are invalid for ${repository.id}`)
  invariant(JSON.stringify(proof.changedPaths) === JSON.stringify([...new Set(proof.changedPaths)].sort(compareUtf8Bytes)), `Repository subject proof changedPaths must be sorted and unique for ${repository.id}`)
  invariant(SHA256.test(proof.changedFilesSha256 ?? '') && SHA256.test(proof.changedPathsSha256 ?? '') && SHA256.test(proof.objectReadbackSha256 ?? '') && SHA256.test(proof.ancestryReadbackSha256 ?? ''), `Repository subject proof readback digest is invalid for ${repository.id}`)
  invariant(proof.subjectCommit === subjectCommit, `Repository subject proof key/commit differs for ${repository.id}`)
  return proof
}

export function validateRepositorySubjectProof(repository, repositoryIdentity, { subjectCommit, subjectTree }, { carrierPolicy } = {}) {
  invariant(SHA1.test(subjectTree ?? ''), `Repository certification subject commit/tree is invalid for ${repository.id}`)
  const proof = validateRepositorySubjectProofShape(repository, repositoryIdentity, subjectCommit)
  invariant(proof.subjectCommit === subjectCommit && proof.subjectTree === subjectTree, `Repository certification subject commit/tree differs from object readback for ${repository.id}`)
  invariant(proof.carrierCommit === repositoryIdentity.gitCommit && proof.carrierTree === repositoryIdentity.gitTree, `Repository certification carrier commit/tree differs from protected default-branch readback for ${repository.id}`)
  invariant((proof.relationship === 'self') === (proof.subjectCommit === proof.carrierCommit), `Repository subject proof self/ancestor relationship contradicts its commits for ${repository.id}`)
  if (proof.relationship === 'self') invariant(proof.subjectTree === proof.carrierTree, `Repository subject proof self relationship has different trees for ${repository.id}`)
  invariant((proof.relationship === 'self') === (proof.changedPaths.length === 0), `Repository subject proof changedPaths contradict its self/ancestor relationship for ${repository.id}`)
  invariant(JSON.stringify(proof.changedPaths) === JSON.stringify(proof.changedFiles.map(file => file.path)), `Repository subject changedFiles/changedPaths mismatch for ${repository.id}`)
  invariant(proof.changedFilesSha256 === repositorySubjectChangedFilesDigest(proof.changedFiles), `Repository subject changed-file digest mismatch for ${repository.id}`)
  invariant(proof.changedPathsSha256 === repositorySubjectChangedPathsDigest(proof.changedPaths), `Repository subject changed-path digest mismatch for ${repository.id}`)
  invariant(proof.objectReadbackSha256 === repositorySubjectObjectReadbackDigest(repository, proof), `Repository subject object readback digest mismatch for ${repository.id}`)
  invariant(proof.ancestryReadbackSha256 === repositorySubjectAncestryReadbackDigest(repository, proof), `Repository subject ancestry readback digest mismatch for ${repository.id}`)
  validateCarrierPolicy(proof, carrierPolicy, repository)
  return true
}

function git(repoRoot, args, label) {
  const result = runClosedGit(args, { cwd: resolve(repoRoot), timeoutMs: 10_000 })
  invariant(
    !result.error && result.signal === null && result.status === 0 && typeof result.stdout === 'string',
    label,
  )
  return result.stdout.trim()
}

function gitChangedFiles(repoRoot, subjectCommit, carrierCommit, repository) {
  const result = runClosedGit(
    ['diff', '--name-status', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', `${subjectCommit}..${carrierCommit}`],
    { cwd: resolve(repoRoot), timeoutMs: 10_000 },
  )
  invariant(
    !result.error && result.signal === null && result.status === 0 && typeof result.stdout === 'string',
    `Cannot read certification carrier changed files for ${repository.id}/${subjectCommit}`,
  )
  const fields = result.stdout.split('\0')
  if (fields.at(-1) === '') fields.pop()
  invariant(fields.length % 2 === 0, `Certification carrier changed-file readback is malformed for ${repository.id}/${subjectCommit}`)
  const statuses = { A: 'added', M: 'modified', D: 'removed' }
  const changedFiles = []
  for (let index = 0; index < fields.length; index += 2) {
    const status = statuses[fields[index]]
    invariant(status, `Certification carrier contains unsupported change status ${fields[index]} for ${repository.id}/${subjectCommit}`)
    changedFiles.push({ path: fields[index + 1], status })
  }
  return changedFiles.sort((left, right) => compareUtf8Bytes(left.path, right.path))
}

export function resolveLocalRepositoryIdentity({ repoRoot, repository, subjectCommits = [], carrierPolicy } = {}) {
  invariant(Array.isArray(subjectCommits), 'Local repository subject commits must be an array')
  const [gitCommit, gitTree, ...extra] = git(repoRoot, ['rev-parse', 'HEAD', 'HEAD^{tree}'], `Cannot resolve carrier commit/tree for ${repository?.id ?? '<unknown>'}`).split('\n')
  invariant(extra.length === 0 && SHA1.test(gitCommit ?? '') && SHA1.test(gitTree ?? ''), `Local carrier commit/tree is invalid for ${repository.id}`)
  const subjectProofs = {}
  for (const subjectCommit of [...new Set(subjectCommits)]) {
    invariant(SHA1.test(subjectCommit ?? ''), `Local repository certification subject commit is invalid for ${repository.id}`)
    const [resolvedCommit, subjectTree, ...subjectExtra] = git(repoRoot, ['rev-parse', `${subjectCommit}^{commit}`, `${subjectCommit}^{tree}`], `Repository certification subject object is missing for ${repository.id}/${subjectCommit}`).split('\n')
    invariant(subjectExtra.length === 0 && resolvedCommit === subjectCommit && SHA1.test(subjectTree ?? ''), `Repository certification subject object readback is invalid for ${repository.id}/${subjectCommit}`)
    if (subjectCommit !== gitCommit) {
      const ancestry = runClosedGit(
        ['merge-base', '--is-ancestor', subjectCommit, gitCommit],
        { cwd: resolve(repoRoot), output: 'ignore', timeoutMs: 10_000 },
      )
      invariant(
        !ancestry.error && ancestry.signal === null && ancestry.status === 0,
        `Repository certification subject is not an ancestor of the carrier for ${repository.id}/${subjectCommit}`,
      )
    }
    const changedFiles = subjectCommit === gitCommit
      ? []
      : gitChangedFiles(repoRoot, subjectCommit, gitCommit, repository)
    subjectProofs[subjectCommit] = buildRepositorySubjectProof(repository, {
      subjectCommit,
      subjectTree,
      carrierCommit: gitCommit,
      carrierTree: gitTree,
      changedFiles,
    })
    validateRepositorySubjectProof(repository, { gitCommit, gitTree, subjectProofs }, { subjectCommit, subjectTree }, { carrierPolicy })
  }
  return { gitCommit, gitTree, subjectProofs }
}
