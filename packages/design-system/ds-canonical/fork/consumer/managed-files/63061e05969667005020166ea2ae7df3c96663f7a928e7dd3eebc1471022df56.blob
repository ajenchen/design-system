#!/usr/bin/env node
// refresh-fork-launchers.mjs — C-prime 接線骨架刷新(sync-all 呼叫 + harness 可測)
//
// 既有 fork 的「接線骨架」(provider configs + governance/bin 的 manifest-declared shared launchers)原本
// 不隨 npm 同步 → DS 改接線層後 user fork 拿不到(2026-06-17 user 抓:完全同步不偏移未達成)。
// 本模組從 npm-current 的 ds-canonical/fork/launchers/ 把骨架 idempotent 刷新進 fork:
//   1. copy manifest-declared launcher set → manifest.consumer.launcherDestination(官方控管,唯一共享副本)
//   2. merge settings-hooks.json 進 .claude/settings.json:
//      - strip 所有 event 裡「引用 canonical launcher set」的舊註冊(去重)
//      - append canonical 啟動器註冊
//      - retire only the exact unsafe allows shipped by older corpus versions
//      - replace policy-owned permissions.ask, retain non-conflicting consumer allow/deny, and enforce safe modes
//      → 不 clobber user 自有「非治理」hook;重跑結果一致(idempotent)
//   4. provider surfaces:manifest-declared instructions + hooks + skills + closed trees 送達 fork root
//      — AGENTS.md 與 provider wiring 是 immutable governance views,固定 clobber；product 規則只放 governance/overlay.md。
// 安全:.github/no-governance-sync opt-out → 整段 skip;launchers 未 ship(舊 npm)→ skip 不報錯。
// §15 契約:deterministic(輸出只依 corpus+dest 內容)/ idempotent(重跑收斂)/ atomic(所有檔案都走
//   same-directory tmp+rename,不沿既有 target inode 覆寫)/ dry-run(opts.dryRun 只算不寫)/ json(CLI --json)。
//
// 抽成獨立模組 = sync-all 呼叫 + test-fork-governance.mjs 直接測(不需真跑 npm install)。

import { closeSync, existsSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join, dirname, resolve, sep, isAbsolute, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareUtf8Bytes,
  portableRepositoryPathKey,
  repositoryPathsOverlap,
  validateAuthenticatedProviderLifecycle,
} from './lib/provider-lifecycle.mjs'
import { assertNoRootNpmShrinkwrap } from './lib/governance-dependency-bootstrap.mjs'

// Consumer upgrades run repository-owned code against attacker-editable working trees. Lexical
// containment alone is insufficient: an in-repo parent symlink can redirect copy/rename/remove to
// a sibling or arbitrary host path. These helpers are the single path-safety SSOT shared with
// sync-all.mjs; every managed source/target is validated before the first mutation.
export function canonicalRepositoryRoot(root) {
  const absolute = resolve(root)
  const info = lstatSync(absolute)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`repository root must be a real directory:${absolute}`)
  return realpathSync(absolute)
}

export function normalizeRepositoryRelative(value, label = 'path', { allowGit = false } = {}) {
  if (typeof value !== 'string' || !value || value.includes('\0') || isAbsolute(value)) throw new Error(`${label} must be a non-empty repository-relative path`)
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
  const parts = normalized.split('/')
  if (!normalized || parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`${label} escapes its repository root:${value}`)
  if (!allowGit && parts[0] === '.git') throw new Error(`${label} may not address .git:${value}`)
  return normalized
}

export function pathEntryExists(path) {
  try { lstatSync(path); return true }
  catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

// Linux permits entries that alias after the case-folding/Unicode normalization used by default
// macOS filesystems. Detect those aliases without following symlinks so a newly claimed provider
// surface cannot create a repository that is uncheckoutable or clobber-prone on another host.
function existingPortablePathCollision(root, repositoryPath) {
  const canonicalRoot = canonicalRepositoryRoot(root)
  const normalized = normalizeRepositoryRelative(repositoryPath, 'portable collision path')
  let cursor = canonicalRoot
  const segments = normalized.split('/')
  for (const [index, segment] of segments.entries()) {
    const cursorInfo = lstatSync(cursor)
    if (!cursorInfo.isDirectory() || cursorInfo.isSymbolicLink()) return cursor
    const matches = readdirSync(cursor)
      .filter((name) => portableRepositoryPathKey(name) === portableRepositoryPathKey(segment))
      .sort()
    if (!matches.length) return null
    const matched = matches[0]
    const child = join(cursor, matched)
    if (matches.length > 1 || matched !== segment || index === segments.length - 1) return child
    const childInfo = lstatSync(child)
    if (!childInfo.isDirectory() || childInfo.isSymbolicLink()) return child
    cursor = child
  }
  return null
}

export function assertNoSymlinkPath(root, target, label = 'path', { allowMissing = true } = {}) {
  const canonicalRoot = canonicalRepositoryRoot(root)
  const absolute = resolve(target)
  const rel = relative(canonicalRoot, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes repository root:${absolute}`)
  let cursor = canonicalRoot
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    if (!pathEntryExists(cursor)) {
      if (allowMissing) return absolute
      throw new Error(`${label} is missing:${cursor}`)
    }
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) throw new Error(`${label} contains symlink component:${cursor}`)
  }
  return absolute
}

export function assertSafeTree(root, target, label = 'tree', { allowMissing = false, allowInternalSymlinks = false } = {}) {
  const absolute = assertNoSymlinkPath(root, target, label, { allowMissing })
  if (!pathEntryExists(absolute)) return absolute
  const visit = (path) => {
    const info = lstatSync(path)
    if (info.isSymbolicLink() && !allowInternalSymlinks) throw new Error(`${label} contains symlink:${path}`)
    if (info.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name))
    else if (info.isFile() && info.nlink !== 1) throw new Error(`${label} contains hard-link alias:${path}`)
    else if (!info.isFile() && !info.isSymbolicLink()) throw new Error(`${label} contains unsupported file type:${path}`)
  }
  visit(absolute)
  return absolute
}

// One same-directory, attempt-unique replacement primitive is the managed-file durability SSOT.
// Keeping it separately testable lets the concurrency test exercise the exact production writer
// without launching two whole provider-tree transactions against the same repository.
export function atomicReplaceRepositoryFile(projectDir, target, content, { mode = 0o600, label = 'atomic repository file' } = {}) {
  projectDir = canonicalRepositoryRoot(projectDir)
  target = resolve(target)
  assertNoSymlinkPath(projectDir, target, label)
  mkdirSync(dirname(target), { recursive: true })
  assertNoSymlinkPath(projectDir, dirname(target), `${label} parent`, { allowMissing: false })
  const tmpPath = `${target}.tmp-${process.pid}-${randomUUID()}`
  assertNoSymlinkPath(projectDir, tmpPath, `${label} temporary path`)
  let descriptor = null
  let parentDescriptor = null
  try {
    descriptor = openSync(tmpPath, 'wx', 0o600)
    writeFileSync(descriptor, content)
    fchmodSync(descriptor, mode & 0o777)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    assertNoSymlinkPath(projectDir, dirname(target), `${label} parent before replace`, { allowMissing: false })
    const temporaryInfo = lstatSync(tmpPath)
    if (!temporaryInfo.isFile() || temporaryInfo.isSymbolicLink() || temporaryInfo.nlink !== 1) {
      throw new Error(`${label} temporary path is not one regular unaliased file:${tmpPath}`)
    }
    renameSync(tmpPath, target)
    parentDescriptor = openSync(dirname(target), 'r')
    fsyncSync(parentDescriptor)
    closeSync(parentDescriptor)
    parentDescriptor = null
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (parentDescriptor !== null) closeSync(parentDescriptor)
    if (pathEntryExists(tmpPath)) rmSync(tmpPath, { force: true })
  }
}

// Required npm commands are part of the immutable consumer BOM, but package.json also contains
// product-owned commands. Merge only the authenticated names so sync-all can add/upgrade governance
// entrypoints without replacing unrelated product scripts or teaching an old updater each new name.
export function mergeRequiredPackageScripts(manifest, requiredScripts) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('consumer package manifest must be an object')
  if (!requiredScripts || typeof requiredScripts !== 'object' || Array.isArray(requiredScripts)) throw new Error('consumer BOM requiredScripts must be an object')
  if (manifest.scripts !== undefined && (!manifest.scripts || typeof manifest.scripts !== 'object' || Array.isArray(manifest.scripts))) {
    throw new Error('consumer package scripts must be an object')
  }
  const entries = Object.entries(requiredScripts)
  const names = entries.map(([name]) => name)
  if (!entries.length || JSON.stringify(names) !== JSON.stringify([...names].sort())) {
    throw new Error('consumer BOM requiredScripts must be nonempty and sorted')
  }
  for (const [name, command] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(name) || typeof command !== 'string' || !command.trim() || /[\0\r\n]/.test(command)) {
      throw new Error(`consumer BOM required script is invalid:${name}`)
    }
  }
  return {
    ...manifest,
    scripts: {
      ...(manifest.scripts || {}),
      ...Object.fromEntries(entries),
    },
  }
}

function safeCopyFile({ sourceRoot, source, targetRoot, target, label, mode = null }) {
  assertNoSymlinkPath(sourceRoot, source, `${label} source`, { allowMissing: false })
  const sourceInfo = lstatSync(source)
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || sourceInfo.nlink !== 1) throw new Error(`${label} source is not one regular unaliased file:${source}`)
  assertNoSymlinkPath(targetRoot, target, `${label} target`)
  atomicReplaceRepositoryFile(targetRoot, target, readFileSync(source), {
    mode: mode === null ? sourceInfo.mode & 0o777 : mode,
    label: `${label} target`,
  })
}

function safeReplaceTree({ sourceRoot, source, targetRoot, target, label }) {
  assertSafeTree(sourceRoot, source, `${label} source`)
  assertNoSymlinkPath(targetRoot, target, `${label} target`)
  if (pathEntryExists(target)) rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  assertNoSymlinkPath(targetRoot, dirname(target), `${label} target parent`, { allowMissing: false })
  cpSync(source, target, { recursive: true })
}

// Claude Code 的 .claude/settings.json 允許 JSONC(// 行註解 / block 註解)→ JSON.parse 會炸。
// string-aware strip 註解後再 parse(fork user 若註解過 settings,skeleton 刷新才不會默默 no-op)。
function parseJsonc(text, label) {
  let out = '', inStr = false, inLine = false, inBlock = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (inLine) { if (c === '\n') { inLine = false; out += c } continue }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++ } continue }
    if (inStr) { out += c; if (c === '\\') out += text[++i] ?? ''; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && n === '/') { inLine = true; i++; continue }
    if (c === '/' && n === '*') { inBlock = true; i++; continue }
    out += c
  }
  try { return JSON.parse(out) } catch (e) { throw new Error(`${label} JSONC strip 後仍非法 JSON:${e.message}`) }
}

const LAUNCHERS = ['fork-governance-dispatcher.sh', 'inject_fork_governance_preamble.sh']
const CLAUDE_PERMISSION_POLICY_SOURCE = 'packages/design-system/ds-canonical/adapters/claude-settings-base.json'
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// path-segment 比對:啟動器必以 `/<name>` 出現且後接邊界(引號/空白/結尾)。
// 避免 loose substring 誤刪「command 只是『含』啟動器名為子字串」的 user hook(adversarial FINDING 2b)。
const refsLauncher = (cmd) => LAUNCHERS.some((l) => new RegExp(`/${escRe(l)}(?=["'\\s]|$)`).test(cmd || ''))
const refsManagedRepositoryPath = (cmd, path) => {
  const variants = [path, `./${path}`, `$CLAUDE_PROJECT_DIR/${path}`, `\${CLAUDE_PROJECT_DIR}/${path}`]
  return variants.some((candidate) => new RegExp(`(?:^|["'\\s])${escRe(candidate)}(?=["'\\s]|$)`).test(cmd || ''))
}

/**
 * Pure materializer for one validated merge-hook-map-into-base-v1 surface. The caller owns file
 * authentication and atomic replacement; this function deliberately selects behavior from the
 * registered materializer/base-template engines, never from a provider id.
 */
export function mergeProviderHookSettings({ settings, canonicalConfig, policy, label = 'provider hook settings' } = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error(`${label} must be an object`)
  if (!canonicalConfig || typeof canonicalConfig !== 'object' || Array.isArray(canonicalConfig)) throw new Error(`${label} canonical config must be an object`)
  if (
    policy?.materializer?.engine !== 'json-hook-map-v1'
    || policy.materializer.mergeStrategy !== 'merge-hook-map-into-base-v1'
    || typeof policy.materializer.hooksField !== 'string'
    || !policy.baseTemplate
  ) throw new Error(`${label} has no supported registered merge materializer`)
  const merged = structuredClone(settings)
  const hooksField = policy.materializer.hooksField
  const priorHooks = merged[hooksField]
  if (priorHooks !== undefined && (!priorHooks || typeof priorHooks !== 'object' || Array.isArray(priorHooks))) {
    throw new Error(`${label} ${hooksField} must be an object`)
  }
  const retiredIds = []
  const canonicalCommands = new Set()
  for (const groups of Object.values(canonicalConfig[hooksField] || {})) for (const group of Array.isArray(groups) ? groups : []) {
    for (const handler of Array.isArray(group?.hooks) ? group.hooks : []) {
      if (typeof handler?.command === 'string' && handler.command) canonicalCommands.add(handler.command)
    }
  }
  const retainedHooks = {}
  for (const groups of Object.values(priorHooks || {})) for (const group of Array.isArray(groups) ? groups : []) {
    for (const handler of Array.isArray(group?.hooks) ? group.hooks : []) {
      const retired = policy.retiredHookRegistrations.find((record) => refsManagedRepositoryPath(handler?.command, record.path))
      if (retired && !retiredIds.includes(retired.id)) retiredIds.push(retired.id)
    }
  }

  for (const [event, groups] of Object.entries(priorHooks || {})) {
    if (!Array.isArray(groups)) throw new Error(`${label} ${hooksField}.${event} must be an array`)
    const retainedGroups = []
    for (const group of groups) {
      if (!group || typeof group !== 'object' || Array.isArray(group) || !Array.isArray(group.hooks)) {
        throw new Error(`${label} ${hooksField}.${event} contains an invalid hook group`)
      }
      const hooks = group.hooks.filter((handler) => {
        const command = handler?.command
        if (typeof command !== 'string') return true
        if (canonicalCommands.has(command) || refsLauncher(command)) return false
        return !policy.retiredHookRegistrations.some((record) => refsManagedRepositoryPath(command, record.path))
      })
      if (hooks.length) retainedGroups.push({ ...structuredClone(group), hooks: structuredClone(hooks) })
    }
    if (retainedGroups.length) retainedHooks[event] = retainedGroups
  }

  // Remove only previously managed/retired registrations, retain consumer-owned hooks, then append
  // the authenticated canonical groups exactly once. This keeps refresh idempotent without turning
  // a provider adapter update into authority over unrelated product automation.
  merged[hooksField] = retainedHooks
  for (const [event, groups] of Object.entries(canonicalConfig[hooksField] || {})) {
    merged[hooksField][event] = [...(merged[hooksField][event] || []), ...structuredClone(groups)]
  }
  for (const [key, value] of Object.entries(canonicalConfig)) {
    if (key === hooksField || key === 'permissions' || key === 'disableAutoMode') continue
    merged[key] = structuredClone(value)
  }
  if (policy.baseTemplate.engine === 'claude-permission-policy-v1') {
    if (merged.permissions !== undefined && (!merged.permissions || typeof merged.permissions !== 'object' || Array.isArray(merged.permissions))) {
      throw new Error(`${label} permissions must be an object`)
    }
    merged.permissions = merged.permissions || {}
    for (const key of ['allow', 'ask', 'deny']) {
      if (merged.permissions[key] !== undefined && !Array.isArray(merged.permissions[key])) throw new Error(`${label} permissions.${key} must be an array`)
      if ((merged.permissions[key] || []).some((rule) => typeof rule !== 'string')) throw new Error(`${label} permissions.${key} must contain only strings`)
    }
    const canonicalPermissions = canonicalConfig.permissions
    if (!canonicalPermissions || typeof canonicalPermissions !== 'object' || Array.isArray(canonicalPermissions)) {
      throw new Error(`${label} canonical permission base is missing`)
    }
    const retiredAllow = new Set(policy.permissionPolicy.retiredPermissionAllow)
    const nextDeny = Array.from(new Set([...(canonicalPermissions.deny || []), ...(merged.permissions.deny || [])]))
    const nextDenySet = new Set(nextDeny)
    // Human-only ask semantics are policy-owned. Retaining arbitrary historical consumer asks would
    // let an old provider config reintroduce engineering approval milestones after the canonical
    // Standing Authorization delegated them. Consumer-specific safety may remain a stricter deny;
    // ask is always the authenticated canonical set.
    const nextAsk = Array.from(new Set(canonicalPermissions.ask || []))
      .filter((rule) => !nextDenySet.has(rule))
    const nextAskSet = new Set(nextAsk)
    merged.permissions.allow = Array.from(new Set([
      ...(merged.permissions.allow || []).filter((rule) => !retiredAllow.has(rule)),
      ...(canonicalPermissions.allow || []),
    ])).filter((rule) => !nextAskSet.has(rule) && !nextDenySet.has(rule))
    merged.permissions.ask = nextAsk
    merged.permissions.deny = nextDeny
    merged.permissions.defaultMode = canonicalPermissions.defaultMode
    merged.permissions.disableBypassPermissionsMode = canonicalPermissions.disableBypassPermissionsMode
    if (Object.hasOwn(canonicalConfig, 'disableAutoMode')) throw new Error(`${label} canonical permission base carries the retired disableAutoMode flag`)
    delete merged.disableAutoMode
    delete merged.permissions.disableAutoMode
    delete merged.defaultMode
  } else if (policy.baseTemplate.engine === 'static-json-object-v1') {
    if (policy.permissionPolicy !== null) throw new Error(`${label} static base template may not claim a permission policy`)
    for (const [key, value] of Object.entries(canonicalConfig)) if (key !== hooksField) merged[key] = structuredClone(value)
  } else {
    throw new Error(`${label} base-template engine is unsupported:${policy.baseTemplate.engine}`)
  }
  return { settings: merged, retiredIds: retiredIds.sort() }
}

export function validateCanonicalSettingsWiring(value, manifest) {
  exactKeys(value, ['_generated', 'kind', 'schemaVersion', 'sourceDigest', 'surfaces'], 'installed provider hook merge policies')
  if (
    value._generated !== 'build-fork-governance.mjs'
    || value.kind !== 'provider-hook-merge-policies'
    || value.schemaVersion !== 1
    || !SHA256.test(value.sourceDigest || '')
    || !value.surfaces
    || typeof value.surfaces !== 'object'
    || Array.isArray(value.surfaces)
  ) throw new Error('installed provider hook merge policy identity is invalid')
  const expectedProviderIds = Object.entries(manifest?.providerSurfaces || {})
    .filter(([, surface]) => surface.generated && surface.hookMaterializerId)
    .filter(([providerId, surface]) => resolveManifestMaterializer(
      manifest,
      'hookViews',
      surface.hookMaterializerId,
      `${providerId}.hookMaterializerId`,
    ).mergeStrategy === 'merge-hook-map-into-base-v1')
    .map(([providerId]) => providerId)
    .sort()
  if (JSON.stringify(Object.keys(value.surfaces).sort()) !== JSON.stringify(expectedProviderIds)) {
    throw new Error('installed provider hook merge policies do not exactly match merge-capable provider surfaces')
  }
  const surfaces = {}
  for (const providerId of expectedProviderIds) {
    const record = value.surfaces[providerId]
    exactKeys(record, [
      'baseTemplateContract', 'hookArtifact', 'hookDestination', 'hookMaterializerId', 'mergeStrategy',
      'permissionPolicy', 'retiredHookRegistrations', 'schemaVersion',
    ], `installed hook merge policy ${providerId}`)
    const surface = manifest.providerSurfaces[providerId]
    const materializer = resolveManifestMaterializer(manifest, 'hookViews', record.hookMaterializerId, `${providerId}.hookMaterializerId`)
    const baseTemplate = resolveManifestMaterializer(manifest, 'hookBaseTemplateContracts', record.baseTemplateContract, `${providerId}.baseTemplateContract`)
    if (
      record.schemaVersion !== 1
      || record.hookArtifact !== surface.hookArtifact
      || record.hookDestination !== surface.hookDestination
      || record.hookMaterializerId !== surface.hookMaterializerId
      || record.mergeStrategy !== 'merge-hook-map-into-base-v1'
      || materializer.mergeStrategy !== record.mergeStrategy
      || materializer.baseTemplateContract !== record.baseTemplateContract
      || materializer.engine !== 'json-hook-map-v1'
    ) throw new Error(`${providerId}:installed hook merge policy differs from its provider materializer`)
    if (!Array.isArray(record.retiredHookRegistrations)) throw new Error(`${providerId}:retired hook registration inventory is invalid`)
    const retirements = record.retiredHookRegistrations.map((retirement, index) => {
      exactKeys(retirement, ['id', 'path', 'provider', 'reasonCode'], `${providerId} retired hook registration[${index}]`)
      const path = normalizeRepositoryRelative(retirement.path, `${providerId} retired hook registration[${index}].path`)
      if (
        retirement.provider !== providerId
        || !/^[a-z][a-z0-9-]*$/.test(retirement.id || '')
        || !/^[A-Z][A-Z0-9_]*$/.test(retirement.reasonCode || '')
      ) throw new Error(`${providerId}:retired hook registration[${index}] is invalid`)
      return { ...retirement, path }
    })
    if (
      JSON.stringify(retirements.map((item) => item.id)) !== JSON.stringify(retirements.map((item) => item.id).sort())
      || new Set(retirements.map((item) => portableRepositoryPathKey(item.path))).size !== retirements.length
    ) throw new Error(`${providerId}:retired hook registrations must be sorted by id and unique by path`)
    if (baseTemplate.engine === 'claude-permission-policy-v1') {
      exactKeys(record.permissionPolicy, ['retiredPermissionAllow', 'sha256', 'source'], `${providerId} permission policy`)
      if (
        record.permissionPolicy.source !== baseTemplate.source
        || !SHA256.test(record.permissionPolicy.sha256 || '')
        || !Array.isArray(record.permissionPolicy.retiredPermissionAllow)
        || record.permissionPolicy.retiredPermissionAllow.length === 0
        || record.permissionPolicy.retiredPermissionAllow.some((rule) => typeof rule !== 'string' || !/^Bash\(.+\)$/.test(rule))
      ) throw new Error(`${providerId}:permission policy binding is invalid`)
    } else if (record.permissionPolicy !== null) throw new Error(`${providerId}:non-permission base template may not claim a permission policy`)
    surfaces[providerId] = { ...record, retiredHookRegistrations: retirements, materializer, baseTemplate }
  }
  return { ...value, surfaces }
}

const safeRelative = (root, value) => {
  try {
    const normalized = normalizeRepositoryRelative(value)
    return resolve(root, normalized).startsWith(resolve(root) + sep)
  } catch { return false }
}

const SHA256 = /^[a-f0-9]{64}$/
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z.-]+)?$/
const stableVersionAtLeast = (value, minimum) => {
  const parse = version => typeof version === 'string'
    ? version.match(/^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/)?.slice(1, 4).map(Number)
    : null
  const observed = parse(value)
  const required = parse(minimum)
  if (!observed || !required) return false
  for (let index = 0; index < 3; index += 1) {
    if (observed[index] !== required[index]) return observed[index] > required[index]
  }
  return true
}
const DISCOVERY_KEYS = Object.freeze([
  'providerRootNames', 'instructionNames', 'instructionOverrideNames', 'configPaths', 'pluginRootNames',
])
const DISCOVERY_PATTERNS = Object.freeze({
  providerRootNames: /^\.(?!git(?:hub)?$)[A-Za-z0-9][A-Za-z0-9_-]*$/,
  instructionNames: /^[A-Za-z0-9][A-Za-z0-9_.@-]*\.md$/,
  instructionOverrideNames: /^[A-Za-z0-9][A-Za-z0-9_.@-]*\.md$/,
  configPaths: /^\.(?:[A-Za-z0-9][A-Za-z0-9_.@-]*|[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9_.@/-]+)$/,
  pluginRootNames: /^\.(?!git(?:hub)?$)[A-Za-z0-9][A-Za-z0-9_-]*$/,
})
const PROTECTED_PRODUCT_DOCUMENTS = new Set(['CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'LICENSE.md', 'README.md', 'SECURITY.md'].map((path) => portableRepositoryPathKey(path)))
const sha256 = (content) => createHash('sha256').update(content).digest('hex')
const fileSha256 = (path) => sha256(readFileSync(path))
const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} has an open or incomplete shape`)
  return value
}
// Structural/tamper mirror only. Canonical selection and certification semantics remain owned by
// packages/governance/src/provider-review-binding.mjs after the shipped corpus is authenticated.
const stableProjectionValue = (value) => {
  if (Array.isArray(value)) return value.map(stableProjectionValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort(compareUtf8Bytes).map((key) => [key, stableProjectionValue(value[key])]),
    )
  }
  return value
}
const validateReviewInvocation = (value, label) => {
  if (value?.strategy === 'main-context') {
    exactKeys(value, ['strategy'], label)
    return value
  }
  exactKeys(value, ['agent', 'context', 'strategy'], label)
  if (
    value.strategy !== 'native-context-fork'
    || value.context !== 'fork'
    || !/^[a-z][a-z0-9-]*$/.test(value.agent || '')
  ) throw new Error(`${label} is invalid`)
  return value
}
const validateIndependentReviewProjection = (value) => {
  exactKeys(value, [
    'bindings', 'certificationContract', 'certifications', 'kind', 'projectionDigest',
    'providerCompatibility', 'repositoryRole', 'schemaVersion', 'skill',
  ], 'installed independent-review projection')
  if (
    value.schemaVersion !== 2
    || value.kind !== 'provider-neutral-independent-review-projection'
    || value.skill !== 'independent-review'
    || value.repositoryRole !== 'product-consumer'
    || value.certificationContract !== 'exact-provider-runtime-surface-role-target-v1'
    || !SHA256.test(value.projectionDigest || '')
    || !Array.isArray(value.bindings)
    || value.bindings.length === 0
    || !Array.isArray(value.providerCompatibility)
    || value.providerCompatibility.length === 0
    || !Array.isArray(value.certifications)
  ) throw new Error('installed independent-review projection is invalid')
  const bindingIds = []
  for (const [index, binding] of value.bindings.entries()) {
    exactKeys(binding, [
      'bindingDigest', 'certificationContract', 'invocation', 'requiredAssuranceTier',
      'requiredComputeTier', 'requiredReasoningTier', 'reviewClass', 'selectionPolicy',
      'selfProviderId', 'transport',
    ], `installed independent-review binding[${index}]`)
    if (
      !/^[a-z][a-z0-9-]*$/.test(binding.selfProviderId || '')
      || !/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(binding.selectionPolicy || '')
      || binding.reviewClass !== 'tier-0-governance'
      || binding.requiredAssuranceTier !== 'maximum'
      || binding.requiredReasoningTier !== 'maximum'
      || binding.requiredComputeTier !== 'maximum'
      || binding.transport !== 'content-addressed-model-broker-exchange-v1'
      || binding.certificationContract !== 'exact-provider-runtime-surface-role-target-v1'
      || !SHA256.test(binding.bindingDigest || '')
    ) throw new Error(`installed independent-review binding[${index}] is invalid`)
    validateReviewInvocation(binding.invocation, `installed independent-review binding[${index}].invocation`)
    bindingIds.push(binding.selfProviderId)
  }
  const compatibilityProviderIds = []
  const compatibilityRuntimeIds = []
  for (const [index, compatibility] of value.providerCompatibility.entries()) {
    exactKeys(compatibility, ['compatibilityProviderId', 'providerId'], `installed independent-review provider compatibility[${index}]`)
    if (
      !/^[a-z][a-z0-9-]*$/.test(compatibility.providerId || '')
      || !/^[a-z][a-z0-9-]*$/.test(compatibility.compatibilityProviderId || '')
    ) throw new Error(`installed independent-review provider compatibility[${index}] is invalid`)
    compatibilityProviderIds.push(compatibility.providerId)
    compatibilityRuntimeIds.push(compatibility.compatibilityProviderId)
  }
  if (
    JSON.stringify(bindingIds) !== JSON.stringify([...new Set(bindingIds)].sort(compareUtf8Bytes))
    || JSON.stringify(compatibilityProviderIds) !== JSON.stringify([...new Set(compatibilityProviderIds)].sort(compareUtf8Bytes))
    || new Set(compatibilityRuntimeIds).size !== compatibilityRuntimeIds.length
    || bindingIds.some((providerId) => !compatibilityProviderIds.includes(providerId))
  ) throw new Error('installed independent-review provider compatibility is incomplete or ambiguous')
  const expectedDigest = sha256(JSON.stringify(stableProjectionValue({
    skill: value.skill,
    repositoryRole: value.repositoryRole,
    bindings: value.bindings,
    providerCompatibility: value.providerCompatibility,
    certifications: value.certifications,
  })))
  if (value.projectionDigest !== expectedDigest) throw new Error('installed independent-review projection digest is invalid')
  return value
}
const regularUnaliasedFile = (root, path, label) => {
  assertNoSymlinkPath(root, path, label, { allowMissing: false })
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`${label} must be one regular unaliased file`)
  return path
}
const validateSurface = (surface, label) => {
  exactKeys(surface, ['kind', 'path'], label)
  if (!['file', 'tree'].includes(surface.kind)) throw new Error(`${label}.kind is invalid`)
  const normalized = normalizeRepositoryRelative(surface.path, `${label}.path`)
  const portable = portableRepositoryPathKey(normalized)
  if (['.git', '.github'].includes(portable.split('/')[0])) throw new Error(`${label}.path addresses a protected Git root`)
  if (PROTECTED_PRODUCT_DOCUMENTS.has(portable)) throw new Error(`${label}.path addresses a protected product document`)
  return { path: normalized, kind: surface.kind }
}
const validateRetiredSurface = (surface, label) => {
  exactKeys(surface, ['kind', 'path', 'sha256'], label)
  if (!SHA256.test(surface.sha256 || '')) throw new Error(`${label}.sha256 is invalid`)
  return { ...validateSurface({ path: surface.path, kind: surface.kind }, label), sha256: surface.sha256 }
}
export function providerSurfaceDigest(projectDir, surface) {
  projectDir = canonicalRepositoryRoot(projectDir)
  const normalized = validateSurface({ path: surface.path, kind: surface.kind }, 'provider digest surface')
  const target = join(projectDir, normalized.path)
  assertNoSymlinkPath(projectDir, target, `provider digest target ${normalized.path}`, { allowMissing: false })
  const info = lstatSync(target)
  if (normalized.kind === 'file') {
    if (!info.isFile() || info.nlink !== 1) throw new Error(`provider digest file is not regular and unaliased:${normalized.path}`)
    return fileSha256(target)
  }
  if (!info.isDirectory()) throw new Error(`provider digest tree is not a directory:${normalized.path}`)
  const rows = []
  const visit = (absolute) => {
    const entry = lstatSync(absolute)
    const rel = relative(target, absolute).split(sep).join('/') || '.'
    const mode = (entry.mode & 0o777).toString(8).padStart(4, '0')
    if (entry.isDirectory()) {
      rows.push(`dir:${rel}:${mode}`)
      for (const name of readdirSync(absolute).sort()) visit(join(absolute, name))
    } else if (entry.isFile() && entry.nlink === 1) rows.push(`file:${rel}:${mode}:${fileSha256(absolute)}`)
    else throw new Error(`provider digest tree contains unsafe entry:${normalized.path}/${rel}`)
  }
  visit(target)
  return sha256(rows.join('\n') + '\n')
}
const sortedUniqueStrings = (values, label) => {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) throw new Error(`${label} must be a string array`)
  if (JSON.stringify(values) !== JSON.stringify([...new Set(values)].sort())) throw new Error(`${label} must be sorted and unique`)
  return values
}
const validateDiscovery = (discovery, label) => {
  exactKeys(discovery, DISCOVERY_KEYS, label)
  for (const key of DISCOVERY_KEYS) validateDiscoveryEntries(discovery[key], key, `${label}.${key}`)
  return discovery
}
const validateDiscoveryEntries = (values, key, label) => {
  const entries = sortedUniqueStrings(values, label)
  const portable = new Set()
  for (const [index, entry] of entries.entries()) {
    const normalized = normalizeRepositoryRelative(entry, `${label}[${index}]`)
    if (normalized !== entry || !DISCOVERY_PATTERNS[key].test(entry)) {
      throw new Error(`${label}[${index}] is not a canonical ${key} discovery path`)
    }
    const alias = portableRepositoryPathKey(normalized)
    if (portable.has(alias)) throw new Error(`${label} contains a portable alias:${entry}`)
    portable.add(alias)
  }
  return entries
}
const validateDiscoveryPolicy = (policy, label) => {
  exactKeys(policy, ['schemaVersion', ...DISCOVERY_KEYS], label)
  if (policy.schemaVersion !== 1) throw new Error(`${label}.schemaVersion is unsupported`)
  for (const key of DISCOVERY_KEYS) validateDiscoveryEntries(policy[key], key, `${label}.${key}`)
  return policy
}
const assertSnapshotDiscoveryWithinPolicy = (snapshot, policy, label) => {
  const records = [
    ...snapshot.providers.map((provider) => ({ ...provider, lifecycleRole: 'provider' })),
    ...snapshot.retiredProviders.map((retirement) => ({ ...retirement, lifecycleRole: 'retirement' })),
  ]
  for (const record of records) for (const key of DISCOVERY_KEYS) {
    const allowed = new Set(policy[key].map(portableRepositoryPathKey))
    for (const entry of record.discovery[key]) if (!allowed.has(portableRepositoryPathKey(entry))) {
      throw new Error(`${label}.${record.lifecycleRole}.${record.id}.discovery.${key} is outside the signed global discovery policy:${entry}`)
    }
  }
}
const snapshotActiveSurfaceView = (snapshot) => snapshot.providers.map((provider) => ({
  id: provider.id,
  surfaces: provider.surfaces.map(({ path, kind }) => ({ path, kind })),
}))
const discoveryPolicyReservesPath = (policy, path) => {
  const pathKey = portableRepositoryPathKey(normalizeRepositoryRelative(path, 'discovery-reserved path'))
  const treeRoots = [...policy.providerRootNames, ...policy.pluginRootNames].map(portableRepositoryPathKey)
  if (treeRoots.some((root) => pathKey === root || pathKey.startsWith(`${root}/`))) return true
  return [
    ...policy.instructionNames,
    ...policy.instructionOverrideNames,
    ...policy.configPaths,
  ].some((candidate) => portableRepositoryPathKey(candidate) === pathKey)
}
const validateProviderMaterializers = (catalog, label = 'provider materializers') => {
  const groups = ['instructionViews', 'hookBaseTemplateContracts', 'hookViews', 'skillViews', 'treeViews']
  exactKeys(catalog, groups, label)
  for (const group of groups) {
    if (!catalog[group] || typeof catalog[group] !== 'object' || Array.isArray(catalog[group]) || !Object.keys(catalog[group]).length) {
      throw new Error(`${label}.${group} must be a non-empty object`)
    }
  }
  const validId = (id, group) => {
    if (!/^[a-z][a-z0-9-]*-v[1-9][0-9]*$/.test(id)) throw new Error(`${label}.${group} has invalid id:${id}`)
  }
  for (const [id, materializer] of Object.entries(catalog.instructionViews)) {
    validId(id, 'instructionViews')
    exactKeys(materializer, ['engine', 'ownershipPolicy', 'supplementPolicy'], `${label}.instructionViews.${id}`)
    if (!['shared-instruction-v1', 'markdown-relative-at-import-v1'].includes(materializer.engine)) throw new Error(`${label}.instructionViews.${id} has unsupported engine`)
    if (!['forbidden', 'optional', 'required'].includes(materializer.supplementPolicy)) throw new Error(`${label}.instructionViews.${id}.supplementPolicy is invalid`)
    if (materializer.engine === 'shared-instruction-v1' && (materializer.supplementPolicy !== 'forbidden' || materializer.ownershipPolicy !== 'common-authority-consumer')) throw new Error(`${label}.instructionViews.${id} shared instruction contract is invalid`)
    if (materializer.engine === 'markdown-relative-at-import-v1' && materializer.ownershipPolicy !== 'provider-generated-projection') throw new Error(`${label}.instructionViews.${id} projection ownership is invalid`)
  }
  const commonInstructionMaterializers = Object.entries(catalog.instructionViews).filter(([, materializer]) => (
    materializer.engine === 'shared-instruction-v1'
    && materializer.ownershipPolicy === 'common-authority-consumer'
  ))
  if (commonInstructionMaterializers.length !== 1) {
    throw new Error(`${label}.instructionViews must declare exactly one common-authority shared instruction materializer`)
  }
  for (const [id, contract] of Object.entries(catalog.hookBaseTemplateContracts)) {
    validId(id, 'hookBaseTemplateContracts')
    if (contract?.engine === 'claude-permission-policy-v1') {
      exactKeys(contract, ['engine', 'schema', 'source'], `${label}.hookBaseTemplateContracts.${id}`)
      if (contract.source !== CLAUDE_PERMISSION_POLICY_SOURCE || typeof contract.schema !== 'string' || !contract.schema) throw new Error(`${label}.hookBaseTemplateContracts.${id} is invalid`)
    } else if (contract?.engine === 'static-json-object-v1') exactKeys(contract, ['engine'], `${label}.hookBaseTemplateContracts.${id}`)
    else throw new Error(`${label}.hookBaseTemplateContracts.${id} has unsupported engine`)
  }
  for (const [id, materializer] of Object.entries(catalog.hookViews)) {
    validId(id, 'hookViews')
    if (materializer?.engine === 'json-hook-map-v1') {
      exactKeys(materializer, ['baseTemplateContract', 'descriptionField', 'engine', 'hooksField', 'mergeStrategy'], `${label}.hookViews.${id}`)
      if (typeof materializer.hooksField !== 'string' || !materializer.hooksField) throw new Error(`${label}.hookViews.${id}.hooksField is invalid`)
    } else if (materializer?.engine === 'json-hook-event-list-v1') {
      exactKeys(materializer, ['baseTemplateContract', 'descriptionField', 'engine', 'eventField', 'eventsField', 'groupsField', 'handlerArgvField', 'handlersField', 'matcherField', 'mergeStrategy'], `${label}.hookViews.${id}`)
      for (const field of ['eventField', 'eventsField', 'groupsField', 'handlerArgvField', 'handlersField', 'matcherField']) {
        if (typeof materializer[field] !== 'string' || !materializer[field]) throw new Error(`${label}.hookViews.${id}.${field} is invalid`)
      }
    } else throw new Error(`${label}.hookViews.${id} has unsupported engine:${materializer?.engine || '<missing>'}`)
    if (
      (materializer.engine === 'json-hook-event-list-v1' && (typeof materializer.descriptionField !== 'string' || !materializer.descriptionField))
      || (materializer.engine === 'json-hook-map-v1' && materializer.descriptionField !== null && (typeof materializer.descriptionField !== 'string' || !materializer.descriptionField))
    ) {
      throw new Error(`${label}.hookViews.${id}.descriptionField is invalid`)
    }
    if (!['merge-hook-map-into-base-v1', 'replace-document-v1'].includes(materializer.mergeStrategy)) throw new Error(`${label}.hookViews.${id}.mergeStrategy is invalid`)
    if (materializer.mergeStrategy === 'merge-hook-map-into-base-v1') {
      if (typeof materializer.baseTemplateContract !== 'string' || !catalog.hookBaseTemplateContracts[materializer.baseTemplateContract]) throw new Error(`${label}.hookViews.${id}.baseTemplateContract is invalid`)
    } else if (materializer.baseTemplateContract !== null) throw new Error(`${label}.hookViews.${id} replace-document must not bind a base template`)
  }
  for (const [id, materializer] of Object.entries(catalog.skillViews)) {
    validId(id, 'skillViews')
    exactKeys(materializer, ['engine', 'entryFile'], `${label}.skillViews.${id}`)
    if (materializer.engine !== 'skill-directory-v1') throw new Error(`${label}.skillViews.${id} has unsupported engine:${materializer.engine}`)
    if (typeof materializer.entryFile !== 'string' || !/^[A-Za-z0-9._-]+\.md$/.test(materializer.entryFile)) {
      throw new Error(`${label}.skillViews.${id}.entryFile is invalid`)
    }
  }
  for (const [id, materializer] of Object.entries(catalog.treeViews)) {
    validId(id, 'treeViews')
    exactKeys(materializer, ['engine', 'transformPolicies'], `${label}.treeViews.${id}`)
    if (materializer.engine !== 'closed-tree-copy-v1' || JSON.stringify(materializer.transformPolicies) !== JSON.stringify(['byte-exact'])) throw new Error(`${label}.treeViews.${id} is unsupported`)
  }
  return catalog
}
const resolveManifestMaterializer = (manifest, group, id, label) => {
  const catalog = validateProviderMaterializers(manifest?.materializers, 'installed provider materializers')
  if (typeof id !== 'string' || !Object.hasOwn(catalog[group] || {}, id)) {
    throw new Error(`${label} references unknown ${group} materializer:${id || '<missing>'}`)
  }
  return catalog[group][id]
}
const compareVersion = (leftValue, rightValue) => {
  const parse = (value) => {
    const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
    return match ? { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? null } : null
  }
  const left = parse(leftValue)
  const right = parse(rightValue)
  if (!left || !right) throw new Error(`provider transition releases must be exact semver:${leftValue}:${rightValue}`)
  for (let index = 0; index < 3; index += 1) if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  if (left.pre === null || right.pre === null) return left.pre === right.pre ? 0 : left.pre === null ? 1 : -1
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    if (left.pre[index] === undefined || right.pre[index] === undefined) return left.pre[index] === undefined ? -1 : 1
    if (left.pre[index] === right.pre[index]) continue
    const leftNumeric = /^\d+$/.test(left.pre[index])
    const rightNumeric = /^\d+$/.test(right.pre[index])
    if (leftNumeric && rightNumeric) return Number(left.pre[index]) - Number(right.pre[index])
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return compareUtf8Bytes(left.pre[index], right.pre[index])
  }
  return 0
}

export function validateForkManifestProviderSurfaces(manifest, label = 'installed manifest') {
  validateProviderMaterializers(manifest?.materializers, `${label}.materializers`)
  const commonInstruction = exactKeys(manifest?.consumer?.commonInstruction, [
    'artifact', 'destination', 'materializerId', 'schemaVersion',
  ], `${label}.consumer.commonInstruction`)
  const commonMaterializer = resolveManifestMaterializer(
    manifest,
    'instructionViews',
    commonInstruction.materializerId,
    `${label}.consumer.commonInstruction.materializerId`,
  )
  const commonDestination = normalizeRepositoryRelative(
    commonInstruction.destination,
    `${label}.consumer.commonInstruction.destination`,
  )
  if (
    commonInstruction.schemaVersion !== 1
    || commonInstruction.artifact !== 'common/instruction.md'
    || commonInstruction.destination !== commonDestination
    || commonMaterializer.engine !== 'shared-instruction-v1'
    || commonMaterializer.ownershipPolicy !== 'common-authority-consumer'
  ) throw new Error(`${label}.consumer.commonInstruction is not the closed common authority record`)
  const providers = []
  for (const [providerId, surface] of Object.entries(manifest?.providerSurfaces || {}).sort(([left], [right]) => compareUtf8Bytes(left, right))) {
    const surfaceLabel = `${label}.providerSurfaces.${providerId}`
    exactKeys(surface, [
      'capabilities', 'environmentMap', 'exclusions', 'generated', 'hookArtifact', 'hookDestination',
      'hookMaterializerId', 'instructionArtifact', 'instructionDestination', 'instructionMaterializerId', 'managedSurfaces', 'schemaVersion',
      'skillArtifactRoot', 'skillDestination', 'skillEntryFile', 'skillMaterializerId', 'skills', 'trees', 'nativeHookCoverage',
    ], surfaceLabel)
    if (surface.schemaVersion !== 3 || typeof surface.generated !== 'boolean' || !Array.isArray(surface.skills) || !Array.isArray(surface.trees) || !Array.isArray(surface.managedSurfaces)) {
      throw new Error(`${surfaceLabel} identity is invalid`)
    }
    const managedSurfaces = surface.managedSurfaces.map((record, index) => validateSurface(record, `${surfaceLabel}.managedSurfaces[${index}]`))
    if (JSON.stringify(managedSurfaces) !== JSON.stringify([...managedSurfaces].sort((left, right) => compareUtf8Bytes(left.path, right.path)))) {
      throw new Error(`${surfaceLabel}.managedSurfaces must be sorted by path`)
    }
    if (new Set(managedSurfaces.map((record) => portableRepositoryPathKey(record.path))).size !== managedSurfaces.length) {
      throw new Error(`${surfaceLabel}.managedSurfaces must be unique by path`)
    }
    for (let left = 0; left < managedSurfaces.length; left += 1) for (let right = left + 1; right < managedSurfaces.length; right += 1) {
      if (repositoryPathsOverlap(managedSurfaces[left].path, managedSurfaces[right].path)) {
        throw new Error(`${surfaceLabel}.managedSurfaces contain overlapping portable paths:${managedSurfaces[left].path} <> ${managedSurfaces[right].path}`)
      }
    }
    if (!surface.generated) {
      if (managedSurfaces.length) throw new Error(`${surfaceLabel} disabled provider may not claim managed surfaces`)
      if (surface.trees.length || surface.nativeHookCoverage !== null) throw new Error(`${surfaceLabel} disabled provider may not claim materialized trees or native coverage`)
      if (surface.instructionMaterializerId !== null || surface.hookMaterializerId !== null || surface.skillMaterializerId !== null || surface.skillEntryFile !== null) {
        throw new Error(`${surfaceLabel} disabled provider may not bind materializers`)
      }
      continue
    }
    if (!managedSurfaces.length) throw new Error(`${surfaceLabel} generated provider needs managed surfaces`)
    const instructionMaterializer = resolveManifestMaterializer(manifest, 'instructionViews', surface.instructionMaterializerId, `${surfaceLabel}.instructionMaterializerId`)
    if (surface.hookMaterializerId !== null) {
      resolveManifestMaterializer(manifest, 'hookViews', surface.hookMaterializerId, `${surfaceLabel}.hookMaterializerId`)
    }
    const skillMaterializer = resolveManifestMaterializer(manifest, 'skillViews', surface.skillMaterializerId, `${surfaceLabel}.skillMaterializerId`)
    if (surface.skillEntryFile !== skillMaterializer.entryFile) throw new Error(`${surfaceLabel}.skillEntryFile differs from its registered materializer`)
    const coverage = exactKeys(surface.nativeHookCoverage, [
      'canonicalEvents', 'excludedEvents', 'projectedEvents', 'projectedNativeEvents', 'schemaVersion',
    ], `${surfaceLabel}.nativeHookCoverage`)
    const canonicalEvents = sortedUniqueStrings(coverage.canonicalEvents, `${surfaceLabel}.nativeHookCoverage.canonicalEvents`)
    const projectedEvents = sortedUniqueStrings(coverage.projectedEvents, `${surfaceLabel}.nativeHookCoverage.projectedEvents`)
    if (coverage.schemaVersion !== 2 || !canonicalEvents.length) throw new Error(`${surfaceLabel}.nativeHookCoverage identity is invalid`)
    if (!Array.isArray(coverage.projectedNativeEvents)) throw new Error(`${surfaceLabel}.nativeHookCoverage.projectedNativeEvents must be an array`)
    const projectedNativeEvents = coverage.projectedNativeEvents.map((record, index) => {
      exactKeys(record, ['canonicalEvent', 'nativeEvent'], `${surfaceLabel}.nativeHookCoverage.projectedNativeEvents[${index}]`)
      if (
        typeof record.canonicalEvent !== 'string'
        || !record.canonicalEvent
        || typeof record.nativeEvent !== 'string'
        || !/^[A-Za-z][A-Za-z0-9_.:@/-]*$/.test(record.nativeEvent)
      ) throw new Error(`${surfaceLabel}.nativeHookCoverage.projectedNativeEvents[${index}] is invalid`)
      return record
    })
    if (JSON.stringify(projectedNativeEvents) !== JSON.stringify([...projectedNativeEvents].sort((left, right) => compareUtf8Bytes(left.canonicalEvent, right.canonicalEvent)))) {
      throw new Error(`${surfaceLabel}.nativeHookCoverage.projectedNativeEvents must be sorted by canonicalEvent`)
    }
    if (!Array.isArray(coverage.excludedEvents)) throw new Error(`${surfaceLabel}.nativeHookCoverage.excludedEvents must be an array`)
    const excludedEvents = coverage.excludedEvents.map((record, index) => {
      exactKeys(record, ['authoritativeFallback', 'event', 'reasonCode'], `${surfaceLabel}.nativeHookCoverage.excludedEvents[${index}]`)
      if (
        typeof record.event !== 'string'
        || !record.event
        || !/^[A-Z][A-Z0-9_]*$/.test(record.reasonCode || '')
        || record.authoritativeFallback !== 'immutable-governance-check-and-protected-ci'
      ) throw new Error(`${surfaceLabel}.nativeHookCoverage.excludedEvents[${index}] is invalid`)
      return record
    })
    if (JSON.stringify(excludedEvents) !== JSON.stringify([...excludedEvents].sort((left, right) => compareUtf8Bytes(left.event, right.event)))) {
      throw new Error(`${surfaceLabel}.nativeHookCoverage.excludedEvents must be sorted by event`)
    }
    const excludedNames = excludedEvents.map((record) => record.event)
    if (
      excludedNames.length !== new Set(excludedNames).size
      || projectedEvents.some((event) => excludedNames.includes(event))
      || JSON.stringify([...projectedEvents, ...excludedNames].sort()) !== JSON.stringify(canonicalEvents)
      || JSON.stringify(projectedNativeEvents.map((record) => record.canonicalEvent)) !== JSON.stringify(projectedEvents)
      || new Set(projectedNativeEvents.map((record) => record.nativeEvent)).size !== projectedNativeEvents.length
      || (!surface.capabilities?.nativeHooks && projectedEvents.length)
      || (!surface.capabilities?.nativeHooks && excludedEvents.some((record) => record.reasonCode !== 'NATIVE_HOOK_API_UNAVAILABLE'))
      || (surface.capabilities?.nativeHooks && excludedEvents.some((record) => record.reasonCode !== 'EVENT_NOT_SUPPORTED'))
    ) throw new Error(`${surfaceLabel}.nativeHookCoverage is not an exact projected/excluded partition`)
    if (surface.capabilities?.nativeHooks) {
      if (!surface.hookArtifact || !surface.hookDestination || !surface.hookMaterializerId) throw new Error(`${surfaceLabel} native hooks lack a materialized hook surface`)
    } else if (surface.hookArtifact !== null || surface.hookDestination !== null || surface.hookMaterializerId !== null) {
      throw new Error(`${surfaceLabel} hookless provider claims a hook surface`)
    }
    if (instructionMaterializer.engine === 'shared-instruction-v1') {
      if (
        surface.instructionArtifact !== commonInstruction.artifact
        || surface.instructionDestination !== commonInstruction.destination
        || surface.instructionMaterializerId !== commonInstruction.materializerId
        || managedSurfaces.some((record) => pathsOverlap(record.path, commonInstruction.destination))
      ) throw new Error(`${surfaceLabel} shared instruction does not reference the common non-provider authority`)
    } else if (!managedSurfaces.some((record) => (
      record.path === normalizeRepositoryRelative(surface.instructionDestination, `${surfaceLabel}.instructionDestination`)
      && record.kind === 'file'
    ))) throw new Error(`${surfaceLabel}.instructionDestination is absent from managedSurfaces`)
    for (const [path, kind, field] of [
      [surface.hookDestination, 'file', 'hookDestination'],
      [surface.skillDestination, 'tree', 'skillDestination'],
    ]) {
      if (!path) continue
      const normalized = normalizeRepositoryRelative(path, `${surfaceLabel}.${field}`)
      if (!managedSurfaces.some((record) => record.path === normalized && record.kind === kind)) {
        throw new Error(`${surfaceLabel}.${field} is absent from managedSurfaces`)
      }
    }
    const trees = surface.trees.map((tree, index) => {
      const treeLabel = `${surfaceLabel}.trees[${index}]`
      exactKeys(tree, ['artifactRoot', 'destination', 'materializerId', 'name', 'schemaVersion', 'transformPolicy'], treeLabel)
      if (tree.schemaVersion !== 1 || !/^[a-z][a-z0-9-]*$/.test(tree.name || '')) throw new Error(`${treeLabel} identity is invalid`)
      const artifactRoot = normalizeRepositoryRelative(tree.artifactRoot, `${treeLabel}.artifactRoot`)
      const destination = normalizeRepositoryRelative(tree.destination, `${treeLabel}.destination`)
      if (artifactRoot !== `providers/${providerId}/trees/${tree.name}`) throw new Error(`${treeLabel}.artifactRoot is not provider/name scoped`)
      const materializer = resolveManifestMaterializer(manifest, 'treeViews', tree.materializerId, `${treeLabel}.materializerId`)
      if (
        materializer.engine !== 'closed-tree-copy-v1'
        || tree.transformPolicy !== 'byte-exact'
        || !materializer.transformPolicies.includes(tree.transformPolicy)
      ) throw new Error(`${treeLabel} has an unsupported tree materializer contract`)
      if (!managedSurfaces.some((record) => record.path === destination && record.kind === 'tree')) {
        throw new Error(`${treeLabel}.destination is absent from managedSurfaces`)
      }
      return { ...tree, artifactRoot, destination }
    })
    if (
      JSON.stringify(trees) !== JSON.stringify([...trees].sort((left, right) => compareUtf8Bytes(left.name, right.name)))
      || new Set(trees.map((tree) => tree.name)).size !== trees.length
      || new Set(trees.map((tree) => portableRepositoryPathKey(tree.destination))).size !== trees.length
    ) throw new Error(`${surfaceLabel}.trees must be sorted and unique by name/destination`)
    const expectedManagedTrees = [
      normalizeRepositoryRelative(surface.skillDestination, `${surfaceLabel}.skillDestination`),
      ...trees.map((tree) => tree.destination),
    ].sort()
    const actualManagedTrees = managedSurfaces.filter((record) => record.kind === 'tree').map((record) => record.path).sort()
    if (JSON.stringify(actualManagedTrees) !== JSON.stringify(expectedManagedTrees)) {
      throw new Error(`${surfaceLabel}.managedSurfaces trees must exactly match skillDestination plus materialized trees`)
    }
    const compatibilityFiles = (manifest?.consumer?.compatibilityCategories || [])
      .filter((category) => category?.providerId === providerId)
      .flatMap((category, categoryIndex) => {
        const destinationRoot = normalizeRepositoryRelative(category.destinationRoot, `${surfaceLabel}.compatibilityCategories[${categoryIndex}].destinationRoot`)
        if (!Array.isArray(category.entries)) throw new Error(`${surfaceLabel}.compatibilityCategories[${categoryIndex}].entries must be an array`)
        return category.entries.map((entry, entryIndex) => normalizeRepositoryRelative(
          `${destinationRoot}/${entry}`,
          `${surfaceLabel}.compatibilityCategories[${categoryIndex}].entries[${entryIndex}]`,
        ))
      })
    const expectedManagedFiles = [
      ...(instructionMaterializer.engine === 'shared-instruction-v1'
        ? []
        : [normalizeRepositoryRelative(surface.instructionDestination, `${surfaceLabel}.instructionDestination`)]),
      ...(surface.hookDestination
        ? [normalizeRepositoryRelative(surface.hookDestination, `${surfaceLabel}.hookDestination`)]
        : []),
      ...compatibilityFiles,
    ].sort()
    const actualManagedFiles = managedSurfaces.filter((record) => record.kind === 'file').map((record) => record.path).sort()
    if (JSON.stringify(actualManagedFiles) !== JSON.stringify(expectedManagedFiles)) {
      throw new Error(`${surfaceLabel}.managedSurfaces files must exactly match non-shared instruction, hook, and compatibility leaves`)
    }
    providers.push({ id: providerId, surfaces: managedSurfaces })
  }
  const claims = providers.flatMap((provider) => provider.surfaces.map((record) => ({
    ...record,
    providerId: provider.id,
  }))).sort((left, right) => (
    compareUtf8Bytes(left.path, right.path) || compareUtf8Bytes(left.providerId, right.providerId)
  ))
  for (let left = 0; left < claims.length; left += 1) for (let right = left + 1; right < claims.length; right += 1) {
    if (
      claims[left].providerId !== claims[right].providerId
      && repositoryPathsOverlap(claims[left].path, claims[right].path)
    ) {
      throw new Error(
        `${label} has cross-provider managed surface overlap:`
        + `${claims[left].providerId}:${claims[left].path} <> ${claims[right].providerId}:${claims[right].path}`,
      )
    }
  }
  const nonProviderClaims = [
    { path: commonDestination, kind: 'file', owner: 'common-instruction' },
    {
      path: normalizeRepositoryRelative(manifest?.consumer?.launcherDestination, `${label}.consumer.launcherDestination`),
      kind: 'tree',
      owner: 'shared-launchers',
    },
    ...Object.keys(manifest?.consumer?.managedFiles || {}).map((path) => ({
      path: normalizeRepositoryRelative(path, `${label}.consumer.managedFiles destination`),
      kind: 'file',
      owner: 'consumer-managed-file',
    })),
    ...CONSUMER_CONTROL_PLANE_PATHS.map((path) => ({
      path,
      kind: 'file',
      owner: 'consumer-control-plane',
    })),
  ]
  for (const claim of nonProviderClaims.filter((item) => item.owner !== 'consumer-control-plane')) {
    const controlPlaneAuthority = consumerControlPlaneAuthority(claim.path)
    if (controlPlaneAuthority) {
      throw new Error(
        `${label} non-provider materialization authority overlaps consumer control plane:`
        + `${claim.owner}:${claim.path} <> ${controlPlaneAuthority}`,
      )
    }
  }
  for (let left = 0; left < nonProviderClaims.length; left += 1) for (let right = left + 1; right < nonProviderClaims.length; right += 1) {
    if (repositoryPathsOverlap(nonProviderClaims[left].path, nonProviderClaims[right].path)) {
      throw new Error(
        `${label} non-provider materialization authorities overlap:`
        + `${nonProviderClaims[left].owner}:${nonProviderClaims[left].path}`
        + ` <> ${nonProviderClaims[right].owner}:${nonProviderClaims[right].path}`,
      )
    }
  }
  for (const claim of claims) {
    const controlPlaneAuthority = consumerControlPlaneAuthority(claim.path)
    if (controlPlaneAuthority) {
      throw new Error(
        `${label} provider surface overlaps non-provider authority:`
        + `${claim.providerId}:${claim.path} <> consumer-control-plane:${controlPlaneAuthority}`,
      )
    }
  }
  for (const claim of claims) for (const reserved of nonProviderClaims) {
    if (
      repositoryPathsOverlap(claim.path, reserved.path)
    ) {
      throw new Error(
        `${label} provider surface overlaps non-provider authority:`
        + `${claim.providerId}:${claim.path} <> ${reserved.owner}:${reserved.path}`,
      )
    }
  }
  return providers
}

// The installed consumer BOM is the package trust root, the corpus lock binds every executable
// body, and the lock binds the manifest. Refresh must prove that complete chain before its first
// write or tombstone removal; a merely well-shaped node_modules/manifest.json is never authority.
export function validateInstalledForkCorpus(projectDir) {
  projectDir = canonicalRepositoryRoot(projectDir)
  assertNoRootNpmShrinkwrap(projectDir, { errorPrefix: 'GOV-CORPUS-LOCK-001' })
  const dsRoot = join(projectDir, 'node_modules/@qijenchen/design-system')
  const forkRoot = join(dsRoot, 'ds-canonical/fork')
  const projectPackagePath = regularUnaliasedFile(projectDir, join(projectDir, 'package.json'), 'consumer package manifest')
  const projectLockPath = regularUnaliasedFile(projectDir, join(projectDir, 'package-lock.json'), 'consumer package lock')
  const dsPackagePath = regularUnaliasedFile(projectDir, join(dsRoot, 'package.json'), 'installed design-system package manifest')
  const utilityRegistryPath = regularUnaliasedFile(projectDir, join(dsRoot, 'src/tokens/utility-registry.json'), 'installed canonical utility registry')
  const bomPath = regularUnaliasedFile(projectDir, join(forkRoot, 'consumer/lock.json'), 'installed consumer BOM')
  const corpusLockPath = regularUnaliasedFile(projectDir, join(forkRoot, 'governance.lock'), 'installed fork corpus lock')
  const manifestPath = regularUnaliasedFile(projectDir, join(forkRoot, 'manifest.json'), 'installed fork manifest')
  const projectPackage = JSON.parse(readFileSync(projectPackagePath, 'utf8'))
  const projectLock = JSON.parse(readFileSync(projectLockPath, 'utf8'))
  const dsPackage = JSON.parse(readFileSync(dsPackagePath, 'utf8'))
  const bom = JSON.parse(readFileSync(bomPath, 'utf8'))
  const corpusLock = JSON.parse(readFileSync(corpusLockPath, 'utf8'))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  exactKeys(bom, ['$schema', 'authority', 'generatedBy', 'payload', 'providers', 'release', 'role', 'schemaVersion', 'upgradeProtocol', 'upgradeTrust'], 'installed consumer BOM')
  exactKeys(bom.release, ['designSystem', 'storybookConfig'], 'installed consumer BOM release')
  exactKeys(bom.upgradeProtocol, [
    'bootstrapEvidenceContract', 'candidateCodeExecutionAllowed',
    'controlPlaneUpdateEvidenceContract', 'controlPlaneUpdateMode', 'controlPlaneUpdatePlanner',
    'implementationSha256', 'legacyEntryMode', 'ordinaryUpgradeMode',
    'physicalPowerLossDurabilityClaimed', 'protectedBaseVerifier', 'protocolId', 'schemaSha256',
    'schemaVersion', 'specificationSha256',
  ], 'installed consumer upgrade protocol')
  exactKeys(bom.payload, [
    'commonInstructionSha256', 'mergeSurfaceDigests', 'providerArtifactDigests',
    'discoveryPolicySha256', 'executionRuntimeSha256', 'forkCorpusLockSha256', 'governanceCheckSha256', 'managedFiles',
    'providerInventorySha256', 'providerLifecycleSha256', 'providerMaterializersSha256', 'requiredScripts', 'sharedSkillCount',
    'sharedSkillsSha256', 'utilityRegistrySha256',
  ], 'installed consumer BOM payload')
  if (bom.$schema !== './lock.schema.json' || bom.schemaVersion !== 1 || bom.role !== 'template-consumer' || !bom.payload.managedFiles || typeof bom.payload.managedFiles !== 'object' || Array.isArray(bom.payload.managedFiles)) {
    throw new Error('installed consumer BOM identity is invalid')
  }
  if (
    bom.upgradeProtocol.schemaVersion !== 2
    || bom.upgradeProtocol.protocolId !== 'protected-base-reconstruction-v2'
    || bom.upgradeProtocol.legacyEntryMode !== 'one-time-reviewed-full-snapshot-pr'
    || bom.upgradeProtocol.bootstrapEvidenceContract !== 'consumer-governance-bootstrap-readback-v1'
    || bom.upgradeProtocol.controlPlaneUpdateMode !== 'recurring-reviewed-full-snapshot-pr'
    || bom.upgradeProtocol.controlPlaneUpdateEvidenceContract !== 'consumer-governance-control-plane-update-readback-v1'
    || bom.upgradeProtocol.controlPlaneUpdatePlanner !== 'infra/governance/bin/consumerctl.mjs'
    || bom.upgradeProtocol.ordinaryUpgradeMode !== 'protected-base-disposable-reconstruction'
    || bom.upgradeProtocol.protectedBaseVerifier !== 'scripts/verify-upgrade-evidence.mjs'
    || bom.upgradeProtocol.candidateCodeExecutionAllowed !== false
    || bom.upgradeProtocol.physicalPowerLossDurabilityClaimed !== false
    || !SHA256.test(bom.upgradeProtocol.specificationSha256 || '')
    || !SHA256.test(bom.upgradeProtocol.schemaSha256 || '')
    || !SHA256.test(bom.upgradeProtocol.implementationSha256 || '')
  ) throw new Error('installed consumer BOM lacks the protected-base reconstruction v2 boundary; use the reviewed full-snapshot bootstrap path')
  if (!EXACT_SEMVER.test(dsPackage.version || '') || bom?.release?.designSystem !== dsPackage.version) {
    throw new Error('installed consumer BOM is not bound to the installed design-system release')
  }
  if (!SHA256.test(bom?.payload?.forkCorpusLockSha256 || '') || bom.payload.forkCorpusLockSha256 !== fileSha256(corpusLockPath)) {
    throw new Error('installed consumer BOM does not bind the exact fork corpus lock')
  }
  if (!SHA256.test(bom?.payload?.utilityRegistrySha256 || '') || bom.payload.utilityRegistrySha256 !== fileSha256(utilityRegistryPath)) {
    throw new Error('installed consumer BOM does not bind the exact canonical utility registry')
  }
  exactKeys(corpusLock, ['_purpose', 'entries', 'hashAlgorithm', 'kind', 'schemaVersion'], 'installed fork corpus lock')
  if (corpusLock.schemaVersion !== 1 || corpusLock.kind !== 'fork-governance-corpus-lock' || corpusLock.hashAlgorithm !== 'sha256' || !Array.isArray(corpusLock.entries)) {
    throw new Error('installed fork corpus lock identity is invalid')
  }
  const entryFiles = []
  const entriesByFile = new Map()
  for (const [index, entry] of corpusLock.entries.entries()) {
    exactKeys(entry, ['classification', 'destination', 'file', 'schemaVersion', 'sha256', 'source'], `installed corpus entry[${index}]`)
    const relativePath = normalizeRepositoryRelative(entry.file, `installed corpus entry[${index}].file`)
    if (entry.schemaVersion !== 1 || !SHA256.test(entry.sha256 || '') || !safeRelative(forkRoot, relativePath)) throw new Error(`installed corpus entry is invalid:${relativePath}`)
    const body = regularUnaliasedFile(projectDir, join(forkRoot, relativePath), `installed corpus body ${relativePath}`)
    if (fileSha256(body) !== entry.sha256) throw new Error(`installed corpus body digest mismatch:${relativePath}`)
    entryFiles.push(relativePath)
    entriesByFile.set(relativePath, entry)
  }
  if (JSON.stringify(entryFiles) !== JSON.stringify([...new Set(entryFiles)].sort(compareUtf8Bytes))) {
    throw new Error('installed corpus entries must be sorted and unique')
  }
  const manifestEntry = corpusLock.entries.filter((entry) => entry.file === 'manifest.json')
  if (manifestEntry.length !== 1 || manifestEntry[0].sha256 !== fileSha256(manifestPath)) throw new Error('installed corpus lock does not bind exactly one manifest')
  const expectedManifestKeys = [
    '_generated', 'schemaVersion', 'kind', 'providerRegistrySchemaVersion', 'materializers', 'discoveryPolicy',
    'providerLifecycle', 'providerAdapters', 'authorityDecision', 'independentReview', 'launchers', 'hooks', 'ciReplay', 'skills', 'commands',
    'agents', 'providerSurfaces', 'codex', 'consumer',
  ]
  exactKeys(manifest, expectedManifestKeys, 'installed fork manifest')
  if (manifest.schemaVersion !== 2 || manifest.kind !== 'provider-neutral-fork-manifest' || manifest.providerRegistrySchemaVersion !== 9) {
    throw new Error('installed fork manifest identity is invalid')
  }
  exactKeys(manifest.authorityDecision, [
    'schemaVersion', 'policySource', 'classifierSource', 'receiptContractSource', 'runner',
    'prepareArgv', 'verifyArgv', 'certificationClaim',
  ], 'installed fork manifest authorityDecision')
  if (
    manifest.authorityDecision.schemaVersion !== 1
    || manifest.authorityDecision.policySource !== 'AGENTS.md#canonical-decision-authority'
    || manifest.authorityDecision.classifierSource !== 'launchers/approval-evidence.mjs'
    || manifest.authorityDecision.receiptContractSource !== 'launchers/authority-decision-evidence.mjs'
    || manifest.authorityDecision.runner !== 'launchers/product-hook-dispatch-runtime.mjs'
    || JSON.stringify(manifest.authorityDecision.prepareArgv) !== JSON.stringify(['--authority-decision', 'prepare'])
    || JSON.stringify(manifest.authorityDecision.verifyArgv) !== JSON.stringify(['--authority-decision', 'verify'])
    || manifest.authorityDecision.certificationClaim !== 'structural-only-not-runtime-certified'
  ) throw new Error('installed fork manifest authorityDecision projection is invalid')
  validateIndependentReviewProjection(manifest.independentReview)
  validateDiscoveryPolicy(manifest.discoveryPolicy, 'installed fork manifest discoveryPolicy')
  if (bom.payload.discoveryPolicySha256 !== sha256(JSON.stringify(manifest.discoveryPolicy))) {
    throw new Error('installed consumer BOM does not bind the discovery policy')
  }
  if (manifest.codex !== null) {
    exactKeys(manifest.codex, [
      'agentsMd', 'agentsSkills', 'compatibilityOnly', 'hookArtifact', 'hookDestination', 'hooksJson',
      'instructionDestination', 'skillArtifactRoot', 'skillDestination',
    ], 'installed legacy Codex compatibility record')
    if (
      manifest.codex.compatibilityOnly !== true
      || typeof manifest.codex.agentsMd !== 'string'
      || typeof manifest.codex.instructionDestination !== 'string'
      || !Array.isArray(manifest.codex.agentsSkills)
      || !Array.isArray(manifest.codex.hooksJson)
      || (manifest.codex.hookArtifact !== null && typeof manifest.codex.hookArtifact !== 'string')
      || (manifest.codex.hookDestination !== null && typeof manifest.codex.hookDestination !== 'string')
      || typeof manifest.codex.skillArtifactRoot !== 'string'
      || typeof manifest.codex.skillDestination !== 'string'
    ) throw new Error('installed legacy Codex compatibility record is invalid')
  }
  exactKeys(manifest.consumer, [
    'claudeMd', 'commonInstruction', 'compatibilityCategories', 'executionRuntime', 'governanceCheck', 'governanceLock', 'governanceLockSchema', 'launcherDestination', 'managedFiles', 'materialization',
  ], 'installed fork manifest consumer')
  if (manifest.consumer.claudeMd !== null && typeof manifest.consumer.claudeMd !== 'string') {
    throw new Error('installed fork manifest legacy claudeMd compatibility alias is invalid')
  }
  if (!Array.isArray(manifest.consumer.compatibilityCategories)) throw new Error('installed compatibility category inventory must be an array')
  exactKeys(manifest.consumer.materialization, ['exactPaths', 'pathPrefixes'], 'installed fork manifest consumer materialization')
  if (!manifest.consumer.managedFiles || typeof manifest.consumer.managedFiles !== 'object' || Array.isArray(manifest.consumer.managedFiles)) {
    throw new Error('installed fork manifest managed-file map is invalid')
  }
  exactKeys(manifest.consumer.executionRuntime, [
    'engine', 'exactNpmVersion', 'minimumNodeVersion', 'nativeWindowsPolicy', 'requiredExecutables', 'requiredPathClasses', 'schemaVersion',
    'supportedHostPlatforms', 'windowsCompatibilityEnvironments',
  ], 'installed consumer execution runtime')
  if (
    manifest.consumer.executionRuntime.schemaVersion !== 2
    || manifest.consumer.executionRuntime.engine !== 'node-posix-toolchain-v2'
    || !/^\d+\.\d+\.\d+$/.test(manifest.consumer.executionRuntime.minimumNodeVersion || '')
    || !/^\d+\.\d+\.\d+$/.test(manifest.consumer.executionRuntime.exactNpmVersion || '')
    || manifest.consumer.executionRuntime.nativeWindowsPolicy !== 'unsupported-fail-closed'
    || JSON.stringify(manifest.consumer.executionRuntime.supportedHostPlatforms) !== JSON.stringify(['darwin', 'linux'])
    || JSON.stringify(manifest.consumer.executionRuntime.windowsCompatibilityEnvironments) !== JSON.stringify(['devcontainer-linux', 'wsl2-linux'])
    || JSON.stringify(manifest.consumer.executionRuntime.requiredExecutables) !== JSON.stringify(['bash', 'git', 'jq', 'node', 'python3'])
    || JSON.stringify(manifest.consumer.executionRuntime.requiredPathClasses) !== JSON.stringify(['plain', 'space-containing'])
    || bom.payload.executionRuntimeSha256 !== sha256(JSON.stringify(manifest.consumer.executionRuntime))
  ) throw new Error('installed consumer execution runtime contract is invalid or unbound')
  const requiredNodeRange = `>=${manifest.consumer.executionRuntime.minimumNodeVersion}`
  const lockedRoot = projectLock?.packages?.['']
  const lockedNpm = projectLock?.packages?.['node_modules/npm']
  if (
    projectPackage?.engines?.node !== requiredNodeRange
    || projectPackage?.devDependencies?.npm !== manifest.consumer.executionRuntime.exactNpmVersion
    || projectLock?.lockfileVersion !== 3
    || lockedRoot?.engines?.node !== requiredNodeRange
    || lockedRoot?.devDependencies?.npm !== manifest.consumer.executionRuntime.exactNpmVersion
    || lockedNpm?.version !== manifest.consumer.executionRuntime.exactNpmVersion
    || lockedNpm?.resolved !== `https://registry.npmjs.org/npm/-/npm-${manifest.consumer.executionRuntime.exactNpmVersion}.tgz`
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(lockedNpm?.integrity || '')
  ) throw new Error('consumer package engines/npm lock differs from the installed execution runtime contract')
  if (!stableVersionAtLeast(process.versions.node, manifest.consumer.executionRuntime.minimumNodeVersion)) {
    throw new Error(`consumer refresh requires Node.js ${manifest.consumer.executionRuntime.minimumNodeVersion} or newer`)
  }
  const launcherDestination = normalizeRepositoryRelative(manifest.consumer.launcherDestination, 'installed shared launcher destination')
  if (!Array.isArray(manifest.launchers) || !manifest.launchers.length) throw new Error('installed fork manifest launcher inventory is empty')
  const launcherNames = manifest.launchers.map((name, index) => {
    if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+\.(?:sh|mjs|py)$/.test(name)) {
      throw new Error(`installed fork manifest launcher[${index}] is invalid`)
    }
    return name
  })
  if (JSON.stringify(launcherNames) !== JSON.stringify([...new Set(launcherNames)].sort())) {
    throw new Error('installed fork manifest launchers must be sorted and unique')
  }
  if (!launcherNames.includes('independent-review.mjs')) throw new Error('installed fork manifest lacks the provider-neutral independent-review launcher')
  const assertLockedArtifact = (relativePath, label) => {
    const normalized = normalizeRepositoryRelative(relativePath, label)
    if (!safeRelative(forkRoot, normalized)) throw new Error(`${label} escapes fork corpus`)
    const absolute = join(forkRoot, normalized)
    assertNoSymlinkPath(projectDir, absolute, label, { allowMissing: false })
    const info = lstatSync(absolute)
    const files = []
    const visit = (path, rel) => {
      const childInfo = lstatSync(path)
      if (childInfo.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name), `${rel}/${name}`)
      else if (childInfo.isFile() && childInfo.nlink === 1) files.push(rel)
      else throw new Error(`${label} contains an unsafe filesystem entry`)
    }
    visit(absolute, normalized)
    if (!info.isFile() && !info.isDirectory()) throw new Error(`${label} is not a file or tree`)
    for (const file of files) if (!entriesByFile.has(file)) throw new Error(`${label} references unlocked corpus body:${file}`)
    return { normalized, files }
  }
  for (const [relativePath, label] of [
    [manifest.authorityDecision.classifierSource, 'installed authority decision classifier'],
    [manifest.authorityDecision.receiptContractSource, 'installed authority decision receipt contract'],
    [manifest.authorityDecision.runner, 'installed authority decision runner'],
  ]) {
    const launcherName = relativePath.slice('launchers/'.length)
    if (!relativePath.startsWith('launchers/') || !launcherNames.includes(launcherName)) {
      throw new Error(`${label} is absent from the shared launcher inventory`)
    }
    assertLockedArtifact(relativePath, label)
  }
  const lifecycle = manifest.providerLifecycle
  assertLockedArtifact('review/provider-review-binding.mjs', 'installed provider review binding resolver')
  if (!lifecycle || typeof lifecycle !== 'object' || Array.isArray(lifecycle) || ![3, 4].includes(lifecycle.schemaVersion)) {
    throw new Error('installed provider lifecycle identity is invalid')
  }
  exactKeys(lifecycle, [
    'currentProviderInventorySha256', 'currentSnapshotSha256', 'immutableHead', 'ledgerSha256', 'previousSnapshotSha256',
    'releaseVersion', 'retiredProviders', 'schemaVersion',
    ...(lifecycle.schemaVersion === 4 ? ['currentSnapshot', 'immutableHeadSnapshot'] : []),
  ], 'installed provider lifecycle')
  if (
    lifecycle.releaseVersion !== dsPackage.version
    || !SHA256.test(lifecycle.ledgerSha256 || '')
    || !SHA256.test(lifecycle.currentSnapshotSha256 || '')
    || !SHA256.test(lifecycle.currentProviderInventorySha256 || '')
    || (lifecycle.previousSnapshotSha256 !== null && !SHA256.test(lifecycle.previousSnapshotSha256 || ''))
    || !Array.isArray(lifecycle.retiredProviders)
  ) throw new Error('installed provider lifecycle identity is invalid')
  exactKeys(lifecycle.immutableHead, ['providerInventorySha256', 'releaseVersion', 'snapshotSha256'], 'installed provider lifecycle immutable head')
  if (!EXACT_SEMVER.test(lifecycle.immutableHead.releaseVersion || '') || !SHA256.test(lifecycle.immutableHead.snapshotSha256 || '') || !SHA256.test(lifecycle.immutableHead.providerInventorySha256 || '')) {
    throw new Error('installed provider lifecycle immutable head is invalid')
  }
  validateAuthenticatedProviderLifecycle(lifecycle, { allowLegacyV3: true })
  const activeProviders = validateForkManifestProviderSurfaces(manifest)
  if (lifecycle.schemaVersion === 4) {
    const currentSnapshot = lifecycle.currentSnapshot
    const immutableHeadSnapshot = lifecycle.immutableHeadSnapshot
    assertSnapshotDiscoveryWithinPolicy(currentSnapshot, manifest.discoveryPolicy, 'installed provider lifecycle currentSnapshot')
    assertSnapshotDiscoveryWithinPolicy(immutableHeadSnapshot, manifest.discoveryPolicy, 'installed provider lifecycle immutableHeadSnapshot')
    if (JSON.stringify(snapshotActiveSurfaceView(currentSnapshot)) !== JSON.stringify(snapshotActiveSurfaceView({ providers: activeProviders }))) {
      throw new Error('installed provider lifecycle currentSnapshot provider ids/surfaces do not exactly match active providerSurfaces managedSurfaces')
    }
  }
  const activeProviderById = new Map(activeProviders.map((provider) => [provider.id, provider]))
  const activeSurfaces = activeProviders.flatMap((provider) => provider.surfaces.map((surface) => ({ ...surface, providerId: provider.id })))
  const commonInstruction = manifest.consumer.commonInstruction
  const commonDestination = normalizeRepositoryRelative(commonInstruction.destination, 'installed common instruction destination')
  const commonArtifact = assertLockedArtifact(commonInstruction.artifact, 'installed common instruction artifact')
  if (
    commonArtifact.files.length !== 1
    || bom.payload.commonInstructionSha256 !== entriesByFile.get(commonArtifact.normalized)?.sha256
    || activeSurfaces.some((surface) => pathsOverlap(surface.path, commonDestination))
  ) throw new Error('installed common instruction is unbound or incorrectly owned by a provider')
  const governanceCheck = assertLockedArtifact(manifest.consumer.governanceCheck, 'installed governance checker artifact')
  if (
    governanceCheck.files.length !== 1
    || entriesByFile.get(governanceCheck.normalized)?.sha256 !== bom.payload.governanceCheckSha256
  ) throw new Error('installed governance checker is not exactly bound by BOM/corpus lock')
  if (manifest.codex !== null) {
    const compatibility = manifest.codex
    const matchingSurfaces = Object.values(manifest.providerSurfaces).filter((surface) => (
      surface.generated
      && surface.instructionArtifact === compatibility.agentsMd
      && surface.instructionDestination === compatibility.instructionDestination
      && surface.hookDestination === compatibility.hookDestination
      && surface.skillDestination === compatibility.skillDestination
      && JSON.stringify(surface.skills) === JSON.stringify(compatibility.agentsSkills)
    ))
    if (matchingSurfaces.length !== 1) throw new Error('legacy Codex compatibility record does not bind exactly one active provider surface')
    assertLockedArtifact(compatibility.agentsMd, 'legacy Codex instruction alias source')
    if (compatibility.hookArtifact !== null) assertLockedArtifact(compatibility.hookArtifact, 'legacy Codex hook alias')
    for (const name of compatibility.agentsSkills) {
      assertLockedArtifact(`${compatibility.skillArtifactRoot}/${name}`, `legacy Codex skill alias ${name}`)
    }
  }
  const compatibilityCategories = manifest.consumer.compatibilityCategories.map((category, index) => {
    const categoryLabel = `installed compatibility category[${index}]`
    exactKeys(category, ['artifactRoot', 'destinationRoot', 'entries', 'name', 'providerId', 'schemaVersion'], categoryLabel)
    if (
      category.schemaVersion !== 1
      || !['agents', 'commands'].includes(category.name)
      || !/^[a-z][a-z0-9-]*$/.test(category.providerId || '')
    ) throw new Error(`${categoryLabel} identity is invalid`)
    const artifactRoot = normalizeRepositoryRelative(category.artifactRoot, `${categoryLabel}.artifactRoot`)
    const destinationRoot = normalizeRepositoryRelative(category.destinationRoot, `${categoryLabel}.destinationRoot`)
    const entries = sortedUniqueStrings(category.entries, `${categoryLabel}.entries`)
    const owner = activeProviderById.get(category.providerId)
    if (!owner) throw new Error(`${categoryLabel} owner is not an active generated provider`)
    if (JSON.stringify(manifest[category.name]) !== JSON.stringify(entries)) throw new Error(`${categoryLabel} differs from its legacy manifest alias`)
    for (const entry of entries) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.@-]*\.md$/.test(entry)) throw new Error(`${categoryLabel} entry is unsafe:${entry}`)
      const destination = `${destinationRoot}/${entry}`
      if (!owner.surfaces.some((surface) => surface.path === destination && surface.kind === 'file')) {
        throw new Error(`${categoryLabel} destination is absent from provider lifecycle ownership:${destination}`)
      }
      assertLockedArtifact(`${artifactRoot}/${entry}`, `${categoryLabel} artifact ${entry}`)
      if (!manifest.consumer.materialization.exactPaths.includes(destination)) throw new Error(`${categoryLabel} destination is absent from exact materialization:${destination}`)
    }
    return { ...category, artifactRoot, destinationRoot, entries }
  })
  if (
    JSON.stringify(compatibilityCategories.map((category) => category.name))
      !== JSON.stringify([...new Set(compatibilityCategories.map((category) => category.name))].sort())
  ) throw new Error('installed compatibility categories must be sorted and unique by name')
  for (const name of ['agents', 'commands']) {
    if (!compatibilityCategories.some((category) => category.name === name) && (manifest[name] || []).length) {
      throw new Error(`legacy ${name} inventory exists without an active compatibility category owner`)
    }
  }
  if (activeSurfaces.some((surface) => pathsOverlap(surface.path, launcherDestination))) {
    throw new Error(`shared launcher destination is owned by a provider lifecycle surface:${launcherDestination}`)
  }
  const retiredIds = []
  const retiredPaths = []
  for (const [index, retirement] of lifecycle.retiredProviders.entries()) {
    exactKeys(retirement, [
      'discovery', 'id', 'priorProviderSha256', 'priorReleaseVersion', 'priorSnapshotSha256',
      'reasonCode', 'replacementProviderId', 'retiredInVersion', 'surfaces',
      ...(Object.hasOwn(retirement || {}, 'transfers') ? ['transfers'] : []),
    ], `installed retirement[${index}]`)
    const transfers = retirement.transfers || []
    if (
      !/^[a-z][a-z0-9-]*$/.test(retirement.id || '')
      || !EXACT_SEMVER.test(retirement.priorReleaseVersion || '')
      || !EXACT_SEMVER.test(retirement.retiredInVersion || '')
      || !SHA256.test(retirement.priorSnapshotSha256 || '')
      || !SHA256.test(retirement.priorProviderSha256 || '')
      || !Array.isArray(retirement.surfaces)
      || (Object.hasOwn(retirement, 'transfers') && (!Array.isArray(transfers) || !transfers.length))
      || (!retirement.surfaces.length && !transfers.length)
    ) throw new Error(`installed retirement proof is invalid:${retirement?.id || index}`)
    validateDiscovery(retirement.discovery, `installed retirement ${retirement.id}.discovery`)
    const surfaces = retirement.surfaces.map((surface, surfaceIndex) => validateRetiredSurface(surface, `installed retirement ${retirement.id}.surfaces[${surfaceIndex}]`))
    if (surfaces.some((surface) => pathsOverlap(surface.path, commonDestination))) {
      throw new Error(`${retirement.id}:provider tombstone may not delete the common instruction authority`)
    }
    if (JSON.stringify(surfaces) !== JSON.stringify([...surfaces].sort((left, right) => compareUtf8Bytes(left.path, right.path)))) throw new Error(`${retirement.id}:retired surfaces must be sorted`)
    const transferred = transfers.map((surface, surfaceIndex) => validateSurface(surface, `installed retirement ${retirement.id}.transfers[${surfaceIndex}]`))
    if (JSON.stringify(transferred) !== JSON.stringify([...transferred].sort((left, right) => compareUtf8Bytes(left.path, right.path)))) throw new Error(`${retirement.id}:transferred surfaces must be sorted`)
    const partition = [...surfaces, ...transferred].map(({ path, kind }) => ({ path, kind }))
      .sort((left, right) => compareUtf8Bytes(left.path, right.path))
    if (partition.length !== new Set(partition.map((surface) => portableRepositoryPathKey(surface.path))).size) throw new Error(`${retirement.id}:retirement deletion/transfer partition contains duplicate paths`)
    const priorProvider = {
      id: retirement.id,
      discovery: retirement.discovery,
      surfaces: partition,
    }
    if (sha256(JSON.stringify(priorProvider)) !== retirement.priorProviderSha256) throw new Error(`${retirement.id}:retirement does not bind its prior provider inventory`)
    const replacement = retirement.replacementProviderId === null ? null : activeProviderById.get(retirement.replacementProviderId)
    if (retirement.replacementProviderId !== null && (!replacement || retirement.replacementProviderId === retirement.id)) {
      throw new Error(`${retirement.id}:replacementProviderId must name a distinct active current provider`)
    }
    if (!replacement && transferred.length) throw new Error(`${retirement.id}:null replacementProviderId cannot transfer surfaces`)
    for (const surface of surfaces) {
      if (activeSurfaces.some((candidate) => pathsOverlap(candidate.path, surface.path))) {
        throw new Error(`${retirement.id}:deletion tombstone remains owned by an active provider:${surface.path}`)
      }
    }
    for (const surface of transferred) {
      if (!replacement.surfaces.some((candidate) => candidate.path === surface.path && candidate.kind === surface.kind)) {
        throw new Error(`${retirement.id}:transfer is not exactly owned by replacement ${retirement.replacementProviderId}:${surface.path}`)
      }
      if (activeSurfaces.some((candidate) => candidate.providerId !== replacement.id && pathsOverlap(candidate.path, surface.path))) {
        throw new Error(`${retirement.id}:transfer is also owned by a non-replacement provider:${surface.path}`)
      }
    }
    retiredIds.push(retirement.id)
    retiredPaths.push(...surfaces.map((surface) => surface.path))
  }
  if (JSON.stringify(retiredIds) !== JSON.stringify([...new Set(retiredIds)].sort()) || retiredPaths.length !== new Set(retiredPaths.map(portableRepositoryPathKey)).size) {
    throw new Error('installed retirement ids and paths must be globally unique and sorted')
  }
  if (bom.payload.providerLifecycleSha256 !== sha256(JSON.stringify(lifecycle))) throw new Error('installed consumer BOM does not bind the provider lifecycle')
  if (bom.payload.providerInventorySha256 !== sha256(JSON.stringify(manifest.providerSurfaces))) throw new Error('installed consumer BOM does not bind provider surfaces')
  if (bom.payload.providerMaterializersSha256 !== sha256(JSON.stringify(manifest.materializers))) throw new Error('installed consumer BOM does not bind provider materializers')
  const activeIds = activeProviders.map((provider) => provider.id)
  if (activeIds.some((id) => retiredIds.includes(id))) throw new Error('installed provider lifecycle reactivates a retired provider')
  if (JSON.stringify(Object.keys(manifest.consumer.managedFiles).sort()) !== JSON.stringify(Object.keys(bom.payload.managedFiles).sort())) {
    throw new Error('installed managed-file artifact map differs from the consumer BOM')
  }
  for (const [destination, artifact] of Object.entries(manifest.consumer.managedFiles)) {
    normalizeRepositoryRelative(destination, `managed-file destination ${destination}`)
    const locked = assertLockedArtifact(artifact, `managed-file artifact ${artifact}`)
    if (locked.files.length !== 1 || entriesByFile.get(locked.normalized)?.sha256 !== bom.payload.managedFiles[destination]) {
      throw new Error(`managed-file artifact is not exactly bound by BOM/corpus lock:${destination}`)
    }
  }
  for (const [providerId, surface] of Object.entries(manifest.providerSurfaces)) {
    if (!surface.generated) continue
    assertLockedArtifact(surface.instructionArtifact, `${providerId} instruction artifact`)
    if (surface.hookArtifact) assertLockedArtifact(surface.hookArtifact, `${providerId} hook artifact`)
    for (const name of surface.skills) assertLockedArtifact(`${surface.skillArtifactRoot}/${name}`, `${providerId} skill artifact ${name}`)
    for (const tree of surface.trees) {
      const locked = assertLockedArtifact(tree.artifactRoot, `${providerId} product managed tree ${tree.name}`)
      if (!locked.files.length) throw new Error(`${providerId} product managed tree is empty or unlocked:${tree.name}`)
    }
  }
  const lockedTreeDigest = (prefix) => sha256(corpusLock.entries
    .filter((entry) => entry.file.startsWith(`${prefix}/`))
    .map((entry) => `${entry.file}:${entry.sha256}`)
    .join('\n') + '\n')
  const sharedSkillEntries = corpusLock.entries
    .filter((entry) => entry.file.startsWith('skills/'))
    .map((entry) => `${entry.file}:${entry.sha256}`)
    .sort()
  const lockedSharedSkillNames = [...new Set(corpusLock.entries
    .filter((entry) => entry.file.startsWith('skills/'))
    .map((entry) => entry.file.split('/')[1]))]
    .sort()
  if (
    !Array.isArray(manifest.skills)
    || JSON.stringify(manifest.skills) !== JSON.stringify([...new Set(manifest.skills)].sort())
    || manifest.skills.some((name) => !/^[a-z][a-z0-9-]*$/.test(name))
    || JSON.stringify(manifest.skills) !== JSON.stringify(lockedSharedSkillNames)
    || bom.payload.sharedSkillCount !== manifest.skills.length
    || bom.payload.sharedSkillsSha256 !== sha256(`${sharedSkillEntries.join('\n')}\n`)
  ) throw new Error('installed shared skill inventory/digest is invalid')
  const providerIds = Object.keys(manifest.providerSurfaces).sort()
  if (JSON.stringify(Object.keys(bom.payload.providerArtifactDigests || {}).sort()) !== JSON.stringify(providerIds)) {
    throw new Error('installed provider artifact digest map differs from the provider inventory')
  }
  for (const [providerId, surface] of Object.entries(manifest.providerSurfaces).sort(([a], [b]) => compareUtf8Bytes(a, b))) {
    const binding = exactKeys(bom.payload.providerArtifactDigests[providerId], [
      'hookSha256', 'instructionSha256', 'skillsSha256', 'treeDigests',
    ], `installed provider artifact digest ${providerId}`)
    exactKeys(binding.treeDigests, surface.trees.map((tree) => tree.name), `installed provider tree digest ${providerId}`)
    const expected = {
      instructionSha256: surface.instructionArtifact ? fileSha256(join(forkRoot, surface.instructionArtifact)) : null,
      hookSha256: surface.hookArtifact ? fileSha256(join(forkRoot, surface.hookArtifact)) : null,
      skillsSha256: surface.skillArtifactRoot ? lockedTreeDigest(surface.skillArtifactRoot) : null,
      treeDigests: Object.fromEntries(surface.trees.map((tree) => [tree.name, lockedTreeDigest(tree.artifactRoot)])),
    }
    if (JSON.stringify(binding) !== JSON.stringify(expected)) throw new Error(`${providerId}:installed provider artifact digest binding is invalid`)
  }
  const mergePolicies = validateCanonicalSettingsWiring(
    JSON.parse(readFileSync(join(forkRoot, 'launchers/settings-hooks.json'), 'utf8')),
    manifest,
  )
  const expectedMergeDigests = Object.fromEntries(Object.entries(mergePolicies.surfaces)
    .sort(([a], [b]) => compareUtf8Bytes(a, b))
    .map(([providerId, policy]) => [providerId, fileSha256(join(forkRoot, policy.hookArtifact))]))
  if (JSON.stringify(bom.payload.mergeSurfaceDigests) !== JSON.stringify(expectedMergeDigests)) {
    throw new Error('installed merge-surface digest map differs from the locked merge policies')
  }
  const exactMaterialization = manifest.consumer.materialization.exactPaths
  if (!Array.isArray(exactMaterialization)) throw new Error('consumer exact materialization inventory must be an array')
  const prefixMaterialization = manifest.consumer.materialization.pathPrefixes
  if (!Array.isArray(prefixMaterialization)) throw new Error('consumer prefix materialization inventory must be an array')
  const generatedSurfaces = Object.entries(manifest.providerSurfaces)
    .filter(([, surface]) => surface.generated)
    .sort(([left], [right]) => compareUtf8Bytes(left, right))
  const exactMaterializationClaims = [
    ...Object.keys(manifest.consumer.managedFiles).map((destination) => ({
      owner: `consumer-managed-file:${destination}`,
      path: normalizeRepositoryRelative(destination, `managed-file materialization destination ${destination}`),
    })),
    ...CONSUMER_CONTROL_PLANE_PATHS.map((path) => ({ owner: `consumer-control-plane:${path}`, path })),
    { owner: 'common-instruction', path: commonDestination },
    ...generatedSurfaces.flatMap(([providerId, surface]) => {
      const instructionMaterializer = resolveManifestMaterializer(
        manifest,
        'instructionViews',
        surface.instructionMaterializerId,
        `${providerId}.instructionMaterializerId`,
      )
      return [
        ...(instructionMaterializer.engine === 'shared-instruction-v1' ? [] : [{
          owner: `${providerId}:instruction`,
          path: normalizeRepositoryRelative(surface.instructionDestination, `${providerId} instruction materialization destination`),
        }]),
        ...(surface.hookDestination === null ? [] : [{
          owner: `${providerId}:hook`,
          path: normalizeRepositoryRelative(surface.hookDestination, `${providerId} hook materialization destination`),
        }]),
      ]
    }),
    ...launcherNames.map((name) => ({ owner: `shared-launcher:${name}`, path: `${launcherDestination}/${name}` })),
    ...compatibilityCategories.flatMap((category) => (
      category.entries.map((entry) => ({
        owner: `compatibility:${category.name}:${entry}`,
        path: `${category.destinationRoot}/${entry}`,
      }))
    )),
  ]
  const prefixMaterializationClaims = generatedSurfaces.flatMap(([providerId, surface]) => [
    ...surface.skills.map((name) => ({
      owner: `${providerId}:skill:${name}`,
      path: `${normalizeRepositoryRelative(surface.skillDestination, `${providerId} skill materialization destination`)}/${name}`,
    })),
    ...surface.trees.map((tree) => ({
      owner: `${providerId}:tree:${tree.name}`,
      path: normalizeRepositoryRelative(tree.destination, `${providerId} tree materialization destination ${tree.name}`),
    })),
  ])
  const ownerClaims = [
    ...exactMaterializationClaims.filter((claim) => !claim.owner.startsWith('shared-launcher:')),
    { owner: 'shared-launchers', path: launcherDestination },
    ...prefixMaterializationClaims,
  ]
    .sort((left, right) => (
      compareUtf8Bytes(left.path, right.path) || compareUtf8Bytes(left.owner, right.owner)
    ))
  for (const claim of ownerClaims.filter((item) => !item.owner.startsWith('consumer-control-plane:'))) {
    const controlPlaneAuthority = consumerControlPlaneAuthority(claim.path)
    if (controlPlaneAuthority) {
      throw new Error(
        'non-provider materialization authority overlaps consumer control plane:'
        + `${claim.owner}:${claim.path} <> ${controlPlaneAuthority}`,
      )
    }
  }
  for (let left = 0; left < ownerClaims.length; left += 1) for (let right = left + 1; right < ownerClaims.length; right += 1) {
    if (repositoryPathsOverlap(ownerClaims[left].path, ownerClaims[right].path)) {
      throw new Error(
        'non-provider materialization authorities overlap:'
        + `${ownerClaims[left].owner}:${ownerClaims[left].path}`
        + ` <> ${ownerClaims[right].owner}:${ownerClaims[right].path}`,
      )
    }
  }
  const expectedExactMaterialization = [...new Set(exactMaterializationClaims.map((claim) => claim.path))].sort()
  const canonicalExactMaterialization = exactMaterialization.map((path, index) => {
    const normalized = normalizeRepositoryRelative(path, `consumer exact materialization[${index}]`)
    if (path !== normalized) throw new Error(`consumer exact materialization path is not canonical:${path}`)
    return normalized
  })
  if (JSON.stringify(canonicalExactMaterialization) !== JSON.stringify(expectedExactMaterialization)) {
    throw new Error('consumer exact materialization inventory must be sorted, unique, canonical, and exactly derived from authenticated corpus')
  }
  const expectedPrefixMaterialization = [...new Set(prefixMaterializationClaims.map((claim) => `${claim.path}/`))].sort()
  const canonicalPrefixMaterialization = prefixMaterialization.map((prefix, index) => {
    if (typeof prefix !== 'string') throw new Error(`consumer prefix materialization[${index}] must be a string`)
    const normalized = `${normalizeRepositoryRelative(prefix, `consumer prefix materialization[${index}]`)}/`
    if (prefix !== normalized) throw new Error(`consumer prefix materialization path is not canonical:${prefix}`)
    return normalized
  })
  if (JSON.stringify(canonicalPrefixMaterialization) !== JSON.stringify(expectedPrefixMaterialization)) {
    throw new Error('consumer prefix materialization inventory must be sorted, unique, canonical, and exactly derived from authenticated corpus')
  }
  for (const name of launcherNames) {
    assertLockedArtifact(`launchers/${name}`, `shared launcher artifact ${name}`)
  }
  return {
    projectDir,
    forkRoot,
    manifest,
    activeProviders,
    bom,
    corpusLock,
    evidence: {
      releaseVersion: dsPackage.version,
      consumerBomSha256: fileSha256(bomPath),
      forkCorpusLockSha256: fileSha256(corpusLockPath),
      manifestSha256: fileSha256(manifestPath),
      providerLifecycleSha256: bom.payload.providerLifecycleSha256,
    },
  }
}

export function collectProviderMutationPaths(manifest, authenticatedActiveProviders = null) {
  const records = []
  for (const provider of authenticatedActiveProviders || validateForkManifestProviderSurfaces(manifest)) records.push(...provider.surfaces)
  for (const retirement of manifest?.providerLifecycle?.retiredProviders || []) {
    for (const surface of retirement.surfaces || []) {
      const validated = validateRetiredSurface(surface, `${retirement.id} retired mutation path`)
      records.push({ path: validated.path, kind: validated.kind })
    }
  }
  const byPath = new Map()
  for (const record of records) {
    const key = portableRepositoryPathKey(record.path)
    const prior = byPath.get(key)
    if (prior && (prior.kind !== record.kind || prior.path !== record.path)) throw new Error(`provider mutation path has conflicting portable aliases:${prior.path}:${record.path}`)
    byPath.set(key, record)
  }
  return [...byPath.values()].map(({ path, kind }) => ({ path, kind }))
    .sort((left, right) => compareUtf8Bytes(left.path, right.path))
}

const pathsOverlap = repositoryPathsOverlap
export const CONSUMER_CONTROL_PLANE_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'governance/lock.json',
  'governance/lock.schema.json',
  'scripts/governance-check.mjs',
])
export function consumerControlPlaneAuthority(providerPath) {
  const normalized = normalizeRepositoryRelative(providerPath, 'provider control-plane collision path')
  const rootSegment = normalized.split('/')[0]
  if (/^package[^/]*\.json$/.test(portableRepositoryPathKey(rootSegment))) return rootSegment
  return CONSUMER_CONTROL_PLANE_PATHS.find((reserved) => pathsOverlap(normalized, reserved)) || null
}
const validatedProviderTransitions = new WeakSet()
const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
const certifyProviderTransition = (transition) => {
  deepFreeze(transition)
  validatedProviderTransitions.add(transition)
  return transition
}

const nonProviderTransitionAuthority = (corpus, label) => {
  const consumer = corpus?.manifest?.consumer
  if (!consumer || typeof consumer !== 'object' || Array.isArray(consumer)) {
    throw new Error(`${label} consumer authority is missing`)
  }
  const launcherDestination = normalizeRepositoryRelative(
    consumer.launcherDestination,
    `${label} shared launcher destination`,
  )
  const discoveryPolicy = structuredClone(validateDiscoveryPolicy(corpus?.manifest?.discoveryPolicy, `${label} discovery policy`))
  const launchers = sortedUniqueStrings(corpus?.manifest?.launchers, `${label} shared launcher inventory`)
  for (const [index, name] of launchers.entries()) {
    if (!/^[A-Za-z0-9._-]+\.(?:sh|mjs|py)$/.test(name)) throw new Error(`${label} shared launcher[${index}] is invalid`)
  }

  const managedFiles = consumer.managedFiles
  if (!managedFiles || typeof managedFiles !== 'object' || Array.isArray(managedFiles)) {
    throw new Error(`${label} consumer managed-file authority must be an object`)
  }
  const managedDestinations = Object.keys(managedFiles).map((destination) => {
    const normalized = normalizeRepositoryRelative(destination, `${label} consumer managed-file destination`)
    if (normalized !== destination || typeof managedFiles[destination] !== 'string' || !managedFiles[destination]) {
      throw new Error(`${label} consumer managed-file mapping is invalid:${destination}`)
    }
    return normalized
  }).sort()
  if (managedDestinations.length !== new Set(managedDestinations.map(portableRepositoryPathKey)).size) {
    throw new Error(`${label} consumer managed-file authority has portable aliases`)
  }
  // The authenticated shared-launcher substrate reserves its parent governance namespace too.
  // This lets a later release add exact-hash, non-executable governance data beside governance/bin
  // without claiming a product-owned root or requiring an artificial bootstrap. The protected
  // evidence verifier still rejects every governance/bin/** ordinary-upgrade mutation.
  const managedNamespaceRoots = [
    ...managedDestinations.filter((destination) => destination.includes('/'))
      .map((destination) => destination.split('/').slice(0, -1).join('/')),
    ...(launcherDestination.includes('/') ? [launcherDestination.split('/').slice(0, -1).join('/')] : []),
  ]
    .sort((left, right) => (
      left.split('/').length - right.split('/').length || compareUtf8Bytes(left, right)
    ))
    .filter((candidate, index, values) => !values.slice(0, index).some((root) => {
      const candidateKey = portableRepositoryPathKey(candidate)
      const rootKey = portableRepositoryPathKey(root)
      return candidateKey === rootKey || candidateKey.startsWith(`${rootKey}/`)
    }))
    .sort()

  const requiredScripts = corpus?.bom?.payload?.requiredScripts
  mergeRequiredPackageScripts({ scripts: {} }, requiredScripts)
  const requiredScriptNames = Object.keys(requiredScripts)
  const exactMaterialization = sortedUniqueStrings(
    consumer?.materialization?.exactPaths,
    `${label} exact materialization inventory`,
  ).map((path, index) => normalizeRepositoryRelative(path, `${label} exact materialization[${index}]`))
  const exactMaterializationPaths = new Set(exactMaterialization)
  const ownedMaterialization = [
    ...launchers.map((name) => `${launcherDestination}/${name}`),
    ...managedDestinations,
    'package.json',
  ].sort()
  for (const path of ownedMaterialization) {
    if (!exactMaterializationPaths.has(path)) {
      throw new Error(`${label} materialization inventory omits non-provider authority:${path}`)
    }
  }

  return {
    discoveryPolicy,
    launcherDestination,
    launchers,
    managedDestinations,
    managedNamespaceRoots,
    managedFiles: Object.fromEntries(Object.entries(managedFiles).sort(([left], [right]) => compareUtf8Bytes(left, right))),
    requiredScriptNames,
    requiredScripts: Object.fromEntries(Object.entries(requiredScripts)),
  }
}

const assertMonotonicNonProviderAuthority = (previousCorpus, currentCorpus, { exact }) => {
  const previous = nonProviderTransitionAuthority(previousCorpus, 'previous installed corpus')
  const current = nonProviderTransitionAuthority(currentCorpus, 'incoming installed corpus')
  if (current.launcherDestination !== previous.launcherDestination) {
    throw new Error('ordinary upgrade may not rename the shared launcher destination')
  }
  if (exact) {
    if (JSON.stringify(current) !== JSON.stringify(previous)) {
      throw new Error('same-version refresh is not an exact non-provider lifecycle replay')
    }
    return { previous, current }
  }
  for (const [kind, previousNames, currentNames] of [
    ['shared launcher', previous.launchers, current.launchers],
    ['consumer managed-file authority', previous.managedDestinations, current.managedDestinations],
    ['required package script', previous.requiredScriptNames, current.requiredScriptNames],
  ]) {
    const incoming = new Set(currentNames)
    for (const name of previousNames) {
      if (!incoming.has(name)) {
        throw new Error(`ordinary upgrade may not remove or rename ${kind}; it would leave an orphan:${name}`)
      }
    }
  }
  for (const name of previous.requiredScriptNames) {
    if (current.requiredScripts[name] !== previous.requiredScripts[name]) {
      throw new Error(`ordinary upgrade may not change an existing required package script command; move command evolution through the reviewed bootstrap boundary:${name}`)
    }
  }
  const previousManagedDestinations = new Set(previous.managedDestinations.map(portableRepositoryPathKey))
  for (const destination of current.managedDestinations) {
    const destinationKey = portableRepositoryPathKey(destination)
    if (previousManagedDestinations.has(destinationKey)) continue
    const reserved = previous.managedNamespaceRoots.some((root) => {
      const rootKey = portableRepositoryPathKey(root)
      return destinationKey.startsWith(`${rootKey}/`)
    })
    if (!reserved) {
      throw new Error(
        'ordinary upgrade may not establish consumer managed-file authority in a new product namespace; '
        + `use the reviewed bootstrap boundary:${destination}`,
      )
    }
  }
  for (const key of DISCOVERY_KEYS) {
    const incoming = new Set(current.discoveryPolicy[key].map(portableRepositoryPathKey))
    for (const entry of previous.discoveryPolicy[key]) {
      if (!incoming.has(portableRepositoryPathKey(entry))) {
        throw new Error(`ordinary upgrade may not shrink or rename discovery policy ${key}:${entry}`)
      }
    }
    const previousEntries = new Set(previous.discoveryPolicy[key].map(portableRepositoryPathKey))
    for (const entry of current.discoveryPolicy[key]) {
      if (
        !previousEntries.has(portableRepositoryPathKey(entry))
        && !discoveryPolicyReservesPath(previous.discoveryPolicy, entry)
      ) {
        throw new Error(
          'ordinary upgrade may not establish a new provider discovery namespace; '
          + `use the reviewed bootstrap boundary:${key}:${entry}`,
        )
      }
    }
  }
  return { previous, current }
}

// Ordinary upgrades authenticate both ends of the transition. Provider surfaces may disappear only
// through an exact tombstone. Shared launchers, consumer-managed files, and required package scripts
// are monotonic because the generic materializer updates/adds them but intentionally has no unsigned
// deletion/rename path; accepting a drop would leave stale executable authority in the consumer.
// Historical tombstones are an append-only prefix and same-version repair is an exact replay.
export function validateInstalledProviderTransition(previousCorpus, currentCorpus) {
  const previousLifecycle = previousCorpus?.manifest?.providerLifecycle
  const currentLifecycle = currentCorpus?.manifest?.providerLifecycle
  if (!previousLifecycle || !currentLifecycle) throw new Error('provider transition requires two validated installed corpora')
  for (const [label, corpus, lifecycle] of [
    ['previous', previousCorpus, previousLifecycle],
    ['current', currentCorpus, currentLifecycle],
  ]) {
    if (lifecycle.schemaVersion !== 4) continue
    const snapshotView = snapshotActiveSurfaceView(lifecycle.currentSnapshot)
    const activeView = snapshotActiveSurfaceView({ providers: corpus.activeProviders })
    if (JSON.stringify(snapshotView) !== JSON.stringify(activeView)) {
      throw new Error(`${label} corpus active provider ids/surfaces differ from its authenticated currentSnapshot`)
    }
  }
  const ordering = compareVersion(currentLifecycle.releaseVersion, previousLifecycle.releaseVersion)
  if (ordering < 0) throw new Error('provider transition may not downgrade')
  const nonProviderAuthority = assertMonotonicNonProviderAuthority(previousCorpus, currentCorpus, { exact: ordering === 0 })
  if (ordering === 0) {
    for (const [label, evidence] of [
      ['previous provider corpus evidence', previousCorpus.evidence],
      ['current provider corpus evidence', currentCorpus.evidence],
    ]) {
      exactKeys(evidence, [
        'consumerBomSha256', 'forkCorpusLockSha256', 'manifestSha256',
        'providerLifecycleSha256', 'releaseVersion',
      ], label)
      if (
        !EXACT_SEMVER.test(evidence.releaseVersion || '')
        || evidence.releaseVersion !== currentLifecycle.releaseVersion
        || ![
          evidence.consumerBomSha256,
          evidence.forkCorpusLockSha256,
          evidence.manifestSha256,
          evidence.providerLifecycleSha256,
        ].every((digest) => SHA256.test(digest || ''))
      ) throw new Error(`${label} is invalid or release-mismatched`)
    }
    if (
      JSON.stringify(currentCorpus.evidence) !== JSON.stringify(previousCorpus.evidence)
      ||
      currentLifecycle.currentSnapshotSha256 !== previousLifecycle.currentSnapshotSha256
      || currentLifecycle.currentProviderInventorySha256 !== previousLifecycle.currentProviderInventorySha256
      || JSON.stringify(currentLifecycle.retiredProviders) !== JSON.stringify(previousLifecycle.retiredProviders)
      || JSON.stringify(currentCorpus.activeProviders) !== JSON.stringify(previousCorpus.activeProviders)
    ) throw new Error(`${currentLifecycle.releaseVersion}:same-version provider refresh is not an exact corpus/lifecycle replay`)
    return certifyProviderTransition({
      paths: collectProviderMutationPaths(currentCorpus.manifest, currentCorpus.activeProviders),
      additions: [],
      managedAdditions: [],
      retirements: [],
      mode: 'replay',
    })
  }
  if (currentLifecycle.schemaVersion !== 4) {
    throw new Error(`${currentLifecycle.releaseVersion}:legacy provider lifecycle v3 may be a prior corpus or exact same-version replay, never a new upgrade target`)
  }

  const immutableHeadSurfaceView = snapshotActiveSurfaceView(currentLifecycle.immutableHeadSnapshot)
  const priorActiveSurfaceView = snapshotActiveSurfaceView({ providers: previousCorpus.activeProviders })
  if (JSON.stringify(immutableHeadSurfaceView) !== JSON.stringify(priorActiveSurfaceView)) {
    throw new Error(`${currentLifecycle.releaseVersion}:immutableHeadSnapshot provider ids/surfaces do not exactly match the prior active corpus`)
  }
  if (
    previousLifecycle.schemaVersion === 4
    && JSON.stringify(currentLifecycle.immutableHeadSnapshot) !== JSON.stringify(previousLifecycle.currentSnapshot)
  ) {
    throw new Error(`${currentLifecycle.releaseVersion}:immutableHeadSnapshot is not the exact previous authenticated currentSnapshot`)
  }

  const previousCommon = previousCorpus.manifest?.consumer?.commonInstruction
  const currentCommon = currentCorpus.manifest?.consumer?.commonInstruction
  if (
    !previousCommon
    || !currentCommon
    || currentCommon.destination !== previousCommon.destination
    || currentCommon.materializerId !== previousCommon.materializerId
  ) {
    throw new Error(`${currentLifecycle.releaseVersion}:ordinary upgrade may not rename or rematerialize the common instruction authority`)
  }

  if (currentLifecycle.previousSnapshotSha256 !== previousLifecycle.currentSnapshotSha256) {
    throw new Error(`${currentLifecycle.releaseVersion}:provider transition does not bind immediately previous release ${previousLifecycle.releaseVersion}`)
  }
  if (
    currentLifecycle.immutableHead.releaseVersion !== previousLifecycle.releaseVersion
    || currentLifecycle.immutableHead.snapshotSha256 !== previousLifecycle.currentSnapshotSha256
    || currentLifecycle.immutableHead.providerInventorySha256 !== previousLifecycle.currentProviderInventorySha256
  ) throw new Error(`${currentLifecycle.releaseVersion}:immutable provider head does not bind previous release inventory`)

  const previousHistory = previousLifecycle.retiredProviders
  const currentHistory = currentLifecycle.retiredProviders
  if (currentHistory.length < previousHistory.length || JSON.stringify(currentHistory.slice(0, previousHistory.length)) !== JSON.stringify(previousHistory)) {
    throw new Error(`${currentLifecycle.releaseVersion}:retired provider history is not append-only`)
  }
  const previousById = new Map(currentLifecycle.immutableHeadSnapshot.providers.map((provider) => [provider.id, provider]))
  const currentById = new Map(currentLifecycle.currentSnapshot.providers.map((provider) => [provider.id, provider]))
  for (const [id, previous] of previousById) {
    const current = currentById.get(id)
    if (!current) continue
    const currentKinds = new Map(current.surfaces.map((surface) => [surface.path, surface.kind]))
    for (const surface of previous.surfaces) {
      if (currentKinds.get(surface.path) !== surface.kind) {
        throw new Error(`${currentLifecycle.releaseVersion}:${id} removed or changed ${surface.path} without retiring the provider`)
      }
    }
    const previousSurfacePaths = new Set(previous.surfaces.map((surface) => portableRepositoryPathKey(surface.path)))
    for (const surface of current.surfaces) {
      if (
        !previousSurfacePaths.has(portableRepositoryPathKey(surface.path))
        && !discoveryPolicyReservesPath(previous.discovery, surface.path)
      ) {
        throw new Error(
          `${currentLifecycle.releaseVersion}:${id} added managed surface outside its immutable provider discovery namespace:`
          + `${surface.path}; establish new namespaces through reviewed bootstrap`,
        )
      }
    }
  }
  const removedIds = [...previousById.keys()].filter((id) => !currentById.has(id)).sort()
  const appended = currentHistory.slice(previousHistory.length)
  const appendedIds = appended.map((retirement) => retirement.id).sort()
  if (JSON.stringify(removedIds) !== JSON.stringify(appendedIds)) {
    throw new Error(`${currentLifecycle.releaseVersion}:provider additions/removals do not match appended retirement history`)
  }
  const activeSurfaces = currentLifecycle.currentSnapshot.providers.flatMap((provider) => provider.surfaces.map((surface) => ({ ...surface, providerId: provider.id })))
  for (const retirement of appended) {
    const previous = previousById.get(retirement.id)
    const transfers = retirement.transfers || []
    const partition = [
      ...retirement.surfaces.map(({ path, kind }) => ({ path, kind })),
      ...transfers.map(({ path, kind }) => ({ path, kind })),
    ].sort((left, right) => compareUtf8Bytes(left.path, right.path))
    if (partition.length !== new Set(partition.map((surface) => portableRepositoryPathKey(surface.path))).size || JSON.stringify(partition) !== JSON.stringify(previous.surfaces)) {
      throw new Error(`${retirement.id}:deletion and transfer records do not exactly partition previously managed destinations`)
    }
    const replacement = retirement.replacementProviderId === null ? null : currentById.get(retirement.replacementProviderId)
    if (retirement.replacementProviderId !== null && (!replacement || retirement.replacementProviderId === retirement.id)) {
      throw new Error(`${retirement.id}:replacementProviderId must name a distinct active current provider`)
    }
    if (!replacement && transfers.length) throw new Error(`${retirement.id}:null replacementProviderId cannot transfer surfaces`)
    for (const surface of retirement.surfaces) {
      if (activeSurfaces.some((candidate) => pathsOverlap(candidate.path, surface.path))) {
        throw new Error(`${retirement.id}:deletion tombstone remains owned by an active provider:${surface.path}`)
      }
    }
    for (const surface of transfers) {
      if (!replacement.surfaces.some((candidate) => candidate.path === surface.path && candidate.kind === surface.kind)) {
        throw new Error(`${retirement.id}:transfer is not exactly owned by replacement ${retirement.replacementProviderId}:${surface.path}`)
      }
      if (activeSurfaces.some((candidate) => candidate.providerId !== replacement.id && pathsOverlap(candidate.path, surface.path))) {
        throw new Error(`${retirement.id}:transfer is also owned by a non-replacement provider:${surface.path}`)
      }
    }
    if (
      retirement.retiredInVersion !== currentLifecycle.releaseVersion
      || retirement.priorReleaseVersion !== previousLifecycle.releaseVersion
      || retirement.priorSnapshotSha256 !== previousLifecycle.currentSnapshotSha256
    ) throw new Error(`${retirement.id}:retirement version/origin does not bind the current transition`)
  }
  const previousActivePaths = new Map(currentLifecycle.immutableHeadSnapshot.providers.flatMap((provider) => (
    provider.surfaces.map((surface) => [surface.path, surface.kind])
  )))
  const additions = currentLifecycle.currentSnapshot.providers.flatMap((provider) => provider.surfaces
    .filter((surface) => previousActivePaths.get(surface.path) !== surface.kind)
    .map((surface) => ({ providerId: provider.id, path: surface.path, kind: surface.kind })))
    .sort((left, right) => (
      compareUtf8Bytes(left.path, right.path) || compareUtf8Bytes(left.providerId, right.providerId)
    ))
  for (const addition of additions) {
    if (!discoveryPolicyReservesPath(nonProviderAuthority.previous.discoveryPolicy, addition.path)) {
      throw new Error(
        `${currentLifecycle.releaseVersion}:${addition.providerId} added managed surface outside every previously reviewed provider namespace:`
        + `${addition.path}; establish the namespace through reviewed bootstrap`,
      )
    }
  }
  const previousManagedDestinations = new Set(
    nonProviderAuthority.previous.managedDestinations.map(portableRepositoryPathKey),
  )
  const managedAdditions = nonProviderAuthority.current.managedDestinations
    .filter((destination) => !previousManagedDestinations.has(portableRepositoryPathKey(destination)))
    .sort()
  return certifyProviderTransition({
    paths: collectProviderMutationPaths(currentCorpus.manifest, currentCorpus.activeProviders),
    additions,
    managedAdditions,
    retirements: structuredClone(appended),
    mode: 'upgrade',
  })
}

export function assertUnclaimedManagedAdditions(projectDir, managedAdditions) {
  projectDir = canonicalRepositoryRoot(projectDir)
  if (!Array.isArray(managedAdditions)) throw new Error('managed additions must be a closed array')
  const normalized = managedAdditions.map((destination, index) => {
    const path = normalizeRepositoryRelative(destination, `managed transition addition[${index}]`)
    if (path !== destination) throw new Error(`managed transition addition[${index}] is not canonical`)
    return path
  })
  if (
    JSON.stringify(normalized) !== JSON.stringify([...new Set(normalized)].sort())
    || normalized.length !== new Set(normalized.map(portableRepositoryPathKey)).size
  ) throw new Error('managed additions must be sorted, unique, and portable')
  for (const destination of normalized) {
    const collision = existingPortablePathCollision(projectDir, destination)
    if (collision) {
      throw new Error(`new consumer managed-file target already exists:${destination}`)
    }
    assertNoSymlinkPath(projectDir, join(projectDir, destination), `new consumer managed-file target:${destination}`)
  }
  return normalized
}

const refreshTransactionCapabilities = new WeakSet()
export function authorizeProviderRefreshTransaction({ verifiedCorpus, providerTransition, journalProviderSnapshot }) {
  if (!verifiedCorpus || !providerTransition || !journalProviderSnapshot) throw new Error('provider refresh authorization requires validated corpus, transition, and durable journal snapshot')
  exactKeys(journalProviderSnapshot, ['entries', 'evidence', 'evidenceRoot', 'paths'], 'durable provider journal snapshot')
  if (
    !validatedProviderTransitions.has(providerTransition)
    ||
    JSON.stringify(journalProviderSnapshot.evidence) !== JSON.stringify(verifiedCorpus.evidence)
    || typeof journalProviderSnapshot.evidenceRoot !== 'string'
    || !isAbsolute(journalProviderSnapshot.evidenceRoot)
    || JSON.stringify(journalProviderSnapshot.paths) !== JSON.stringify(providerTransition.paths)
    || !Array.isArray(journalProviderSnapshot.entries)
    || journalProviderSnapshot.entries.length === 0
    || journalProviderSnapshot.entries.length !== providerTransition.paths.length
  ) throw new Error('provider refresh authorization is not bound to the durable journal/corpus path set')
  const backupPaths = new Set()
  for (const [index, entry] of journalProviderSnapshot.entries.entries()) {
    exactKeys(entry, ['backup', 'path', 'present', 'source'], `durable provider journal entry[${index}]`)
    const expectedPath = providerTransition.paths[index].path
    const expectedSource = join(verifiedCorpus.projectDir, expectedPath)
    if (
      entry.path !== expectedPath
      || entry.source !== expectedSource
      || typeof entry.backup !== 'string'
      || !isAbsolute(entry.backup)
      || entry.backup === entry.source
      || typeof entry.present !== 'boolean'
      || backupPaths.has(portableRepositoryPathKey(entry.backup))
    ) throw new Error(`durable provider journal entry[${index}] is not a closed recovery record`)
    backupPaths.add(portableRepositoryPathKey(entry.backup))
  }
  const capability = Object.freeze({ mode: 'durable', verifiedCorpus, providerTransition, journalProviderSnapshot })
  refreshTransactionCapabilities.add(capability)
  return capability
}

// Evidence reconstruction and clean-room tests intentionally mutate only disposable sandboxes and
// therefore have no crash-recovery journal to bind. Keep that authority explicit, project-bound,
// validated, and one-shot rather than weakening the production durable authorizer with fake entries.
export function authorizeDisposableProviderRefreshTransaction({ projectDir, verifiedCorpus, providerTransition }) {
  const disposableRoot = canonicalRepositoryRoot(projectDir)
  if (
    !verifiedCorpus
    || disposableRoot !== verifiedCorpus.projectDir
    || !validatedProviderTransitions.has(providerTransition)
    || JSON.stringify(providerTransition.paths) !== JSON.stringify(collectProviderMutationPaths(verifiedCorpus.manifest))
  ) throw new Error('disposable provider refresh authorization is not bound to its validated sandbox corpus/transition')
  const capability = Object.freeze({
    mode: 'disposable',
    projectDir: disposableRoot,
    verifiedCorpus,
    providerTransition,
  })
  refreshTransactionCapabilities.add(capability)
  return capability
}

// 刷新 projectDir 的接線骨架;回傳 {copied, removed, settingsMerged, skills, commands, agents, codex, governance, managed, codexSkipped, skipped, dryRun}
// opts.dryRun = true → 只計算會做什麼(result 照填),不寫任何檔(§15 dry-run 契約)
export function refreshLaunchers(projectDir, opts = {}) {
  projectDir = canonicalRepositoryRoot(projectDir)
  const dryRun = !!opts.dryRun
  const result = { copied: [], removed: [], retired: [], settingsMerged: false, skills: [], commands: [], agents: [], providers: {}, codex: [], governance: [], managed: [], codexSkipped: [], skipped: null, dryRun }

  // opt-out:fork user 明確不要官方覆蓋骨架
  if (existsSync(join(projectDir, '.github/no-governance-sync'))) {
    result.skipped = 'opt-out(.github/no-governance-sync 存在)'
    return result
  }

  const candidateForkRoot = join(projectDir, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const src = join(candidateForkRoot, 'launchers')
  assertSafeTree(projectDir, src, 'installed launcher corpus', { allowMissing: true })
  if (!existsSync(join(src, 'settings-hooks.json'))) {
    result.skipped = 'launchers 未 ship(npm 套件版本過舊或治理本體未安裝)'
    return result
  }
  const verifiedCorpus = opts.verifiedCorpus || validateInstalledForkCorpus(projectDir)
  const { forkRoot, manifest } = verifiedCorpus
  const providerTransition = opts.providerTransition || validateInstalledProviderTransition(verifiedCorpus, verifiedCorpus)
  if (
    !validatedProviderTransitions.has(providerTransition)
    || JSON.stringify(providerTransition.paths) !== JSON.stringify(collectProviderMutationPaths(manifest))
  ) {
    throw new Error('prepared provider transition does not match the validated installed manifest')
  }
  if (
    !Array.isArray(providerTransition.additions)
    || !Array.isArray(providerTransition.managedAdditions)
    || !Array.isArray(providerTransition.retirements)
  ) {
    throw new Error('prepared provider transition has no closed addition/retirement authorization')
  }
  if (!dryRun) {
    const capability = opts.transactionCapability
    if (
      !refreshTransactionCapabilities.has(capability)
      || capability.verifiedCorpus !== verifiedCorpus
      || capability.providerTransition !== providerTransition
      || !['durable', 'disposable'].includes(capability.mode)
      || (capability.mode === 'disposable' && capability.projectDir !== projectDir)
      || (capability.mode === 'durable' && !capability.journalProviderSnapshot)
    ) throw new Error('provider refresh mutation requires an authorized one-shot transaction capability')
    // One capability authorizes one materialization attempt. Rollback remains sync-all's job.
    refreshTransactionCapabilities.delete(capability)
  }

  // Parse and close-shape the BOM-bound settings migration policy before the first workspace
  // mutation. A malformed generated policy can therefore never leave a partial launcher refresh.
  const canonical = validateCanonicalSettingsWiring(JSON.parse(readFileSync(join(src, 'settings-hooks.json'), 'utf8')), manifest)
  const packageManifestPath = regularUnaliasedFile(projectDir, join(projectDir, 'package.json'), 'consumer package manifest')
  const packageManifestInfo = lstatSync(packageManifestPath)
  const currentPackageManifest = JSON.parse(readFileSync(packageManifestPath, 'utf8'))
  const requiredPackageManifest = mergeRequiredPackageScripts(currentPackageManifest, verifiedCorpus.bom.payload.requiredScripts)
  const packageScriptsChanged = JSON.stringify(currentPackageManifest.scripts || {}) !== JSON.stringify(requiredPackageManifest.scripts)

  // A generic materializer is intentionally future-compatible, but that cannot become authority
  // to adopt an existing product file merely because the candidate added a destination under an
  // already reserved namespace. Every newly claimed managed file must still be absent (including
  // portable case/Unicode aliases) before the first mutation.
  assertUnclaimedManagedAdditions(projectDir, providerTransition.managedAdditions)

  // A newly claimed provider root has no prior consumer ownership proof. An authenticated release
  // may declare the new surface, but it may not silently adopt or clobber a pre-existing product
  // file/tree at that destination. Retained and explicitly transferred surfaces remain governed.
  for (const [index, addition] of providerTransition.additions.entries()) {
    exactKeys(addition, ['kind', 'path', 'providerId'], `provider transition addition[${index}]`)
    validateSurface({ path: addition.path, kind: addition.kind }, `provider transition addition[${index}]`)
    if (!/^[a-z][a-z0-9-]*$/.test(addition.providerId || '')) throw new Error(`provider transition addition[${index}].providerId is invalid`)
    const target = join(projectDir, addition.path)
    const portableCollision = existingPortablePathCollision(projectDir, addition.path)
    if (portableCollision) {
      throw new Error(`new provider surface target already exists:${addition.providerId}:${addition.path}`)
    }
    assertNoSymlinkPath(projectDir, target, `new provider surface target:${addition.providerId}:${addition.path}`)
  }

  // Resolve and validate every closed-tree source/target before the first provider mutation. The
  // installed manifest and corpus lock authorize the mapping; filesystem aliases may not redirect
  // either side outside its authenticated root.
  const productTreePlans = new Map()
  for (const [providerId, surface] of Object.entries(manifest.providerSurfaces).sort(([a], [b]) => compareUtf8Bytes(a, b))) {
    if (!surface.generated) continue
    for (const tree of surface.trees) {
      if (!safeRelative(forkRoot, tree.artifactRoot) || !safeRelative(projectDir, tree.destination)) {
        throw new Error(`unsafe ${providerId} product managed tree mapping:${tree.destination} <- ${tree.artifactRoot}`)
      }
      const source = join(forkRoot, tree.artifactRoot)
      const target = join(projectDir, tree.destination)
      assertSafeTree(projectDir, source, `${providerId} product managed tree ${tree.name} source`)
      if (!lstatSync(source).isDirectory()) throw new Error(`${providerId} product managed tree source is not a directory:${tree.name}`)
      assertNoSymlinkPath(projectDir, target, `${providerId} product managed tree ${tree.name} target`)
      if (pathEntryExists(target)) assertSafeTree(projectDir, target, `${providerId} product managed tree ${tree.name} target`)
      productTreePlans.set(`${providerId}/${tree.name}`, { source, target, destination: tree.destination })
    }
  }

  // A provider rename/removal is an authenticated migration, not an inference from missing current
  // records. Only exact versioned tombstones in the installed corpus may delete old destinations.
  const retirementPlan = []
  for (const retired of providerTransition.retirements) {
    for (const surface of retired.surfaces) {
      const validated = validateRetiredSurface(surface, `${retired.id} authenticated tombstone`)
      if (pathsOverlap(validated.path, manifest.consumer.commonInstruction.destination)) {
        throw new Error(`${retired.id}:provider tombstone may not delete the common instruction authority`)
      }
      if (!safeRelative(projectDir, validated.path)) throw new Error(`unsafe retired provider tombstone:${retired.id}:${validated.path}`)
      const target = join(projectDir, validated.path)
      if (!pathEntryExists(target)) continue
      assertNoSymlinkPath(projectDir, target, `retired provider tombstone ${validated.path}`, { allowMissing: false })
      const info = lstatSync(target)
      if ((validated.kind === 'file' && !info.isFile()) || (validated.kind === 'tree' && !info.isDirectory())) {
        throw new Error(`retired provider tombstone kind mismatch:${validated.path}:${validated.kind}`)
      }
      if (validated.kind === 'tree') assertSafeTree(projectDir, target, `retired provider tombstone ${validated.path}`)
      const actualDigest = providerSurfaceDigest(projectDir, validated)
      if (actualDigest !== validated.sha256) {
        throw new Error(`retired provider tombstone content differs from immutable prior artifact:${retired.id}:${validated.path}`)
      }
      retirementPlan.push({ ...validated, target })
    }
  }
  // Validate the complete authenticated deletion plan before deleting its first path. A malformed
  // later record can therefore never leave an earlier provider half-retired.
  if (!dryRun && packageScriptsChanged) {
    atomicReplaceRepositoryFile(projectDir, packageManifestPath, JSON.stringify(requiredPackageManifest, null, 2) + '\n', {
      mode: packageManifestInfo.mode & 0o777,
      label: 'consumer package governance scripts',
    })
  }
  for (const surface of retirementPlan) {
    if (!dryRun) rmSync(surface.target, { recursive: surface.kind === 'tree', force: false })
    result.retired.push(surface.path)
  }

  // 1. Materialize one provider-neutral launcher tree. Provider configs may reference it, but no
  // provider owns it; retiring `.claude` therefore cannot delete Codex/future runtime dependencies.
  const launcherDestination = normalizeRepositoryRelative(manifest.consumer.launcherDestination, 'shared launcher destination')
  const launcherDir = join(projectDir, launcherDestination)
  assertNoSymlinkPath(projectDir, launcherDir, 'shared launcher directory')
  if (!dryRun) {
    mkdirSync(launcherDir, { recursive: true })
    assertNoSymlinkPath(projectDir, launcherDir, 'shared launcher directory', { allowMissing: false })
  }
  const launcherFiles = readdirSync(src).filter((f) => f.endsWith('.sh') || f.endsWith('.mjs') || f.endsWith('.py')).sort()
  if (JSON.stringify(launcherFiles) !== JSON.stringify(manifest.launchers)) {
    throw new Error('installed launcher artifact tree differs from its closed manifest inventory')
  }
  for (const f of launcherFiles) {
    if (!dryRun) safeCopyFile({ sourceRoot: projectDir, source: join(src, f), targetRoot: projectDir, target: join(launcherDir, f), label: `launcher ${f}` })
    result.copied.push(f)
  }
  // 2. Idempotently merge every registered template-backed hook surface.  The policy inventory,
  // materializer and base-template plugin are all manifest/corpus facts; provider ids never select
  // implementation behavior.
  for (const [mergeProviderId, policy] of Object.entries(canonical.surfaces).sort(([a], [b]) => compareUtf8Bytes(a, b))) {
    const settingsRelative = normalizeRepositoryRelative(policy.hookDestination, `${mergeProviderId} template-backed hook destination`)
    const settingsPath = join(projectDir, settingsRelative)
    const canonicalHookPath = join(forkRoot, policy.hookArtifact)
    assertNoSymlinkPath(projectDir, settingsPath, settingsRelative)
    assertNoSymlinkPath(projectDir, canonicalHookPath, `${mergeProviderId} canonical hook artifact`, { allowMissing: false })
    const canonicalConfig = JSON.parse(readFileSync(canonicalHookPath, 'utf8'))
    const currentSettings = existsSync(settingsPath) ? parseJsonc(readFileSync(settingsPath, 'utf8'), settingsRelative) : {}
    const merged = mergeProviderHookSettings({
      settings: currentSettings,
      canonicalConfig,
      policy,
      label: `${mergeProviderId} ${settingsRelative}`,
    })
    for (const retiredId of merged.retiredIds) if (!result.removed.includes(retiredId)) result.removed.push(retiredId)
    if (!dryRun) {
      atomicReplaceRepositoryFile(projectDir, settingsPath, JSON.stringify(merged.settings, null, 2) + '\n', {
        mode: 0o600,
        label: settingsRelative,
      })
    }
    result.settingsMerged = true
  }

  // 3. Materialize only registry-declared legacy discovery leaves. Their exact destinations are
  // provider lifecycle surfaces, so retiring the owning provider removes them and this phase cannot
  // resurrect a provider-specific commands/agents tree.
  for (const category of manifest.consumer.compatibilityCategories) {
    for (const name of category.entries) {
      const source = join(forkRoot, category.artifactRoot, name)
      const destination = join(projectDir, category.destinationRoot, name)
      if (!dryRun) safeCopyFile({ sourceRoot: projectDir, source, targetRoot: projectDir, target: destination, label: `${category.name}/${name}` })
      result[category.name].push(name)
    }
  }

  // Materialize every BOM-enforced body from the exact installed corpus. This is deliberately
  // generic: a future release may add a managed file without requiring an older consumer's
  // sync-all implementation to know that filename. Product-owned files are never in this map.
  for (const [destination, artifact] of Object.entries(manifest?.consumer?.managedFiles || {}).sort(([a], [b]) => compareUtf8Bytes(a, b))) {
    if (!safeRelative(projectDir, destination) || !safeRelative(forkRoot, artifact)) {
      throw new Error(`unsafe consumer managed-file mapping:${destination} <- ${artifact}`)
    }
    const source = join(forkRoot, artifact)
    const target = join(projectDir, destination)
    if (!dryRun) safeCopyFile({
      sourceRoot: projectDir,
      source,
      targetRoot: projectDir,
      target,
      label: `consumer managed body ${destination}`,
    })
    result.managed.push(destination)
  }

  // The shared instruction is materialized once from its consumer-owned artifact. A provider using
  // shared-instruction-v1 only references this destination; provider refresh and retirement never
  // own, duplicate, or delete it.
  const commonInstruction = manifest.consumer.commonInstruction
  const commonSource = join(forkRoot, commonInstruction.artifact)
  const commonDestination = join(projectDir, commonInstruction.destination)
  if (!dryRun) safeCopyFile({
    sourceRoot: projectDir,
    source: commonSource,
    targetRoot: projectDir,
    target: commonDestination,
    label: 'common instruction authority',
  })
  result.governance.push(commonInstruction.destination)

  // 4. Provider surfaces—the installed manifest is the inventory. New providers materialize
  // without adding another provider-id branch here. The template-backed hook view is merged above so
  // consumer-owned non-governance hooks survive; all other declared hook views are exact generated
  // files. Skills clobber only the governance-owned names listed by the manifest.
  if (manifest?.providerSurfaces) {
    for (const [providerId, surface] of Object.entries(manifest.providerSurfaces).sort(([a], [b]) => compareUtf8Bytes(a, b))) {
      result.providers[providerId] = { installed: [], exclusions: surface.exclusions || [] }
      if (!surface.generated) continue
      const hookMaterializer = surface.hookMaterializerId
        ? resolveManifestMaterializer(manifest, 'hookViews', surface.hookMaterializerId, `${providerId}.hookMaterializerId`)
        : null
      const instructionMaterializer = resolveManifestMaterializer(
        manifest,
        'instructionViews',
        surface.instructionMaterializerId,
        `${providerId}.instructionMaterializerId`,
      )
      const mappings = [
        ...(instructionMaterializer.engine === 'shared-instruction-v1'
          ? []
          : [['instruction', surface.instructionArtifact, surface.instructionDestination]]),
        ...(surface.hookArtifact && surface.hookDestination && hookMaterializer?.mergeStrategy === 'replace-document-v1'
          ? [['hook', surface.hookArtifact, surface.hookDestination]]
          : []),
      ]
      for (const [kind, sourceRel, destination] of mappings) {
        if (!safeRelative(forkRoot, sourceRel) || !safeRelative(projectDir, destination)) throw new Error(`unsafe ${providerId} ${kind} mapping:${destination} <- ${sourceRel}`)
        const source = join(forkRoot, sourceRel)
        if (!existsSync(source)) throw new Error(`${providerId} ${kind} artifact missing:${sourceRel}`)
        if (!dryRun) safeCopyFile({ sourceRoot: projectDir, source, targetRoot: projectDir, target: join(projectDir, destination), label: `${providerId} ${kind} adapter` })
        result.providers[providerId].installed.push(destination)
        if (providerId === 'codex') result.codex.push(destination)
      }
      if (hookMaterializer?.mergeStrategy === 'merge-hook-map-into-base-v1') result.providers[providerId].installed.push(surface.hookDestination)
      for (const name of surface.skills || []) {
        const sourceRel = `${surface.skillArtifactRoot}/${name}`
        const destination = `${surface.skillDestination}/${name}`
        if (!safeRelative(forkRoot, sourceRel) || !safeRelative(projectDir, destination)) throw new Error(`unsafe ${providerId} skill mapping:${destination} <- ${sourceRel}`)
        const source = join(forkRoot, sourceRel)
        if (!existsSync(source)) throw new Error(`${providerId} skill artifact missing:${sourceRel}`)
        if (!dryRun) safeReplaceTree({ sourceRoot: projectDir, source, targetRoot: projectDir, target: join(projectDir, destination), label: `${providerId} skill ${name}` })
        result.providers[providerId].installed.push(destination)
        if (!result.skills.includes(name)) result.skills.push(name)
        if (providerId === 'codex') result.codex.push(destination)
      }
      for (const tree of surface.trees) {
        const plan = productTreePlans.get(`${providerId}/${tree.name}`)
        if (!plan) throw new Error(`${providerId} product managed tree has no validated materialization plan:${tree.name}`)
        if (!dryRun) safeReplaceTree({
          sourceRoot: projectDir,
          source: plan.source,
          targetRoot: projectDir,
          target: plan.target,
          label: `${providerId} product managed tree ${tree.name}`,
        })
        result.providers[providerId].installed.push(plan.destination)
        if (providerId === 'codex') result.codex.push(plan.destination)
      }
    }
  } else if (manifest?.codex) {
    // Immutable older releases did not yet contain providerSurfaces. Keep a bounded compatibility
    // reader so exact upgrades from them can reach the first provider-neutral release.
    const codexMeta = manifest.codex
    if (codexMeta.agentsMd && codexMeta.instructionDestination && existsSync(join(forkRoot, codexMeta.agentsMd))) {
      if (!dryRun) safeCopyFile({ sourceRoot: projectDir, source: join(forkRoot, codexMeta.agentsMd), targetRoot: projectDir, target: join(projectDir, codexMeta.instructionDestination), label: 'legacy common instruction adapter' })
      result.codex.push(codexMeta.instructionDestination)
    }
    if ((codexMeta.hooksJson || []).length && codexMeta.hookArtifact && codexMeta.hookDestination && existsSync(join(forkRoot, codexMeta.hookArtifact))) {
      if (!dryRun) safeCopyFile({ sourceRoot: projectDir, source: join(forkRoot, codexMeta.hookArtifact), targetRoot: projectDir, target: join(projectDir, codexMeta.hookDestination), label: 'legacy provider hook adapter' })
      result.codex.push(codexMeta.hookDestination)
    }
    for (const name of codexMeta.agentsSkills || []) {
      const source = join(forkRoot, codexMeta.skillArtifactRoot, name)
      if (!existsSync(source)) continue
      const destination = `${codexMeta.skillDestination}/${name}`
      if (!dryRun) safeReplaceTree({ sourceRoot: projectDir, source, targetRoot: projectDir, target: join(projectDir, destination), label: `legacy provider skill ${name}` })
      result.codex.push(destination)
    }
  }

  // 5. Immutable consumer BOM/schema. These two paths are governance-owned generated views;
  // local product policy belongs in governance/overlay.md and is never touched here.
  if (manifest?.consumer) {
    for (const [sourceKey, destination] of [['governanceLock', 'lock.json'], ['governanceLockSchema', 'lock.schema.json']]) {
      const sourceRel = manifest.consumer[sourceKey]
      if (!sourceRel || !existsSync(join(forkRoot, sourceRel))) continue
      if (!dryRun) {
        safeCopyFile({ sourceRoot: projectDir, source: join(forkRoot, sourceRel), targetRoot: projectDir, target: join(projectDir, 'governance', destination), label: `governance/${destination}` })
      }
      result.governance.push(`governance/${destination}`)
    }
    const checkerSource = manifest.consumer.governanceCheck
    if (checkerSource && existsSync(join(forkRoot, checkerSource))) {
      const checkerDestination = join(projectDir, 'scripts/governance-check.mjs')
      if (!dryRun) {
        safeCopyFile({
          sourceRoot: projectDir,
          source: join(forkRoot, checkerSource),
          targetRoot: projectDir,
          target: checkerDestination,
          label: 'governance checker',
          mode: 0o755,
        })
      }
      result.governance.push('scripts/governance-check.mjs')
    }
    // providerSurfaces installs every instruction. Only older immutable corpora need the legacy
    // consumer.claudeMd fallback.
    if (!manifest.providerSurfaces) {
      const claudeSource = manifest.consumer.claudeMd
      if (claudeSource && existsSync(join(forkRoot, claudeSource))) {
        if (!dryRun) safeCopyFile({ sourceRoot: projectDir, source: join(forkRoot, claudeSource), targetRoot: projectDir, target: join(projectDir, claudeSource), label: 'legacy provider instruction adapter' })
        result.governance.push(claudeSource)
      }
    }
  }
  result.skills.sort()
  return result
}

// 允許直接 `node scripts/refresh-fork-launchers.mjs [--dry-run] [--json]`(inject hook self-heal 用);
// 被 import(sync-all)時不執行。--dry-run 只算不寫;--json 輸出 machine-readable 結果(§15 契約)。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const apply = process.argv.includes('--apply')
  if (apply) {
    console.error('refresh-fork-launchers: --apply requires the durable sync-all transaction; run sync-all --apply --to <exact-version>')
    process.exit(2)
  }
  const dryRun = true
  const asJson = process.argv.includes('--json')
  const r = refreshLaunchers(process.cwd(), { dryRun })
  if (asJson) console.log(JSON.stringify(r))
  else if (r.skipped) console.log(`refresh-fork-launchers: skip(${r.skipped})`)
  else console.log(`refresh-fork-launchers${dryRun ? '(dry-run)' : ''}: launchers ${r.copied.length} / skills ${(r.skills || []).length} / codex ${(r.codex || []).length} / settings ${r.settingsMerged ? 'merged' : '-'}`)
}
