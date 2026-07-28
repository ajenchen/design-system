#!/usr/bin/env node
/**
 * Fail-closed guard for the remaining high-risk SSOT authority surfaces.
 *
 * Provider roots may appear as generated adapter destinations or explicitly labelled historical
 * provenance. They may not appear in owner/ssot/consumer metadata, canonical read paths, or build
 * graph sources except for the narrow plugin-alias materializer dependency and
 * the exact canonical-to-generated Harness mirror parity projection.
 * Bare CLAUDE.md mentions likewise require same-line adapter/provider-specific or provenance
 * disclosure whenever the line uses active SSOT, required-read, canonical, or authority language.
 */
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  CONTROL_PLANE_GENESIS_CLOSED_STATE,
  CONTROL_PLANE_GENESIS_OPEN_STATE,
  CONTROL_PLANE_GENESIS_TOMBSTONES,
  assertControlPlaneGenesisTombstones,
  loadControlPlaneGenesisTransition,
} from './lib/control-plane-genesis-transition.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

function valueOf(flag) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

const ROOT = realpathSync(resolve(valueOf('--root') || process.cwd()))
const BARE_CLAUDE_MD = /(?<![A-Za-z0-9_.\\/-])CLAUDE\.md(?![A-Za-z0-9_.\\/-])/i
const LITERAL_POSIX_USER_HOME = /(?:^|[\s`"'(:=]|file:\/\/)\/(?:Users|home|mnt\/[A-Za-z]\/Users)\/(?!<|\$|\{|\\)[A-Za-z0-9._-]+(?:\/|[\s`"'),:;]|$)/i
const LITERAL_WINDOWS_USER_HOME = /(?:^|[\s`"'(:=]|file:\/\/\/?)[A-Za-z]:(?:\\|\/)Users(?:\\|\/)(?!<|%|\$|\{|\\)[^\\/\s`"'):,;]+(?:\\|\/|[\s`"'),:;]|$)/i
const errors = []

function contained(path) {
  const rel = relative(ROOT, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function regular(relativePath, label = relativePath) {
  const path = resolve(ROOT, relativePath)
  if (!contained(path) || !existsSync(path)) throw new Error(`${label} missing or outside repository:${relativePath}`)
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`${label} must be one regular file:${relativePath}`)
  return path
}

function text(relativePath) {
  return readFileSync(regular(relativePath), 'utf8')
}

function json(relativePath) {
  try { return JSON.parse(text(relativePath)) } catch (error) { throw new Error(`${relativePath} is not valid JSON:${error.message}`) }
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function topLevelMarkdownSection(markdown, heading) {
  const lines = markdown.split('\n')
  const marker = `# ${heading}`
  const start = lines.findIndex((line) => line.trim() === marker)
  if (start < 0) return null
  const next = lines.findIndex((line, index) => index > start && /^#\s+\S/.test(line))
  return lines.slice(start, next < 0 ? lines.length : next).join('\n')
}

function topLevelMarkdownHeadingCount(markdown, heading) {
  const marker = `# ${heading}`
  return markdown.split('\n').filter((line) => line.trim() === marker).length
}

const providerRegistry = json('packages/governance/canonical/providers.json')
const providerRoots = [...new Set([
  ...(providerRegistry?.canonical?.reservedDiscovery?.providerRootNames || []),
  ...(providerRegistry?.providers || []).flatMap((provider) => provider?.adapter?.discovery?.providerRootNames || []),
])].sort()
if (!providerRoots.length) throw new Error('provider registry has no discovery roots')
const providerRootAlternation = providerRoots
  .map(regexEscape)
  .join('|')
const PROVIDER_ROOT = new RegExp(`(?:^|[/\`~])(?:${providerRootAlternation})(?:[/\`]|$)`, 'i')
const isProviderSource = (source) => typeof source === 'string' && providerRoots.some((root) => source === root || source.startsWith(`${root}/`))

function record(condition, message) {
  if (!condition) errors.push(message)
}

function pathEntryExists(relativePath) {
  const path = resolve(ROOT, relativePath)
  if (!contained(path)) throw new Error(`tombstone path escapes repository:${relativePath}`)
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const genesisTransition = loadControlPlaneGenesisTransition({ root: ROOT })
if (genesisTransition.state === CONTROL_PLANE_GENESIS_OPEN_STATE) {
  try {
    assertControlPlaneGenesisTombstones({
      root: ROOT,
      materializationRoot: ROOT,
      transition: genesisTransition,
    })
  } catch (error) {
    errors.push(error.message)
  }
} else if (genesisTransition.state === CONTROL_PLANE_GENESIS_CLOSED_STATE) {
  for (const { path } of CONTROL_PLANE_GENESIS_TOMBSTONES) {
    record(!pathEntryExists(path), `closed transition legacy tombstone must remain absent:${path}`)
  }
}

const agents = text('AGENTS.md')
const independentReview = topLevelMarkdownSection(agents, 'Independent second opinion(跨 provider 對抗審查)')
const taskNavigation = topLevelMarkdownSection(agents, '任務導航表')
record(independentReview !== null, 'AGENTS.md must retain one top-level provider-neutral independent-review section')
record(taskNavigation !== null, 'AGENTS.md must retain one top-level task-navigation section')
record(topLevelMarkdownHeadingCount(agents, 'Independent second opinion(跨 provider 對抗審查)') === 1, 'AGENTS.md must contain exactly one top-level independent-review section')
record(topLevelMarkdownHeadingCount(agents, '任務導航表') === 1, 'AGENTS.md must contain exactly one top-level task-navigation section')

const reviewRoutingRequirements = [
  'packages/governance/canonical/providers.json',
  'packages/governance/src/provider-review-binding.mjs',
  'resolveProviderReviewBinding',
  'packages/design-system/ds-canonical/skills/independent-review/SKILL.md',
  'packages/design-system/ds-canonical/skills/deep-audit-cross-codex/SKILL.md',
  'REVIEW-BLOCKED',
]
for (const required of reviewRoutingRequirements) {
  record(independentReview?.includes(required), `AGENTS.md independent-review routing must name canonical requirement:${required}`)
}

const legacyDeepAuditSkillPath = 'packages/design-system/ds-canonical/skills/deep-audit-cross-codex/SKILL.md'
const registeredConcreteProviderTerms = [...new Set((providerRegistry.providers || [])
  .filter((provider) => provider?.providerKind === 'concrete-runtime')
  .flatMap((provider) => [provider.id, provider.displayName])
  .filter((value) => typeof value === 'string' && value.trim())
  .map((value) => value.trim()))]

const memoryIndexPath = 'governance/memory/MEMORY.md'
const memoryIndex = text(memoryIndexPath)
const activeMemoryIndex = memoryIndex.split(/\n---\s*\n/u, 1)[0]
const activeMemoryLinks = [...activeMemoryIndex.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)]
  .map((match) => match[1])
const activeMemoryPaths = []
const memoryRoot = resolve(ROOT, 'governance/memory')
record(activeMemoryLinks.length > 0, `${memoryIndexPath} must index at least one active memory`)
record(new Set(activeMemoryLinks).size === activeMemoryLinks.length, `${memoryIndexPath} contains duplicate active-memory links`)
for (const link of activeMemoryLinks) {
  const absolute = resolve(memoryRoot, link)
  if (!contained(absolute) || relative(memoryRoot, absolute).startsWith(`..${sep}`) || isAbsolute(relative(memoryRoot, absolute))) {
    errors.push(`${memoryIndexPath} active-memory link escapes governance/memory:${link}`)
    continue
  }
  const relativePath = relative(ROOT, absolute).split(sep).join('/')
  try {
    regular(relativePath, `${memoryIndexPath} active-memory link`)
    activeMemoryPaths.push(relativePath)
  } catch (error) {
    errors.push(error.message)
  }
}

const activeMemoryDisclosure = /historical\s+non-authority|non-authority\s+historical|retired|退役|歷史.{0,24}(?:非|non-)authority|禁止當\s*current|不得當\s*current|不是\s*(?:current\s*)?(?:SSOT|authority)/iu
const operationalMandate = /SSOT|canonical|authority|規則(?:\(硬\))?|必(?:須|經|跑|加|用)|唯一\s*(?:working|入口|路徑)|\bmust\b|\brequired\b/iu
const providerNativeTransport = /(?:\bcodex\s+exec\b|node_modules\/\.bin\/codex\b|scripts\/codex-run-guarded\.mjs\b|--dangerously-bypass-approvals-and-sandbox\b|(?:^|[\s`])@codex\b)/iu
const retiredCodexWrapper = /scripts\/codex-run-guarded\.mjs[^\n]{0,120}(?:--brief|--stdin)|(?:--brief|--stdin)[^\n]{0,120}scripts\/codex-run-guarded\.mjs/iu
const fixedProviderLayer = /(?:Layer|Track)\s*A[^\n]{0,120}\b(Claude|Codex)\b[^\n]{0,120}(?:Layer|Track)\s*B[^\n]{0,120}\b(Claude|Codex)\b/giu
const activeMemoryDocuments = [memoryIndexPath, ...activeMemoryPaths]
for (const file of activeMemoryDocuments) {
  const body = text(file)
  for (const match of body.matchAll(fixedProviderLayer)) {
    if (match[1].toLowerCase() !== match[2].toLowerCase() && !activeMemoryDisclosure.test(match[0])) {
      errors.push(`${file} fixes Layer/Track A and B to concrete providers instead of resolving an independent peer`)
    }
  }
  body.split('\n').forEach((line, index) => {
    if (retiredCodexWrapper.test(line) && !activeMemoryDisclosure.test(line)) {
      errors.push(`${file}:${index + 1} promotes the retired codex-run-guarded --brief/--stdin entrypoint`)
    }
    if (providerNativeTransport.test(line) && operationalMandate.test(line) && !activeMemoryDisclosure.test(line)) {
      errors.push(`${file}:${index + 1} promotes provider-native transport as active operational authority`)
    }
    for (const claim of line.matchAll(/`?(packages\/design-system\/ds-canonical\/skills\/[^`\s)]+\/SKILL\.md)`?[^.\n]{0,160}\bStep\s+([0-9]+(?:\.[0-9]+)*)/giu)) {
      const [whole, skillPath, step] = claim
      if (activeMemoryDisclosure.test(whole)) continue
      let skill
      try {
        skill = text(skillPath)
      } catch (error) {
        errors.push(`${file}:${index + 1} cites an unavailable canonical skill step:${error.message}`)
        continue
      }
      if (!new RegExp(`\\bStep\\s+${regexEscape(step)}(?![0-9.])`, 'iu').test(skill)) {
        errors.push(`${file}:${index + 1} cites nonexistent ${skillPath} Step ${step}`)
      }
    }
  })
}

function providerIdentityResidue(markdown, allowedReferences = []) {
  let inspected = markdown || ''
  for (const reference of allowedReferences) inspected = inspected.split(reference).join('<provider-neutral-workflow>')
  return registeredConcreteProviderTerms.filter((term) => (
    new RegExp(`(?<![A-Za-z0-9])${regexEscape(term)}(?![A-Za-z0-9])`, 'iu').test(inspected)
  ))
}

const independentIdentityResidue = providerIdentityResidue(independentReview, [legacyDeepAuditSkillPath])
record(
  independentIdentityResidue.length === 0,
  `AGENTS.md independent-review prose hard-codes registered provider identities instead of resolving a binding:${independentIdentityResidue.join(', ')}`,
)
record(
  !/(?:authored|author|reviewer|peer|transport)[^\n]{0,80}(?:→|->)[^\n]{0,80}(?:authored|author|reviewer|peer|transport)/iu.test(independentReview || ''),
  'AGENTS.md independent-review prose contains a fixed author/reviewer/transport route',
)

const taskNavigationIdentityResidue = providerIdentityResidue(taskNavigation, ['/deep-audit-cross-codex'])
record(
  taskNavigationIdentityResidue.length === 0,
  `AGENTS.md task navigation hard-codes a registered provider identity:${taskNavigationIdentityResidue.join(', ')}`,
)
record(!/(?:\/|skills\/)codex-collab(?:\/|\b)/i.test(taskNavigation || ''), 'AGENTS.md task navigation routes peer work through the legacy codex-collab surface')
for (const required of [
  '**跨 provider 討論 / 多輪震盪 / 任何 peer 輸出**',
  'packages/governance/canonical/providers.json',
  'packages/governance/src/provider-review-binding.mjs',
  'resolveProviderReviewBinding',
  '/independent-review',
  '/deep-audit-cross-codex',
]) {
  record(taskNavigation?.includes(required), `AGENTS.md task navigation must retain provider-adaptive review routing:${required}`)
}

const globalReviewRouteResidue = []
for (const [index, line] of agents.split('\n').entries()) {
  if (!/(?:\b(?:authored|author|review(?:er)?|peer|transport|second opinion)\b|第二意見|討論|輸出)/iu.test(line)) continue
  const residue = providerIdentityResidue(line, [legacyDeepAuditSkillPath, '/deep-audit-cross-codex'])
  if (residue.length) globalReviewRouteResidue.push(`${index + 1}:${residue.join(',')}`)
}
record(
  globalReviewRouteResidue.length === 0,
  `AGENTS.md contains a provider-specific review route outside canonical binding resolution:${globalReviewRouteResidue.join('; ')}`,
)

function canonicalReference(value, label) {
  record(typeof value === 'string' && value.length > 0, `${label} must be a non-empty canonical path`)
  if (typeof value !== 'string' || !value) return
  record(!PROVIDER_ROOT.test(value), `${label} points at a generated provider view:${value}`)
  const path = value.split('#')[0]
  try { regular(path, label) } catch (error) { errors.push(error.message) }
}

const storyPath = 'packages/design-system/ds-canonical/references/story-baseline-registry.json'
const story = json(storyPath)
record(story?.schemaVersion === 1, 'story baseline registry must declare schemaVersion 1')
record(story?._meta?.owner === storyPath, `story baseline owner must be ${storyPath}`)
record(Array.isArray(story?._meta?.consumed_by) && story._meta.consumed_by.length > 0, 'story baseline consumed_by must be a non-empty canonical inventory')
for (const [index, consumer] of (story?._meta?.consumed_by || []).entries()) canonicalReference(consumer, `story consumed_by[${index}]`)
record(typeof story?._meta?.provider_view_policy === 'string' && story._meta.provider_view_policy.length > 0, 'story baseline registry must disclose generated provider views as non-authority')

const utilityPath = 'packages/design-system/src/tokens/utility-registry.json'
const utility = json(utilityPath)
record(utility?.schemaVersion === 1, 'utility registry must declare schemaVersion 1')
record(utility?._meta?.owner === utilityPath, `utility registry owner must be ${utilityPath}`)
record(Array.isArray(utility?._meta?.consumed_by) && utility._meta.consumed_by.length > 0, 'utility registry consumed_by must be a non-empty canonical inventory')
for (const [index, consumer] of (utility?._meta?.consumed_by || []).entries()) canonicalReference(consumer, `utility consumed_by[${index}]`)
record(typeof utility?._meta?.provider_view_policy === 'string' && utility._meta.provider_view_policy.length > 0, 'utility registry must disclose generated provider views as non-authority')

const principlePath = 'packages/design-system/ds-canonical/references/principle-dim-map.json'
const principle = json(principlePath)
record(principle?._meta?.ssot === principlePath, `principle map ssot must own itself:${principlePath}`)
record(Array.isArray(principle?._meta?.governedBy) && principle._meta.governedBy.length >= 2, 'principle map governedBy must enumerate canonical governing inputs')
for (const [index, source] of (principle?._meta?.governedBy || []).entries()) canonicalReference(source, `principle governedBy[${index}]`)

const authorityKeys = new Set(['owner', 'ssot', 'source', 'source_ssot', 'consumed_by'])
function inspectAuthorityMetadata(value, path = '$') {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectAuthorityMetadata(entry, `${path}[${index}]`))
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    if (authorityKeys.has(key)) {
      const entries = Array.isArray(entry) ? entry : [entry]
      for (const item of entries) if (typeof item === 'string' && PROVIDER_ROOT.test(item)) {
        errors.push(`${path}.${key} names a generated provider view as authority:${item}`)
      }
    }
    inspectAuthorityMetadata(entry, `${path}.${key}`)
  }
}
inspectAuthorityMetadata(story, 'story')
inspectAuthorityMetadata(utility, 'utility')
inspectAuthorityMetadata(principle, 'principle')

const failurePath = 'packages/design-system/ds-canonical/references/failure-class-registry.json'
const failure = json(failurePath)
record(failure?._meta?.owner === failurePath, `failure-class owner must be ${failurePath}`)
record(!Object.hasOwn(failure?._meta || {}, 'source'), 'failure-class provider snapshot must not occupy generic _meta.source authority field')
const legacy = failure?._meta?.legacyProvenance
record(typeof legacy === 'string' && PROVIDER_ROOT.test(legacy) && /(?:legacy|historical)/i.test(legacy) && /non-authority/i.test(legacy), 'failure-class legacy provider snapshot must be isolated under legacyProvenance and labelled historical/non-authority')

const scenarioTest = text('scripts/test-2-scenario-architecture.mjs')
record(!scenarioTest.split('\n').some((line) => /readFile/.test(line) && PROVIDER_ROOT.test(line)), 'scenario architecture test reads a generated provider view as canonical input')
record(scenarioTest.includes("const SCENARIO_SSOT = `${CANONICAL_ROOT}/references/scenario-definition.md`"), 'scenario architecture test must bind its SSOT to the canonical reference path')
record(/registry-declared Claude adapter|registry-declared\n?\/\/ generated discovery adapters/.test(scenarioTest), 'scenario architecture test must label provider-path checks as registry-declared adapter verification')

const pluginValidator = text('scripts/plugin-structure-validate.mjs')
record(!pluginValidator.split('\n').some((line) => /readFileSync/.test(line) && PROVIDER_ROOT.test(line)), 'plugin validator reads a generated provider setting as comparison authority')
record(pluginValidator.includes("buildProviderHookView({ providerId: 'claude' })"), 'plugin validator must derive the repository provider projection from canonical registrations')

const metaRunner = text('scripts/run-gate-meta-tests.mjs')
record(!metaRunner.split('\n').some((line) => /git status --porcelain/.test(line) && PROVIDER_ROOT.test(line)), 'gate meta-test clean scope names generated provider views')

const forkClassification = json('scripts/fork-governance-classification.json')
record(/ds-canonical/.test(forkClassification?._meta?.authority || '') && /outputs only/i.test(forkClassification?._meta?.authority || ''), 'fork-governance classification must declare canonical authority and provider views as outputs only')
const hookClassification = json('scripts/fork-hook-classification.json')
record(/ds-canonical\/hooks/.test(hookClassification?._meta?.authority || '') && /generated\/materialized outputs/i.test(hookClassification?._meta?.authority || ''), 'fork-hook classification must declare canonical hook authority and generated outputs')
record(!/\.claude\/\{logs,memory\}[^\n]*\[ -d \]/.test(JSON.stringify(hookClassification)), 'fork-hook rewrite policy still legitimizes guarded provider-home reads')

const graph = json('scripts/governance-build-graph.json')
const pluginAliases = json('packages/governance/canonical/plugin-aliases.json')
const pluginAliasProvider = providerRegistry.providers.find((provider) => provider.id === pluginAliases.providerId)
const harnessMirrorProviderSources = ['.claude/hooks/tests/']
const expectedPluginProviderSources = (pluginAliases.aliases || []).map((alias) => {
  const destination = alias.source?.kind === 'repositoryManagedTree'
    ? pluginAliasProvider?.adapter?.repositoryManagedTrees?.[alias.source.key]
    : alias.source?.kind === 'skillView'
      ? pluginAliasProvider?.adapter?.skillView?.directory
      : null
  return typeof destination === 'string' ? `${destination}/` : null
}).filter(Boolean).sort()
for (const stage of graph.stages || []) {
  const providerSources = (stage.sources || []).filter(isProviderSource).sort()
  if (stage.id === 'plugin-aliases') {
    record(JSON.stringify(providerSources) === JSON.stringify([...new Set(expectedPluginProviderSources)]), 'plugin-aliases must be the sole registry-derived narrow adapter-to-alias materializer input')
  } else if (stage.id === 'harness-authority-bindings') {
    record(
      JSON.stringify(providerSources) === JSON.stringify(harnessMirrorProviderSources),
      `harness-authority-bindings may consume only the exact generated hook-test mirror:${providerSources.join(', ')}`,
    )
  } else {
    record(providerSources.length === 0, `${stage.id} consumes generated provider views as build sources:${providerSources.join(', ')}`)
  }
}

function markdownFiles(relativeRoot, result = []) {
  const root = resolve(ROOT, relativeRoot)
  if (!existsSync(root)) return result
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
    const relativePath = `${relativeRoot}/${entry.name}`
    if (entry.isDirectory()) markdownFiles(relativePath, result)
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(relativePath)
  }
  return result
}

function portableTextFiles(relativeRoot, result = []) {
  const root = resolve(ROOT, relativeRoot)
  if (!existsSync(root)) return result
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
    const relativePath = `${relativeRoot}/${entry.name}`
    if (entry.isSymbolicLink()) {
      errors.push(`${relativePath} must not be a symlink inside a canonical shipped instruction surface`)
    } else if (entry.isDirectory()) {
      portableTextFiles(relativePath, result)
    } else if (entry.isFile() && /\.(?:md|json|jsonl|ya?ml|txt|sh|mjs|cjs|js|ts|tsx|py)$/i.test(entry.name)) {
      result.push(relativePath)
    }
  }
  return result
}

// Canonical, shipped governance text must be relocatable. Generated provider adapters and
// historical planning records are intentionally outside this inventory; literal developer home
// paths in active prompts, rules, skills, or templates would make a clean consumer checkout depend
// on one person's workstation. Portable forms such as <verified-repository-root>, $HOME,
// ${HOME}, %USERPROFILE%, and repository-relative paths remain valid.
for (const file of [
  ...portableTextFiles('packages/design-system/ds-canonical/skills'),
  ...portableTextFiles('packages/design-system/ds-canonical/rules'),
  ...portableTextFiles('packages/design-system/ds-canonical/references'),
  ...portableTextFiles('packages/design-system/ds-canonical/templates'),
  ...portableTextFiles('packages/governance/canonical'),
  ...portableTextFiles('scripts/package-role-sources'),
  ...portableTextFiles('scripts/fork-role-sources'),
]) {
  text(file).split('\n').forEach((line, index) => {
    if (LITERAL_POSIX_USER_HOME.test(line) || LITERAL_WINDOWS_USER_HOME.test(line)) {
      errors.push(`${file}:${index + 1} contains a literal developer home path; inject a verified repository root or use a portable placeholder`)
    }
  })
}

const disclosure = /generated|adapter|non-authority|legacy|historical|provenance|certified|delivery|可重建|不是.{0,8}(?:authority|owner)|非\s*SSOT|compatibility|投影|輸出/i
const bareClaudeDisclosure = /\bgenerated\s+adapter\b|\bprovider[- ]specific\b|\blegacy\b|\bhistorical\b|\bprovenance\b|\bnon[- ]authority\b/i
const providerAuthorityLanguage = /SSOT|owner|必讀|詳(?:見|讀)?|pointer|讀取指標|→\s*/i
const bareClaudeAuthorityLanguage = /SSOT|owner|authority|authoritative|canonical|required(?:[- ]read|\s+reading)|must[- ]read|source[- ]of[- ]truth|en(?:sure|sures|suring)|enforce(?:ment)?(?:\s+layer)?|governance\s+(?:core|home)|必讀|必須|詳(?:見|讀)?|pointer|讀取指標|治理核心|唯一|只改|同步/i
for (const file of [
  ...markdownFiles('packages/design-system/ds-canonical/references'),
  ...markdownFiles('packages/design-system/ds-canonical/rules'),
  ...markdownFiles('governance/memory'),
]) {
  text(file).split('\n').forEach((line, index) => {
    if (PROVIDER_ROOT.test(line) && providerAuthorityLanguage.test(line) && !disclosure.test(line)) {
      errors.push(`${file}:${index + 1} uses a provider view in active authority language without adapter/provenance disclosure`)
    }
    if (BARE_CLAUDE_MD.test(line) && bareClaudeAuthorityLanguage.test(line) && !bareClaudeDisclosure.test(line)) {
      errors.push(`${file}:${index + 1} uses bare CLAUDE.md in active authority language without generated-adapter/provider-specific/legacy/historical/provenance/non-authority disclosure`)
    }
  })
}

if (errors.length) {
  console.error('❌ provider-neutral SSOT residue gate FAIL:')
  for (const error of errors) console.error(`   - ${error}`)
  process.exit(1)
}

console.log('✅ provider-neutral SSOT residue gate PASS(provider-adaptive review routing + canonical owners/reads + bare CLAUDE.md/provider-view disclosure)')
