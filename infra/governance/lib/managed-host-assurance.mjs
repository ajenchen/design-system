import { createPublicKey, verify as verifySignature } from 'node:crypto'
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readlinkSync, realpathSync, readdirSync } from 'node:fs'
import { isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path'
import { validateCandidateRelease } from './release-evidence.mjs'
import { compareUtf8Bytes, invariant, readJson, runClosedGit, sha256, stableStringify } from './common.mjs'
import {
  CLAUDE_PERMISSION_POLICY_SOURCE,
  assertClaudePermissionMaterialization,
  materializeClaudeGovernanceSettings,
  materializeClaudeSandbox,
  readClaudePermissionPolicy,
} from '../../../scripts/lib/claude-permission-policy.mjs'

const SHA1 = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const PLATFORMS = new Set(['darwin', 'linux', 'win32'])
const ENVELOPE_KEYS = ['$schema', 'schemaVersion', 'kind', 'payload', 'attestation']
const PAYLOAD_KEYS = [
  'schemaVersion', 'kind', 'provider', 'hostIdentity', 'source', 'sourceIdentity',
  'observedVersion', 'canonicalInputs', 'controlReadbacks', 'runtime', 'hookDelivery',
  'filesystemTrust', 'issuedAt', 'expiresAt', 'nonce', 'collector',
]
const CLAUDE_PLUGIN_RUNTIME_ROOTS = [
  'generated/governance',
  'packages/governance/canonical',
  'packages/governance/src',
  'scripts',
]
const CLAUDE_PLUGIN_RUNTIME_FILES = [
  'AGENTS.md',
]
const WINDOWS_ADMIN_SIDS = new Set(['S-1-5-18', 'S-1-5-32-544'])
const WINDOWS_WRITE_RIGHTS = new Set([
  'append-data', 'delete', 'delete-child', 'full-control', 'generic-all', 'generic-write',
  'write-attributes', 'write-dac', 'write-data', 'write-extended-attributes', 'write-owner',
])
const WINDOWS_KNOWN_RIGHTS = new Set([
  ...WINDOWS_WRITE_RIGHTS,
  'execute', 'generic-read', 'read-attributes', 'read-control', 'read-data',
  'read-extended-attributes', 'synchronize',
])
const CODEX_GOVERNED_APPROVAL_POLICIES = Object.freeze(['never', 'on-request'])
const CODEX_GOVERNED_PERMISSION_PROFILES = Object.freeze([
  '":read-only" = true',
  '":workspace" = true',
])

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  const actual = Object.keys(value).sort(compareUtf8Bytes)
  const wanted = [...expected].sort(compareUtf8Bytes)
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

function pointerGet(value, pointer, label) {
  invariant(typeof pointer === 'string' && pointer.startsWith('/'), `${label} pointer is invalid`)
  let current = value
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~')
    invariant(current && typeof current === 'object' && key in current, `${label} pointer is unresolved:${pointer}`)
    current = current[key]
  }
  return current
}

function semver(value, label) {
  const match = String(value || '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/)
  invariant(match, `${label} is not a supported semantic version`)
  return {
    core: match.slice(1, 4),
    prerelease: match[4] ? match[4].split('.').map(token => (/^\d+$/.test(token)
      ? { kind: 'numeric', value: token }
      : { kind: 'text', value: token })) : [],
  }
}

function compareNumericToken(left, right) {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1
  return compareUtf8Bytes(left, right)
}

function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) {
    if (left.length === right.length) return 0
    return left.length === 0 ? 1 : -1
  }
  const count = Math.max(left.length, right.length)
  for (let index = 0; index < count; index += 1) {
    const leftToken = left[index]
    const rightToken = right[index]
    if (leftToken === undefined || rightToken === undefined) {
      if (leftToken === rightToken) return 0
      return leftToken === undefined ? -1 : 1
    }
    if (leftToken.kind !== rightToken.kind) return leftToken.kind === 'numeric' ? -1 : 1
    if (leftToken.value === rightToken.value) continue
    if (leftToken.kind === 'numeric') return compareNumericToken(leftToken.value, rightToken.value)
    return compareUtf8Bytes(leftToken.value, rightToken.value)
  }
  return 0
}

export function managedHostVersionAtLeast(actual, minimum) {
  const left = semver(actual, 'observed provider version')
  const right = semver(minimum, 'minimum provider version')
  for (let index = 0; index < 3; index += 1) {
    const compared = compareNumericToken(left.core[index], right.core[index])
    if (compared !== 0) return compared > 0
  }
  return comparePrerelease(left.prerelease, right.prerelease) >= 0
}

function safeRelativePath(path, label) {
  invariant(typeof path === 'string' && path && !path.includes('\\') && !isAbsolute(path), `${label} must be a relative POSIX path`)
  invariant(!path.split('/').some(part => !part || part === '.' || part === '..'), `${label} contains an unsafe segment`)
  return path
}

function contained(root, target, label, { allowRoot = false } = {}) {
  const base = resolve(root)
  const absolute = resolve(target)
  const rel = relative(base, absolute)
  invariant((allowRoot && !rel) || (rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)), `${label} escapes its root`)
  return absolute
}

function lstatIfPresent(path, options = undefined) {
  try {
    return lstatSync(path, options)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function assertNoSymlinkComponents(root, target, label, { allowMissing = false } = {}) {
  const base = resolve(root)
  const absolute = contained(base, target, label, { allowRoot: true })
  const rootInfo = lstatIfPresent(base)
  invariant(rootInfo, `${label} root is missing`)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), `${label} root must be a real directory`)
  let cursor = base
  const rel = relative(base, absolute)
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    const info = lstatIfPresent(cursor)
    if (!info) {
      invariant(allowMissing, `${label} is missing:${relative(base, cursor)}`)
      return
    }
    invariant(!info.isSymbolicLink(), `${label} crosses a symbolic link:${relative(base, cursor)}`)
  }
}

function safeRepoPath(root, path, label, { mustExist = true } = {}) {
  safeRelativePath(path, label)
  const absolute = contained(root, resolve(root, path), label)
  assertNoSymlinkComponents(root, absolute, label, { allowMissing: !mustExist })
  if (mustExist) invariant(existsSync(absolute), `${label} is missing:${path}`)
  return absolute
}

function materializeTokens(value, tokens) {
  if (typeof value === 'string') {
    let output = value
    for (const [token, replacement] of Object.entries(tokens)) output = output.replaceAll(token, replacement)
    invariant(!/__[_A-Z0-9]+__/.test(output), `managed-host template contains an unresolved token:${output.match(/__[_A-Z0-9]+__/)?.[0]}`)
    return output
  }
  if (Array.isArray(value)) return value.map(item => materializeTokens(item, tokens))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materializeTokens(item, tokens)]))
  return value
}

function tomlSectionLines(bytes, section, label) {
  const lines = bytes.replaceAll('\r\n', '\n').split('\n')
  const header = `[${section}]`
  const start = lines.indexOf(header)
  invariant(start >= 0 && lines.indexOf(header, start + 1) < 0, `${label} must contain exactly one ${header} section`)
  const values = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (line.startsWith('[')) break
    if (line && !line.startsWith('#')) values.push(line)
  }
  return values
}

export function assertCodexManagedEngineeringDelegationPolicy(bytes, {
  label = 'Codex managed requirements policy',
} = {}) {
  invariant(typeof bytes === 'string' && bytes.length > 0, `${label} must be non-empty TOML`)
  const normalized = bytes.replaceAll('\r\n', '\n')
  const lines = normalized.split('\n')
  const exactRoot = [
    'allow_managed_hooks_only = true',
    `allowed_approval_policies = [${CODEX_GOVERNED_APPROVAL_POLICIES.map(value => `"${value}"`).join(', ')}]`,
    'default_permissions = ":workspace"',
  ]
  for (const expected of exactRoot) {
    invariant(lines.filter(line => line === expected).length === 1, `${label} lacks exact governed authority binding:${expected}`)
  }
  invariant(
    stableStringify(tomlSectionLines(normalized, 'allowed_permission_profiles', label), 0)
      === stableStringify(CODEX_GOVERNED_PERMISSION_PROFILES, 0),
    `${label} permits an unbound or over-privileged permission profile`,
  )
  invariant(
    stableStringify(tomlSectionLines(normalized, 'features', label), 0)
      === stableStringify(['hooks = true', 'plugins = false', 'remote_plugin = false'], 0),
    `${label} does not bind managed hooks while excluding unmanaged plugin execution`,
  )
  invariant(
    tomlSectionLines(normalized, 'mcp_servers', label).length === 0,
    `${label} includes an unmanaged MCP execution surface`,
  )
  invariant(
    !/(?:danger-full-access|bypassPermissions|dangerously-bypass|allowed_approval_policies\s*=\s*\[[^\]]*untrusted)/.test(normalized),
    `${label} weakens sandbox, approval, or bypass enforcement`,
  )
  return true
}

function validLogicalAbsolute(path, platform, label) {
  invariant(typeof path === 'string' && path && !path.includes('\0') && !/[\r\n"']/.test(path), `${label} contains unsafe characters`)
  if (platform === 'win32') invariant(win32.isAbsolute(path), `${label} must be an absolute Windows path`)
  else {
    invariant(isAbsolute(path), `${label} must be an absolute path`)
    invariant(!/\s/.test(path), `${label} may not contain whitespace on Unix because it is embedded in a managed command`)
  }
  return path
}

function darwinEtcAliasBinding(hostRoot, logicalPath, label) {
  if (logicalPath !== '/etc' && !logicalPath.startsWith('/etc/')) return null
  normalizeLogicalAbsolute(logicalPath, 'darwin', label)
  const root = resolve(hostRoot)
  const aliasPath = contained(root, resolve(root, 'etc'), `${label} macOS /etc alias`)
  const aliasInfo = lstatIfPresent(aliasPath, { bigint: true })
  if (!aliasInfo?.isSymbolicLink()) return null

  const linkTarget = readlinkSync(aliasPath)
  invariant(linkTarget === 'private/etc', `${label} may only cross the standard macOS /etc -> /private/etc alias`)
  const canonicalRoot = contained(root, resolve(root, 'private/etc'), `${label} macOS /etc canonical target`)
  assertNoSymlinkComponents(root, canonicalRoot, `${label} macOS /etc canonical target`)
  invariant(realpathSync(aliasPath) === realpathSync(canonicalRoot), `${label} macOS /etc alias does not resolve to the canonical target`)

  const tail = logicalPath === '/etc' ? '' : logicalPath.slice('/etc/'.length)
  const physicalPath = tail
    ? contained(canonicalRoot, resolve(canonicalRoot, ...tail.split('/')), label)
    : canonicalRoot
  return {
    physicalPath,
    alias: {
      logicalPath: '/etc',
      physicalPath: aliasPath,
      canonicalTarget: canonicalRoot,
      linkTarget,
      identity: stableStatIdentity(aliasInfo),
    },
  }
}

function resolveHostPathBinding(hostRoot, logicalPath, platform, label = 'managed host path') {
  const root = resolve(hostRoot)
  invariant(isAbsolute(root), `${label} host root must be absolute`)
  assertNoSymlinkComponents(root, root, `${label} host root`)
  if (platform === 'darwin') {
    const alias = darwinEtcAliasBinding(root, logicalPath, label)
    if (alias) return alias
  }
  if (root === resolve('/') && platform === process.platform) return { physicalPath: resolve(logicalPath), alias: null }
  const parts = platform === 'win32'
    ? logicalPath.replace(/^%ProgramData%/i, 'ProgramData').replace(/^([A-Za-z]):/, '$1').split('\\').filter(Boolean)
    : logicalPath.split('/').filter(Boolean)
  if (parts.length === 0 && platform !== 'win32') return { physicalPath: root, alias: null }
  invariant(parts.length > 0 && !parts.some(part => part === '.' || part === '..'), `${label} is not safely mappable`)
  return { physicalPath: contained(root, resolve(root, ...parts), label), alias: null }
}

function mapHostPath(hostRoot, logicalPath, platform, label = 'managed host path') {
  return resolveHostPathBinding(hostRoot, logicalPath, platform, label).physicalPath
}

function logicalPathApi(platform) {
  return platform === 'win32' ? win32 : posix
}

function normalizeLogicalAbsolute(path, platform, label) {
  validLogicalAbsolute(path, platform, label)
  const api = logicalPathApi(platform)
  const normalized = api.normalize(path)
  invariant(normalized === path, `${label} must use its canonical absolute spelling:${path}`)
  return normalized
}

function logicalJoin(root, path, platform, label) {
  safeRelativePath(path, label)
  const api = logicalPathApi(platform)
  const joined = api.join(root, ...path.split('/'))
  normalizeLogicalAbsolute(joined, platform, label)
  const rel = api.relative(root, joined)
  invariant(rel && rel !== '..' && !rel.startsWith(`..${api.sep}`) && !api.isAbsolute(rel), `${label} escapes its logical root`)
  return joined
}

function logicalAncestors(path, platform) {
  const api = logicalPathApi(platform)
  const normalized = normalizeLogicalAbsolute(path, platform, 'managed filesystem requirement')
  const output = []
  let cursor = normalized
  while (true) {
    output.push(cursor)
    const parent = api.dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  return output.reverse()
}

function stableStatIdentity(stat) {
  return {
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    linkCount: stat.nlink.toString(),
    size: stat.size.toString(),
    modifiedTimeNs: stat.mtimeNs.toString(),
    changedTimeNs: stat.ctimeNs.toString(),
  }
}

function rawFilesystemObservation({ hostRoot, logicalPath, objectType, platform }) {
  const label = `managed filesystem ${logicalPath}`
  const resolvedBefore = resolveHostPathBinding(hostRoot, logicalPath, platform, label)
  const physicalPath = resolvedBefore.physicalPath
  assertNoSymlinkComponents(hostRoot, physicalPath, `managed filesystem ${logicalPath}`)
  const noFollow = fsConstants.O_NOFOLLOW || 0
  const directoryOnly = objectType === 'directory' ? (fsConstants.O_DIRECTORY || 0) : 0
  const descriptor = openSync(physicalPath, fsConstants.O_RDONLY | noFollow | directoryOnly)
  try {
    const before = fstatSync(descriptor, { bigint: true })
    invariant(objectType === 'directory' ? before.isDirectory() : before.isFile(), `managed filesystem object type mismatch:${logicalPath}`)
    const contentSha256 = objectType === 'file' ? sha256(readFileSync(descriptor)) : null
    const after = fstatSync(descriptor, { bigint: true })
    const beforeIdentity = stableStatIdentity(before)
    const afterIdentity = stableStatIdentity(after)
    invariant(stableStringify(beforeIdentity, 0) === stableStringify(afterIdentity, 0), `managed filesystem object changed while it was read:${logicalPath}`)
    const resolvedAfter = resolveHostPathBinding(hostRoot, logicalPath, platform, label)
    assertNoSymlinkComponents(hostRoot, resolvedAfter.physicalPath, label)
    const pathIdentityAfter = stableStatIdentity(lstatSync(resolvedAfter.physicalPath, { bigint: true }))
    invariant(
      resolvedAfter.physicalPath === resolvedBefore.physicalPath
        && stableStringify(resolvedAfter.alias, 0) === stableStringify(resolvedBefore.alias, 0)
        && stableStringify(pathIdentityAfter, 0) === stableStringify(afterIdentity, 0),
      `managed filesystem path binding changed while it was read:${logicalPath}`,
    )
    return {
      logicalPath,
      objectType,
      identity: beforeIdentity,
      contentSha256,
      unix: platform === 'win32' ? null : {
        uid: Number(before.uid),
        gid: Number(before.gid),
        mode: Number(before.mode & 0o7777n),
      },
      windowsAcl: null,
    }
  } finally {
    closeSync(descriptor)
  }
}

function selectFilesystemProbe(testOnlyFilesystemProbe) {
  if (!testOnlyFilesystemProbe) return null
  invariant(typeof testOnlyFilesystemProbe === 'function', 'managed-host test-only filesystem probe must be a function')
  invariant(Boolean(process.env.NODE_TEST_CONTEXT), 'managed-host test-only filesystem probe is forbidden outside the Node test runner')
  return testOnlyFilesystemProbe
}

function collectFilesystemSnapshot({ requirements, hostRoot, platform, testOnlyFilesystemProbe = null, phase }) {
  const probe = selectFilesystemProbe(testOnlyFilesystemProbe)
  return requirements.map((requirement) => {
    const context = {
      ...requirement,
      hostRoot,
      platform,
      phase,
      defaultProbe: () => rawFilesystemObservation({ ...requirement, hostRoot, platform }),
    }
    const observation = probe ? probe(context) : context.defaultProbe()
    exactKeys(observation, ['logicalPath', 'objectType', 'identity', 'contentSha256', 'unix', 'windowsAcl'], `managed filesystem observation ${requirement.logicalPath}`)
    invariant(observation.logicalPath === requirement.logicalPath && observation.objectType === requirement.objectType, `managed filesystem probe changed its requested identity:${requirement.logicalPath}`)
    return observation
  })
}

function exactFilesystemRequirements(targets, platform) {
  const byPath = new Map()
  let requiresDarwinEtcCanonicalAncestor = false
  for (const target of targets) {
    exactKeys(target, ['logicalPath', 'objectType'], 'managed filesystem target')
    invariant(['file', 'directory'].includes(target.objectType), `managed filesystem target type is invalid:${target.logicalPath}`)
    const ancestors = logicalAncestors(target.logicalPath, platform)
    if (platform === 'darwin' && (target.logicalPath === '/etc' || target.logicalPath.startsWith('/etc/'))) requiresDarwinEtcCanonicalAncestor = true
    for (const [index, logicalPath] of ancestors.entries()) {
      const objectType = index === ancestors.length - 1 ? target.objectType : 'directory'
      const prior = byPath.get(logicalPath)
      invariant(!prior || prior.objectType === objectType, `managed filesystem target type conflicts with an ancestor:${logicalPath}`)
      byPath.set(logicalPath, { logicalPath, objectType })
    }
  }
  if (requiresDarwinEtcCanonicalAncestor) {
    const prior = byPath.get('/private')
    invariant(!prior || prior.objectType === 'directory', 'managed filesystem /private canonical ancestor conflicts with a target type')
    byPath.set('/private', { logicalPath: '/private', objectType: 'directory' })
  }
  invariant(byPath.size > 0, 'managed filesystem requirements are empty')
  return [...byPath.values()].sort((left, right) => compareUtf8Bytes(left.logicalPath, right.logicalPath))
}

function walkRegularFiles(root, label) {
  invariant(existsSync(root), `${label} is missing`)
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), `${label} must be a real directory`)
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
      const absolute = join(directory, entry.name)
      const rel = relative(root, absolute).split(sep).join('/')
      invariant(!entry.isSymbolicLink(), `${label} crosses a symbolic link:${rel}`)
      if (entry.isDirectory()) visit(absolute)
      else {
        invariant(entry.isFile(), `${label} contains an unsupported file:${rel}`)
        files.push({ path: rel, sha256: sha256(readFileSync(absolute)) })
      }
    }
  }
  visit(root)
  return files.sort((left, right) => compareUtf8Bytes(left.path, right.path))
}

function inventoryDigest(files) {
  return sha256(stableStringify(files, 0))
}

function verifyInventoryRoot({ root, files, label, excluded = [] }) {
  invariant(Array.isArray(files) && files.length > 0, `${label} has no inventory`)
  const seen = new Set()
  const normalized = []
  for (const file of files) {
    exactKeys(file, ['path', 'sha256'], `${label} file`)
    safeRelativePath(file.path, `${label} file path`)
    invariant(SHA256.test(file.sha256 || '') && !seen.has(file.path), `${label} file digest/path is invalid:${file.path}`)
    const absolute = contained(root, resolve(root, file.path), `${label} file`)
    assertNoSymlinkComponents(root, absolute, `${label} file`)
    const info = lstatSync(absolute)
    invariant(info.isFile() && !info.isSymbolicLink(), `${label} file is not regular:${file.path}`)
    invariant(sha256(readFileSync(absolute)) === file.sha256, `${label} file digest mismatch:${file.path}`)
    seen.add(file.path)
    normalized.push({ path: file.path, sha256: file.sha256 })
  }
  const actual = walkRegularFiles(root, label).filter(item => !excluded.includes(item.path))
  invariant(stableStringify(actual, 0) === stableStringify(normalized.sort((a, b) => compareUtf8Bytes(a.path, b.path)), 0), `${label} contains missing or unexpected files`)
  return inventoryDigest(normalized)
}

function treeDigest(root, label) {
  return inventoryDigest(walkRegularFiles(root, label))
}

function normalizedCandidateSourceFiles(sourceFiles) {
  invariant(sourceFiles instanceof Map, 'candidate release source snapshot must be a Map')
  const output = new Map()
  for (const [path, content] of sourceFiles) {
    safeRelativePath(path, 'candidate release source path')
    invariant(Buffer.isBuffer(content) && !output.has(path), `candidate release source content is invalid or duplicated:${path}`)
    output.set(path, Buffer.from(content))
  }
  return output
}

function selectedCandidateSourceFiles(sourceFiles, paths) {
  const selected = new Map()
  for (const repoPath of paths) {
    safeRelativePath(repoPath, 'candidate release source selector')
    const matches = [...sourceFiles].filter(([path]) => path === repoPath || path.startsWith(`${repoPath}/`))
    invariant(matches.length > 0, `candidate release source snapshot is missing:${repoPath}`)
    for (const [path, content] of matches) {
      invariant(!selected.has(path), `candidate release source selectors overlap:${path}`)
      selected.set(path, content)
    }
  }
  return new Map([...selected].sort(([left], [right]) => compareUtf8Bytes(left, right)))
}

export function loadCandidateReleaseSourceFiles({ repoRoot, release, paths }) {
  invariant(release?.status === 'ready' && SHA1.test(release.sourceCommit || '') && SHA1.test(release.sourceTree || ''), 'candidate release Git source identity is unavailable')
  const git = (args, { output = 'capture', maxOutputBytes = 64 * 1024 * 1024 } = {}) => {
    const result = runClosedGit(args, {
      cwd: resolve(repoRoot),
      maxOutputBytes,
      output,
      timeoutMs: 15_000,
    })
    invariant(!result.error && result.signal === null && result.status === 0, `candidate release closed Git read failed:${args[0]}`)
    return result.stdout
  }
  const tree = git(['rev-parse', `${release.sourceCommit}^{tree}`]).trim()
  invariant(tree === release.sourceTree, `candidate release Git tree mismatch:${tree}!=${release.sourceTree}`)
  const output = new Map()
  for (const repoPath of paths) {
    safeRelativePath(repoPath, 'candidate release Git selector')
    const listing = git(
      ['ls-tree', '-r', '-z', '--full-tree', release.sourceCommit, '--', repoPath],
      { output: 'buffer' },
    )
    const records = listing.toString('utf8').split('\0').filter(Boolean)
    invariant(records.length > 0, `candidate release Git tree is missing:${repoPath}`)
    for (const record of records) {
      const match = record.match(/^([0-9]{6}) ([a-z]+) ([a-f0-9]{40})\t(.+)$/)
      invariant(match, `candidate release Git tree record is invalid:${record}`)
      const [, mode, type, object, path] = match
      safeRelativePath(path, 'candidate release Git path')
      invariant(type === 'blob' && ['100644', '100755'].includes(mode), `candidate release Git path is not a regular file:${path}:${mode}:${type}`)
      invariant(!output.has(path), `candidate release Git selectors overlap:${path}`)
      output.set(path, git(['cat-file', 'blob', object], { output: 'buffer' }))
    }
  }
  return normalizedCandidateSourceFiles(output)
}

function candidateSourceInventory(sourceFiles, paths, { outputPrefix = '' } = {}) {
  const selected = selectedCandidateSourceFiles(sourceFiles, paths)
  return [...selected].map(([path, content]) => ({
    path: outputPrefix ? `${outputPrefix}/${path}` : path,
    sha256: sha256(content),
  })).sort((left, right) => compareUtf8Bytes(left.path, right.path))
}

function candidatePrefixDigest(sourceFiles, repoPath, label) {
  const selected = selectedCandidateSourceFiles(sourceFiles, [repoPath])
  const files = [...selected].map(([path, content]) => ({
    path: path === repoPath ? repoPath.split('/').at(-1) : path.slice(repoPath.length + 1),
    sha256: sha256(content),
  })).sort((left, right) => compareUtf8Bytes(left.path, right.path))
  invariant(files.length > 0, `${label} is empty`)
  return inventoryDigest(files)
}

function candidateFile(sourceFiles, path, label) {
  const content = sourceFiles.get(path)
  invariant(Buffer.isBuffer(content), `candidate release is missing ${label}:${path}`)
  return content
}

function claudePluginRootReferences(hookViewBytes) {
  const hookView = JSON.parse(hookViewBytes.toString('utf8'))
  const references = new Set()
  const visit = (value) => {
    if (typeof value === 'string') {
      if (!value.includes('${CLAUDE_PLUGIN_ROOT}')) return
      const matched = []
      for (const match of value.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9._/-]+)/g)) {
        safeRelativePath(match[1], 'Claude plugin runtime dependency')
        references.add(match[1])
        matched.push(match[0])
      }
      const residual = matched.reduce((current, token) => current.replace(token, ''), value)
      invariant(!residual.includes('${CLAUDE_PLUGIN_ROOT}'), `Claude hook view contains an unresolved plugin-root expression:${value}`)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value && typeof value === 'object') for (const item of Object.values(value)) visit(item)
  }
  visit(hookView)
  invariant(references.size > 0, 'Claude hook view has no plugin-root executable dependencies')
  return [...references].sort(compareUtf8Bytes)
}

export function buildExpectedClaudePluginRuntime(candidateSourceFiles) {
  const sourceFiles = normalizedCandidateSourceFiles(candidateSourceFiles)
  const hookViewBytes = candidateFile(sourceFiles, 'hooks/hooks.json', 'Claude plugin hook registration view')
  const entrypoints = claudePluginRootReferences(hookViewBytes).map((path) => {
    invariant(CLAUDE_PLUGIN_RUNTIME_ROOTS.some(root => path.startsWith(`${root}/`)), `Claude plugin runtime dependency is outside the verified runtime roots:${path}`)
    return { path, sha256: sha256(candidateFile(sourceFiles, path, 'Claude plugin runtime dependency')) }
  })
  const roots = CLAUDE_PLUGIN_RUNTIME_ROOTS.map(path => ({
    path,
    sha256: candidatePrefixDigest(sourceFiles, path, `candidate Claude plugin runtime root ${path}`),
  }))
  const files = CLAUDE_PLUGIN_RUNTIME_FILES.map(path => ({
    path,
    sha256: sha256(candidateFile(sourceFiles, path, 'Claude plugin runtime file')),
  }))
  const withoutDigest = { roots, files, entrypoints }
  return { ...withoutDigest, runtimeDependencySha256: sha256(stableStringify(withoutDigest, 0)) }
}

export function buildManagedFilesystemRequirements({ provider, platform, runtime, hookDelivery, codexExpectedFiles = [] }) {
  invariant(provider && ['claude-code', 'codex'].includes(provider.id), 'managed filesystem provider is unsupported')
  invariant(PLATFORMS.has(platform), `managed filesystem platform is unsupported:${platform}`)
  const targets = []
  if (provider.id === 'claude-code') {
    invariant(hookDelivery && typeof hookDelivery === 'object' && !Array.isArray(hookDelivery), 'Claude filesystem trust requires hook delivery')
    const installedRoot = normalizeLogicalAbsolute(hookDelivery.installedRoot, platform, 'Claude installed plugin root')
    targets.push({ logicalPath: installedRoot, objectType: 'directory' })
    invariant(Array.isArray(hookDelivery.files) && hookDelivery.files.length > 0, 'Claude filesystem trust requires the installed inventory')
    const seen = new Set()
    for (const file of hookDelivery.files) {
      exactKeys(file, ['path', 'sha256'], 'Claude filesystem trust inventory file')
      safeRelativePath(file.path, 'Claude filesystem trust inventory path')
      invariant(SHA256.test(file.sha256 || '') && !seen.has(file.path), `Claude filesystem trust inventory is invalid:${file.path}`)
      seen.add(file.path)
      targets.push({ logicalPath: logicalJoin(installedRoot, file.path, platform, 'Claude filesystem trust inventory path'), objectType: 'file' })
    }
  } else {
    const paths = runtimePaths(runtime, platform)
    for (const logicalPath of Object.values(paths)) targets.push({ logicalPath: normalizeLogicalAbsolute(logicalPath, platform, 'Codex managed runtime path'), objectType: 'file' })
    invariant(hookDelivery && typeof hookDelivery === 'object' && !Array.isArray(hookDelivery), 'Codex filesystem trust requires hook delivery')
    const logicalRoot = normalizeLogicalAbsolute(hookDelivery.logicalRoot, platform, 'Codex managed hook root')
    targets.push({ logicalPath: logicalRoot, objectType: 'directory' })
    invariant(Array.isArray(codexExpectedFiles) && codexExpectedFiles.length > 0, 'Codex filesystem trust requires the deterministic file inventory')
    for (const file of codexExpectedFiles) {
      exactKeys(file, ['path', 'sha256'], 'Codex filesystem trust inventory file')
      safeRelativePath(file.path, 'Codex filesystem trust inventory path')
      invariant(SHA256.test(file.sha256 || ''), `Codex filesystem trust inventory digest is invalid:${file.path}`)
      targets.push({ logicalPath: logicalJoin(logicalRoot, file.path, platform, 'Codex filesystem trust inventory path'), objectType: 'file' })
    }
    targets.push({ logicalPath: logicalJoin(logicalRoot, 'managed-hook-bundle.json', platform, 'Codex managed hook manifest path'), objectType: 'file' })
  }
  return exactFilesystemRequirements(targets, platform)
}

function validateFilesystemIdentity(identity, label) {
  exactKeys(identity, ['device', 'inode', 'linkCount', 'size', 'modifiedTimeNs', 'changedTimeNs'], `${label} identity`)
  for (const [name, value] of Object.entries(identity)) invariant(typeof value === 'string' && /^\d+$/.test(value), `${label} identity ${name} is invalid`)
}

function validateUnixFilesystemObservation(observation, label) {
  invariant(observation.windowsAcl === null, `${label} Unix observation may not contain Windows ACL evidence`)
  exactKeys(observation.unix, ['uid', 'gid', 'mode'], `${label} Unix ownership`)
  invariant(Number.isSafeInteger(observation.unix.uid) && observation.unix.uid === 0, `${label} is not root/admin owned`)
  invariant(Number.isSafeInteger(observation.unix.gid) && observation.unix.gid >= 0, `${label} has an invalid group owner`)
  invariant(Number.isSafeInteger(observation.unix.mode) && observation.unix.mode >= 0 && observation.unix.mode <= 0o7777, `${label} has an invalid Unix mode`)
  invariant((observation.unix.mode & 0o022) === 0, `${label} is writable by an untrusted Unix group/other principal`)
}

function validateWindowsAcl(acl, label) {
  exactKeys(acl, ['ownerSid', 'daclProtected', 'rawSecurityDescriptorSha256', 'aces'], `${label} Windows ACL`)
  invariant(WINDOWS_ADMIN_SIDS.has(acl.ownerSid), `${label} is not owned by SYSTEM or BUILTIN\\Administrators`)
  invariant(typeof acl.daclProtected === 'boolean', `${label} Windows ACL protection flag is invalid`)
  invariant(SHA256.test(acl.rawSecurityDescriptorSha256 || ''), `${label} raw Windows security descriptor digest is invalid`)
  invariant(Array.isArray(acl.aces), `${label} Windows ACL entries are missing`)
  const identities = new Set()
  for (const [index, ace] of acl.aces.entries()) {
    exactKeys(ace, ['type', 'sid', 'rights', 'inherited'], `${label} Windows ACL entry ${index}`)
    invariant(['allow', 'deny'].includes(ace.type) && /^S-\d(?:-\d+)+$/.test(ace.sid || '') && typeof ace.inherited === 'boolean', `${label} Windows ACL entry ${index} is invalid`)
    invariant(Array.isArray(ace.rights) && ace.rights.length > 0 && ace.rights.every(right => WINDOWS_KNOWN_RIGHTS.has(right)), `${label} Windows ACL rights are invalid or not normalized`)
    invariant(stableStringify(ace.rights, 0) === stableStringify([...new Set(ace.rights)].sort(compareUtf8Bytes), 0), `${label} Windows ACL rights must be sorted and unique`)
    const identity = stableStringify(ace, 0)
    invariant(!identities.has(identity), `${label} Windows ACL contains a duplicate entry`)
    identities.add(identity)
    if (ace.type === 'allow' && ace.rights.some(right => WINDOWS_WRITE_RIGHTS.has(right))) {
      invariant(WINDOWS_ADMIN_SIDS.has(ace.sid), `${label} grants write-capable Windows rights to an untrusted principal:${ace.sid}`)
    }
  }
}

function validateFilesystemObservation(observation, requirement, platform, { requireAcl }) {
  const label = `managed filesystem ${requirement.logicalPath}`
  exactKeys(observation, ['logicalPath', 'objectType', 'identity', 'contentSha256', 'unix', 'windowsAcl'], `${label} observation`)
  invariant(observation.logicalPath === requirement.logicalPath && observation.objectType === requirement.objectType, `${label} observation identity mismatch`)
  validateFilesystemIdentity(observation.identity, label)
  if (requirement.objectType === 'file') invariant(SHA256.test(observation.contentSha256 || ''), `${label} file content digest is invalid`)
  else invariant(observation.contentSha256 === null, `${label} directory may not contain a content digest`)
  if (platform === 'win32') {
    invariant(observation.unix === null, `${label} Windows observation may not contain Unix ownership`)
    if (requireAcl) validateWindowsAcl(observation.windowsAcl, label)
    else invariant(observation.windowsAcl === null, `${label} local Windows snapshot may not self-assert ACL evidence`)
  } else validateUnixFilesystemObservation(observation, label)
}

export function collectManagedFilesystemTrustEvidence({
  requirements,
  platform,
  hostRoot,
  hostIdentity,
  collectorInstanceId,
  attestorKeyId,
  observedAt,
  windowsAclObservations = null,
  testOnlyFilesystemProbe = null,
}) {
  invariant(Array.isArray(requirements) && requirements.length > 0, 'managed filesystem trust requirements are missing')
  const canonicalRequirements = exactFilesystemRequirements(requirements, platform)
  invariant(typeof collectorInstanceId === 'string' && collectorInstanceId.length > 0 && typeof attestorKeyId === 'string' && attestorKeyId.length > 0, 'managed filesystem endpoint collector identity is missing')
  const observed = new Date(observedAt)
  invariant(Number.isFinite(observed.getTime()) && observed.toISOString() === observedAt, 'managed filesystem observation time is invalid')
  let observations
  if (platform === 'win32') {
    invariant(Array.isArray(windowsAclObservations), 'Windows filesystem trust requires endpoint-collected owner and ACL evidence')
    observations = windowsAclObservations
  } else {
    invariant(windowsAclObservations === null, 'Unix filesystem trust may not accept endpoint-only ACL evidence')
    observations = collectFilesystemSnapshot({ requirements: canonicalRequirements, hostRoot, platform, testOnlyFilesystemProbe, phase: 'evidence' })
  }
  invariant(observations.length === canonicalRequirements.length, 'managed filesystem trust observation inventory is incomplete')
  for (const [index, requirement] of canonicalRequirements.entries()) validateFilesystemObservation(observations[index], requirement, platform, { requireAcl: platform === 'win32' })
  const withoutDigest = {
    schemaVersion: 1,
    kind: 'managed-filesystem-trust',
    platform,
    hostIdentitySha256: sha256(stableStringify(hostIdentity, 0)),
    collectorInstanceId,
    attestorKeyId,
    observedAt,
    requirementsSha256: sha256(stableStringify(canonicalRequirements, 0)),
    observations,
  }
  return { ...withoutDigest, observationsSha256: sha256(stableStringify(observations, 0)) }
}

function filesystemLocalProjection(observation) {
  return {
    logicalPath: observation.logicalPath,
    objectType: observation.objectType,
    identity: observation.identity,
    contentSha256: observation.contentSha256,
  }
}

function beginManagedFilesystemTrustVerification({
  payload,
  attestationKeyId,
  requirements,
  platform,
  hostRoot,
  testOnlyFilesystemProbe,
}) {
  const trust = payload.filesystemTrust
  invariant(trust && typeof trust === 'object' && !Array.isArray(trust), `${payload.provider} managed filesystem owner/ACL evidence is unavailable`)
  invariant(payload.source === 'endpoint-management-composed-effective' && payload.collector.kind === 'endpoint-management', `${payload.provider} filesystem trust must come from the endpoint-management composed effective collector`)
  exactKeys(trust, [
    'schemaVersion', 'kind', 'platform', 'hostIdentitySha256', 'collectorInstanceId', 'attestorKeyId',
    'observedAt', 'requirementsSha256', 'observations', 'observationsSha256',
  ], `${payload.provider} managed filesystem trust`)
  invariant(trust.schemaVersion === 1 && trust.kind === 'managed-filesystem-trust' && trust.platform === platform, `${payload.provider} managed filesystem trust kind/platform mismatch`)
  invariant(trust.hostIdentitySha256 === sha256(stableStringify(payload.hostIdentity, 0)), `${payload.provider} managed filesystem trust host identity mismatch`)
  invariant(trust.collectorInstanceId === payload.collector.instanceId && trust.attestorKeyId === attestationKeyId, `${payload.provider} managed filesystem trust collector/attestor mismatch`)
  invariant(trust.observedAt === payload.issuedAt, `${payload.provider} managed filesystem trust is not contemporaneous with the signed readback`)
  const canonicalRequirements = exactFilesystemRequirements(requirements, platform)
  invariant(trust.requirementsSha256 === sha256(stableStringify(canonicalRequirements, 0)), `${payload.provider} managed filesystem requirement digest mismatch`)
  invariant(Array.isArray(trust.observations) && trust.observations.length === canonicalRequirements.length, `${payload.provider} managed filesystem observation inventory is incomplete`)
  invariant(trust.observationsSha256 === sha256(stableStringify(trust.observations, 0)), `${payload.provider} managed filesystem observation digest mismatch`)
  for (const [index, requirement] of canonicalRequirements.entries()) validateFilesystemObservation(trust.observations[index], requirement, platform, { requireAcl: platform === 'win32' })

  const before = collectFilesystemSnapshot({ requirements: canonicalRequirements, hostRoot, platform, testOnlyFilesystemProbe, phase: 'before' })
  for (const [index, requirement] of canonicalRequirements.entries()) {
    validateFilesystemObservation(before[index], requirement, platform, { requireAcl: false })
    const signedProjection = platform === 'win32' ? filesystemLocalProjection(trust.observations[index]) : trust.observations[index]
    const localProjection = platform === 'win32' ? filesystemLocalProjection(before[index]) : before[index]
    invariant(stableStringify(signedProjection, 0) === stableStringify(localProjection, 0), `${payload.provider} signed filesystem observation does not match the local object:${requirement.logicalPath}`)
  }
  return () => {
    const after = collectFilesystemSnapshot({ requirements: canonicalRequirements, hostRoot, platform, testOnlyFilesystemProbe, phase: 'after' })
    for (const [index, requirement] of canonicalRequirements.entries()) {
      validateFilesystemObservation(after[index], requirement, platform, { requireAcl: false })
      invariant(stableStringify(filesystemLocalProjection(after[index]), 0) === stableStringify(filesystemLocalProjection(before[index]), 0), `${payload.provider} managed filesystem object changed during verification:${requirement.logicalPath}`)
    }
  }
}

export function buildCodexManagedDispatcher({
  maxInputBytes = 64 * 1024 * 1024,
  maxChildOutputBytes = 1024 * 1024,
  childTimeoutMs = 45_000,
} = {}) {
  invariant(Number.isSafeInteger(maxInputBytes) && maxInputBytes > 0, 'managed Codex dispatcher input bound is invalid')
  invariant(Number.isSafeInteger(maxChildOutputBytes) && maxChildOutputBytes > 0, 'managed Codex dispatcher child-output bound is invalid')
  invariant(Number.isSafeInteger(childTimeoutMs) && childTimeoutMs > 0, 'managed Codex dispatcher child timeout is invalid')
  const source = String.raw`#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TextDecoder } from 'node:util'

const MAX_INPUT_BYTES = __MAX_INPUT_BYTES__
const MAX_CHILD_OUTPUT_BYTES = __MAX_CHILD_OUTPUT_BYTES__
const CHILD_TIMEOUT_MS = __CHILD_TIMEOUT_MS__
const MAX_BUNDLE_DOCUMENT_BYTES = 16 * 1024 * 1024
const MAX_HOOK_BYTES = 4 * 1024 * 1024
const MAX_CORPUS_SNAPSHOT_BYTES = 64 * 1024 * 1024
const MAX_CORPUS_SNAPSHOT_ENTRIES = 4096
const MAX_CHANGED_FILE_COUNT = 256
const MAX_DESCRIPTOR_COUNT = 64
const MAX_INVOCATION_COUNT = 1024
const MAX_PROPOSED_AFTER_IMAGE_BYTES = 16 * 1024 * 1024
const MAX_AGGREGATE_CHILD_OUTPUT_BYTES = 8 * 1024 * 1024
const MAX_EMITTED_OUTPUT_BYTES = 8 * 1024 * 1024
const BATCH_RUNTIME_MS = 120000
const SIGNAL_GRACE_MS = 150
const SIGNAL_KILL_WAIT_MS = 100
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true })
const CHILD_INTEGRITY_MARKER = 'GOVERNANCE_INTEGRITY:'
const EVENTS = new Set(['PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'Stop'])
const OUTPUT_MODES = new Set([
  'diagnostic',
  'blocking',
  'governance-context',
  'governance-decision',
  'governance-context-or-block',
])
const INPUT_CONTRACTS = new Set(['event-v1', 'proposed-text-v1'])
const TRANSCRIPT_REQUIREMENTS = new Set(['none', 'optional', 'stable-required'])
const RUNTIME_NAMES = new Set(['bash', 'python3'])
const ROOT = dirname(fileURLToPath(import.meta.url))
const INSTALLED_FORK = resolve(ROOT, 'payload/packages/design-system/ds-canonical/fork')
const corpusSnapshotRoots = new Set()
const activeChildren = new Set()
const batchStartedAt = process.hrtime.bigint()
const batchRuntimeLimitMs = process.env.NODE_ENV === 'test'
  && process.argv.includes('--test-short-batch-runtime')
  ? 750
  : BATCH_RUNTIME_MS
let aggregateChildOutputBytes = 0
let emittedOutputBytes = 0
let batchDeadlineTimer = null
let shutdownStarted = false

function cleanupCorpusSnapshots() {
  for (const root of corpusSnapshotRoots) {
    try {
      makePrivateTreeRemovable(root)
      rmSync(root, { recursive: true, force: true })
    } catch {}
    corpusSnapshotRoots.delete(root)
  }
}

function makePrivateTreeRemovable(root, current = root) {
  let info
  try {
    info = lstatSync(current)
  } catch {
    return
  }
  if (info.isSymbolicLink() || !info.isDirectory()) return
  chmodSync(current, 0o700)
  for (const name of readdirSync(current)) {
    const child = resolve(current, name)
    const childInfo = lstatSync(child)
    if (childInfo.isDirectory() && !childInfo.isSymbolicLink()) {
      makePrivateTreeRemovable(root, child)
    }
  }
}

const boundedDelay = (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds))

function signalChildTree(child, signal) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    try { child.kill(signal) } catch {}
  }
}

async function terminateChildTrees(children) {
  const captured = [...children]
  for (const child of captured) signalChildTree(child, 'SIGTERM')
  if (!captured.length) return
  await boundedDelay(SIGNAL_GRACE_MS)
  for (const child of captured) signalChildTree(child, 'SIGKILL')
  await boundedDelay(SIGNAL_KILL_WAIT_MS)
}

async function shutdownForSignal(exitCode) {
  if (shutdownStarted) return
  shutdownStarted = true
  if (batchDeadlineTimer) clearTimeout(batchDeadlineTimer)
  await terminateChildTrees(activeChildren)
  cleanupCorpusSnapshots()
  process.exit(exitCode)
}

async function shutdownForDeadline() {
  if (shutdownStarted) return
  shutdownStarted = true
  if (batchDeadlineTimer) clearTimeout(batchDeadlineTimer)
  await terminateChildTrees(activeChildren)
  cleanupCorpusSnapshots()
  process.stderr.write(
    'GOVERNANCE_INTEGRITY:MANAGED_CODEX_DISPATCH_FAILED:managed hook batch exceeded '
      + batchRuntimeLimitMs + 'ms:deadline\n',
  )
  process.exit(70)
}

process.once('exit', cleanupCorpusSnapshots)
process.once('SIGINT', () => { void shutdownForSignal(130) })
process.once('SIGTERM', () => { void shutdownForSignal(143) })

class ManagedCodexIntegrityError extends Error {
  constructor(message, { childStderr = '' } = {}) {
    super(message)
    this.name = 'ManagedCodexIntegrityError'
    this.code = 'MANAGED_CODEX_DISPATCH_INTEGRITY_FAILURE'
    this.childStderr = childStderr
  }
}

function integrity(message, options) {
  throw new ManagedCodexIntegrityError(message, options)
}

// Preserve canonical artifact code points and order their exact UTF-8 bytes.
// This closure must remain zero-I/O because snapshot verification uses it before
// any authenticated corpus module may be imported.
function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'))
}

function batchElapsedMs() {
  return Number(process.hrtime.bigint() - batchStartedAt) / 1000000
}

function remainingBatchMs(label) {
  const remaining = batchRuntimeLimitMs - batchElapsedMs()
  if (remaining <= 0) {
    integrity('managed hook batch exceeded ' + batchRuntimeLimitMs + 'ms:' + label)
  }
  return Math.max(1, Math.floor(remaining))
}

function writeBoundedOutput(stream, value, label) {
  const text = String(value)
  emittedOutputBytes += Buffer.byteLength(text, 'utf8')
  if (!Number.isSafeInteger(emittedOutputBytes)
    || emittedOutputBytes > MAX_EMITTED_OUTPUT_BYTES) {
    integrity('emitted output exceeds ' + MAX_EMITTED_OUTPUT_BYTES + ' bytes:' + label)
  }
  stream.write(text)
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    integrity(label + ' must be an object')
  }
  return value
}

function identity(info) {
  return [
    info.dev,
    info.ino,
    info.nlink,
    info.size,
    info.mtimeNs,
    info.ctimeNs,
  ].map((value) => value.toString()).join(':')
}

function contained(root, target, { allowRoot = false } = {}) {
  const rel = relative(resolve(root), resolve(target))
  return (allowRoot && !rel)
    || Boolean(rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

function chainSnapshot(root, target, label, { allowMissing = false } = {}) {
  const absoluteRoot = resolve(root)
  const absoluteTarget = resolve(target)
  if (!contained(absoluteRoot, absoluteTarget, { allowRoot: true })) {
    integrity(label + ' escapes its trusted root')
  }
  const paths = [absoluteRoot]
  const rel = relative(absoluteRoot, absoluteTarget)
  let cursor = absoluteRoot
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment)
    paths.push(cursor)
  }
  const snapshot = []
  for (const path of paths) {
    let info
    try {
      info = lstatSync(path, { bigint: true })
    } catch (error) {
      if (allowMissing && error?.code === 'ENOENT') break
      integrity(label + ' cannot be inspected:' + (error?.code || error.message))
    }
    if (info.isSymbolicLink()) integrity(label + ' crosses a symbolic link:' + path)
    snapshot.push({ path, identity: identity(info) })
  }
  return snapshot
}

function sameSnapshot(left, right) {
  return left.length === right.length
    && left.every((entry, index) =>
      entry.path === right[index].path && entry.identity === right[index].identity)
}

function readStableText(path, label, maximumBytes = MAX_BUNDLE_DOCUMENT_BYTES, trustedRoot = ROOT) {
  const beforeChain = chainSnapshot(trustedRoot, path, label)
  const pathInfo = lstatSync(path, { bigint: true })
  if (!pathInfo.isFile() || pathInfo.nlink !== 1n || pathInfo.size > BigInt(maximumBytes)) {
    integrity(label + ' must be one bounded regular unaliased file')
  }
  let handle = null
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(path, fsConstants.O_RDONLY | noFollow)
    const opened = fstatSync(handle, { bigint: true })
    if (identity(opened) !== identity(pathInfo)) integrity(label + ' changed while being opened')
    const bytes = Buffer.alloc(Number(opened.size))
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(handle, bytes, offset, bytes.length - offset, offset)
      if (count <= 0) integrity(label + ' changed while being read')
      offset += count
    }
    const openedAfter = fstatSync(handle, { bigint: true })
    const afterChain = chainSnapshot(trustedRoot, path, label)
    if (identity(opened) !== identity(openedAfter) || !sameSnapshot(beforeChain, afterChain)) {
      integrity(label + ' changed while being read')
    }
    try {
      return STRICT_UTF8.decode(bytes)
    } catch {
      integrity(label + ' is not strict UTF-8')
    }
  } finally {
    if (handle !== null) closeSync(handle)
  }
}

function readJson(path, label, trustedRoot = ROOT) {
  let parsed
  try {
    parsed = JSON.parse(readStableText(path, label, MAX_BUNDLE_DOCUMENT_BYTES, trustedRoot))
  } catch (error) {
    if (error instanceof ManagedCodexIntegrityError) throw error
    integrity(label + ' is invalid JSON:' + error.message)
  }
  return object(parsed, label)
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : ''
}

async function readBoundedInput() {
  const chunks = []
  let total = 0
  try {
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += bytes.length
      if (total > MAX_INPUT_BYTES) {
        integrity('provider input exceeds ' + MAX_INPUT_BYTES + ' bytes')
      }
      chunks.push(bytes)
    }
  } catch (error) {
    if (error instanceof ManagedCodexIntegrityError) throw error
    integrity('provider input read failed:' + error.message)
  }
  try {
    return STRICT_UTF8.decode(Buffer.concat(chunks, total))
  } catch {
    integrity('provider input is not strict UTF-8')
  }
}

function canonicalDescriptor(value, index, event) {
  const descriptor = object(value, 'hook descriptor ' + event + '[' + index + ']')
  if (typeof descriptor.file !== 'string' || !descriptor.file.startsWith('hooks/')) {
    integrity('hook descriptor has an unsafe file:' + event + '[' + index + ']')
  }
  if (descriptor.file.split('/').some((part) => !part || part === '.' || part === '..')) {
    integrity('hook descriptor has an unsafe file:' + event + '[' + index + ']')
  }
  if (typeof descriptor.matcher !== 'string') {
    integrity('hook descriptor has an invalid matcher:' + descriptor.file)
  }
  if (!RUNTIME_NAMES.has(descriptor.runtime)) {
    integrity('hook descriptor has an unsupported runtime:' + descriptor.file)
  }
  if (!OUTPUT_MODES.has(descriptor.outputMode)) {
    integrity('hook descriptor has an unsupported outputMode:' + descriptor.file)
  }
  if (!INPUT_CONTRACTS.has(descriptor.inputContract)) {
    integrity('hook descriptor has an unsupported inputContract:' + descriptor.file)
  }
  if (!TRANSCRIPT_REQUIREMENTS.has(descriptor.transcriptRequirement)) {
    integrity('hook descriptor has an unsupported transcriptRequirement:' + descriptor.file)
  }
  return Object.freeze({ ...descriptor })
}

function descriptorMatchesTool(descriptor, tool) {
  return !descriptor.matcher || descriptor.matcher.split('|').includes(tool)
}

function lockEntries(lock) {
  if (
    lock.schemaVersion !== 1
    || lock.kind !== 'fork-governance-corpus-lock'
    || lock.hashAlgorithm !== 'sha256'
    || !Array.isArray(lock.entries)
  ) integrity('fork corpus lock identity is invalid')
  const entries = new Map()
  for (const [index, entry] of lock.entries.entries()) {
    if (
      !entry
      || typeof entry !== 'object'
      || Array.isArray(entry)
      || typeof entry.file !== 'string'
      || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')
      || entries.has(entry.file)
    ) integrity('fork corpus lock entry is invalid or duplicated:' + index)
    entries.set(entry.file, entry.sha256)
  }
  return entries
}

function corpusEntryPath(root, file, label) {
  if (
    typeof file !== 'string'
    || !file
    || file.includes('\0')
    || isAbsolute(file)
    || file.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')
  ) integrity(label + ' has an unsafe corpus-relative path')
  const absolute = resolve(root, file)
  if (!contained(root, absolute)) integrity(label + ' escapes the fork corpus:' + file)
  return absolute
}

function authenticatedCorpusEntry(forkRoot, file, expected) {
  const label = 'corpus entry ' + file
  const absolute = corpusEntryPath(forkRoot, file, label)
  const chainBefore = chainSnapshot(forkRoot, absolute, label)
  const pathInfo = lstatSync(absolute, { bigint: true })
  if (!pathInfo.isFile() || pathInfo.nlink !== 1n || pathInfo.size > BigInt(MAX_HOOK_BYTES)) {
    integrity(label + ' must be one bounded regular unaliased file')
  }
  let handle = null
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    handle = openSync(absolute, fsConstants.O_RDONLY | noFollow)
    const opened = fstatSync(handle, { bigint: true })
    if (identity(opened) !== identity(pathInfo)) integrity(label + ' changed while being opened')
    const bytes = Buffer.alloc(Number(opened.size))
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(handle, bytes, offset, bytes.length - offset, offset)
      if (count <= 0) integrity(label + ' changed while being authenticated')
      offset += count
    }
    const openedAfter = fstatSync(handle, { bigint: true })
    const chainAfter = chainSnapshot(forkRoot, absolute, label)
    if (identity(opened) !== identity(openedAfter) || !sameSnapshot(chainBefore, chainAfter)) {
      integrity(label + ' changed while being authenticated')
    }
    if (createHash('sha256').update(bytes).digest('hex') !== expected) {
      integrity(label + ' differs from the immutable corpus lock')
    }
    return Object.freeze({ bytes, file })
  } finally {
    if (handle !== null) closeSync(handle)
  }
}

function writePrivateSnapshotEntry(root, entry) {
  const target = corpusEntryPath(root, entry.file, 'snapshot entry ' + entry.file)
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  chmodSync(dirname(target), 0o700)
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
  let handle = null
  try {
    handle = openSync(
      target,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow,
      0o500,
    )
    let offset = 0
    while (offset < entry.bytes.length) {
      const count = writeSync(handle, entry.bytes, offset, entry.bytes.length - offset, offset)
      if (count <= 0) integrity('snapshot entry could not be written:' + entry.file)
      offset += count
    }
    fchmodSync(handle, 0o500)
    fsyncSync(handle)
  } finally {
    if (handle !== null) closeSync(handle)
  }
  const info = lstatSync(target, { bigint: true })
  if (
    info.isSymbolicLink()
    || !info.isFile()
    || info.nlink !== 1n
    || info.size !== BigInt(entry.bytes.length)
    || (info.mode & 0o077n) !== 0n
    || realpathSync(target) !== target
  ) integrity('snapshot entry is unsafe:' + entry.file)
}

function sealPrivateSnapshotDirectories(root, current = root) {
  for (const name of readdirSync(current)) {
    const child = resolve(current, name)
    const info = lstatSync(child, { bigint: true })
    if (info.isDirectory() && !info.isSymbolicLink()) {
      sealPrivateSnapshotDirectories(root, child)
    }
  }
  chmodSync(current, 0o500)
}

function verifyPrivateSnapshot(snapshot) {
  const expected = new Map(snapshot.entries.map((entry) => [entry.file, entry]))
  const actual = new Set()
  const walk = (current, relativePath = '') => {
    let info
    try {
      info = lstatSync(current, { bigint: true })
    } catch (error) {
      integrity('authenticated snapshot cannot be inspected:'
        + (relativePath || '.') + ':' + (error?.code || error.message))
    }
    if (info.isSymbolicLink()) {
      integrity('authenticated snapshot crosses a symbolic link:' + (relativePath || '.'))
    }
    if (info.isDirectory()) {
      if ((info.mode & 0o777n) !== 0o500n || realpathSync(current) !== current) {
        integrity('authenticated snapshot directory is not sealed:' + (relativePath || '.'))
      }
      for (const name of readdirSync(current).sort(compareUtf8Bytes)) {
        walk(resolve(current, name), relativePath ? relativePath + '/' + name : name)
      }
      return
    }
    if (!info.isFile() || info.nlink !== 1n || (info.mode & 0o777n) !== 0o500n) {
      integrity('authenticated snapshot entry is unsafe:' + relativePath)
    }
    const entry = expected.get(relativePath)
    if (!entry || info.size !== BigInt(entry.bytes.length) || realpathSync(current) !== current) {
      integrity('authenticated snapshot inventory differs from its lock:' + relativePath)
    }
    if (!readFileSync(current).equals(entry.bytes)) {
      integrity('authenticated snapshot entry changed after materialization:' + relativePath)
    }
    actual.add(relativePath)
  }
  walk(snapshot.root)
  if (actual.size !== expected.size || [...expected.keys()].some((file) => !actual.has(file))) {
    integrity('authenticated snapshot path set differs from its lock')
  }
}

function createAuthenticatedCorpusSnapshot(forkRoot, lock) {
  const expectedDigests = lockEntries(lock)
  if (expectedDigests.size > MAX_CORPUS_SNAPSHOT_ENTRIES) {
    integrity('fork corpus lock exceeds ' + MAX_CORPUS_SNAPSHOT_ENTRIES + ' entries')
  }
  const authenticated = []
  let total = 0
  for (const [file, expected] of expectedDigests) {
    const entry = authenticatedCorpusEntry(forkRoot, file, expected)
    total += entry.bytes.length
    if (total > MAX_CORPUS_SNAPSHOT_BYTES) {
      integrity('fork corpus snapshot exceeds ' + MAX_CORPUS_SNAPSHOT_BYTES + ' bytes')
    }
    authenticated.push(entry)
  }

  let snapshotRoot = ''
  try {
    snapshotRoot = realpathSync(mkdtempSync(resolve(tmpdir(), 'qijenchen-managed-corpus-')))
    chmodSync(snapshotRoot, 0o700)
    const rootInfo = lstatSync(snapshotRoot, { bigint: true })
    if (
      rootInfo.isSymbolicLink()
      || !rootInfo.isDirectory()
      || (rootInfo.mode & 0o077n) !== 0n
      || realpathSync(snapshotRoot) !== snapshotRoot
    ) integrity('private managed corpus snapshot root is unsafe')
    corpusSnapshotRoots.add(snapshotRoot)
    for (const entry of authenticated) writePrivateSnapshotEntry(snapshotRoot, entry)
    sealPrivateSnapshotDirectories(snapshotRoot)
    const snapshot = Object.freeze({
      root: snapshotRoot,
      entries: Object.freeze([...authenticated]),
    })
    verifyPrivateSnapshot(snapshot)
    return snapshot
  } catch (error) {
    if (snapshotRoot) {
      corpusSnapshotRoots.delete(snapshotRoot)
      try {
        makePrivateTreeRemovable(snapshotRoot)
        rmSync(snapshotRoot, { recursive: true, force: true })
      } catch {}
    }
    throw error
  }
}

function snapshotHookPath(snapshotFork, descriptor) {
  const absolute = corpusEntryPath(snapshotFork, descriptor.file, 'managed hook ' + descriptor.file)
  const pathInfo = lstatSync(absolute, { bigint: true })
  if (!pathInfo.isFile() || pathInfo.nlink !== 1n || pathInfo.size > BigInt(MAX_HOOK_BYTES)) {
    integrity('authenticated hook snapshot is unsafe:' + descriptor.file)
  }
  return absolute
}

function strictChildText(value, label) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.alloc(0)
  try {
    return STRICT_UTF8.decode(bytes)
  } catch {
    integrity(label + ' is not strict UTF-8')
  }
}

function serializeInvocation(payload, label) {
  let serialized
  try {
    serialized = JSON.stringify(payload)
  } catch (error) {
    integrity(label + ' is not JSON serializable:' + error.message)
  }
  if (serialized === undefined) integrity(label + ' is not JSON serializable')
  const bytes = Buffer.from(serialized + '\n')
  if (bytes.length > MAX_INPUT_BYTES) integrity(label + ' exceeds the bounded stdin contract')
  return bytes
}

function appendBoundedChildOutput(chunks, channel, state, chunk, descriptor, child) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  channel.bytes += bytes.length
  aggregateChildOutputBytes += bytes.length
  if (channel.bytes > MAX_CHILD_OUTPUT_BYTES) {
    state.failure ||= descriptor.file + ' ' + channel.name + ' exceeds ' + MAX_CHILD_OUTPUT_BYTES + ' bytes'
  }
  if (!Number.isSafeInteger(aggregateChildOutputBytes)
    || aggregateChildOutputBytes > MAX_AGGREGATE_CHILD_OUTPUT_BYTES) {
    state.failure ||= 'aggregate child output exceeds ' + MAX_AGGREGATE_CHILD_OUTPUT_BYTES + ' bytes'
  }
  if (state.failure) {
    state.termination ||= terminateChildTrees([child])
    return
  }
  chunks.push(bytes)
}

async function runHook({ descriptor, executionPath, runtime, payload, environment }) {
  const remaining = remainingBatchMs('before-child:' + descriptor.file)
  const timeoutMs = Math.min(CHILD_TIMEOUT_MS, remaining)
  const batchDeadlineOwnsTimeout = remaining <= CHILD_TIMEOUT_MS
  let child
  try {
    child = spawn(runtime, [executionPath], {
      cwd: environment.GOVERNANCE_PROJECT_DIR,
      env: environment,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    integrity('hook child launch threw:' + descriptor.file + ':' + error.message)
  }
  activeChildren.add(child)
  const stdout = []
  const stderr = []
  const state = {
    failure: '',
    launchError: null,
    termination: null,
    timedOut: false,
    stdout: { bytes: 0, name: 'stdout' },
    stderr: { bytes: 0, name: 'stderr' },
  }
  child.stdout.on('data', (chunk) =>
    appendBoundedChildOutput(stdout, state.stdout, state, chunk, descriptor, child))
  child.stderr.on('data', (chunk) =>
    appendBoundedChildOutput(stderr, state.stderr, state, chunk, descriptor, child))
  child.once('error', (error) => { state.launchError = error })
  child.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') {
      state.failure ||= descriptor.file + ' stdin failed:' + (error.code || error.message)
      state.termination ||= terminateChildTrees([child])
    }
  })
  const completion = new Promise((accept) => {
    child.once('close', (status, signal) => accept({ status, signal }))
  })
  const timer = setTimeout(() => {
    state.timedOut = true
    state.termination ||= terminateChildTrees([child])
  }, timeoutMs)
  try {
    child.stdin.end(serializeInvocation(payload, descriptor.file + ' invocation'))
  } catch (error) {
    state.failure ||= descriptor.file + ' stdin failed:' + (error.code || error.message)
    state.termination ||= terminateChildTrees([child])
  }
  let result
  try {
    result = await completion
  } finally {
    clearTimeout(timer)
    if (state.termination) await state.termination
    signalChildTree(child, 'SIGKILL')
    activeChildren.delete(child)
  }
  if (state.launchError) {
    integrity('hook child execution failed:' + descriptor.file + ':' + (state.launchError.code || 'UNKNOWN'))
  }
  if (state.timedOut) {
    if (batchDeadlineOwnsTimeout) {
      integrity('managed hook batch exceeded ' + batchRuntimeLimitMs + 'ms:during-child:' + descriptor.file)
    }
    integrity('hook child timed out after ' + CHILD_TIMEOUT_MS + 'ms:' + descriptor.file)
  }
  if (state.failure) integrity(state.failure)
  if (result.status === null || result.signal) {
    integrity('hook child terminated without an exit record:' + descriptor.file + ':' + (result.signal || 'unknown'))
  }
  remainingBatchMs('after-child:' + descriptor.file)
  return {
    status: result.status,
    stdout: strictChildText(Buffer.concat(stdout, state.stdout.bytes), descriptor.file + ' stdout'),
    stderr: strictChildText(Buffer.concat(stderr, state.stderr.bytes), descriptor.file + ' stderr'),
  }
}

function invocationForFile({ normalized, changedFile, projectRoot, writeState = null }) {
  const {
    governance_shared_content: sharedContent = '',
    governance_materialized_write_states: _materializedStates,
    changed_files: _changedFiles,
    ...base
  } = normalized
  if (!changedFile) return base
  if (!changedFile || typeof changedFile !== 'object' || Array.isArray(changedFile)) {
    integrity('normalizer returned an invalid changed-file record')
  }
  const absolutePath = resolve(projectRoot, changedFile.path)
  if (!contained(projectRoot, absolutePath)) {
    integrity('normalizer changed-file path escaped project root:' + changedFile.path)
  }
  const content = changedFile.content || changedFile.new_string || changedFile.text || sharedContent
  const materializedFile = {
    file_path: absolutePath,
    path: absolutePath,
    ...(typeof content === 'string' && content.length
      ? { content, new_string: content }
      : {}),
  }
  const invocation = {
    ...base,
    tool_input: {
      ...(base.tool_input || {}),
      ...materializedFile,
      edits: [materializedFile],
      changed_paths: [absolutePath],
    },
    changed_paths: [absolutePath],
  }
  if (writeState) {
    invocation.governance_write_state = writeState
    invocation.tool_input.governance_write_state = writeState
  }
  return invocation
}

async function main() {
  if (realpathSync(ROOT) !== ROOT) integrity('managed bundle root crosses a symbolic-link alias')
  chainSnapshot(ROOT, INSTALLED_FORK, 'managed fork corpus')
  const event = argument('--event')
  const shellRuntime = argument('--shell')
  const pythonRuntime = argument('--python')
  if (!EVENTS.has(event)) integrity('managed event is invalid:' + (event || '<missing>'))
  if (!isAbsolute(shellRuntime) || !isAbsolute(pythonRuntime)) {
    integrity('managed runtime path is not absolute')
  }

  const installedLock = readJson(resolve(INSTALLED_FORK, 'governance.lock'), 'fork corpus lock')
  const snapshot = createAuthenticatedCorpusSnapshot(INSTALLED_FORK, installedLock)
  const snapshotFork = snapshot.root
  verifyPrivateSnapshot(snapshot)
  const manifest = readJson(resolve(snapshotFork, 'manifest.json'), 'authenticated fork manifest', snapshotFork)
  const adapter = object(manifest.providerAdapters?.codex, 'Codex adapter')
  const hooks = object(manifest.hooks, 'fork hook contracts')

  let normalizationRuntime
  let outputTransport
  try {
    normalizationRuntime = await import(pathToFileURL(
      resolve(snapshotFork, 'launchers/normalize-provider-event.mjs'),
    ).href)
    outputTransport = await import(pathToFileURL(
      resolve(snapshotFork, 'launchers/provider-hook-output-transport.mjs'),
    ).href)
  } catch (error) {
    integrity('managed dispatcher runtime import failed:' + error.message)
  }
  const { normalizeProviderEventPayload } = normalizationRuntime
  const {
    formatProviderHookContext,
    formatProviderStopDecision,
    interpretProviderHookChildResult,
    providerHookOutputContract,
    sanitizeProviderHookEnvironment,
  } = outputTransport
  if (
    typeof normalizeProviderEventPayload !== 'function'
    || typeof formatProviderHookContext !== 'function'
    || typeof formatProviderStopDecision !== 'function'
    || typeof interpretProviderHookChildResult !== 'function'
    || typeof sanitizeProviderHookEnvironment !== 'function'
    || typeof providerHookOutputContract?.executablePath !== 'string'
  ) integrity('managed dispatcher runtime exports are incomplete')

  const raw = await readBoundedInput()
  let input
  try {
    input = JSON.parse(raw || '{}')
  } catch (error) {
    integrity('provider payload is invalid JSON:' + error.message)
  }
  object(input, 'provider payload')

  const projectRoot = realpathSync(process.cwd())
  const normalized = normalizeProviderEventPayload({
    input: { ...input, hook_event_name: event, event },
    adapter,
    providerId: 'codex',
    projectRoot,
    hookContracts: hooks,
    dispatchLimits: {
      maxChangedFileCount: MAX_CHANGED_FILE_COUNT,
      maxDescriptorCount: MAX_DESCRIPTOR_COUNT,
      maxInvocationCount: MAX_INVOCATION_COUNT,
      maxProposedAfterImageBytes: MAX_PROPOSED_AFTER_IMAGE_BYTES,
    },
  })
  object(normalized, 'normalized provider payload')
  normalized.transcript_path = ''
  const tool = normalized.tool
  const eventDescriptors = hooks[event] ?? []
  if (!Array.isArray(eventDescriptors)) integrity('fork hook event contract must be an array:' + event)
  const descriptors = eventDescriptors
    .map((descriptor, index) => canonicalDescriptor(descriptor, index, event))
    .filter((descriptor) => descriptorMatchesTool(descriptor, tool))
  if (descriptors.length > MAX_DESCRIPTOR_COUNT) {
    integrity('descriptor count exceeds ' + MAX_DESCRIPTOR_COUNT)
  }
  if (!descriptors.length) return
  if (descriptors.some((descriptor) => descriptor.transcriptRequirement === 'stable-required')) {
    integrity('verified transcript contract is unavailable for managed Codex hooks:' + event)
  }

  const transportRegistry = {
    providers: Object.entries(manifest.providerAdapters || {}).map(([id, providerAdapter]) => ({
      id,
      adapter: providerAdapter,
    })),
  }
  let baseEnvironment
  try {
    baseEnvironment = sanitizeProviderHookEnvironment({
      environment: process.env,
      registry: transportRegistry,
    })
  } catch (error) {
    integrity('payload environment sanitization failed:' + error.message)
  }
  // Managed native feedback is deliberately telemetry-off. Keep the inert fallback independent
  // of the Git metadata shape so linked worktrees and submodules do not fail when .git is a file.
  const runtimeRoot = resolve(projectRoot, '.managed-governance-runtime-disabled')
  chainSnapshot(projectRoot, runtimeRoot, 'managed governance runtime root', { allowMissing: true })
  Object.assign(baseEnvironment, {
    PATH: providerHookOutputContract.executablePath,
    GOVERNANCE_PROVIDER: 'codex',
    GOVERNANCE_SELF_PROVIDER: 'codex',
    GOVERNANCE_PROJECT_DIR: projectRoot,
    GOVERNANCE_CORPUS_ROOT: snapshotFork,
    GOVERNANCE_PROVIDER_ADAPTER_JSON: JSON.stringify(adapter),
    GOVERNANCE_RUNTIME_ROOT: runtimeRoot,
    GOVERNANCE_STATE_DIR: runtimeRoot,
    GOVERNANCE_TELEMETRY_OPT_IN: '0',
    GOVERNANCE_TRANSCRIPT_PATH: '',
    GOVERNANCE_TRANSCRIPT_TRUST: 'unavailable',
    GOVERNANCE_WRITE_STATE_TRUST: 'unavailable',
  })

  const changedFiles = normalized.operation === 'write' && normalized.changed_files.length
    ? normalized.changed_files
    : [null]
  if (!Array.isArray(changedFiles)) integrity('normalizer omitted the changed-file collection')
  if (normalized.changed_files.length > MAX_CHANGED_FILE_COUNT) {
    integrity('changed-file count exceeds ' + MAX_CHANGED_FILE_COUNT)
  }
  const invocationCount = descriptors.length * changedFiles.length
  if (!Number.isSafeInteger(invocationCount) || invocationCount > MAX_INVOCATION_COUNT) {
    integrity('invocation count exceeds ' + MAX_INVOCATION_COUNT)
  }
  const proposedStates = new Map()
  let proposedAfterImageBytes = 0
  for (const state of normalized.governance_materialized_write_states || []) {
    if (!state || typeof state !== 'object' || typeof state.path !== 'string' || proposedStates.has(state.path)) {
      integrity('normalizer returned invalid or duplicate proposed write states')
    }
    if (typeof state.content === 'string') {
      proposedAfterImageBytes += Buffer.byteLength(state.content, 'utf8')
    }
    if (!Number.isSafeInteger(proposedAfterImageBytes)
      || proposedAfterImageBytes > MAX_PROPOSED_AFTER_IMAGE_BYTES) {
      integrity('proposed after-image bytes exceed ' + MAX_PROPOSED_AFTER_IMAGE_BYTES)
    }
    proposedStates.set(state.path, state)
  }
  const contexts = []
  let stopReason = ''
  const runtimes = { bash: shellRuntime, python3: pythonRuntime }

  dispatch:
  for (const descriptor of descriptors) {
    const descriptorContexts = []
    for (const changedFile of changedFiles) {
      const writeState = descriptor.inputContract === 'proposed-text-v1'
        ? proposedStates.get(changedFile?.path)
        : null
      if (descriptor.inputContract === 'proposed-text-v1' && !writeState) {
        integrity('trusted proposed state is unavailable:' + descriptor.file + ':' + (changedFile?.path || '<missing>'))
      }
      const payload = invocationForFile({
        normalized,
        changedFile,
        projectRoot,
        writeState,
      })
      const environment = {
        ...baseEnvironment,
        GOVERNANCE_WRITE_STATE_TRUST: writeState ? 'runner-v1' : 'unavailable',
      }
      verifyPrivateSnapshot(snapshot)
      const result = await runHook({
        descriptor,
        executionPath: snapshotHookPath(snapshotFork, descriptor),
        runtime: runtimes[descriptor.runtime],
        payload,
        environment,
      })
      verifyPrivateSnapshot(snapshot)

      if (descriptor.outputMode === 'diagnostic') {
        if (result.status !== 0) {
          integrity('diagnostic hook returned nonzero:' + descriptor.file + ':exit-' + result.status, {
            childStderr: result.stderr,
          })
        }
        if (result.stdout.length) {
          integrity('diagnostic hook wrote forbidden raw stdout:' + descriptor.file)
        }
        if (result.stderr.includes(CHILD_INTEGRITY_MARKER)) {
          integrity('diagnostic hook emitted the reserved integrity marker:' + descriptor.file, {
            childStderr: result.stderr,
          })
        }
        if (result.stderr.length) {
          writeBoundedOutput(process.stderr, result.stderr, 'diagnostic:' + descriptor.file)
        }
        continue
      }

      if (result.status === 70) {
        integrity('hook reported integrity exit 70:' + descriptor.file, {
          childStderr: result.stderr,
        })
      }
      let interpreted
      try {
        interpreted = interpretProviderHookChildResult({
          status: result.status,
          outputMode: descriptor.outputMode,
          event,
          stdout: result.stdout,
          stderr: result.stderr,
        })
      } catch (error) {
        integrity(descriptor.file + ':' + (error?.code || 'PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE'), {
          childStderr: result.stderr,
        })
      }
      if (interpreted.kind === 'policy-block') {
        writeBoundedOutput(process.stderr, interpreted.reason + '\n', 'policy:' + descriptor.file)
        return 2
      } else if (interpreted.kind === 'governance-context') {
        descriptorContexts.push(interpreted.message)
      } else if (interpreted.kind === 'governance-decision') {
        stopReason = interpreted.reason
        break dispatch
      } else if (interpreted.kind !== 'clean') {
        integrity('unknown interpreted child result:' + descriptor.file + ':' + interpreted.kind)
      }
    }
    if (descriptorContexts.length) {
      contexts.push([...new Set(descriptorContexts)].join('\n\n'))
    }
  }

  if (stopReason) {
    const formatted = formatProviderStopDecision({
      transport: adapter.stopDecisionTransport,
      reason: stopReason,
    })
    if (formatted) writeBoundedOutput(process.stdout, JSON.stringify(formatted) + '\n', 'stop-decision')
    else if (adapter.stopDecisionTransport === 'blocking-exit') {
      writeBoundedOutput(process.stderr, stopReason + '\n', 'stop-decision')
      return 2
    } else integrity('stop decision transport is unavailable:codex')
    return 0
  }
  if (contexts.length) {
    const message = [...new Set(contexts)].join('\n\n')
    const formatted = formatProviderHookContext({
      transport: adapter.contextOutputTransport,
      event,
      message,
    })
    if (formatted) writeBoundedOutput(process.stdout, JSON.stringify(formatted) + '\n', 'governance-context')
    else if (adapter.contextOutputTransport === 'stderr') {
      writeBoundedOutput(process.stderr, message + '\n', 'governance-context')
    }
    else integrity('context transport is unavailable:codex')
  }
  return 0
}

let exitCode = 0
batchDeadlineTimer = setTimeout(() => { void shutdownForDeadline() }, remainingBatchMs('startup'))
batchDeadlineTimer.unref?.()
try {
  exitCode = await main()
} catch (error) {
  await terminateChildTrees(activeChildren)
  if (error?.childStderr) process.stderr.write(error.childStderr)
  process.stderr.write('GOVERNANCE_INTEGRITY:' + (error?.code || 'MANAGED_CODEX_DISPATCH_FAILED') + ':' + error.message + '\n')
  exitCode = 70
} finally {
  if (batchDeadlineTimer) clearTimeout(batchDeadlineTimer)
  cleanupCorpusSnapshots()
}
process.exitCode = exitCode
`
  return source
    .replaceAll('__MAX_INPUT_BYTES__', String(maxInputBytes))
    .replaceAll('__MAX_CHILD_OUTPUT_BYTES__', String(maxChildOutputBytes))
    .replaceAll('__CHILD_TIMEOUT_MS__', String(childTimeoutMs))
}

export function buildExpectedCodexBundle({ contract, repoRoot, release = null, candidateSourceFiles = null }) {
  const sourceFiles = candidateSourceFiles
    ? normalizedCandidateSourceFiles(candidateSourceFiles)
    : loadCandidateReleaseSourceFiles({ repoRoot, release, paths: contract.canonicalInputs })
  const canonicalSourceFiles = candidateSourceInventory(sourceFiles, contract.canonicalInputs)
  const canonicalInputsSha256 = inventoryDigest(canonicalSourceFiles)
  const payloadFiles = candidateSourceInventory(sourceFiles, contract.canonicalInputs, { outputPrefix: contract.bundleLayout.payloadPrefix })
  const dispatcher = buildCodexManagedDispatcher()
  const dispatcherSha256 = sha256(dispatcher)
  const files = [{ path: contract.entrypoint.relativePath, sha256: dispatcherSha256 }, ...payloadFiles]
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
  return { dispatcher, dispatcherSha256, canonicalInputsSha256, files, bundleSha256: inventoryDigest(files) }
}

export function resolveManagedHostRelease(desired, rings) {
  const missing = reason => ({ status: 'missing', tag: null, sourceCommit: null, sourceTree: null, candidateDigest: null, packageVersion: null, packageIntegrity: null, reason })
  const invalid = reason => ({ status: 'invalid', tag: null, sourceCommit: null, sourceTree: null, candidateDigest: null, packageVersion: null, packageIntegrity: null, reason })
  const candidate = pointerGet(rings, desired.releaseBinding.candidatePointer, 'managed-host candidate release')
  if (candidate === null) return missing('candidateRelease is null; immutable provider policy cannot be materialized')
  try {
    validateCandidateRelease(candidate)
    invariant(candidate.id === `${desired.releaseBinding.sourceRepository}@${desired.releaseBinding.tagPrefix}${candidate.version}`, 'candidate release repository/tag binding mismatch')
    const pkg = candidate.packages.find(item => item.name === desired.releaseBinding.packageName)
    invariant(pkg, `candidate release is missing ${desired.releaseBinding.packageName}`)
    exactKeys(pkg, desired.releaseBinding.packageFields, 'candidate managed-host package binding')
    return {
      status: 'ready', tag: `${desired.releaseBinding.tagPrefix}${candidate.version}`,
      sourceCommit: candidate[desired.releaseBinding.sourceCommitField], sourceTree: candidate[desired.releaseBinding.sourceTreeField],
      candidateDigest: sha256(stableStringify(candidate, 0)), packageVersion: pkg.version, packageIntegrity: pkg.integrity,
      reason: 'validated candidate release, exact tag, source commit/tree, BOM, and package SRI are available',
    }
  } catch (error) {
    return invalid(error.message)
  }
}

function validateTrustKeys(trust) {
  const ids = new Set()
  const keys = new Set()
  for (const record of trust.trustedEndpointKeys) {
    exactKeys(record, ['keyId', 'publicKeySPKI', 'endpointIds'], 'managed-host endpoint trust key')
    invariant(!ids.has(record.keyId), `duplicate managed-host endpoint key id:${record.keyId}`)
    const der = Buffer.from(record.publicKeySPKI, 'base64')
    invariant(der.length > 0 && der.toString('base64') === record.publicKeySPKI, `managed-host endpoint public key is not canonical base64:${record.keyId}`)
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' })
    invariant(key.asymmetricKeyType === 'ed25519', `managed-host endpoint key is not Ed25519:${record.keyId}`)
    const canonical = key.export({ format: 'der', type: 'spki' }).toString('base64')
    invariant(!keys.has(canonical), `managed-host endpoint public key is aliased by more than one key id:${record.keyId}`)
    invariant(Array.isArray(record.endpointIds) && record.endpointIds.length > 0 && new Set(record.endpointIds).size === record.endpointIds.length, `managed-host endpoint key has invalid endpoint ids:${record.keyId}`)
    ids.add(record.keyId)
    keys.add(canonical)
  }
}

export function validateManagedHostAssuranceModel({ desired, compatibility, contract, repoRoot }) {
  invariant(desired?.schemaVersion === 2 && desired.id === 'qijenchen-managed-host-assurance', 'managed-host desired model kind/version mismatch')
  invariant(desired.scope?.portableRepoBaseline?.managedHostEquivalent === false && desired.scope?.portableRepoBaseline?.securityBoundary === false, 'portable repo baseline must not claim managed-host enforcement')
  invariant(desired.scope?.managedHostExclusive?.assurance === 'endpoint-admin-enforced-covered-controls' && desired.scope?.managedHostExclusive?.coveredControlBoundary === 'only-enforcementControls-listed-per-provider', 'managed-host exclusivity claim is too broad')
  invariant(desired.scope.managedHostExclusive.localFileAloneIsProof === false && desired.scope.managedHostExclusive.unknownStateFailsClosed === true && desired.scope.managedHostExclusive.certificationRequiresSignedEndpointAttestation === true, 'managed-host evidence boundary is open')
  invariant(
    stableStringify(desired.scope.managedHostExclusive.applicableRepositoryRoles, 0) === stableStringify(['authority'], 0)
      && desired.scope.managedHostExclusive.repositoryIdentity === desired.releaseBinding.sourceRepository
      && desired.scope.managedHostExclusive.endpointAssignment === 'authority-only-no-mixed-role'
      && desired.scope.managedHostExclusive.claudeTransportProfileId === 'claude-authority-full',
    'managed-host assignment must be authority-only, repository-bound, and transport-profile-bound',
  )
  invariant(desired.readbackTrust?.algorithm === 'ed25519' && desired.readbackTrust?.canonicalization === 'stable-json-v1' && desired.readbackTrust?.replayCacheRequiredForCertification === true && desired.readbackTrust?.hostIdentityRequired === true, 'managed-host readback trust is incomplete')
  validateTrustKeys(desired.readbackTrust)
  invariant(desired.activationProtocol?.firstLaunchBootstrapRequired === true && desired.activationProtocol?.freshProcessRequired === true && desired.activationProtocol?.readbackAfterBootstrapRequired === true, 'managed-host first-launch activation protocol is incomplete')

  const desiredIds = desired.providers.map(item => item.id)
  invariant(new Set(desiredIds).size === desiredIds.length, 'managed-host provider ids must be unique')
  const excluded = desired.providerRegistryBinding.outOfScopeProviders.map(item => item.id)
  invariant(new Set(excluded).size === excluded.length && !excluded.some(id => desiredIds.includes(id)), 'managed-host out-of-scope provider declarations are invalid')
  const registryIds = Object.keys(pointerGet(compatibility, desired.providerRegistryBinding.providersPointer, 'compatibility provider registry')).sort(compareUtf8Bytes)
  invariant(stableStringify([...desiredIds, ...excluded].sort(compareUtf8Bytes), 0) === stableStringify(registryIds, 0), `managed-host provider registry is not exhaustive; onboard or explicitly exclude every provider:${registryIds.join(',')}`)
  invariant(desired.providerRegistryBinding.unregisteredProviderOutcome === 'fail', 'future managed-host provider onboarding must fail closed')

  for (const provider of desired.providers) {
    const expectedAdapter = provider.id === 'claude-code' ? 'claude-managed-settings-v2' : provider.id === 'codex' ? 'codex-requirements-v2' : null
    invariant(expectedAdapter && provider.adapter === expectedAdapter, `managed-host provider adapter is unknown:${provider.id}:${provider.adapter}`)
    invariant(pointerGet(compatibility, provider.compatibilityMinimumVersionPointer, `${provider.id} compatibility minimum`) === compatibility.providers[provider.id].minimumVersion, `${provider.id} compatibility pointer does not bind its registry entry`)
    invariant(provider.effectiveState.localFileDiscoveryIsAuthoritative === false && provider.effectiveState.requireWinningSourceIdentity === true && provider.effectiveState.unobservableControlOutcome === 'unknown', `${provider.id} effective readback policy is unsafe`)
    invariant(stableStringify(Object.keys(provider.effectiveState.sourceCapabilities).sort(compareUtf8Bytes), 0) === stableStringify([...provider.effectiveState.acceptedReadbackSources].sort(compareUtf8Bytes), 0), `${provider.id} readback source capabilities are not exhaustive`)
    for (const controls of Object.values(provider.effectiveState.sourceCapabilities)) {
      invariant(Array.isArray(controls) && new Set(controls).size === controls.length && (!controls.includes('*') || controls.length === 1), `${provider.id} readback source capability list is invalid`)
      invariant(controls.every(control => control === '*' || provider.enforcementControls.includes(control)), `${provider.id} readback source claims an unknown control`)
    }
    invariant(provider.equivalentHookDelivery.externalActivationRequired === true, `${provider.id} equivalent hook delivery may not be inferred from repository state`)
    for (const path of Object.values(provider.policyTemplates)) safeRepoPath(repoRoot, path, `${provider.id} policy template`)
  }
  const claude = desired.providers.find(item => item.id === 'claude-code')
  const codex = desired.providers.find(item => item.id === 'codex')
  invariant(claude?.artifactContract === null && claude.equivalentHookDelivery.mode === 'force-enabled-release-tagged-plugin-with-installed-inventory', 'Claude managed hook delivery must bind release tag, resolved commit, and installed inventory')
  invariant(claude.enforcementControls.includes('strict-bash-sandbox'), 'Claude managed-host assurance omits the fail-closed Bash sandbox control')
  invariant(codex?.artifactContract && codex.equivalentHookDelivery.mode === 'deterministic-absolute-managed-bundle', 'Codex managed hook delivery must use a deterministic absolute bundle contract')
  invariant(contract?.schemaVersion === 2 && contract.id === 'qijenchen-codex-managed-hook-bundle', 'Codex managed hook bundle contract kind/version mismatch')
  invariant(contract.delivery.repositoryMayInstall === false && contract.delivery.requirementsTomlDistributesBundle === false && contract.verification.localFilesystemAloneIsProof === false, 'Codex bundle contract overclaims repository or requirements delivery')
  invariant(
    contract.entrypoint.protocol === 'qijenchen-codex-managed-dispatcher-v2'
      && contract.entrypoint.policyBlockingExitCode === 2
      && contract.entrypoint.integrityExitCode === 70
      && contract.entrypoint.mustMatchDeterministicBytes === true
      && contract.verification.requireExactDeterministicInventory === true
      && contract.verification.requireExactCanonicalInputsDigest === true,
    'Codex deterministic bundle execution/verification contract is incomplete',
  )
  invariant(stableStringify(contract.runtime.requiredExecutables, 0) === stableStringify(['node', 'shell', 'python'], 0), 'Codex managed bundle runtime set is incomplete')
  exactKeys(contract.installRoots, ['darwin', 'linux', 'win32'], 'Codex managed bundle install roots')
  for (const platform of PLATFORMS) {
    const rootTemplate = contract.installRoots[platform]
    invariant(typeof rootTemplate === 'string' && rootTemplate.includes('__DS_RELEASE_SOURCE_COMMIT__'), `Codex managed bundle install root is not release-bound:${platform}`)
    validLogicalAbsolute(materializeTokens(rootTemplate, { '__DS_RELEASE_SOURCE_COMMIT__': 'a'.repeat(40) }), platform, `Codex managed bundle install root:${platform}`)
    const templateBytes = readFileSync(safeRepoPath(repoRoot, codex.policyTemplates[platform], `Codex ${platform} policy template`), 'utf8')
    invariant(templateBytes.includes(rootTemplate), `Codex ${platform} policy template is not bound to the bundle contract install root`)
    assertCodexManagedEngineeringDelegationPolicy(templateBytes, {
      label: `Codex ${platform} policy template`,
    })
  }
  return true
}

function runtimePaths(runtime, platform) {
  invariant(runtime && typeof runtime === 'object' && !Array.isArray(runtime), 'Codex managed runtime readback is required')
  exactKeys(runtime, ['node', 'shell', 'python'], 'Codex managed runtime readback')
  return Object.fromEntries(Object.entries(runtime).map(([name, record]) => {
    exactKeys(record, ['executablePath', 'executableSha256'], `Codex ${name} runtime readback`)
    validLogicalAbsolute(record.executablePath, platform, `Codex ${name} runtime path`)
    invariant(SHA256.test(record.executableSha256 || ''), `Codex ${name} runtime digest is invalid`)
    return [name, record.executablePath]
  }))
}

export function materializeManagedHostPolicy({ provider, release, compatibility, repoRoot, platform, runtime = null }) {
  invariant(release.status === 'ready', `cannot materialize managed-host policy:${release.reason}`)
  invariant(PLATFORMS.has(platform), `unsupported managed-host platform:${platform}`)
  const templatePath = safeRepoPath(repoRoot, provider.policyTemplates[platform], `${provider.id} policy template`)
  const minimumVersion = pointerGet(compatibility, provider.compatibilityMinimumVersionPointer, `${provider.id} minimum version`)
  const paths = provider.id === 'codex' ? runtimePaths(runtime, platform) : { node: '', shell: '', python: '' }
  const tokens = {
    '__CLAUDE_MINIMUM_VERSION__': minimumVersion,
    '__DS_RELEASE_SOURCE_COMMIT__': release.sourceCommit,
    '__DS_RELEASE_TAG__': release.tag,
    '__CODEX_NODE_RUNTIME__': paths.node,
    '__CODEX_SHELL_RUNTIME__': paths.shell,
    '__CODEX_PYTHON_RUNTIME__': paths.python,
  }
  if (provider.adapter === 'claude-managed-settings-v2') {
    const policy = materializeTokens(JSON.parse(readFileSync(templatePath, 'utf8')), tokens)
    invariant(policy.permissionPolicy === CLAUDE_PERMISSION_POLICY_SOURCE, 'Claude managed-host template is not bound to the canonical permission-policy SSOT')
    delete policy.permissionPolicy
    const permissionPolicy = readClaudePermissionPolicy({ sourceRoot: repoRoot })
    const governance = materializeClaudeGovernanceSettings({
      permissions: policy.permissions,
      sandbox: policy.sandbox,
    }, permissionPolicy, {
      label: 'Claude managed-host governance profile',
      managedSettings: true,
    })
    policy.permissions = governance.permissions
    policy.sandbox = governance.sandbox
    policy.disableAutoMode = permissionPolicy.disableAutoMode
    assertClaudePermissionMaterialization(policy, permissionPolicy, {
      label: 'Claude managed-host materialized settings',
      managedSettings: true,
    })
    return { format: 'canonical-json', value: policy, bytes: `${stableStringify(policy, 2)}\n`, sha256: sha256(stableStringify(policy, 0)) }
  }
  if (provider.adapter === 'codex-requirements-v2') {
    const bytes = materializeTokens(readFileSync(templatePath, 'utf8'), tokens).replaceAll('\r\n', '\n')
    assertCodexManagedEngineeringDelegationPolicy(bytes, {
      label: `Codex ${platform} materialized policy`,
    })
    return { format: 'exact-toml', value: bytes, bytes, sha256: sha256(bytes) }
  }
  throw new Error(`unknown managed-host provider adapter:${provider.adapter}`)
}

export function buildExpectedManagedHostControls({
  provider,
  release,
  compatibility,
  contract,
  platform,
  runtime = null,
  repoRoot = null,
}) {
  const minimumVersion = pointerGet(compatibility, provider.compatibilityMinimumVersionPointer, `${provider.id} minimum version`)
  if (provider.id === 'claude-code') {
    invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'Claude expected controls require repoRoot')
    const permissionPolicy = readClaudePermissionPolicy({ sourceRoot: repoRoot })
    return {
      'required-minimum-version': minimumVersion,
      'authority-endpoint-assignment': {
        repositoryRole: 'authority',
        repositoryIdentity: 'ajenchen/design-system',
        mixedRoleUseAllowed: false,
        providerTransportProfile: 'claude-authority-full',
      },
      'allow-managed-hooks-only': true,
      'force-enabled-exact-plugin': { 'design-system@qijenchen-ds': true },
      'strict-plugin-only-customization': true,
      'strict-known-marketplace-exact-tag': [{ source: 'github', repo: 'ajenchen/design-system', ref: release.tag }],
      'managed-marketplace-first-launch-bootstrap': { 'qijenchen-ds': { source: { source: 'github', repo: 'ajenchen/design-system', ref: release.tag } } },
      'disable-sideload-flags': true,
      'managed-mcp-only-empty-allowlist': { allowManagedMcpServersOnly: true, allowedMcpServers: [] },
      'managed-permission-rules-only': true,
      'disable-bypass-permissions': 'disable',
      'strict-bash-sandbox': materializeClaudeSandbox({
        network: { allowManagedDomainsOnly: true },
      }, permissionPolicy, {
        label: 'Claude managed-host expected sandbox',
        managedSettings: true,
      }),
      'force-remote-settings-refresh': true,
    }
  }
  const paths = runtimePaths(runtime, platform)
  invariant(contract?.id === 'qijenchen-codex-managed-hook-bundle', 'Codex managed hook bundle contract is required for expected controls')
  const logicalRoot = materializeTokens(contract.installRoots[platform], { '__DS_RELEASE_SOURCE_COMMIT__': release.sourceCommit })
  return {
    'authority-endpoint-assignment': {
      repositoryRole: 'authority',
      repositoryIdentity: 'ajenchen/design-system',
      mixedRoleUseAllowed: false,
      providerTransportProfile: null,
    },
    'allow-managed-hooks-only': true,
    'hooks-feature-pinned-on': true,
    'absolute-managed-hook-bundle': { logicalRoot, events: ['PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'Stop'] },
    'absolute-pinned-runtime': runtime,
    'permission-profile-allowlist': { default: ':workspace', allowed: { ':read-only': true, ':workspace': true } },
    'approval-policy-allowlist': [...CODEX_GOVERNED_APPROVAL_POLICIES],
    'empty-mcp-allowlist': {},
    'plugin-feature-pinned-off': false,
    'remote-plugin-feature-pinned-off': false,
    'marketplace-add-install-refresh-exact-tag': { source: 'git', url: 'https://github.com/ajenchen/design-system.git', ref: release.tag },
  }
}

function canonicalInputsForProvider({ desired, compatibility, rings, contract, provider, policy, controls }) {
  const inputs = {
    desiredSha256: sha256(stableStringify(desired, 0)),
    compatibilitySha256: sha256(stableStringify(compatibility, 0)),
    releaseRingsSha256: sha256(stableStringify(rings, 0)),
    artifactContractSha256: sha256(stableStringify(contract, 0)),
    materializedPolicySha256: policy.sha256,
    expectedControlsSha256: sha256(stableStringify(controls, 0)),
  }
  return { ...inputs, canonicalInputsSha256: sha256(stableStringify(inputs, 0)) }
}

function nonceBytes(value, minimum) {
  invariant(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value), 'managed-host readback nonce is invalid')
  const bytes = Buffer.from(value, 'base64url')
  invariant(bytes.length >= minimum && bytes.toString('base64url') === value, 'managed-host readback nonce is non-canonical or too short')
  invariant(bytes.length <= 64, 'managed-host readback nonce is too long')
  return bytes
}

function validateHostIdentity(actual, expected, platform) {
  exactKeys(actual, ['hostId', 'endpointId', 'platform', 'deviceIdentitySha256'], 'managed-host readback host identity')
  invariant(expected, 'expected host identity is required before an effective readback can be trusted')
  exactKeys(expected, ['hostId', 'endpointId', 'platform', 'deviceIdentitySha256'], 'expected managed-host identity')
  invariant(actual.platform === platform && expected.platform === platform, 'managed-host readback platform mismatch')
  invariant(SHA256.test(actual.deviceIdentitySha256 || '') && stableStringify(actual, 0) === stableStringify(expected, 0), 'managed-host readback host identity mismatch')
}

function validateReadbackEnvelope({ envelope, provider, desired, platform, expectedHostIdentity, now, replayProtection }) {
  exactKeys(envelope, ENVELOPE_KEYS, `${provider.id} effective readback envelope`)
  invariant(envelope.$schema === 'infra/governance/schemas/managed-host-effective-readback.schema.json' && envelope.schemaVersion === 2 && envelope.kind === 'managed-host-effective-readback-envelope', `${provider.id} effective readback envelope kind/version mismatch`)
  exactKeys(envelope.payload, PAYLOAD_KEYS, `${provider.id} effective readback payload`)
  const payload = envelope.payload
  invariant(payload.schemaVersion === 2 && payload.kind === 'managed-host-effective-readback-payload' && payload.provider === provider.id, `${provider.id} effective readback payload identity mismatch`)
  validateHostIdentity(payload.hostIdentity, expectedHostIdentity, platform)
  invariant(provider.effectiveState.acceptedReadbackSources.includes(payload.source), `${provider.id} readback source is not accepted:${payload.source}`)
  invariant(typeof payload.sourceIdentity === 'string' && payload.sourceIdentity.length > 0, `${provider.id} winning source identity is missing`)
  exactKeys(payload.collector, ['kind', 'instanceId'], `${provider.id} readback collector`)
  invariant(payload.collector && ['endpoint-management', 'provider-effective-api'].includes(payload.collector.kind) && typeof payload.collector.instanceId === 'string' && payload.collector.instanceId.length > 0, `${provider.id} readback collector identity is invalid`)
  invariant(payload.filesystemTrust === null || (payload.filesystemTrust && typeof payload.filesystemTrust === 'object' && !Array.isArray(payload.filesystemTrust)), `${provider.id} filesystem trust evidence is invalid`)

  const issuedAt = new Date(payload.issuedAt)
  const expiresAt = new Date(payload.expiresAt)
  invariant(Number.isFinite(issuedAt.getTime()) && Number.isFinite(expiresAt.getTime()), `${provider.id} readback time window is invalid`)
  const skew = desired.readbackTrust.clockSkewSeconds * 1000
  invariant(issuedAt.getTime() <= now.getTime() + skew, `${provider.id} readback is issued in the future`)
  invariant(expiresAt.getTime() > now.getTime() - skew, `${provider.id} readback has expired`)
  invariant(expiresAt.getTime() > issuedAt.getTime() && expiresAt.getTime() - issuedAt.getTime() <= desired.readbackTrust.maxTtlSeconds * 1000, `${provider.id} readback TTL exceeds policy`)
  nonceBytes(payload.nonce, desired.readbackTrust.nonceMinBytes)

  exactKeys(envelope.attestation, ['algorithm', 'keyId', 'payloadSha256', 'signature'], `${provider.id} readback attestation`)
  invariant(envelope.attestation.algorithm === desired.readbackTrust.algorithm, `${provider.id} readback signature algorithm mismatch`)
  const trustKey = desired.readbackTrust.trustedEndpointKeys.find(item => item.keyId === envelope.attestation.keyId)
  invariant(trustKey, `${provider.id} readback signer is not trusted:${envelope.attestation.keyId}`)
  invariant(trustKey.endpointIds.includes(payload.hostIdentity.endpointId), `${provider.id} readback signer is not authorized for endpoint:${payload.hostIdentity.endpointId}`)
  const bytes = Buffer.from(stableStringify(payload, 0))
  invariant(envelope.attestation.payloadSha256 === sha256(bytes), `${provider.id} readback canonical payload digest mismatch`)
  const signature = Buffer.from(envelope.attestation.signature, 'base64url')
  invariant(signature.length === 64 && signature.toString('base64url') === envelope.attestation.signature, `${provider.id} readback signature is invalid`)
  const publicKey = createPublicKey({ key: Buffer.from(trustKey.publicKeySPKI, 'base64'), format: 'der', type: 'spki' })
  invariant(verifySignature(null, bytes, publicKey, signature), `${provider.id} readback signature verification failed`)

  if (!replayProtection) return { payload, replay: 'unchecked', attestationKeyId: envelope.attestation.keyId }
  invariant(replayProtection.durability === 'persistent-atomic' && typeof replayProtection.consume === 'function', 'managed-host replay protection is not persistent and atomic')
  const replayKey = `${payload.hostIdentity.endpointId}:${payload.hostIdentity.hostId}:${payload.nonce}`
  invariant(replayProtection.consume({ key: replayKey, expiresAt: payload.expiresAt }) === true, `${provider.id} readback nonce was replayed`)
  return { payload, replay: 'verified', attestationKeyId: envelope.attestation.keyId }
}

function verifyRuntimeExecutables({ runtime, platform, hostRoot }) {
  runtimePaths(runtime, platform)
  for (const [name, record] of Object.entries(runtime)) {
    const physical = mapHostPath(hostRoot, record.executablePath, platform, `Codex ${name} runtime`)
    assertNoSymlinkComponents(hostRoot, physical, `Codex ${name} runtime`)
    const info = lstatSync(physical)
    invariant(info.isFile() && !info.isSymbolicLink(), `Codex ${name} runtime is not a regular file`)
    if (platform !== 'win32') invariant((info.mode & 0o111) !== 0, `Codex ${name} runtime is not executable`)
    invariant(sha256(readFileSync(physical)) === record.executableSha256, `Codex ${name} runtime digest mismatch`)
  }
}

export function verifyInstalledCodexHookBundle({ contract, release, readback, hostRoot, platform, repoRoot, candidateSourceFiles }) {
  const expectedLogicalRoot = materializeTokens(contract.installRoots[platform], { '__DS_RELEASE_SOURCE_COMMIT__': release.sourceCommit })
  validLogicalAbsolute(expectedLogicalRoot, platform, 'Codex managed hook bundle root')
  const hook = readback.hookDelivery
  exactKeys(hook, ['mode', 'logicalRoot', 'sourceCommit', 'sourceTree', 'packageVersion', 'packageIntegrity', 'contractSha256', 'canonicalInputsSha256', 'dispatcherSha256', 'bundleSha256'], 'Codex hook delivery readback')
  invariant(hook.mode === 'deterministic-absolute-managed-bundle' && hook.logicalRoot === expectedLogicalRoot, 'Codex managed hook bundle root mismatch')
  invariant(hook.sourceCommit === release.sourceCommit && hook.sourceTree === release.sourceTree && hook.packageVersion === release.packageVersion && hook.packageIntegrity === release.packageIntegrity, 'Codex managed hook bundle release binding mismatch')
  const contractDigest = sha256(stableStringify(contract, 0))
  invariant(hook.contractSha256 === contractDigest, 'Codex managed hook contract digest mismatch')
  const expected = buildExpectedCodexBundle({ contract, repoRoot, release, candidateSourceFiles })
  invariant(hook.canonicalInputsSha256 === expected.canonicalInputsSha256 && hook.dispatcherSha256 === expected.dispatcherSha256 && hook.bundleSha256 === expected.bundleSha256, 'Codex managed hook expected bundle digest mismatch')

  const root = mapHostPath(hostRoot, expectedLogicalRoot, platform, 'Codex managed hook bundle')
  assertNoSymlinkComponents(hostRoot, root, 'Codex managed hook bundle')
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'Codex managed hook bundle directory is unsafe')
  const manifestPath = contained(root, resolve(root, contract.installedManifest.relativePath), 'Codex managed hook manifest')
  assertNoSymlinkComponents(root, manifestPath, 'Codex managed hook manifest')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  exactKeys(manifest, contract.installedManifest.requiredFields, 'installed Codex managed hook bundle manifest')
  invariant(manifest.schemaVersion === 2 && manifest.sourceCommit === release.sourceCommit && manifest.sourceTree === release.sourceTree, 'installed Codex managed hook bundle identity mismatch')
  exactKeys(manifest.package, ['name', 'version', 'integrity'], 'installed Codex managed hook bundle package')
  invariant(manifest.package.name === '@qijenchen/design-system' && manifest.package.version === release.packageVersion && manifest.package.integrity === release.packageIntegrity, 'installed Codex managed hook bundle package mismatch')
  invariant(manifest.contractSha256 === contractDigest && manifest.canonicalInputsSha256 === expected.canonicalInputsSha256 && manifest.dispatcherSha256 === expected.dispatcherSha256, 'installed Codex managed hook bundle contract/input/dispatcher mismatch')
  invariant(stableStringify(manifest.files, 0) === stableStringify(expected.files, 0), 'installed Codex managed hook inventory is not the deterministic expected inventory')
  const aggregate = verifyInventoryRoot({ root, files: manifest.files, label: 'installed Codex managed hook bundle', excluded: [contract.installedManifest.relativePath] })
  invariant(aggregate === expected.bundleSha256 && manifest.bundleSha256 === expected.bundleSha256, 'installed Codex managed hook bundle aggregate digest mismatch')
  const dispatcherPath = contained(root, resolve(root, contract.entrypoint.relativePath), 'Codex managed hook dispatcher')
  invariant(readFileSync(dispatcherPath, 'utf8') === expected.dispatcher, 'installed Codex managed hook dispatcher bytes mismatch')
  return { logicalRoot: expectedLogicalRoot, contractDigest, ...expected }
}

function verifyClaudeDelivery({ desired, release, readback, hostRoot, platform, candidateSourceFiles }) {
  const hook = readback.hookDelivery
  exactKeys(hook, ['mode', 'pluginFullId', 'marketplaceName', 'marketplaceRef', 'marketplaceResolvedCommit', 'pluginVersion', 'installedRoot', 'marketplaceManifestSha256', 'pluginManifestSha256', 'canonicalHookCorpusSha256', 'files', 'inventorySha256'], 'Claude hook delivery readback')
  invariant(hook.mode === 'force-enabled-release-tagged-plugin-with-installed-inventory' && hook.pluginFullId === desired.releaseBinding.pluginFullId && hook.marketplaceName === 'qijenchen-ds', 'Claude managed plugin identity mismatch')
  invariant(hook.marketplaceRef === release.tag && hook.marketplaceResolvedCommit === release.sourceCommit && hook.pluginVersion === release.packageVersion, 'Claude marketplace tag, resolved commit, or plugin version mismatch')
  validLogicalAbsolute(hook.installedRoot, platform, 'Claude installed plugin root')

  const marketplaceBytes = candidateFile(candidateSourceFiles, desired.releaseBinding.marketplaceManifest, 'Claude marketplace manifest')
  const pluginBytes = candidateFile(candidateSourceFiles, desired.releaseBinding.pluginManifest, 'Claude plugin manifest')
  const marketplace = JSON.parse(marketplaceBytes.toString('utf8'))
  const plugin = JSON.parse(pluginBytes.toString('utf8'))
  invariant(marketplace.name === 'qijenchen-ds' && marketplace.plugins?.length === 1 && marketplace.plugins[0].name === 'design-system' && marketplace.plugins[0].source === './', 'Claude marketplace does not bind the relative plugin source from the tagged marketplace checkout')
  invariant(plugin.name === 'design-system' && plugin.version === release.packageVersion && marketplace.plugins[0].version === release.packageVersion && marketplace.metadata?.version === release.packageVersion, 'Claude plugin/marketplace version is not bound to the candidate release')

  const root = mapHostPath(hostRoot, hook.installedRoot, platform, 'Claude installed plugin')
  assertNoSymlinkComponents(hostRoot, root, 'Claude installed plugin')
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'Claude installed plugin root is unsafe')
  const aggregate = verifyInventoryRoot({ root, files: hook.files, label: 'Claude installed plugin' })
  invariant(aggregate === hook.inventorySha256, 'Claude installed plugin inventory digest mismatch')
  const installedMarketplace = contained(root, resolve(root, desired.releaseBinding.marketplaceManifest), 'Claude installed marketplace manifest')
  const installedPlugin = contained(root, resolve(root, desired.releaseBinding.pluginManifest), 'Claude installed plugin manifest')
  invariant(hook.marketplaceManifestSha256 === sha256(readFileSync(installedMarketplace)) && hook.marketplaceManifestSha256 === sha256(marketplaceBytes), 'Claude installed marketplace manifest digest mismatch')
  invariant(hook.pluginManifestSha256 === sha256(readFileSync(installedPlugin)) && hook.pluginManifestSha256 === sha256(pluginBytes), 'Claude installed plugin manifest digest mismatch')
  const installedHookPath = contained(root, resolve(root, 'packages/design-system/ds-canonical/hooks'), 'installed Claude hook corpus')
  assertNoSymlinkComponents(root, installedHookPath, 'installed Claude hook corpus')
  const hookViewBytes = candidateFile(candidateSourceFiles, 'hooks/hooks.json', 'Claude plugin hook registration view')
  const installedHookViewPath = contained(root, resolve(root, 'hooks/hooks.json'), 'installed Claude plugin hook registration view')
  const installedHookScriptsPath = contained(root, resolve(root, 'hooks/scripts'), 'installed Claude plugin hook scripts')
  assertNoSymlinkComponents(root, installedHookViewPath, 'installed Claude plugin hook registration view')
  assertNoSymlinkComponents(root, installedHookScriptsPath, 'installed Claude plugin hook scripts')
  invariant(sha256(readFileSync(installedHookViewPath)) === sha256(hookViewBytes), 'Claude installed hook registration view digest mismatch')
  const canonicalDigest = candidatePrefixDigest(candidateSourceFiles, 'packages/design-system/ds-canonical/hooks', 'candidate canonical Claude hook corpus')
  const installedCanonicalDigest = treeDigest(installedHookPath, 'installed Claude hook corpus')
  const scriptDigest = candidatePrefixDigest(candidateSourceFiles, '.claude/hooks', 'candidate Claude plugin hook scripts')
  const installedScriptDigest = treeDigest(installedHookScriptsPath, 'installed Claude plugin hook scripts')
  const runtimeDependencies = buildExpectedClaudePluginRuntime(candidateSourceFiles)
  for (const expected of runtimeDependencies.roots) {
    const installedRoot = contained(root, resolve(root, expected.path), `installed Claude plugin runtime root ${expected.path}`)
    assertNoSymlinkComponents(root, installedRoot, `installed Claude plugin runtime root ${expected.path}`)
    invariant(treeDigest(installedRoot, `installed Claude plugin runtime root ${expected.path}`) === expected.sha256, `Claude installed plugin runtime root digest mismatch:${expected.path}`)
  }
  for (const expected of runtimeDependencies.files) {
    const installedFile = contained(root, resolve(root, expected.path), `installed Claude plugin runtime file ${expected.path}`)
    assertNoSymlinkComponents(root, installedFile, `installed Claude plugin runtime file ${expected.path}`)
    const info = lstatSync(installedFile)
    invariant(info.isFile() && !info.isSymbolicLink() && sha256(readFileSync(installedFile)) === expected.sha256, `Claude installed plugin runtime file mismatch:${expected.path}`)
  }
  for (const expected of runtimeDependencies.entrypoints) {
    const installedEntrypoint = contained(root, resolve(root, expected.path), `installed Claude plugin runtime dependency ${expected.path}`)
    assertNoSymlinkComponents(root, installedEntrypoint, `installed Claude plugin runtime dependency ${expected.path}`)
    const info = lstatSync(installedEntrypoint)
    invariant(info.isFile() && !info.isSymbolicLink() && sha256(readFileSync(installedEntrypoint)) === expected.sha256, `Claude installed plugin runtime dependency mismatch:${expected.path}`)
  }
  const expectedHookDigest = sha256(stableStringify({ canonicalDigest, hookViewSha256: sha256(hookViewBytes), scriptDigest, runtimeDependencySha256: runtimeDependencies.runtimeDependencySha256 }, 0))
  invariant(installedCanonicalDigest === canonicalDigest && installedScriptDigest === scriptDigest && hook.canonicalHookCorpusSha256 === expectedHookDigest, 'Claude installed canonical/plugin hook corpus digest mismatch')
}

function evaluateControlReadbacks({ provider, payload, expectedControls }) {
  invariant(Array.isArray(payload.controlReadbacks), `${provider.id} control readbacks are missing`)
  const expectedIds = [...provider.enforcementControls].sort(compareUtf8Bytes)
  const actualIds = payload.controlReadbacks.map(item => item.controlId).sort(compareUtf8Bytes)
  invariant(stableStringify(actualIds, 0) === stableStringify(expectedIds, 0), `${provider.id} control readback inventory is incomplete or duplicated`)
  const capabilities = provider.effectiveState.sourceCapabilities[payload.source]
  invariant(Array.isArray(capabilities), `${provider.id} readback source capabilities are missing`)
  const observed = []
  const unknown = []
  for (const record of payload.controlReadbacks) {
    exactKeys(record, ['controlId', 'status', 'source', 'value', 'reason'], `${provider.id} control readback`)
    invariant(record.source === payload.source, `${provider.id} control readback source mismatch:${record.controlId}`)
    if (record.status === 'unknown') {
      invariant(record.value === null && typeof record.reason === 'string' && record.reason.length > 0, `${provider.id} unknown control lacks a reason:${record.controlId}`)
      unknown.push(record.controlId)
      continue
    }
    invariant(record.status === 'observed' && record.reason === null, `${provider.id} control status is invalid:${record.controlId}`)
    invariant(capabilities.includes('*') || capabilities.includes(record.controlId), `${provider.id} source ${payload.source} cannot observe control:${record.controlId}`)
    invariant(stableStringify(record.value, 0) === stableStringify(expectedControls[record.controlId], 0), `${provider.id} effective control mismatch:${record.controlId}`)
    observed.push(record.controlId)
  }
  return { observed: observed.sort(compareUtf8Bytes), unknown: unknown.sort(compareUtf8Bytes) }
}

function discoverLocalPolicy(provider, platform, hostRoot) {
  const logicalPath = provider.systemPaths[platform]
  let physicalPath
  try {
    physicalPath = mapHostPath(hostRoot, logicalPath, platform, `${provider.id} local managed policy`)
  } catch {
    return { logicalPath, discovered: false, safety: 'unsafe' }
  }
  if (!existsSync(physicalPath)) {
    try {
      assertNoSymlinkComponents(hostRoot, physicalPath, `${provider.id} local managed policy`, { allowMissing: true })
      return { logicalPath, discovered: false, safety: 'missing' }
    } catch {
      return { logicalPath, discovered: false, safety: 'unsafe' }
    }
  }
  try {
    assertNoSymlinkComponents(hostRoot, physicalPath, `${provider.id} local managed policy`)
    const info = lstatSync(physicalPath)
    return { logicalPath, discovered: info.isFile() && !info.isSymbolicLink(), safety: info.isFile() && !info.isSymbolicLink() ? 'safe-regular-file' : 'unsafe' }
  } catch {
    return { logicalPath, discovered: false, safety: 'unsafe' }
  }
}

export function verifyManagedHostAssurance({
  repoRoot,
  platform = process.platform,
  hostRoot = '/',
  effectiveReadbacks = {},
  expectedHostIdentity = null,
  replayProtection = null,
  generatedAt = new Date(),
  models = {},
} = {}) {
  invariant(typeof repoRoot === 'string' && repoRoot.length > 0, 'managed-host verifier requires repoRoot')
  invariant(PLATFORMS.has(platform), `unsupported managed-host platform:${platform}`)
  invariant(generatedAt instanceof Date && Number.isFinite(generatedAt.getTime()), 'managed-host generatedAt is invalid')
  assertNoSymlinkComponents(resolve(hostRoot), resolve(hostRoot), 'managed-host root')
  const desired = models.desired ?? readJson(resolve(repoRoot, 'infra/governance/providers/managed-host-assurance.json'))
  const compatibility = models.compatibility ?? readJson(resolve(repoRoot, desired.providerRegistryBinding.path))
  const rings = models.rings ?? readJson(resolve(repoRoot, desired.releaseBinding.path))
  const codexProvider = desired.providers.find(item => item.id === 'codex')
  const contract = models.contract ?? readJson(resolve(repoRoot, codexProvider.artifactContract))
  validateManagedHostAssuranceModel({ desired, compatibility, contract, repoRoot })
  const release = resolveManagedHostRelease(desired, rings)
  const candidatePaths = [
    ...contract.canonicalInputs,
    ...CLAUDE_PLUGIN_RUNTIME_ROOTS,
    ...CLAUDE_PLUGIN_RUNTIME_FILES,
    desired.releaseBinding.marketplaceManifest,
    desired.releaseBinding.pluginManifest,
    'hooks/hooks.json',
    '.claude/hooks',
  ]
  const suppliedReadbacks = Object.keys(effectiveReadbacks).length > 0
  const candidateSourceFiles = release.status === 'ready' && suppliedReadbacks
    ? (models.candidateSourceFiles
        ? normalizedCandidateSourceFiles(models.candidateSourceFiles)
        : loadCandidateReleaseSourceFiles({ repoRoot, release, paths: candidatePaths }))
    : null
  const results = []

  for (const provider of desired.providers) {
    const local = discoverLocalPolicy(provider, platform, hostRoot)
    const minimumVersion = pointerGet(compatibility, provider.compatibilityMinimumVersionPointer, `${provider.id} minimum version`)
    const envelope = effectiveReadbacks[provider.id]
    const result = {
      id: provider.id,
      status: 'unknown',
      minimumVersion,
      systemPolicyPath: local.logicalPath,
      localPolicyDiscovered: local.discovered,
      localPolicyPathSafety: local.safety,
      effectiveReadback: local.discovered ? 'untrusted-local-only' : 'missing',
      attestation: 'missing',
      policy: 'not-evaluable',
      filesystemTrust: 'not-evaluable',
      hookDelivery: 'not-evaluable',
      observedControls: [],
      unknownControls: [...provider.enforcementControls].sort(compareUtf8Bytes),
      reasons: [],
    }
    if (!envelope) {
      result.reasons.push(local.discovered
        ? 'a local managed file was discovered, but no signed host-bound winning effective state was read back'
        : local.safety === 'unsafe'
          ? 'the local managed policy path is unsafe and no signed host-bound effective state was read back'
          : 'managed policy and signed winning effective state were not observed')
      if (release.status !== 'ready') result.reasons.push(release.reason)
      results.push(result)
      continue
    }

    try {
      const verified = validateReadbackEnvelope({ envelope, provider, desired, platform, expectedHostIdentity, now: generatedAt, replayProtection })
      const payload = verified.payload
      result.attestation = verified.replay === 'verified' ? 'verified' : 'replay-unchecked'
      result.effectiveReadback = verified.replay === 'verified' ? 'verified' : 'verified-replay-unchecked'
      invariant(release.status === 'ready', release.reason)
      invariant(managedHostVersionAtLeast(payload.observedVersion, minimumVersion), `${provider.id} version is below compatibility minimum:${payload.observedVersion}<${minimumVersion}`)
      if (provider.id === 'claude-code') invariant(payload.runtime === null, 'Claude readback must not invent a managed runtime executable proof')
      else runtimePaths(payload.runtime, platform)
      const policy = materializeManagedHostPolicy({ provider, release, compatibility, repoRoot, platform, runtime: payload.runtime })
      const controls = buildExpectedManagedHostControls({
        provider,
        release,
        compatibility,
        contract,
        platform,
        runtime: payload.runtime,
        repoRoot,
      })
      invariant(stableStringify(Object.keys(controls).sort(compareUtf8Bytes), 0) === stableStringify([...provider.enforcementControls].sort(compareUtf8Bytes), 0), `${provider.id} expected control projection is incomplete`)
      const canonicalInputs = canonicalInputsForProvider({ desired, compatibility, rings, contract, provider, policy, controls })
      invariant(stableStringify(payload.canonicalInputs, 0) === stableStringify(canonicalInputs, 0), `${provider.id} readback canonical input digest mismatch`)
      const evaluated = evaluateControlReadbacks({ provider, payload, expectedControls: controls })
      result.observedControls = evaluated.observed
      result.unknownControls = evaluated.unknown
      if (evaluated.unknown.length) {
        result.reasons.push(`effective source leaves controls unobservable:${evaluated.unknown.join(',')}`)
        results.push(result)
        continue
      } else {
        result.policy = 'match'
      }
      if (payload.filesystemTrust === null) {
        result.filesystemTrust = 'missing'
        result.reasons.push('signed endpoint owner/permission/ACL evidence for the managed runtime and hook delivery is unavailable')
        results.push(result)
        continue
      }
      const codexExpected = provider.id === 'codex'
        ? buildExpectedCodexBundle({ contract, repoRoot, release, candidateSourceFiles })
        : null
      const filesystemRequirements = buildManagedFilesystemRequirements({
        provider,
        platform,
        runtime: payload.runtime,
        hookDelivery: payload.hookDelivery,
        codexExpectedFiles: codexExpected?.files,
      })
      const finishFilesystemVerification = beginManagedFilesystemTrustVerification({
        payload,
        attestationKeyId: verified.attestationKeyId,
        requirements: filesystemRequirements,
        platform,
        hostRoot,
        testOnlyFilesystemProbe: models.testOnlyFilesystemProbe ?? null,
      })
      if (provider.id === 'claude-code') {
        verifyClaudeDelivery({ desired, release, readback: payload, hostRoot, platform, candidateSourceFiles })
      } else {
        verifyRuntimeExecutables({ runtime: payload.runtime, platform, hostRoot })
        verifyInstalledCodexHookBundle({ contract, release, readback: payload, hostRoot, platform, repoRoot, candidateSourceFiles })
      }
      finishFilesystemVerification()
      result.filesystemTrust = 'verified'
      result.hookDelivery = 'match'
      result.status = 'pass'
      result.reasons.push(verified.replay === 'verified'
        ? 'signed host-bound effective controls, endpoint-admin filesystem trust, and equivalent hook delivery match; nonce was atomically consumed'
        : 'signed host-bound effective controls, endpoint-admin filesystem trust, and equivalent hook delivery match, but persistent replay consumption was not supplied')
    } catch (error) {
      result.effectiveReadback = 'invalid'
      result.attestation = 'invalid'
      if (/effective control mismatch|canonical input digest mismatch/.test(error.message)) result.policy = 'mismatch'
      if (/filesystem|owned|writable|ACL/.test(error.message)) result.filesystemTrust = 'mismatch'
      if (result.policy === 'match' || /hook|plugin|bundle|runtime|filesystem|owned|writable|ACL/.test(error.message)) result.hookDelivery = 'mismatch'
      result.status = 'fail'
      result.reasons.push(error.message)
    }
    results.push(result)
  }

  const anyFail = results.some(item => item.status === 'fail') || release.status === 'invalid'
  const allPass = release.status === 'ready' && results.every(item => item.status === 'pass')
  const replayVerified = allPass && results.every(item => item.attestation === 'verified')
  const overallStatus = anyFail ? 'fail' : replayVerified ? 'certified' : allPass ? 'aligned-unattested' : 'external-activation-required'
  const certification = overallStatus === 'certified'
    ? { status: 'certified', reason: 'all listed controls, endpoint-admin filesystem boundaries, and hook deliveries are release-bound, independently signed, host-bound, fresh, stable across verification, and replay-consumed' }
    : { status: 'not-certified', reason: overallStatus === 'aligned-unattested' ? 'alignment is signed but a persistent atomic replay consume was not supplied' : 'one or more effective controls, endpoint attestations, release bindings, or hook deliveries remain unknown or invalid' }
  const withoutDigest = {
    schemaVersion: 2,
    kind: 'managed-host-assurance-evidence',
    generatedAt: generatedAt.toISOString(),
    platform,
    expectedHostIdentity,
    modelDigests: {
      desired: sha256(stableStringify(desired, 0)),
      compatibility: sha256(stableStringify(compatibility, 0)),
      releaseRings: sha256(stableStringify(rings, 0)),
      codexHookBundleContract: sha256(stableStringify(contract, 0)),
    },
    scope: {
      portableRepoBaseline: 'declared-not-managed-host-proof',
      managedHostExclusive: 'only-listed-controls-with-effective-readback-and-equivalent-hook-delivery',
    },
    releaseBinding: release,
    providers: results,
    overallStatus,
    certification,
  }
  return { ...withoutDigest, evidenceDigest: sha256(stableStringify(withoutDigest, 0)) }
}
