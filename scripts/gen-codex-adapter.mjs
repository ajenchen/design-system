#!/usr/bin/env node
// Legacy filename, provider-neutral implementation. Canonical content lives under
// packages/design-system/ds-canonical; every provider surface is a deterministic adapter view.

import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  compareUtf8Bytes,
  hasUsableVersionedTranscript,
  validateHookRegistrations,
  validateProviderRegistryDocument,
  validateProviderSkillSemanticsDocument,
  projectProviderNativeEvent,
  resolveProviderMaterializer,
} from './lib/provider-contract-validation.mjs'
import {
  CLAUDE_PERMISSION_POLICY_SOURCE,
  CLAUDE_PERMISSION_POLICY_SCHEMA,
  assertClaudePermissionMaterialization,
  readClaudePermissionPolicy,
} from './lib/claude-permission-policy.mjs'
import {
  EXACT_REVIEW_CERTIFICATION_CONTRACT,
  PORTABLE_REVIEW_EXCHANGE_CORE,
  resolveProviderHookEligibility,
  resolveProviderReviewBinding,
} from '../packages/governance/src/provider-review-binding.mjs'
import {
  buildProviderHookGroupLaunchArgv,
  buildProviderHookLaunchArgv,
} from './lib/provider-hook-output-transport.mjs'

export { buildProviderDiscoveryPolicy, buildProviderLifecycle, projectProviderNativeEvent, resolveProviderMaterializer } from './lib/provider-contract-validation.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_PATH = join(ROOT, 'packages/governance/canonical/providers.json')
const SEMANTICS_PATH = join(ROOT, 'scripts/provider-skill-semantics.json')
export const PROVIDER_HOOK_COVERAGE_PATH = 'generated/governance/provider-hook-coverage.json'

const SEMANTIC_LEAK_PATTERNS = Object.freeze({
  'provider-identity': /(?:anthropic|claude(?:\s+code)?|codex)/giu,
  'provider-surface-path': /(?:~\/)?\.(?:claude|agents)(?:\/|\\)|\b(?:CLAUDE|AGENTS)\.md\b/gu,
  'provider-native-tool': /\b(?:Agent|Task|Skill)\s+tool\b|\brun_in_background\b|\bAskUserQuestion\b|\bspawn_agent\b|\bexec_command\b|\bapply_patch\b/giu,
  'provider-native-env': /\b(?:CLAUDE|CODEX)_[A-Z0-9_]+\b/gu,
  'provider-transport': /@codex\b|\bcodex\s+(?:exec|review)\b|\bmcp__[A-Za-z0-9_]+\b|\bcodex-run-[A-Za-z0-9_.-]+/giu,
})

const PROVIDER_VIEW_AUTHORITY_OR_ACTION = /\b(?:ssot|canonical(?:\s+(?:source|owner|home))?|authorit(?:y|ative)|source\s+of\s+truth|semantic\s+owner|edit|modify|write|update|add|create|scaffold|generate|materiali[sz]e|run|execute|invoke|read|scan|enumerate|grep|sync|copy|mirror)\b|(?:真源|權威|單一真相|唯一(?:語意|規則)?來源|編輯|修改|寫入|新增|建立|產生|執行|運行|讀取|掃描|列舉|枚舉|同步|複製|鏡像|修行為|落地)/iu
const EXPLICIT_GENERATED_PROJECTION = /\b(?:generated|materiali[sz]ed|derived)\b.{0,80}\b(?:delivery|discovery|compatibility|provider)?\s*(?:view|projection|surface)\b|\b(?:delivery|discovery|compatibility|provider)\s+(?:view|projection|surface)\b|(?:產生|生成|衍生).{0,40}(?:交付|探索|相容|供應商)?(?:檢視|投影|介面)/iu
const EXPLICIT_NON_AUTHORITY = /\b(?:not|never|isn't|is\s+not|must\s+not|cannot|can't|do\s+not|don't)\b.{0,80}\b(?:ssot|canonical|authorit(?:y|ative)|source\s+of\s+truth|semantic\s+owner|edit|modify|write)\b|(?:不是|非|不可|不得|禁止).{0,60}(?:SSOT|canonical|authority|權威|真源|語意來源|編輯|修改|寫入)/iu

const posix = (value) => value.split('\\').join('/')
const sha16 = (body) => createHash('sha256').update(body).digest('hex').slice(0, 16)
const sha256 = (body) => `sha256:${createHash('sha256').update(body).digest('hex')}`
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))

function contractJson(path, label, root = ROOT) {
  assertNoSymlinkComponents(root, path, label)
  const info = existsSync(path) ? lstatSync(path) : null
  if (!info || info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
    throw new Error(`${label} must exist as one regular unaliased no-symlink file`)
  }
  return json(path)
}

function repositoryPath(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty repository-relative POSIX path`)
  }
  const segments = value.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} must not contain empty, dot, or traversal segments`)
  }
  return value
}

function resolveContained(root, repositoryRelativePath, label) {
  repositoryPath(repositoryRelativePath, label)
  const base = resolve(root)
  const absolute = resolve(base, repositoryRelativePath)
  const rel = relative(base, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes or aliases the declared repository root`)
  }
  return absolute
}

function assertNoSymlinkComponents(root, target, label) {
  const base = resolve(root)
  if (!existsSync(base)) throw new Error(`${label} declared root does not exist`)
  const baseStat = lstatSync(base)
  if (baseStat.isSymbolicLink() || !baseStat.isDirectory()) throw new Error(`${label} declared root must be a real directory, not a symbolic link`)
  const absolute = resolve(target)
  const rel = relative(base, absolute)
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes the declared root`)
  }
  let cursor = base
  for (const segment of rel.split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, segment)
    if (!existsSync(cursor)) break
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} crosses a symbolic link:${posix(relative(base, cursor))}`)
  }
}

function pathEntryExists(path) {
  try { lstatSync(path); return true }
  catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

// Provider views are generated into attacker-editable working trees. Never write through an
// existing destination inode: it may be a hard link to a file outside outputRoot. Stage a fresh,
// single-link inode beside the destination, durably flush it, then atomically replace the name.
function atomicWriteProviderTarget({ outputRoot, target, content, mode, label }) {
  const root = resolve(outputRoot)
  const absolute = resolve(target)
  assertNoSymlinkComponents(root, absolute, label)
  mkdirSync(dirname(absolute), { recursive: true })
  assertNoSymlinkComponents(root, dirname(absolute), `${label} parent`)
  const temporary = `${absolute}.tmp-${process.pid}-${randomUUID()}`
  assertNoSymlinkComponents(root, temporary, `${label} temporary path`)
  let descriptor = null
  let parentDescriptor = null
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    writeFileSync(descriptor, content)
    fchmodSync(descriptor, mode & 0o777)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    assertNoSymlinkComponents(root, dirname(absolute), `${label} parent before replace`)
    const temporaryInfo = lstatSync(temporary)
    if (!temporaryInfo.isFile() || temporaryInfo.isSymbolicLink() || temporaryInfo.nlink !== 1) {
      throw new Error(`${label} temporary path must remain one regular unaliased file`)
    }
    renameSync(temporary, absolute)
    parentDescriptor = openSync(dirname(absolute), 'r')
    fsyncSync(parentDescriptor)
    closeSync(parentDescriptor)
    parentDescriptor = null
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (parentDescriptor !== null) closeSync(parentDescriptor)
    if (pathEntryExists(temporary)) rmSync(temporary, { force: true })
  }
}

function walkFiles(directory, { root = directory, label = 'managed tree' } = {}) {
  const files = []
  if (!existsSync(directory)) return files
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const absolute = join(current, name)
      const stat = lstatSync(absolute)
      if (stat.isSymbolicLink()) throw new Error(`${label} contains a symbolic link:${posix(relative(root, absolute))}`)
      if (stat.isDirectory()) {
        if (name.startsWith('.') || ['logs', 'tmp', 'temp', 'node_modules'].includes(name)) {
          throw new Error(`${label} contains a forbidden runtime/dot directory:${posix(relative(root, absolute))}`)
        }
        visit(absolute)
      }
      else if (name.startsWith('.') && name !== '.gitkeep') throw new Error(`${label} contains a forbidden dot artifact:${posix(relative(root, absolute))}`)
      else if (stat.isFile() && stat.nlink === 1) files.push(absolute)
      else if (stat.isFile()) throw new Error(`${label} contains a hard-link alias:${posix(relative(root, absolute))}`)
      else throw new Error(`${label} contains an unsupported filesystem entry:${posix(relative(root, absolute))}`)
    }
  }
  if (lstatSync(directory).isSymbolicLink()) throw new Error(`${label} root is a symbolic link`)
  visit(directory)
  return files
}

function readTarget(path, source) {
  const body = readFileSync(source)
  return { path, content: body, mode: statSync(source).mode & 0o777, source }
}

export function materializeProviderInstruction({ provider, registry = PROVIDER_REGISTRY, sourceRoot = ROOT } = {}) {
  if (!provider?.adapter?.instructionView) throw new Error(`${provider?.id || '<missing>'}:instructionView is missing => ADAPTER-BLOCKED`)
  const materializer = resolveProviderMaterializer(
    registry,
    'instructionViews',
    provider.adapter.instructionView.materializerId,
    `${provider.id}.adapter.instructionView.materializerId`,
  )
  if (materializer.engine === 'shared-instruction-v1') {
    if (provider.instructionEntry !== provider.sharedInstructionEntry || provider.adapter.repositoryInstructionSource !== null) {
      throw new Error(`${provider.id}:shared instruction materializer must bind the shared entry without a supplement => ADAPTER-BLOCKED`)
    }
    return null
  }
  if (materializer.engine !== 'markdown-relative-at-import-v1') {
    throw new Error(`${provider.id}:unsupported instruction materializer engine:${materializer.engine} => ADAPTER-BLOCKED`)
  }
  if (provider.instructionEntry === provider.sharedInstructionEntry) {
    throw new Error(`${provider.id}:relative-import instruction materializer requires a distinct destination => ADAPTER-BLOCKED`)
  }
  const importPath = posix(relative(dirname(provider.instructionEntry), provider.sharedInstructionEntry))
  if (!importPath || importPath.includes('\0') || importPath.includes('\n') || importPath.includes('\r')) {
    throw new Error(`${provider.id}:relative instruction import path is unsafe => ADAPTER-BLOCKED`)
  }
  let supplement = ''
  let source = provider.sharedInstructionEntry
  if (provider.adapter.repositoryInstructionSource !== null) {
    source = provider.adapter.repositoryInstructionSource
    const sourcePath = resolveContained(sourceRoot, source, `${provider.id}.adapter.repositoryInstructionSource`)
    assertNoSymlinkComponents(sourceRoot, sourcePath, `${provider.id}.adapter.repositoryInstructionSource`)
    const sourceInfo = existsSync(sourcePath) ? lstatSync(sourcePath) : null
    if (!sourceInfo || sourceInfo.isSymbolicLink() || !sourceInfo.isFile() || sourceInfo.nlink !== 1) {
      throw new Error(`${provider.id}:repository instruction supplement must be one regular unaliased no-symlink file => ADAPTER-BLOCKED`)
    }
    supplement = readFileSync(sourcePath, 'utf8')
    if (/^\s*@[A-Za-z0-9_./@-]+\.md\s*$/mu.test(supplement)) {
      throw new Error(`${provider.id}:repository instruction supplement may not embed an import directive => ADAPTER-BLOCKED`)
    }
  } else if (materializer.supplementPolicy === 'required') {
    throw new Error(`${provider.id}:instruction materializer requires a repository instruction supplement => ADAPTER-BLOCKED`)
  }
  return {
    content: Buffer.from(`@${importPath}\n${supplement ? `\n${supplement}` : ''}`),
    mode: 0o644,
    source,
  }
}

export function materializeProductInstruction({
  provider,
  registry = PROVIDER_REGISTRY,
  sourceRoot = ROOT,
  sharedBody,
} = {}) {
  if (typeof sharedBody !== 'string' && !Buffer.isBuffer(sharedBody)) {
    throw new Error(`${provider?.id || '<missing>'}:product common instruction body is unavailable => ADAPTER-BLOCKED`)
  }
  const materializer = resolveProviderMaterializer(
    registry,
    'instructionViews',
    provider?.adapter?.instructionView?.materializerId,
    `${provider?.id || '<missing>'}.adapter.instructionView.materializerId`,
  )
  if (materializer.engine === 'shared-instruction-v1') {
    if (provider.instructionEntry !== provider.sharedInstructionEntry || provider.adapter.repositoryInstructionSource !== null) {
      throw new Error(`${provider.id}:shared product instruction must consume the common authority without claiming a provider projection => ADAPTER-BLOCKED`)
    }
    return Buffer.isBuffer(sharedBody) ? Buffer.from(sharedBody) : Buffer.from(sharedBody)
  }
  if (materializer.engine !== 'markdown-relative-at-import-v1') {
    throw new Error(`${provider.id}:unsupported product instruction materializer engine:${materializer.engine} => ADAPTER-BLOCKED`)
  }
  if (provider.instructionEntry === provider.sharedInstructionEntry) {
    throw new Error(`${provider.id}:relative product instruction import requires a distinct destination => ADAPTER-BLOCKED`)
  }
  const importPath = posix(relative(dirname(provider.instructionEntry), provider.sharedInstructionEntry))
  if (!importPath || importPath.includes('\0') || importPath.includes('\n') || importPath.includes('\r')) {
    throw new Error(`${provider.id}:relative product instruction import path is unsafe => ADAPTER-BLOCKED`)
  }
  if (!provider.adapter.productInstructionSource) {
    throw new Error(`${provider.id}:relative product instruction materializer requires a supplement source => ADAPTER-BLOCKED`)
  }
  const sourcePath = resolveContained(sourceRoot, provider.adapter.productInstructionSource, `${provider.id}.adapter.productInstructionSource`)
  assertNoSymlinkComponents(sourceRoot, sourcePath, `${provider.id}.adapter.productInstructionSource`)
  const sourceInfo = existsSync(sourcePath) ? lstatSync(sourcePath) : null
  if (!sourceInfo || sourceInfo.isSymbolicLink() || !sourceInfo.isFile() || sourceInfo.nlink !== 1) {
    throw new Error(`${provider.id}:product instruction supplement must be one regular unaliased no-symlink file => ADAPTER-BLOCKED`)
  }
  const supplement = readFileSync(sourcePath, 'utf8')
  if (/^\s*@[A-Za-z0-9_./@-]+\.md\s*$/mu.test(supplement)) {
    throw new Error(`${provider.id}:product instruction supplement may not embed an import directive => ADAPTER-BLOCKED`)
  }
  return Buffer.from(`@${importPath}\n${supplement ? `\n${supplement}` : ''}`)
}

export function validateProviderRegistry(registry, { sourceRoot = ROOT } = {}) {
  validateProviderRegistryDocument(registry)
  for (const [name, value] of Object.entries(registry.canonical.roots)) repositoryPath(value, `canonical.roots.${name}`)
  repositoryPath(registry.canonical.hookRegistrations, 'canonical.hookRegistrations')
  repositoryPath(registry.canonical.skillSemantics, 'canonical.skillSemantics')
  repositoryPath(registry.canonical.productSharedInstructionSource, 'canonical.productSharedInstructionSource')
  const ids = new Set()
  for (const provider of registry.providers) {
    if (!provider?.id || ids.has(provider.id)) throw new Error(`provider id missing or duplicated:${provider?.id || '<empty>'}`)
    ids.add(provider.id)
    const adapter = provider.adapter
    if (!adapter || typeof adapter.generate !== 'boolean') throw new Error(`${provider.id}:adapter binding is missing`)
    if (adapter.repositoryInstructionSource !== null) repositoryPath(adapter.repositoryInstructionSource, `${provider.id}.adapter.repositoryInstructionSource`)
    if (adapter.productInstructionSource !== null) repositoryPath(adapter.productInstructionSource, `${provider.id}.adapter.productInstructionSource`)
    if (adapter.generate && adapter.productInstructionSource === null) throw new Error(`${provider.id}:generated adapter requires a productInstructionSource`)
    if (adapter.generate && adapter.skillView === null) throw new Error(`${provider.id}:generated adapter requires a registered skillView so canonical skills cannot silently disappear`)
    if (!adapter.generate && adapter.repositoryInstructionSource !== null) throw new Error(`${provider.id}:disabled adapter must not declare a repositoryInstructionSource`)
    if (!adapter.generate && adapter.productInstructionSource !== null) throw new Error(`${provider.id}:disabled adapter must not declare a productInstructionSource`)
    if (adapter.generate && !adapter.skillView && !adapter.hookView && !Object.keys(adapter.repositoryManagedTrees || {}).length) {
      throw new Error(`${provider.id}:generated adapter has no declared output`)
    }
    if (!adapter.generate && !(adapter.exclusions || []).length) {
      throw new Error(`${provider.id}:disabled adapter requires a machine-readable exclusion`)
    }
    for (const field of ['instructionEntry', 'sharedInstructionEntry', 'skillDirectory']) repositoryPath(provider[field], `${provider.id}.${field}`)
    for (const field of ['hookConfig', 'hookEntrypoint']) if (provider[field] !== null) repositoryPath(provider[field], `${provider.id}.${field}`)
    if (provider.runtime) {
      repositoryPath(provider.runtime.cli.localExecutable, `${provider.id}.runtime.cli.localExecutable`)
      if (provider.runtime.memorySyncScript !== null) repositoryPath(provider.runtime.memorySyncScript, `${provider.id}.runtime.memorySyncScript`)
      if (provider.runtime.transcript.fixture !== null) repositoryPath(provider.runtime.transcript.fixture, `${provider.id}.runtime.transcript.fixture`)
      const transcript = provider.runtime.transcript
      if (transcript.contract && !hasUsableVersionedTranscript(transcript)) {
        throw new Error(`${provider.id}:versioned transcript contract requires a committed fixture and bounded validated-tail access`)
      }
      if (!transcript.contract && (transcript.fixture !== null || transcript.access !== null || transcript.stability === 'tested-versioned')) {
        throw new Error(`${provider.id}:unversioned transcript cannot expose a fixture, tested stability, or trusted access strategy`)
      }
    }
    if (provider.adapter.generate && provider.capabilities.nativeHooks && !provider.runtime) {
      throw new Error(`${provider.id}:native hook adapter requires provider runtime metadata`)
    }
    for (const [name, value] of Object.entries(adapter.repositoryManagedTrees || {})) repositoryPath(value, `${provider.id}.adapter.repositoryManagedTrees.${name}`)
    for (const [name, record] of Object.entries(adapter.productManagedTrees || {})) {
      repositoryPath(record.sourceRoot, `${provider.id}.adapter.productManagedTrees.${name}.sourceRoot`)
      repositoryPath(record.destination, `${provider.id}.adapter.productManagedTrees.${name}.destination`)
    }
    if (adapter.skillView) repositoryPath(adapter.skillView.directory, `${provider.id}.adapter.skillView.directory`)
    if (adapter.hookView) {
      repositoryPath(adapter.hookView.output, `${provider.id}.adapter.hookView.output`)
      if (adapter.hookView.settingsTemplate !== null) repositoryPath(adapter.hookView.settingsTemplate, `${provider.id}.adapter.hookView.settingsTemplate`)
      if (adapter.hookView.workingDirectoryPolicy !== 'repository-root') throw new Error(`${provider.id}.adapter.hookView working directory policy must be repository-root`)
    }
    for (const [canonical, providerSpecific] of Object.entries(adapter.environmentMap || {})) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(canonical) || !/^[A-Z][A-Z0-9_]*$/.test(providerSpecific)) {
        throw new Error(`${provider.id}:environment aliases must be safe uppercase identifiers`)
      }
    }
    for (const [skill, binding] of Object.entries(adapter.skillBindings || {})) {
      if (binding.self !== provider.id) throw new Error(`${provider.id}:${skill} self binding must equal provider id`)
      if (!binding.selectionPolicy || !binding.reviewClass || Object.hasOwn(binding, 'peer')) {
        throw new Error(`${provider.id}:${skill} requires capability-based selection without a fixed peer`)
      }
      if (['deep-audit-cross-codex', 'independent-review'].includes(skill)
        && binding.certificationContract !== EXACT_REVIEW_CERTIFICATION_CONTRACT) {
        throw new Error(`${provider.id}:${skill} requires an exact target certification contract => ADAPTER-BLOCKED`)
      }
      if (['deep-audit-cross-codex', 'independent-review'].includes(skill)
        && binding.transport !== PORTABLE_REVIEW_EXCHANGE_CORE) {
        throw new Error(`${provider.id}:${skill} must use the canonical portable content-addressed exchange core => ADAPTER-BLOCKED`)
      }
    }
  }
  for (const provider of registry.providers) {
    for (const [field, relativePath] of [
      ['repositoryInstructionSource', provider.adapter.repositoryInstructionSource],
      ['productInstructionSource', provider.adapter.productInstructionSource],
    ]) {
      if (relativePath === null) continue
      const source = resolveContained(sourceRoot, relativePath, `${provider.id}.${field}`)
      assertNoSymlinkComponents(sourceRoot, source, `${provider.id}.${field}`)
      if (!existsSync(source) || lstatSync(source).isSymbolicLink() || !lstatSync(source).isFile()) {
        throw new Error(`${provider.id}.${field} must exist as a regular no-symlink file`)
      }
    }
    for (const [skill, binding] of Object.entries(provider.adapter.skillBindings || {})) {
      resolveProviderReviewBinding({
        registry,
        skill,
        selfProviderId: provider.id,
        requireCertificationContract: ['deep-audit-cross-codex', 'independent-review'].includes(skill),
      })
    }
  }
  const sharedProductSource = resolveContained(sourceRoot, registry.canonical.productSharedInstructionSource, 'canonical.productSharedInstructionSource')
  assertNoSymlinkComponents(sourceRoot, sharedProductSource, 'canonical.productSharedInstructionSource')
  if (!existsSync(sharedProductSource) || lstatSync(sharedProductSource).isSymbolicLink() || !lstatSync(sharedProductSource).isFile()) {
    throw new Error('canonical.productSharedInstructionSource must exist as a regular no-symlink file')
  }
  return registry
}

export function validateProviderSkillSemantics(registry) {
  validateProviderSkillSemanticsDocument(registry)
  const requiredPolicy = {
    unknownProviderOutcome: 'ADAPTER-BLOCKED',
    unclassifiedSkillOutcome: 'ADAPTER-BLOCKED',
    semanticLeakOutcome: 'ADAPTER-BLOCKED',
    independence: 'different-provider-required',
    reviewIsolation: 'separate-context-required',
    reviewMutation: 'read-only',
    reviewWorkspace: 'immutable-snapshot-or-enforced-tool-deny',
    mutationDetection: 'before-after-worktree-fingerprint',
    missingEvidenceOutcome: 'REVIEW-BLOCKED',
  }
  for (const [name, expected] of Object.entries(requiredPolicy)) {
    if (registry.policy[name] !== expected) throw new Error(`provider skill policy ${name} must be ${expected}`)
  }
  const names = new Set()
  for (const skill of registry.skills) {
    if (!skill?.name || names.has(skill.name)) throw new Error(`provider skill missing or duplicated:${skill?.name || '<empty>'}`)
    names.add(skill.name)
    for (const identifier of skill.declaredIdentifiers) {
      if (identifier !== skill.name && !(skill.name === 'governance-status' && identifier === 'scripts/gen-codex-adapter.mjs')) {
        throw new Error(`${skill.name}:declared identifier may only mask its stable skill id or the committed legacy generator path:${identifier}`)
      }
    }
    const expectedSource = `packages/design-system/ds-canonical/skills/${skill.name}/SKILL.md`
    if (skill.sourceWorkflow !== expectedSource) throw new Error(`${skill.name}:workflow source must be exactly ${expectedSource}`)
    if (skill.sourceWorkflow.startsWith('.claude/') || skill.sourceWorkflow.startsWith('.agents/')) {
      throw new Error(`${skill.name}:provider view cannot own workflow semantics`)
    }
    if (skill.classification === 'provider-neutral') {
      if (skill.projection !== 'provider-copy') throw new Error(`${skill.name}:provider-neutral skills require provider-copy projection`)
      if (skill.allowedAssumptions.length) throw new Error(`${skill.name}:provider-neutral skills cannot allow provider assumptions`)
    } else {
      const profile = registry.bindingProfiles[skill.bindingProfile]
      if (!profile) throw new Error(`${skill.name}:binding profile is missing:${skill.bindingProfile}`)
      for (const [providerId, binding] of Object.entries(profile.providers)) {
        if (binding.status !== 'compatible') continue
        if (skill.projection === 'provider-thin-driver' && binding.strategy !== 'provider-thin-driver') {
          throw new Error(`${skill.name}:${providerId} thin-driver skill requires a provider-thin-driver binding`)
        }
        if (skill.projection === 'provider-bound-copy' && binding.strategy !== 'generated-binding-header') {
          throw new Error(`${skill.name}:${providerId} bound-copy skill requires a generated-binding-header binding`)
        }
        for (const assumption of skill.allowedAssumptions) {
          if (!binding.resolutions?.[assumption]) throw new Error(`${skill.name}:${providerId} has no resolution for ${assumption}`)
        }
      }
    }
    for (const reference of skill.requiredReferences || []) {
      if (!reference.startsWith('packages/design-system/ds-canonical/skills/')) {
        throw new Error(`${skill.name}:required reference must be provider-neutral ds-canonical content:${reference}`)
      }
    }
    if (skill.mode === 'cross-provider-deep-audit' && skill.requiresAuthorProvider !== true) {
      throw new Error(`${skill.name}:cross-provider deep audit must require explicit author identity => REVIEW-BLOCKED`)
    }
  }
  return registry
}

export const PROVIDER_REGISTRY = validateProviderRegistry(contractJson(REGISTRY_PATH, 'provider registry contract'))
export const PROVIDER_SKILL_SEMANTICS = validateProviderSkillSemantics(contractJson(SEMANTICS_PATH, 'provider skill semantics contract'))

export function assertProviderContractSources({ registry = PROVIDER_REGISTRY, sourceRoot = ROOT } = {}) {
  const contracts = [
    ['packages/governance/canonical/providers.json', 'provider registry contract'],
    ['packages/governance/canonical/schemas/providers.schema.json', 'provider registry schema'],
    [registry.canonical.skillSemantics, 'provider skill semantics contract'],
    ['scripts/schemas/provider-skill-semantics.schema.json', 'provider skill semantics schema'],
  ]
  for (const [relativePath, label] of contracts) {
    const path = resolveContained(sourceRoot, relativePath, label)
    assertNoSymlinkComponents(sourceRoot, path, label)
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) {
      throw new Error(`${label} must exist as a regular no-symlink file`)
    }
  }
  for (const provider of registry.providers) {
    for (const [skill, binding] of Object.entries(provider.adapter.skillBindings || {})) {
      if (binding.invocation.strategy !== 'native-context-fork') continue
      const agentTree = Object.entries(provider.adapter.repositoryManagedTrees || {})
        .find(([, output]) => output.endsWith('/agents'))
      if (!agentTree) throw new Error(`${provider.id}:${skill} native context-fork invocation has no canonical agent tree => ADAPTER-BLOCKED`)
      const [canonicalName] = agentTree
      const canonicalRoot = registry.canonical.roots[canonicalName]
      if (!canonicalRoot) throw new Error(`${provider.id}:${skill} native context-fork invocation has no canonical agent source => ADAPTER-BLOCKED`)
      const source = resolveContained(sourceRoot, `${canonicalRoot}/${binding.invocation.agent}.md`, `${provider.id}:${skill} canonical agent source`)
      assertNoSymlinkComponents(sourceRoot, source, `${provider.id}:${skill} canonical agent source`)
      if (!existsSync(source) || lstatSync(source).isSymbolicLink() || !lstatSync(source).isFile()) {
        throw new Error(`${provider.id}:${skill} canonical agent source must exist as a regular no-symlink file => ADAPTER-BLOCKED`)
      }
    }
  }
}

function providerById(id, registry = PROVIDER_REGISTRY) {
  const provider = registry.providers.find((item) => item.id === id)
  if (!provider) throw new Error(`unknown provider:${id} => ADAPTER-BLOCKED`)
  return provider
}

function skillByName(name, semantics = PROVIDER_SKILL_SEMANTICS) {
  const skill = semantics.skills.find((item) => item.name === name)
  if (!skill) throw new Error(`unclassified canonical skill:${name} => ${semantics.policy.unclassifiedSkillOutcome}`)
  return skill
}

function providerSkillBinding(skill, targetProvider, semantics = PROVIDER_SKILL_SEMANTICS) {
  if (skill.classification === 'provider-neutral') return null
  const profile = semantics.bindingProfiles[skill.bindingProfile]
  if (!profile) throw new Error(`${skill.name}:binding profile is missing:${skill.bindingProfile} => ADAPTER-BLOCKED`)
  const binding = profile.providers[targetProvider]
  if (!binding) {
    throw new Error(`${skill.name}:${targetProvider} => ${profile.unboundProvider.reasonCode}: ${profile.unboundProvider.detail} => ADAPTER-BLOCKED`)
  }
  if (binding.status === 'excluded') throw new Error(`${skill.name}:${targetProvider} => ${binding.reasonCode}: ${binding.detail} => ADAPTER-BLOCKED`)
  for (const assumption of skill.allowedAssumptions) {
    if (!binding.resolutions?.[assumption]) throw new Error(`${skill.name}:${targetProvider} missing ${assumption} resolution => ADAPTER-BLOCKED`)
  }
  return { profile, binding }
}

function semanticFiles(skillRoot) {
  return walkFiles(skillRoot, { root: skillRoot, label: 'canonical skill tree' })
}

function maskDeclaredIdentifiers(content, identifiers) {
  let masked = content
  for (const identifier of identifiers) masked = masked.split(identifier).join('')
  return masked
}

function lineAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function providerViewPaths(registry) {
  const paths = new Set()
  for (const provider of registry.providers) {
    const adapter = provider.adapter || {}
    for (const value of [
      provider.skillDirectory,
      provider.hookConfig,
      adapter.skillView?.directory,
      adapter.hookView?.output,
      ...Object.values(adapter.repositoryManagedTrees || {}),
      ...Object.values(adapter.productManagedTrees || {}).map((record) => record.destination),
      ...(adapter.discovery?.configPaths || []),
      ...(adapter.discovery?.pluginRootNames || []),
    ]) {
      if (typeof value === 'string' && value) paths.add(value)
    }
  }
  return [...paths].sort((left, right) => (
    right.length - left.length || compareUtf8Bytes(left, right)
  ))
}

function providerViewAuthorityFindings(content, registry) {
  const views = providerViewPaths(registry).map((path) => ({
    path,
    pattern: new RegExp(`(?:~\\/)?${regexEscape(path)}(?=$|[\\/\\s\`'"),:;*}\\]])`, 'iu'),
  }))
  const findings = []
  for (const [offset, line] of content.split(/\r?\n/).entries()) {
    if (!PROVIDER_VIEW_AUTHORITY_OR_ACTION.test(line)) continue
    const view = views.find((candidate) => candidate.pattern.test(line))
    if (!view) continue
    const explicitlyNonAuthoritativeProjection = EXPLICIT_GENERATED_PROJECTION.test(line) && EXPLICIT_NON_AUTHORITY.test(line)
    if (explicitlyNonAuthoritativeProjection) continue
    findings.push({ line: offset + 1, path: view.path, excerpt: line.trim().slice(0, 240) })
  }
  return findings
}

function assumptionFingerprint(findings, skillRoot) {
  const normalized = findings.map((item) => [
    item.kind,
    posix(relative(skillRoot, item.absolutePath)),
    item.token.toLocaleLowerCase('en-US'),
  ].join('\0')).sort()
  return sha256(normalized.join('\n'))
}

export function scanCanonicalSkillSemantics({
  registry = PROVIDER_REGISTRY,
  semantics = PROVIDER_SKILL_SEMANTICS,
  sourceRoot = ROOT,
} = {}) {
  validateProviderRegistry(registry, { sourceRoot })
  validateProviderSkillSemantics(semantics)
  const canonical = resolveContained(sourceRoot, registry.canonical.roots.skills, 'canonical skill root')
  assertNoSymlinkComponents(sourceRoot, canonical, 'canonical skill root')
  const actualNames = []
  for (const name of readdirSync(canonical).sort()) {
    const directory = join(canonical, name)
    const stat = lstatSync(directory)
    if (stat.isSymbolicLink()) throw new Error(`canonical skill root contains a symbolic link:${name}`)
    if (stat.isDirectory() && existsSync(join(directory, 'SKILL.md'))) actualNames.push(name)
  }
  const declaredNames = semantics.skills.map((skill) => skill.name).sort()
  const missing = actualNames.filter((name) => !declaredNames.includes(name))
  const extra = declaredNames.filter((name) => !actualNames.includes(name))
  if (missing.length || extra.length) {
    throw new Error(`canonical skill classification inventory mismatch; unclassified=[${missing.join(',')}]; missing-source=[${extra.join(',')}] => ${semantics.policy.unclassifiedSkillOutcome}`)
  }

  const surfaceIdentifiers = [...new Set(semantics.skills.flatMap((skill) => skill.declaredIdentifiers))]
  const surfaceFiles = []
  for (const name of readdirSync(canonical).sort()) {
    const path = join(canonical, name)
    const stat = lstatSync(path)
    if (!stat.isFile()) continue
    const rawBuffer = readFileSync(path)
    if (rawBuffer.includes(0)) throw new Error(`canonical skill surface files must be text:${name}`)
    const raw = maskDeclaredIdentifiers(rawBuffer.toString('utf8'), surfaceIdentifiers)
    const ownershipFindings = providerViewAuthorityFindings(raw, registry)
    if (ownershipFindings.length) {
      const evidence = ownershipFindings.slice(0, 8).map((item) => `${name}:${item.line}:${item.path}:${item.excerpt}`)
      throw new Error(`canonical skill surface declares a provider view as authority/edit/execute/enumeration target; evidence=[${evidence.join(';')}] => ${semantics.policy.semanticLeakOutcome}`)
    }
    const findings = []
    for (const [kind, pattern] of Object.entries(SEMANTIC_LEAK_PATTERNS)) {
      pattern.lastIndex = 0
      for (const match of raw.matchAll(pattern)) findings.push(`${kind}:${name}:${lineAt(raw, match.index)}:${match[0]}`)
    }
    if (findings.length) throw new Error(`canonical skill surface file contains undeclared provider assumptions:${findings.slice(0, 8).join(';')} => ${semantics.policy.semanticLeakOutcome}`)
    surfaceFiles.push(name)
  }

  const records = []
  for (const skill of semantics.skills) {
    const expectedSource = `packages/design-system/ds-canonical/skills/${skill.name}/SKILL.md`
    if (skill.sourceWorkflow !== expectedSource) throw new Error(`${skill.name}:sourceWorkflow must equal ${expectedSource}`)
    const source = resolveContained(sourceRoot, skill.sourceWorkflow, `${skill.name}.sourceWorkflow`)
    assertNoSymlinkComponents(sourceRoot, source, `${skill.name}.sourceWorkflow`)
    if (!existsSync(source) || lstatSync(source).isSymbolicLink() || !lstatSync(source).isFile()) {
      throw new Error(`${skill.name}:sourceWorkflow must exist as a regular no-symlink file`)
    }
    const sourceBody = readFileSync(source, 'utf8')
    const frontmatterName = sourceBody.match(/^---\r?\n[\s\S]*?^name:\s*([^\r\n]+)\r?$/m)?.[1]?.trim()
    if (frontmatterName !== skill.name) throw new Error(`${skill.name}:SKILL.md frontmatter name mismatch:${frontmatterName || '<missing>'}`)
    for (const reference of skill.requiredReferences || []) {
      const path = resolveContained(sourceRoot, reference, `${skill.name}.requiredReference`)
      assertNoSymlinkComponents(sourceRoot, path, `${skill.name}.requiredReference`)
      if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) {
        throw new Error(`${skill.name}:required reference must exist as a regular no-symlink file:${reference}`)
      }
    }

    const files = semanticFiles(dirname(source))
    const textFiles = []
    const binaryFiles = []
    for (const path of files) {
      const body = readFileSync(path)
      if (body.includes(0)) {
        const rel = posix(relative(dirname(source), path))
        if (!rel.startsWith('assets/')) throw new Error(`${skill.name}:binary resources are allowed only under assets/:${rel}`)
        binaryFiles.push(path)
      } else textFiles.push(path)
    }
    const combinedRaw = textFiles.map((path) => readFileSync(path, 'utf8')).join('\n')
    for (const identifier of skill.declaredIdentifiers) {
      if (!combinedRaw.includes(identifier)) throw new Error(`${skill.name}:declared identifier is unused:${identifier}`)
    }
    const findings = []
    for (const path of textFiles) {
      const raw = readFileSync(path, 'utf8')
      const content = maskDeclaredIdentifiers(raw, skill.declaredIdentifiers)
      const ownershipFindings = providerViewAuthorityFindings(content, registry)
      if (ownershipFindings.length) {
        const evidence = ownershipFindings.slice(0, 8).map((item) => `${posix(relative(sourceRoot, path))}:${item.line}:${item.path}:${item.excerpt}`)
        throw new Error(`${skill.name}:provider view cannot be canonical authority or edit/execute/enumeration target; evidence=[${evidence.join(';')}] => ${semantics.policy.semanticLeakOutcome}`)
      }
      for (const [kind, pattern] of Object.entries(SEMANTIC_LEAK_PATTERNS)) {
        pattern.lastIndex = 0
        for (const match of content.matchAll(pattern)) findings.push({
          kind,
          absolutePath: path,
          path: posix(relative(sourceRoot, path)),
          line: lineAt(content, match.index),
          token: match[0],
        })
      }
    }
    const detected = [...new Set(findings.map((item) => item.kind))].sort()
    const allowed = [...skill.allowedAssumptions].sort()
    const undeclared = detected.filter((kind) => !allowed.includes(kind))
    const stale = allowed.filter((kind) => !detected.includes(kind))
    if (undeclared.length || stale.length) {
      const evidence = findings.filter((item) => undeclared.includes(item.kind)).slice(0, 8).map((item) => `${item.kind}:${item.path}:${item.line}:${item.token}`)
      throw new Error(`${skill.name}:semantic assumption mismatch; undeclared=[${undeclared.join(',')}]; stale=[${stale.join(',')}]; evidence=[${evidence.join(';')}] => ${semantics.policy.semanticLeakOutcome}`)
    }
    if (skill.classification === 'provider-neutral' && findings.length) {
      throw new Error(`${skill.name}:provider-neutral skill contains provider assumptions => ${semantics.policy.semanticLeakOutcome}`)
    }
    const fingerprint = assumptionFingerprint(findings, dirname(source))
    if (skill.projection === 'provider-bound-copy') {
      if (skill.assumptionFindingCount !== findings.length || skill.assumptionFingerprint !== fingerprint) {
        throw new Error(`${skill.name}:declared assumption inventory drift; expected=${skill.assumptionFindingCount}/${skill.assumptionFingerprint}; actual=${findings.length}/${fingerprint} => ${semantics.policy.semanticLeakOutcome}`)
      }
    }
    records.push({ name: skill.name, classification: skill.classification, files: files.length, textFiles: textFiles.length, binaryFiles: binaryFiles.length, assumptions: detected, assumptionFindingCount: findings.length, assumptionFingerprint: fingerprint, findings })
  }
  return { canonical, surfaceFiles, records }
}

function modeInstructions(skill, binding) {
  if (skill.mode === 'cross-provider-collaboration') return [
    'Complete the current provider analysis before seeing peer conclusions.',
    'Dispatch the same evidence-complete brief through the bound transport.',
    'Verify peer claims against primary evidence, preserve disagreements, and synthesize only supported conclusions.',
  ]
  if (skill.mode === 'cross-provider-deep-audit') return [
    `Require explicit author provider identity; this binding is valid only when the author provider is ${binding.self}.`,
    'Freeze the inventory and run the complete no-sample primary audit first.',
    `Resolve the highest certified independent capability under ${binding.selectionPolicy}/${binding.reviewClass} at review prepare time, freeze the exact certified reviewer receipt, and run it in a separate read-only context against the identical rubric and inventory; it must differ from both author and primary.`,
    'Reconcile dimension by dimension; missing coverage, mutation, absent identity, or author/peer collision is REVIEW-BLOCKED.',
  ]
  if (skill.mode === 'canonical-read-only-review') return [
    `If the author provider is ${binding.self}, resolve ${binding.selectionPolicy}/${binding.reviewClass}; this context cannot claim independent review.`,
    'Use an immutable snapshot or denied write tools and fingerprint the worktree before and after.',
    'Answer every canonical review question with evidence; suggestions are text only.',
  ]
  if (skill.mode === 'independent-product-review') return [
    `Require the author provider to be ${binding.self} and resolve only a distinct reviewer through ${binding.selectionPolicy}/${binding.reviewClass}.`,
    'Verify an exact certified provider/runtime/surface/product-consumer target before claiming an independent second opinion.',
    'Freeze and digest the product scope, dispatch without author conclusions, and require a separate read-only context.',
    'Validate broker/transport evidence and before/after worktree fingerprints; emit findings only and never acquire DS-author, release, or mutation authority.',
  ]
  throw new Error(`${skill.name}:unsupported workflow mode:${skill.mode}`)
}

function invocationFrontmatter(binding) {
  if (binding.invocation.strategy === 'main-context') return ''
  if (binding.invocation.strategy === 'native-context-fork') {
    if (binding.invocation.context !== 'fork' || !/^[a-z][a-z0-9-]*$/.test(binding.invocation.agent || '')) {
      throw new Error(`${binding.self}:native context-fork invocation is incomplete => ADAPTER-BLOCKED`)
    }
    return `context: ${binding.invocation.context}\nagent: ${binding.invocation.agent}\n`
  }
  throw new Error(`${binding.self}:unknown skill invocation strategy => ADAPTER-BLOCKED`)
}

export function buildProviderSkillDriver({
  skillName,
  targetProvider,
  outputName = skillName,
  registry = PROVIDER_REGISTRY,
  semantics = PROVIDER_SKILL_SEMANTICS,
} = {}) {
  validateProviderRegistry(registry)
  validateProviderSkillSemantics(semantics)
  const skill = skillByName(skillName, semantics)
  const provider = providerById(targetProvider, registry)
  const compatibility = providerSkillBinding(skill, targetProvider, semantics)
  if (skill.projection !== 'provider-thin-driver' || compatibility?.binding.strategy !== 'provider-thin-driver') {
    throw new Error(`${skill.name}:${targetProvider} is not a provider-thin-driver workflow`)
  }
  let resolved
  try {
    resolved = resolveProviderReviewBinding({
      registry,
      skill: skill.name,
      selfProviderId: targetProvider,
      requireCertificationContract: ['cross-provider-deep-audit', 'independent-product-review'].includes(skill.mode),
    })
  } catch (error) {
    throw new Error(`${skill.name}:${targetProvider} => ${semantics.policy.unknownProviderOutcome}:${error.message}`)
  }
  const binding = resolved.binding
  const steps = modeInstructions(skill, binding).map((line, index) => `${index + 1}. ${line}`).join('\n')
  const requiredReferences = (skill.requiredReferences || []).length
    ? `\n## Required canonical references\n\n${skill.requiredReferences.map((path) => `- \`${path}\``).join('\n')}\n`
    : ''
  return `---
name: ${outputName}
description: ${JSON.stringify(skill.description)}
${invocationFrontmatter(binding)}---

<!-- _generated: scripts/gen-codex-adapter.mjs; source: ${skill.sourceWorkflow} + packages/governance/canonical/providers.json; do not edit this provider view. -->

# ${outputName} — ${provider.displayName} adapter

Read and follow the complete provider-neutral workflow at \`${skill.sourceWorkflow}\`. This file only resolves the provider binding; it must not redefine workflow meaning.

## Resolved binding

- \`currentProvider: ${binding.self}\`
- \`reviewSelectionPolicy: ${binding.selectionPolicy}\`
- \`reviewClass: ${binding.reviewClass}\`
- \`independentPeerProvider: selected-and-frozen-at-review-prepare-time\`
- \`transport: ${binding.transport}\`
- \`targetCertificationContract: ${binding.certificationContract || 'not-declared'}\`
- \`sameProviderPeer: invalid\`
- \`authorProviderRequired: ${skill.requiresAuthorProvider}\`
${skill.requiresAuthorProvider ? '- `authorProviderMustEqualCurrentProvider: true`\n- `independentReviewerMustDifferFromAuthor: true`\n' : ''}- \`reviewIsolation: ${semantics.policy.reviewIsolation}\`
- \`reviewMutation: ${semantics.policy.reviewMutation}\`
- \`reviewWorkspace: ${semantics.policy.reviewWorkspace}\`
- \`mutationDetection: ${semantics.policy.mutationDetection}\`
- \`missingEvidenceOutcome: ${semantics.policy.missingEvidenceOutcome}\`
- \`compatibilityEvidence: ${compatibility.binding.evidenceSource}\`
${requiredReferences}

## Adapter execution

${steps}

Unavailable transport, same-provider execution, missing identity/evidence, incomplete coverage, absent isolation, or worktree drift is \`${semantics.policy.missingEvidenceOutcome}\`, never PASS.
`
}

function provenanceMarker(sourceRel, provider) {
  return `<!-- _generated: scripts/gen-codex-adapter.mjs; source: ${sourceRel}; provider: ${provider}; do not edit this adapter view. -->\n`
}

export function projectSharedSkillMarkdown(content, sourceRel, targetProvider) {
  if (!targetProvider) throw new Error('provider skill projection requires an explicit targetProvider => ADAPTER-BLOCKED')
  const match = /^packages\/design-system\/ds-canonical\/skills\/([^/]+)\/SKILL\.md$/.exec(sourceRel)
  if (match) {
    const skill = skillByName(match[1])
    if (skill.projection === 'provider-thin-driver') return buildProviderSkillDriver({ skillName: match[1], targetProvider })
    return projectSkillMarkdownForProvider(content, sourceRel, targetProvider, PROVIDER_SKILL_SEMANTICS, PROVIDER_REGISTRY, skill)
  }
  const marker = provenanceMarker(sourceRel, targetProvider)
  const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  return frontmatter ? `${frontmatter[0]}\n${marker}${content.slice(frontmatter[0].length)}` : `${marker}${content}`
}

export function buildSharedSkillTargets({
  sourceRoot = ROOT,
  outputRoot = ROOT,
  sourceDir,
  destinationDir,
  targetProvider,
  registry = PROVIDER_REGISTRY,
  semantics = PROVIDER_SKILL_SEMANTICS,
} = {}) {
  if (!targetProvider) throw new Error('shared skill target generation requires an explicit targetProvider => ADAPTER-BLOCKED')
  const provider = providerById(targetProvider, registry)
  const materializer = provider.adapter.skillView
    ? resolveProviderMaterializer(registry, 'skillViews', provider.adapter.skillView.materializerId, `${provider.id}.adapter.skillView.materializerId`)
    : null
  const canonical = sourceDir || resolveContained(sourceRoot, registry.canonical.roots.skills, 'canonical skill root')
  const destination = destinationDir || resolveContained(outputRoot, provider.adapter.skillView?.directory || provider.skillDirectory, `${provider.id} skill output`)
  assertNoSymlinkComponents(sourceRoot, canonical, 'canonical skill root')
  assertNoSymlinkComponents(outputRoot, destination, `${provider.id} skill output`)
  const targets = []
  for (const source of existsSync(canonical) ? readdirSync(canonical).sort().map((name) => join(canonical, name)) : []) {
    const stat = lstatSync(source)
    if (stat.isSymbolicLink()) throw new Error(`canonical skill root contains a symbolic link:${posix(relative(canonical, source))}`)
    if (!stat.isFile()) continue
    const sourceRel = posix(relative(sourceRoot, source))
    targets.push({ path: join(destination, posix(relative(canonical, source))), content: readFileSync(source), mode: statSync(source).mode & 0o777, source: sourceRel })
  }
  for (const name of existsSync(canonical) ? readdirSync(canonical).sort() : []) {
    const skillDirectory = join(canonical, name)
    const stat = lstatSync(skillDirectory)
    if (stat.isSymbolicLink()) throw new Error(`canonical skill root contains a symbolic link:${name}`)
    if (!stat.isDirectory() || !existsSync(join(skillDirectory, 'SKILL.md'))) continue
    const skill = skillByName(name, semantics)
    const compatibility = providerSkillBinding(skill, targetProvider, semantics)
    for (const source of walkFiles(skillDirectory, { root: canonical, label: 'canonical skill root' })) {
      const sourceRelativeFile = posix(relative(canonical, source))
      const relativeFile = sourceRelativeFile.endsWith('/SKILL.md') && materializer
        ? `${sourceRelativeFile.slice(0, -'SKILL.md'.length)}${materializer.entryFile}`
        : sourceRelativeFile
      const sourceRel = posix(relative(sourceRoot, source))
      const raw = readFileSync(source)
      const isSkill = sourceRelativeFile.endsWith('/SKILL.md')
      const content = isSkill
        ? Buffer.from(skill.projection === 'provider-thin-driver'
          ? buildProviderSkillDriver({ skillName: name, targetProvider, registry, semantics })
          : projectSkillMarkdownForProvider(raw.toString('utf8'), sourceRel, targetProvider, semantics, registry, skill, compatibility))
        : raw
      targets.push({ path: join(destination, relativeFile), content, mode: statSync(source).mode & 0o777, source: sourceRel })
    }
  }
  for (const alias of provider.adapter.skillAliases || []) {
    const content = Buffer.from(buildProviderSkillDriver({ skillName: alias.sourceSkill, outputName: alias.name, targetProvider, registry, semantics }))
    targets.push({ path: join(destination, alias.name, materializer?.entryFile || 'SKILL.md'), content, mode: 0o644, source: `alias:${alias.sourceSkill}` })
  }
  return targets
}

function projectSkillMarkdownForProvider(content, sourceRel, provider, semantics, registry, skill, compatibility = providerSkillBinding(skill, provider, semantics)) {
  const marker = provenanceMarker(sourceRel, provider)
  const binding = compatibility
    ? `\n<!-- provider-binding: profile=${skill.bindingProfile}; provider=${provider}; strategy=${compatibility.binding.strategy}; assumptionCount=${skill.assumptionFindingCount}; assumptionFingerprint=${skill.assumptionFingerprint}; evidence=${compatibility.binding.evidenceSource} -->\n\n## Provider binding contract\n\nThis canonical workflow contains a committed inventory of legacy assumptions. Resolve them exactly as follows; an unavailable resolution or inventory drift is \`${semantics.policy.semanticLeakOutcome}\`:\n\n${skill.allowedAssumptions.map((kind) => `- \`${kind}\`: ${compatibility.binding.resolutions[kind]}`).join('\n')}\n`
    : ''
  const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  return frontmatter ? `${frontmatter[0]}\n${marker}${binding}${content.slice(frontmatter[0].length)}` : `${marker}${binding}${content}`
}

function hookRegistry(registry = PROVIDER_REGISTRY, sourceRoot = ROOT) {
  const path = resolveContained(sourceRoot, registry.canonical.hookRegistrations, 'canonical hook registrations')
  assertNoSymlinkComponents(sourceRoot, path, 'canonical hook registrations')
  return validateHookRegistrations(json(path))
}

function matcherFor(matcher, aliases) {
  if (!matcher) return ''
  const values = new Set()
  for (const token of matcher.split('|')) for (const value of aliases?.[token] || [token]) values.add(value)
  return [...values].join('|')
}

function validateProviderHookCoverageDocument(document, sourceRoot = ROOT) {
  const schemaPath = resolveContained(
    sourceRoot,
    'packages/governance/canonical/schemas/provider-hook-coverage.schema.json',
    'provider hook coverage schema',
  )
  const schema = contractJson(schemaPath, 'provider hook coverage schema', sourceRoot)
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  if (!validate(document)) {
    const failures = (validate.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')
    throw new Error(`provider hook coverage violates its committed JSON Schema:${failures}`)
  }
  return document
}

function canonicalHookRecords(registry, sourceRoot) {
  const registrations = hookRegistry(registry, sourceRoot)
  return Object.entries(registrations.hooks || {}).flatMap(([event, groups]) => groups.flatMap((group) => group.hooks.map((descriptor) => ({
    event,
    canonicalMatcher: group.matcher || '',
    hook: descriptor.hook,
    kind: descriptor.kind,
    runtime: descriptor.runtime,
    outputMode: descriptor.outputMode,
    inputContract: descriptor.inputContract || 'event-v1',
    transcriptRequirement: descriptor.transcript || 'none',
    requirements: [...(descriptor.requires || [])].sort(),
    descriptor,
  }))))
}

const AUTHORITY_DECISION_HOOK = 'check_substantive_edit_approval_preflight.sh'

function missingNativeHookFallback(record) {
  if (record.hook === AUTHORITY_DECISION_HOOK) {
    return {
      status: 'declared',
      authority: 'packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs',
      runner: 'scripts/run-provider-hook.mjs',
      prepareArgv: ['--authority-decision', 'prepare'],
      verifyArgv: ['--authority-decision', 'verify'],
      evidence: 'scripts/test-authority-decision-evidence.mjs',
      detail: 'The existing provider-neutral hook runner prepares and verifies one content-addressed authority receipt with the canonical classifier; native projection remains feedback-only and every untested runtime remains not-certified.',
    }
  }
  return { status: 'none' }
}

/**
 * Durable evidence for native hook projection only. This intentionally does not infer runtime
 * certification or CI equivalence from the presence of generated configuration.
 */
export function buildProviderHookCoverage({ registry = PROVIDER_REGISTRY, sourceRoot = ROOT } = {}) {
  validateProviderRegistry(registry, { sourceRoot })
  const canonical = canonicalHookRecords(registry, sourceRoot)
  const providers = registry.providers.map((provider) => {
    const supported = new Set(provider.adapter.hookView?.supportedEvents || [])
    const projected = []
    const excluded = []
    const nativeSurfaceExclusion = (provider.adapter.exclusions || []).find((item) => item.scope === 'native-hooks')
    for (const record of canonical) {
      let exclusion = null
      if (!provider.adapter.hookView) {
        exclusion = nativeSurfaceExclusion || {
          reasonCode: 'NATIVE_HOOK_SURFACE_NOT_GENERATED',
          detail: `${provider.id} has no generated native hook view`,
        }
      } else if (!supported.has(record.event)) {
        exclusion = {
          reasonCode: 'EVENT_NOT_SUPPORTED',
          detail: `${provider.id} does not declare ${record.event}`,
        }
      } else {
        const eligibility = hookEligibilityForProvider(provider.id, record.descriptor, registry)
        if (!eligibility.eligible) exclusion = eligibility
      }
      const common = {
        event: record.event,
        canonicalMatcher: record.canonicalMatcher,
        hook: record.hook,
        kind: record.kind,
        runtime: record.runtime,
        outputMode: record.outputMode,
        inputContract: record.inputContract,
        transcriptRequirement: record.transcriptRequirement,
        requirements: record.requirements,
      }
      if (exclusion) {
        excluded.push({
          ...common,
          nativeCoverage: 'gap',
          reasonCode: exclusion.reasonCode,
          detail: exclusion.detail,
          certificationImpact: 'not-certified',
          authoritativeFallback: missingNativeHookFallback(record),
        })
      } else {
        projected.push({
          ...common,
          nativeEvent: projectProviderNativeEvent(provider, record.event),
          projectedMatcher: projectMatcherForProvider(record.canonicalMatcher, provider.id, registry),
          nativeCoverage: 'projected',
          certificationImpact: 'runtime-certification-required',
        })
      }
    }
    return {
      provider: provider.id,
      nativeHooksDeclared: provider.capabilities.nativeHooks,
      hookEnforcement: provider.capabilities.hookEnforcement,
      projectionStatus: excluded.length === 0 ? 'complete-projection' : projected.length === 0 ? 'unavailable' : 'partial-projection',
      certificationClaim: 'projection-only-not-runtime-certified',
      canonicalRegistrationCount: canonical.length,
      projectedCount: projected.length,
      excludedCount: excluded.length,
      projected,
      excluded,
    }
  })
  const coverageSchemaPath = resolveContained(
    sourceRoot,
    'packages/governance/canonical/schemas/provider-hook-coverage.schema.json',
    'provider hook coverage schema',
  )
  const schema = contractJson(coverageSchemaPath, 'provider hook coverage schema', sourceRoot)
  const document = {
    $schema: '../../../governance/canonical/schemas/provider-hook-coverage.schema.json',
    schemaVersion: 2,
    generated: {
      generator: 'scripts/gen-codex-adapter.mjs',
      canonicalHookRegistry: registry.canonical.hookRegistrations,
      providerRegistry: 'packages/governance/canonical/providers.json',
      inputSha256: {
        hookRegistrations: sha256(JSON.stringify(hookRegistry(registry, sourceRoot))),
        providerRegistry: sha256(JSON.stringify(registry)),
        coverageSchema: sha256(JSON.stringify(schema)),
      },
    },
    policy: {
      nativeProjectionIsFeedbackOnly: true,
      nativeProjectionIsSecurityBoundary: false,
      ciEquivalenceRequiresHookSpecificEvidence: true,
      absenceOfProvenFallbackOutcome: 'not-certified',
    },
    providers,
  }
  return validateProviderHookCoverageDocument(document, sourceRoot)
}

export function buildProviderHookCoverageTarget({ registry = PROVIDER_REGISTRY, sourceRoot = ROOT, outputRoot = ROOT } = {}) {
  const path = resolveContained(outputRoot, PROVIDER_HOOK_COVERAGE_PATH, 'provider hook coverage artifact')
  const coverage = buildProviderHookCoverage({ registry, sourceRoot })
  return {
    path,
    content: Buffer.from(`${JSON.stringify(coverage, null, 2)}\n`),
    mode: 0o644,
    source: registry.canonical.hookRegistrations,
  }
}

export function checkProviderHookCoverageArtifact(options = {}) {
  const outputRoot = options.outputRoot || ROOT
  const target = buildProviderHookCoverageTarget(options)
  assertNoSymlinkComponents(outputRoot, target.path, 'provider hook coverage artifact')
  if (!existsSync(target.path)) return { ok: false, kind: 'missing', path: target.path }
  if (lstatSync(target.path).isSymbolicLink() || !lstatSync(target.path).isFile()) return { ok: false, kind: 'unsafe', path: target.path }
  if (!readFileSync(target.path).equals(target.content)) return { ok: false, kind: 'content', path: target.path }
  if ((statSync(target.path).mode & 0o777) !== target.mode) return { ok: false, kind: 'mode', path: target.path }
  return { ok: true, kind: null, path: target.path }
}

export function writeProviderHookCoverageArtifact(options = {}) {
  const outputRoot = options.outputRoot || ROOT
  const target = buildProviderHookCoverageTarget(options)
  atomicWriteProviderTarget({
    outputRoot,
    target: target.path,
    content: target.content,
    mode: target.mode,
    label: 'provider hook coverage artifact',
  })
  return target.path
}

export function projectMatcherForProvider(matcher, providerId, registry = PROVIDER_REGISTRY) {
  const provider = providerById(providerId, registry)
  return matcherFor(matcher, provider.adapter.hookView?.matcherAliases || {})
}

function hookGroupArgv(provider, event, groupIndex) {
  try {
    return buildProviderHookGroupLaunchArgv({ provider, event, groupIndex })
  } catch (error) {
    throw new Error(`${provider.id}:${error.message} => ADAPTER-BLOCKED`)
  }
}

function hookGroupCommand(provider, event, groupIndex) {
  return hookGroupArgv(provider, event, groupIndex).join(' ')
}

export function resolveProviderPeerContext(providerId, skillName, registry = PROVIDER_REGISTRY) {
  const provider = providerById(providerId, registry)
  try {
    const resolved = resolveProviderReviewBinding({
      registry,
      skill: skillName,
      selfProviderId: providerId,
      requireCertificationContract: ['deep-audit-cross-codex', 'independent-review'].includes(skillName),
    })
    return {
      provider,
      peer: resolved.peer,
      binding: resolved.binding,
      selectionPolicy: resolved.binding.selectionPolicy,
      reviewClass: resolved.binding.reviewClass,
      reasonCode: resolved.peer ? null : resolved.selectionReasonCode,
    }
  } catch (error) {
    return { provider, peer: null, binding: null, reasonCode: error.code || 'PEER_REVIEW_BINDING_UNAVAILABLE' }
  }
}

export function hookEligibilityForProvider(providerId, descriptor, registry = PROVIDER_REGISTRY) {
  return resolveProviderHookEligibility({
    registry,
    providerId,
    descriptor,
    hasUsableVersionedTranscript,
    allowDeferredSelection: true,
  })
}

export function materializeProviderHookConfig({
  providerId,
  hooks,
  description,
  registry = PROVIDER_REGISTRY,
  sourceRoot = ROOT,
  baseConfig = null,
} = {}) {
  const provider = providerById(providerId, registry)
  const view = provider.adapter.hookView
  if (!view) throw new Error(`${provider.id}:hook materializer is unavailable => ADAPTER-BLOCKED`)
  const materializer = resolveProviderMaterializer(
    registry,
    'hookViews',
    view.materializerId,
    `${provider.id}.adapter.hookView.materializerId`,
  )
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) throw new Error(`${provider.id}:hook materializer requires a hook event map`)

  const baseTemplateContract = materializer.baseTemplateContract === null
    ? null
    : resolveProviderMaterializer(
      registry,
      'hookBaseTemplateContracts',
      materializer.baseTemplateContract,
      `${provider.id}.adapter.hookView baseTemplateContract`,
    )
  const callerSuppliedBaseConfig = baseConfig !== null
  let template = baseConfig
  if (baseTemplateContract) {
    if (template === null) {
      const templatePath = resolveContained(sourceRoot, view.settingsTemplate, `${provider.id}.adapter.hookView.settingsTemplate`)
      assertNoSymlinkComponents(sourceRoot, templatePath, `${provider.id} hook settings template`)
      template = json(templatePath)
    }
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      throw new Error(`${provider.id}:hook materializer requires a JSON object template`)
    }
    if (baseTemplateContract.engine === 'claude-permission-policy-v1') {
      if (baseTemplateContract.source !== CLAUDE_PERMISSION_POLICY_SOURCE || baseTemplateContract.schema !== CLAUDE_PERMISSION_POLICY_SCHEMA) {
        throw new Error(`${provider.id}:Claude permission base-template contract has an unrecognized source/schema binding => ADAPTER-BLOCKED`)
      }
      if (view.settingsTemplate !== baseTemplateContract.source) {
        throw new Error(`${provider.id}:hook settings template differs from its registered Claude permission contract => ADAPTER-BLOCKED`)
      }
      const policy = readClaudePermissionPolicy({ sourceRoot })
      assertClaudePermissionMaterialization(template, policy, {
        label: `${provider.id} ${callerSuppliedBaseConfig ? 'product' : 'repository'} adapter settings`,
      })
      // The repository projection must reproduce the canonical Claude adapter byte-for-byte. A
      // product projection is a separately registered permission profile: it may intentionally
      // narrow `allow`, but assertClaudePermissionMaterialization above still binds privileged
      // `ask`, bypass prevention and safe mode placement to the same SSOT.
      if (!callerSuppliedBaseConfig && JSON.stringify(template.permissions.allow) !== JSON.stringify(policy.dsAllow)) {
        throw new Error(`${provider.id} repository adapter allow profile differs from ${baseTemplateContract.source}`)
      }
    } else if (baseTemplateContract.engine !== 'static-json-object-v1') {
      throw new Error(`${provider.id}:unsupported hook base-template contract:${baseTemplateContract.engine} => ADAPTER-BLOCKED`)
    }
  } else if (baseConfig !== null) {
    throw new Error(`${provider.id}:hook materializer forbids a base config`)
  } else if (view.settingsTemplate !== null) {
    throw new Error(`${provider.id}:hook materializer has no registered base-template contract => ADAPTER-BLOCKED`)
  }

  if (materializer.engine === 'json-hook-map-v1') {
    const config = materializer.mergeStrategy === 'merge-hook-map-into-base-v1'
      ? structuredClone(template)
      : materializer.mergeStrategy === 'replace-document-v1' && template === null
        ? {}
        : null
    if (config === null) throw new Error(`${provider.id}:unsupported hook-map merge strategy:${materializer.mergeStrategy} => ADAPTER-BLOCKED`)
    if (materializer.descriptionField !== null) config[materializer.descriptionField] = description
    config[materializer.hooksField] = Object.fromEntries(Object.entries(hooks).map(([event, groups]) => [event, groups.map((group) => ({
      ...group,
      hooks: group.hooks.map((handler) => {
        if (Array.isArray(handler.argv)) {
          if (handler.command !== handler.argv.join(' ')) throw new Error(`${provider.id}:hook command and argv disagree => ADAPTER-BLOCKED`)
          return { type: 'command', command: handler.command }
        }
        return handler
      }),
    }))]))
    return config
  }
  if (materializer.engine === 'json-hook-event-list-v1') {
    if (materializer.mergeStrategy !== 'replace-document-v1' || template !== null) {
      throw new Error(`${provider.id}:event-list hooks require replace-document-v1 without a base template => ADAPTER-BLOCKED`)
    }
    return {
      [materializer.descriptionField]: description,
      [materializer.eventsField]: Object.entries(hooks).map(([event, groups]) => ({
        [materializer.eventField]: event,
        [materializer.groupsField]: groups.map((group) => ({
          ...(group.matcher ? { [materializer.matcherField]: group.matcher } : {}),
          [materializer.handlersField]: group.hooks.map((handler) => {
            if (handler?.type !== 'command' || !Array.isArray(handler.argv) || handler.command !== handler.argv.join(' ')) {
              throw new Error(`${provider.id}:event-list materializer requires canonical structured-argv handlers => ADAPTER-BLOCKED`)
            }
            return { [materializer.handlerArgvField]: [...handler.argv] }
          }),
        })),
      })),
    }
  }
  throw new Error(`${provider.id}:unsupported hook materializer engine:${materializer.engine} => ADAPTER-BLOCKED`)
}

export function buildProviderHookView({ providerId, registry = PROVIDER_REGISTRY, sourceRoot = ROOT, commandForGroup = null } = {}) {
  const provider = providerById(providerId, registry)
  const view = provider.adapter.hookView
  if (!view) return { config: null, projected: [], excluded: [] }
  const registrations = hookRegistry(registry, sourceRoot)
  const supported = new Set(view.supportedEvents)
  const hooks = {}
  const projected = []
  const excluded = []
  for (const [event, groups] of Object.entries(registrations.hooks || {})) {
    if (!supported.has(event)) {
      for (const group of groups) for (const descriptor of group.hooks) excluded.push({
        event,
        hook: descriptor.hook || descriptor.command,
        reasonCode: 'EVENT_NOT_SUPPORTED',
        detail: `${provider.id} does not declare ${event}`,
      })
      continue
    }
    const projectedGroups = []
    for (const [groupIndex, group] of groups.entries()) {
      const eligibleDescriptors = []
      for (const descriptor of group.hooks) {
        const eligibility = hookEligibilityForProvider(provider.id, descriptor, registry)
        if (!eligibility.eligible) {
          excluded.push({
            event,
            hook: descriptor.hook || descriptor.command,
            reasonCode: eligibility.reasonCode,
            detail: eligibility.detail,
          })
          continue
        }
        const nativeEvent = projectProviderNativeEvent(provider, event)
        projected.push({
          event,
          nativeEvent,
          hook: descriptor.hook || descriptor.command,
        })
        eligibleDescriptors.push(descriptor)
      }
      if (eligibleDescriptors.length) {
        const handler = commandForGroup
          ? commandForGroup(provider, { event, groupIndex, descriptors: eligibleDescriptors })
          : {
              type: 'command',
              command: hookGroupCommand(provider, event, groupIndex),
              argv: hookGroupArgv(provider, event, groupIndex),
            }
        projectedGroups.push({
          ...(group.matcher ? { matcher: projectMatcherForProvider(group.matcher, provider.id, registry) } : {}),
          hooks: [handler],
        })
      }
    }
    if (projectedGroups.length) hooks[projectProviderNativeEvent(provider, event)] = projectedGroups
  }
  const digest = sha16(JSON.stringify({ provider: provider.id, hooks, excluded }))
  const config = materializeProviderHookConfig({
    providerId: provider.id,
    registry,
    sourceRoot,
    hooks,
    description: `_generated: scripts/gen-codex-adapter.mjs; canonical hooks=${registry.canonical.hookRegistrations}; provider=${provider.id}; digest=${digest}; native hooks are feedback only, hard CI remains authoritative.`,
  })
  return { config, projected, excluded }
}

function marketplacePluginTransport(registry) {
  const transport = registry.canonical.compatibilityProjections.marketplacePluginTransport
  const provider = registry.providers.find((candidate) => candidate.id === transport.providerId)
  return { ...transport, active: provider?.adapter?.generate === true }
}

export function buildClaudePluginHookView({ registry = PROVIDER_REGISTRY, sourceRoot = ROOT } = {}) {
  const transport = marketplacePluginTransport(registry)
  if (!transport.active) throw new Error(`marketplace plugin transport provider is retired:${transport.providerId}`)
  const result = buildProviderHookView({
    providerId: transport.providerId,
    registry,
    sourceRoot,
    commandForGroup: (provider, { event, groupIndex }) => {
      const argv = buildProviderHookLaunchArgv([
        'node',
        '${CLAUDE_PLUGIN_ROOT}/scripts/run-provider-hook.mjs',
        '--provider', provider.id,
        '--event', event,
        '--group', String(groupIndex),
        '--target-role', transport.governanceRole,
      ])
      return {
        type: 'command',
        command: argv[0],
        args: argv.slice(1),
      }
    },
  })
  return {
    config: {
      description: `_generated: scripts/gen-codex-adapter.mjs; canonical hooks=${registry.canonical.hookRegistrations}; provider=${transport.providerId}-plugin; transport-profile=${transport.profileId}; repository-role=${transport.repositoryRole}; governance-role=${transport.governanceRole}; projection=${transport.projection}; corpus and target roots remain isolated.`,
      hooks: result.config.hooks,
    },
    projected: result.projected,
    excluded: result.excluded,
  }
}

export function checkClaudePluginHookView({ registry = PROVIDER_REGISTRY, sourceRoot = ROOT, outputRoot = ROOT } = {}) {
  const transport = marketplacePluginTransport(registry)
  const path = resolveContained(outputRoot, transport.hookOutput, 'marketplace plugin hook view')
  if (!transport.active) return { ok: !existsSync(path), kind: existsSync(path) ? 'extra' : null, path }
  const expected = `${JSON.stringify(buildClaudePluginHookView({ registry, sourceRoot }).config, null, 2)}\n`
  if (!existsSync(path)) return { ok: false, kind: 'missing', path }
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) return { ok: false, kind: 'unsafe', path }
  return readFileSync(path, 'utf8') === expected ? { ok: true, kind: null, path } : { ok: false, kind: 'content', path }
}

export function writeClaudePluginHookView({ registry = PROVIDER_REGISTRY, sourceRoot = ROOT, outputRoot = ROOT } = {}) {
  const result = checkClaudePluginHookView({ registry, sourceRoot, outputRoot })
  assertNoSymlinkComponents(outputRoot, result.path, 'marketplace plugin hook view')
  if (!marketplacePluginTransport(registry).active) {
    if (existsSync(result.path)) rmSync(result.path, { force: false })
    return result.path
  }
  atomicWriteProviderTarget({
    outputRoot,
    target: result.path,
    content: `${JSON.stringify(buildClaudePluginHookView({ registry, sourceRoot }).config, null, 2)}\n`,
    mode: 0o644,
    label: 'marketplace plugin hook view',
  })
  return result.path
}

// Compatibility exports retained for the fork builder. They now derive from the neutral registry.
const legacyCodexProviderId = PROVIDER_REGISTRY.canonical.compatibilityProjections.legacyCodexCorpus.providerId
const codexProjection = buildProviderHookView({ providerId: legacyCodexProviderId })
export const PROJECTED = [...new Set(codexProjection.projected.map((item) => item.hook).filter((item) => !item.includes(' ')))].sort().map((hook) => ({ hook }))
export const NOT_PROJECTED = codexProjection.excluded

export function buildHooksJson({ entries = PROJECTED, commandFor, sourceNote = 'provider-neutral hook registry' } = {}) {
  const allow = new Set(entries.map((item) => item.hook))
  const registrations = hookRegistry()
  const hooks = {}
  for (const [event, groups] of Object.entries(registrations.hooks || {})) {
    for (const group of groups) {
      const selected = group.hooks.filter((item) => item.kind === 'hook' && allow.has(item.hook))
      if (!selected.length) continue
      hooks[event] ||= []
      hooks[event].push({
        ...(group.matcher ? { matcher: group.matcher } : {}),
        hooks: selected.map((item) => ({ type: 'command', command: commandFor(item.hook) })),
      })
    }
  }
  return { description: `_generated from ${sourceNote}; native hooks are not a security boundary.`, hooks }
}

export function buildIndependentReviewSkill({ targetProvider, transform = (value) => value } = {}) {
  if (!targetProvider) throw new Error('independent review projection requires an explicit targetProvider => ADAPTER-BLOCKED')
  return transform(buildProviderSkillDriver({ skillName: 'independent-review', targetProvider }))
}

function treeTargets({ sourceRoot, outputRoot, canonicalDirectory, outputDirectory }) {
  const sourceDirectory = resolveContained(sourceRoot, canonicalDirectory, 'canonical managed tree')
  const destinationDirectory = resolveContained(outputRoot, outputDirectory, 'provider managed output tree')
  assertNoSymlinkComponents(sourceRoot, sourceDirectory, 'canonical managed tree')
  assertNoSymlinkComponents(outputRoot, destinationDirectory, 'provider managed output tree')
  return walkFiles(sourceDirectory, { root: sourceDirectory, label: 'canonical managed tree' }).map((source) => readTarget(
    resolveContained(destinationDirectory, posix(relative(sourceDirectory, source)), 'provider managed output file'),
    source,
  ))
}

export function buildProviderAdapterTargets({
  registry = PROVIDER_REGISTRY,
  semantics = PROVIDER_SKILL_SEMANTICS,
  sourceRoot = ROOT,
  outputRoot = ROOT,
  providerIds,
} = {}) {
  assertNoSymlinkComponents(sourceRoot, sourceRoot, 'provider adapter source root')
  assertNoSymlinkComponents(outputRoot, outputRoot, 'provider adapter output root')
  assertProviderContractSources({ registry, sourceRoot })
  validateProviderRegistry(registry, { sourceRoot })
  validateProviderSkillSemantics(semantics)
  const skillScan = scanCanonicalSkillSemantics({ registry, semantics, sourceRoot })
  const requested = providerIds ? new Set(providerIds) : null
  if (requested) for (const id of requested) providerById(id, registry)
  const targets = []
  const managedRoots = []
  const managedFiles = []
  const report = []
  const coverageTarget = buildProviderHookCoverageTarget({ registry, sourceRoot, outputRoot })
  managedFiles.push(coverageTarget.path)
  targets.push(coverageTarget)
  for (const provider of registry.providers) {
    if (requested && !requested.has(provider.id)) continue
    if (!provider.adapter.generate) {
      report.push({ provider: provider.id, generated: false, exclusions: provider.adapter.exclusions })
      continue
    }
    const instruction = materializeProviderInstruction({ provider, registry, sourceRoot })
    if (instruction) {
      const output = resolveContained(outputRoot, provider.instructionEntry, `${provider.id}.instructionEntry`)
      managedFiles.push(output)
      targets.push({ path: output, ...instruction })
    }
    for (const [canonicalName, outputDirectory] of Object.entries(provider.adapter.repositoryManagedTrees || {})) {
      const canonicalDirectory = registry.canonical.roots[canonicalName]
      if (!canonicalDirectory) throw new Error(`${provider.id}:unknown canonical tree:${canonicalName}`)
      managedRoots.push(resolveContained(outputRoot, outputDirectory, `${provider.id}.adapter.repositoryManagedTrees.${canonicalName}`))
      targets.push(...treeTargets({ sourceRoot, outputRoot, canonicalDirectory, outputDirectory }))
    }
    if (provider.adapter.skillView) {
      managedRoots.push(resolveContained(outputRoot, provider.adapter.skillView.directory, `${provider.id}.adapter.skillView.directory`))
      targets.push(...buildSharedSkillTargets({ sourceRoot, outputRoot, targetProvider: provider.id, registry, semantics }))
    }
    let hookResult = { projected: [], excluded: [] }
    if (provider.adapter.hookView) {
      hookResult = buildProviderHookView({ providerId: provider.id, registry, sourceRoot })
      const output = resolveContained(outputRoot, provider.adapter.hookView.output, `${provider.id}.adapter.hookView.output`)
      managedFiles.push(output)
      targets.push({ path: output, content: Buffer.from(`${JSON.stringify(hookResult.config, null, 2)}\n`), mode: 0o644, source: registry.canonical.hookRegistrations })
    }
    report.push({ provider: provider.id, generated: true, projectedHooks: hookResult.projected.length, exclusions: hookResult.excluded })
  }
  // Claude's marketplace plugin is another generated transport view of the same registrations,
  // never a hand-maintained fourth hook inventory. Its exec-form runner reads policy from the
  // immutable plugin corpus while operating only on the consumer target Git checkout.
  const pluginTransport = marketplacePluginTransport(registry)
  if (!requested || requested.has(pluginTransport.providerId)) {
    const output = resolveContained(outputRoot, pluginTransport.hookOutput, 'marketplace plugin hook view')
    managedFiles.push(output)
  }
  if (pluginTransport.active && (!requested || requested.has(pluginTransport.providerId))) {
    const plugin = buildClaudePluginHookView({ registry, sourceRoot })
    const output = resolveContained(outputRoot, pluginTransport.hookOutput, 'marketplace plugin hook view')
    targets.push({
      path: output,
      content: Buffer.from(`${JSON.stringify(plugin.config, null, 2)}\n`),
      mode: 0o644,
      source: registry.canonical.hookRegistrations,
    })
  }
  const unique = new Map()
  for (const target of targets) {
    const key = resolve(target.path)
    if (unique.has(key)) throw new Error(`provider adapter target collision:${posix(relative(outputRoot, key))}`)
    unique.set(key, target)
  }
  return {
    targets: [...unique.values()].sort((a, b) => compareUtf8Bytes(a.path, b.path)),
    managedRoots: [...new Set(managedRoots)],
    managedFiles: [...new Set(managedFiles)],
    report,
    skillScan,
  }
}

export function checkProviderAdapterTargets(options = {}) {
  const outputRoot = options.outputRoot || ROOT
  const built = buildProviderAdapterTargets(options)
  for (const file of built.managedFiles) {
    assertNoSymlinkComponents(outputRoot, file, 'provider managed output file')
    if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error(`provider managed output file is a symbolic link:${posix(relative(outputRoot, file))}`)
  }
  const expected = new Map(built.targets.map((target) => [resolve(target.path), target]))
  const actual = new Set(built.managedFiles.filter(existsSync).map((path) => resolve(path)))
  for (const root of built.managedRoots) {
    assertNoSymlinkComponents(outputRoot, root, 'provider managed output tree')
    for (const path of walkFiles(root, { root, label: 'provider managed output tree' })) actual.add(resolve(path))
  }
  const drift = []
  for (const [path, target] of expected) {
    if (!existsSync(path)) drift.push({ path: posix(relative(outputRoot, path)), kind: 'missing' })
    else if (!readFileSync(path).equals(target.content)) drift.push({ path: posix(relative(outputRoot, path)), kind: 'content' })
    else if ((statSync(path).mode & 0o777) !== target.mode) drift.push({ path: posix(relative(outputRoot, path)), kind: 'mode' })
  }
  for (const path of actual) if (!expected.has(path)) drift.push({ path: posix(relative(outputRoot, path)), kind: 'extra' })
  return { ...built, drift: drift.sort((a, b) => compareUtf8Bytes(a.path, b.path)) }
}

export function writeProviderAdapterTargets(options = {}) {
  const outputRoot = options.outputRoot || ROOT
  const built = buildProviderAdapterTargets(options)
  for (const root of built.managedRoots) assertNoSymlinkComponents(outputRoot, root, 'provider managed output tree')
  for (const file of built.managedFiles) assertNoSymlinkComponents(outputRoot, file, 'provider managed output file')
  for (const target of built.targets) assertNoSymlinkComponents(outputRoot, target.path, 'provider adapter target')
  for (const root of built.managedRoots) if (existsSync(root)) rmSync(root, { recursive: true, force: true })
  const expected = new Set(built.targets.map((target) => resolve(target.path)))
  for (const file of built.managedFiles) if (existsSync(file) && !expected.has(resolve(file))) rmSync(file, { force: false })
  for (const target of built.targets) {
    atomicWriteProviderTarget({
      outputRoot,
      target: target.path,
      content: target.content,
      mode: target.mode,
      label: `provider adapter target ${posix(relative(outputRoot, target.path))}`,
    })
  }
  return built
}

export function verifyEligibility({ registry = PROVIDER_REGISTRY, semantics = PROVIDER_SKILL_SEMANTICS, sourceRoot = ROOT } = {}) {
  const errors = []
  try { scanCanonicalSkillSemantics({ registry, semantics, sourceRoot }) } catch (error) { errors.push(`canonical skills:${error.message}`) }
  const registrations = hookRegistry(registry, sourceRoot)
  const hookRoot = resolveContained(sourceRoot, registry.canonical.roots.hooks, 'canonical hook root')
  assertNoSymlinkComponents(sourceRoot, hookRoot, 'canonical hook root')
  const descriptors = Object.values(registrations.hooks || {}).flatMap((groups) => groups.flatMap((group) => group.hooks))
  for (const descriptor of descriptors) {
    const source = resolve(hookRoot, descriptor.hook)
    if (!existsSync(source)) { errors.push(`${descriptor.hook}:canonical hook is missing`); continue }
    if (lstatSync(source).isSymbolicLink()) { errors.push(`${descriptor.hook}:canonical hook must not be a symbolic link`); continue }
    if (descriptor.runtime === 'bash') {
      try { execFileSync('bash', ['-n', source], { stdio: 'pipe' }) } catch { errors.push(`${descriptor.hook}:bash syntax error`) }
    }
  }
  for (const source of walkFiles(hookRoot, { root: hookRoot, label: 'canonical hook root' })) {
    const rel = posix(relative(hookRoot, source))
    if (rel.startsWith('tests/') || rel.startsWith('retired/') || !/\.(?:sh|py|mjs)$/.test(rel)) continue
    const body = readFileSync(source, 'utf8')
    const legacy = body.match(/CLAUDE_(?:PROJECT_DIR|TRANSCRIPT_PATH|PLUGIN_ROOT|TOOL_INPUT|BYPASS_[A-Z0-9_]+)/g)
    if (legacy) errors.push(`${rel}:provider-branded core env:${[...new Set(legacy)].join(',')}`)
  }
  return [...new Set(errors)].sort()
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (isMain) {
  const check = process.argv.includes('--check')
  const pluginOnly = process.argv.includes('--plugin-only')
  const coverageOnly = process.argv.includes('--coverage-only')
  const errors = verifyEligibility()
  if (errors.length) {
    console.error('❌ PROVIDER-ADAPTER SOURCE INVALID:')
    for (const error of errors) console.error(`   - ${error}`)
    process.exit(1)
  }
  if (pluginOnly) {
    const result = checkClaudePluginHookView()
    if (check && !result.ok) {
      console.error(`❌ CLAUDE PLUGIN HOOK VIEW DRIFT:${result.kind}`)
      process.exit(1)
    }
    if (!check) writeClaudePluginHookView()
    console.log(`✅ Claude plugin hook view ${check ? 'matches' : 'generated from'} canonical registrations`)
    process.exit(0)
  }
  if (coverageOnly) {
    const result = checkProviderHookCoverageArtifact()
    if (check && !result.ok) {
      console.error(`❌ PROVIDER HOOK COVERAGE DRIFT:${result.kind}`)
      process.exit(1)
    }
    if (!check) writeProviderHookCoverageArtifact()
    console.log(`✅ provider hook coverage ${check ? 'matches' : 'generated from'} canonical registrations and provider capabilities`)
    process.exit(0)
  }
  if (check) {
    const result = checkProviderAdapterTargets()
    if (result.drift.length) {
      console.error('❌ PROVIDER-ADAPTER DRIFT:')
      for (const item of result.drift) console.error(`   - ${item.path}:${item.kind}`)
      process.exit(1)
    }
    console.log(`✅ provider-adapter --check PASS (${result.targets.length} files; ${result.report.map((item) => `${item.provider}:${item.generated ? item.projectedHooks : item.exclusions.length}`).join(', ')})`)
  } else {
    const result = writeProviderAdapterTargets()
    console.log(`✅ generated deterministic provider views (${result.targets.length} files)`)
    for (const item of result.report) console.log(`   ${item.provider}: ${item.generated ? `${item.projectedHooks} hook registrations` : item.exclusions.map((entry) => entry.reasonCode).join(', ')}`)
  }
}
