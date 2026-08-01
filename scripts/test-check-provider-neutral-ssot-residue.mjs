#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONTROL_PLANE_GENESIS_TOMBSTONES,
} from './lib/control-plane-genesis-transition.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const GATE = join(ROOT, 'scripts/check-provider-neutral-ssot-residue.mjs')
const AGENTS = 'AGENTS.md'
const STORY = 'packages/design-system/ds-canonical/references/story-baseline-registry.json'
const UTILITY = 'packages/design-system/src/tokens/utility-registry.json'
const PRINCIPLE = 'packages/design-system/ds-canonical/references/principle-dim-map.json'
const FAILURE = 'packages/design-system/ds-canonical/references/failure-class-registry.json'
const GRAPH = 'scripts/governance-build-graph.json'
const HOOK_CLASSIFICATION = 'scripts/fork-hook-classification.json'
const MEMORY = 'governance/memory/MEMORY.md'
const TOMBSTONES = CONTROL_PLANE_GENESIS_TOMBSTONES.map(item => item.path)

function indexedMemoryFiles(root = ROOT) {
  const index = readFileSync(join(root, MEMORY), 'utf8').split(/\n---\s*\n/u, 1)[0]
  return [...index.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)]
    .map((match) => `governance/memory/${match[1]}`)
}

const required = [
  AGENTS,
  STORY,
  UTILITY,
  PRINCIPLE,
  FAILURE,
  'packages/design-system/ds-canonical/hooks/check_story_invariants.sh',
  'packages/design-system/ds-canonical/hooks/check_opacity_token_usage.sh',
  'packages/design-system/ds-canonical/hooks/check_consumer_code_quality.sh',
  'packages/design-system/ds-canonical/hooks/lib/_token_hygiene.sh',
  'packages/design-system/ds-canonical/skills/story-writing/SKILL.md',
  'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md',
  'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md',
  MEMORY,
  ...indexedMemoryFiles(),
  'packages/design-system/ds-canonical/skills/codex-collab/SKILL.md',
  'scripts/test-2-scenario-architecture.mjs',
  'scripts/plugin-structure-validate.mjs',
  'scripts/run-gate-meta-tests.mjs',
  'scripts/fork-governance-classification.json',
  'packages/governance/canonical/providers.json',
  'packages/governance/canonical/plugin-aliases.json',
  HOOK_CLASSIFICATION,
  GRAPH,
  'scripts/lib/control-plane-genesis-transition.mjs',
]

function activateMemory(root, filename, body) {
  const relativePath = `governance/memory/${filename}`
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  mutateText(root, MEMORY, value => value.replace(
    '\n---\n',
    `\n- [active poison](${filename}) — fixture\n\n---\n`,
  ))
  return path
}

function install(root) {
  for (const relativePath of required) {
    const destination = join(root, relativePath)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(ROOT, relativePath), destination)
  }
}

function run(root) {
  return spawnSync(process.execPath, ['--', GATE, '--root', root, '--check'], { encoding: 'utf8' })
}

function mutateJson(root, relativePath, mutator) {
  const path = join(root, relativePath)
  const value = JSON.parse(readFileSync(path, 'utf8'))
  mutator(value)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function mutateText(root, relativePath, mutator) {
  const path = join(root, relativePath)
  const before = readFileSync(path, 'utf8')
  const after = mutator(before)
  assert.notEqual(after, before, `text poison did not mutate ${relativePath}`)
  writeFileSync(path, after)
}

const fixture = mkdtempSync(join(tmpdir(), 'provider-neutral-ssot-residue-'))
try {
  install(fixture)
  assert.equal(run(fixture).status, 0, 'clean canonical fixture must pass')

  // Arbitrary provider-view bytes never affect a canonical verdict.
  mkdirSync(join(fixture, '.claude/references'), { recursive: true })
  mkdirSync(join(fixture, '.codex'), { recursive: true })
  writeFileSync(join(fixture, '.claude/references/story-baseline-registry.json'), '{"_meta":{"owner":"poison"}}\n')
  writeFileSync(join(fixture, '.codex/hooks.json'), '{"poison":true}\n')
  assert.equal(run(fixture).status, 0, 'poisoned provider views changed the verdict')

  assert.equal(run(fixture).status, 0, 'closed transition with absent tombstones must pass')
  for (const tombstonePath of TOMBSTONES) {
    const absolute = join(fixture, tombstonePath)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, 'closed transition poison\n')
    const residue = run(fixture)
    assert.notEqual(residue.status, 0, `closed transition accepted a remaining tombstone:${tombstonePath}`)
    assert.match(residue.stderr, /closed transition legacy tombstone must remain absent/)
    rmSync(absolute)
  }
  install(fixture)

  mutateText(fixture, AGENTS, value => value.replace(
    /^- \*\*路由 authority\*\*:.*$/m,
    '- Claude authored → Codex review (transport = scripts/codex-run-guarded.mjs)\n- Codex authored → Claude review',
  ))
  const fixedPair = run(fixture)
  assert.notEqual(fixedPair.status, 0, 'fixed Claude/Codex author-to-reviewer routing was accepted in AGENTS.md')
  assert.match(fixedPair.stderr, /hard-codes registered provider identities/, 'fixed provider pair did not trigger the provider-identity diagnostic')

  install(fixture)
  mutateText(fixture, AGENTS, value => value.replace(
    /^\| \*\*跨 provider 討論 \/ 多輪震盪 \/ 任何 peer 輸出\*\* \|.*$/m,
    '| **跟 codex 討論 / 多輪震盪 / 任何 codex 輸出** | `packages/design-system/ds-canonical/skills/codex-collab/SKILL.md` |',
  ))
  const legacyNavigation = run(fixture)
  assert.notEqual(legacyNavigation.status, 0, 'legacy codex-collab task-navigation route was accepted in AGENTS.md')
  assert.match(legacyNavigation.stderr, /legacy codex-collab surface/, 'legacy task route did not trigger the codex-collab diagnostic')

  install(fixture)
  mutateText(fixture, AGENTS, value => value
    .replaceAll('packages/governance/src/provider-review-binding.mjs', 'scripts/peer-router.mjs')
    .replaceAll('resolveProviderReviewBinding', 'resolvePeer'))
  const missingResolver = run(fixture)
  assert.notEqual(missingResolver.status, 0, 'review routing without the canonical provider-binding resolver was accepted')
  assert.match(missingResolver.stderr, /canonical requirement:packages\/governance\/src\/provider-review-binding\.mjs/, 'missing canonical resolver did not trigger the routing-authority diagnostic')

  install(fixture)
  mutateJson(fixture, 'packages/governance/canonical/providers.json', value => {
    value.providers.push({
      id: 'future-model',
      displayName: 'Future Model',
      providerKind: 'concrete-runtime',
      adapter: { discovery: {} },
    })
  })
  mutateText(fixture, AGENTS, value => value.replace(
    '\n# SSOT 消費 canonical',
    '\n- Future Model is the mandatory reviewer for every author.\n\n# SSOT 消費 canonical',
  ))
  const futureProviderRoute = run(fixture)
  assert.notEqual(futureProviderRoute.status, 0, 'a newly registered provider hard-coded into AGENTS.md review prose was accepted')
  assert.match(futureProviderRoute.stderr, /hard-codes registered provider identities.*Future Model/, 'future provider hard-coding did not trigger the dynamic registry identity diagnostic')

  install(fixture)
  mutateText(fixture, AGENTS, value => value.replace(
    '\n# 專案 Stack',
    '\nClaude is the fixed reviewer for this repository.\n\n# 專案 Stack',
  ))
  const displacedProviderRoute = run(fixture)
  assert.notEqual(displacedProviderRoute.status, 0, 'a provider-specific review route moved outside the review section was accepted')
  assert.match(displacedProviderRoute.stderr, /outside canonical binding resolution/, 'a displaced provider route bypassed the repository-wide routing diagnostic')

  install(fixture)
  mutateJson(fixture, STORY, value => { value._meta.owner = '.claude/references/story-baseline-registry.json' })
  assert.notEqual(run(fixture).status, 0, 'provider-owned story registry metadata was accepted')

  install(fixture)
  mutateJson(fixture, UTILITY, value => {
    value._meta.consumed_by.push('.codex/hooks/check-utility.sh')
  })
  assert.notEqual(run(fixture).status, 0, 'utility registry accepted a generated provider view as an authority consumer')

  install(fixture)
  mutateJson(fixture, PRINCIPLE, value => { value._meta.ssot = '.codex/principle-dim-map.json' })
  assert.notEqual(run(fixture).status, 0, 'provider-owned principle map metadata was accepted')

  install(fixture)
  mutateJson(fixture, FAILURE, value => { value._meta.legacyProvenance = '.claude/logs/failure-class.json' })
  assert.notEqual(run(fixture).status, 0, 'unlabelled provider provenance was accepted')

  install(fixture)
  const pluginPath = join(fixture, 'scripts/plugin-structure-validate.mjs')
  writeFileSync(pluginPath, readFileSync(pluginPath, 'utf8')
    .replace("const claudeConfig = buildProviderHookView({ providerId: 'claude' }).config", "const claudeConfig = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8'))"))
  assert.notEqual(run(fixture).status, 0, 'generated provider config read was accepted as comparison authority')

  install(fixture)
  mutateJson(fixture, GRAPH, value => {
    value.stages.find(stage => stage.id === 'fork-template').sources.unshift('.codex/hooks.json')
  })
  assert.notEqual(run(fixture).status, 0, 'non-materializer build stage consumed a provider view')

  install(fixture)
  mutateJson(fixture, GRAPH, value => {
    const stage = value.stages.find(item => item.id === 'harness-authority-bindings')
    stage.sources = stage.sources.map(source => source === '.claude/hooks/tests/' ? '.claude/hooks/' : source)
  })
  const widenedHarnessMirror = run(fixture)
  assert.notEqual(widenedHarnessMirror.status, 0, 'Harness authority projection accepted a widened generated provider source')
  assert.match(widenedHarnessMirror.stderr, /may consume only the exact generated hook-test mirror/)

  install(fixture)
  mutateJson(fixture, GRAPH, value => {
    value.stages.find(stage => stage.id === 'harness-authority-bindings').sources.push('.codex/hooks.json')
  })
  const substitutedHarnessMirror = run(fixture)
  assert.notEqual(substitutedHarnessMirror.status, 0, 'Harness authority projection accepted an additional provider source')
  assert.match(substitutedHarnessMirror.stderr, /may consume only the exact generated hook-test mirror/)

  install(fixture)
  mutateJson(fixture, 'packages/governance/canonical/providers.json', value => {
    value.canonical.reservedDiscovery.providerRootNames.push('.future-provider')
    value.canonical.reservedDiscovery.providerRootNames.sort()
  })
  mutateJson(fixture, STORY, value => { value._meta.owner = '.future-provider/references/story-baseline-registry.json' })
  assert.notEqual(run(fixture).status, 0, 'registry-declared future provider root was accepted as canonical authority')

  install(fixture)
  mutateJson(fixture, 'packages/governance/canonical/providers.json', value => {
    value.canonical.reservedDiscovery.providerRootNames.push('.future-provider')
    value.canonical.reservedDiscovery.providerRootNames.sort()
  })
  mutateJson(fixture, GRAPH, value => {
    value.stages.find(stage => stage.id === 'fork-template').sources.unshift('.future-provider/hooks.json')
  })
  assert.notEqual(run(fixture).status, 0, 'non-materializer build stage consumed a registry-declared future provider view')

  install(fixture)
  mutateJson(fixture, HOOK_CLASSIFICATION, value => {
    value._meta.buckets_def.SHIP_REWRITTEN = 'legacy .claude/{logs,memory} read guarded by [ -d ]'
  })
  assert.notEqual(run(fixture).status, 0, 'guarded provider-home read policy was accepted')

  install(fixture)
  const memoryPath = join(fixture, 'governance/memory/provider-authority-poison.md')
  writeFileSync(memoryPath, 'SSOT 詳 `.claude/references/poison.md`。\n')
  assert.notEqual(run(fixture).status, 0, 'active provider-view SSOT prose was accepted')
  rmSync(memoryPath)

  install(fixture)
  writeFileSync(memoryPath, 'Required read and canonical authority: `CLAUDE.md`.\n')
  assert.notEqual(run(fixture).status, 0, 'bare CLAUDE.md was accepted as active authority')
  writeFileSync(memoryPath, 'Historical provenance note.\nRequired read and canonical authority: `CLAUDE.md`.\n')
  assert.notEqual(run(fixture).status, 0, 'a prior-line provenance label exempted active bare CLAUDE.md authority')
  writeFileSync(memoryPath, 'Historical provenance: provider-specific generated adapter `CLAUDE.md` formerly carried an SSOT pointer.\n')
  assert.equal(run(fixture).status, 0, 'explicitly labelled bare CLAUDE.md adapter provenance was rejected')
  rmSync(memoryPath)

  install(fixture)
  let activePoisonPath = activateMemory(
    fixture,
    'active-retired-wrapper-poison.md',
    'Codex audit SSOT 必經 `node scripts/codex-run-guarded.mjs --brief brief.md`。\n',
  )
  let activePoison = run(fixture)
  assert.notEqual(activePoison.status, 0, 'an active memory promoted the retired codex-run-guarded entrypoint')
  assert.match(activePoison.stderr, /retired codex-run-guarded|provider-native transport/, 'retired wrapper poison did not trigger an operational-authority diagnostic')
  rmSync(activePoisonPath)

  install(fixture)
  activePoisonPath = activateMemory(
    fixture,
    'active-fixed-layer-poison.md',
    'Required review mapping: Layer A Claude own analysis + Layer B Codex own analysis + Layer C synthesis.\n',
  )
  activePoison = run(fixture)
  assert.notEqual(activePoison.status, 0, 'an active memory fixed review layers to concrete providers')
  assert.match(activePoison.stderr, /fixes Layer\/Track A and B/, 'fixed layer poison did not trigger the provider-binding diagnostic')
  rmSync(activePoisonPath)

  install(fixture)
  activePoisonPath = activateMemory(
    fixture,
    'active-nonexistent-step-poison.md',
    'Canonical required read: `packages/design-system/ds-canonical/skills/codex-collab/SKILL.md` Step 0.4.\n',
  )
  activePoison = run(fixture)
  assert.notEqual(activePoison.status, 0, 'an active memory cited a nonexistent canonical skill step')
  assert.match(activePoison.stderr, /cites nonexistent .* Step 0\.4/, 'nonexistent step poison did not trigger the referential-integrity diagnostic')
  rmSync(activePoisonPath)

  install(fixture)
  activePoisonPath = activateMemory(
    fixture,
    'active-dangerous-transport-poison.md',
    'Codex exec 規則(硬):必須加 `--dangerously-bypass-approvals-and-sandbox`。\n',
  )
  activePoison = run(fixture)
  assert.notEqual(activePoison.status, 0, 'an active memory promoted a dangerous provider-native transport flag')
  assert.match(activePoison.stderr, /provider-native transport/, 'dangerous transport poison did not trigger the operational-authority diagnostic')
  rmSync(activePoisonPath)

  install(fixture)
  const portablePromptPath = join(fixture, 'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md')
  writeFileSync(portablePromptPath, `${readFileSync(portablePromptPath, 'utf8')}\nRead /Users/alice/private/worktree directly.\n`)
  assert.notEqual(run(fixture).status, 0, 'literal macOS developer home path was accepted in a shipped canonical prompt')
  writeFileSync(portablePromptPath, `${readFileSync(join(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md'), 'utf8')}\nRead C:\\Users\\alice\\private\\worktree directly.\n`)
  assert.notEqual(run(fixture).status, 0, 'literal Windows developer home path was accepted in a shipped canonical prompt')
  writeFileSync(portablePromptPath, `${readFileSync(join(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md'), 'utf8')}\nRead /mnt/c/Users/alice/private/worktree directly.\n`)
  assert.notEqual(run(fixture).status, 0, 'literal WSL-mounted developer home path was accepted in a shipped canonical prompt')
  writeFileSync(portablePromptPath, `${readFileSync(join(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md'), 'utf8')}\nRead file:///Users/alice/private/worktree directly.\n`)
  assert.notEqual(run(fixture).status, 0, 'literal file-URI developer home path was accepted in a shipped canonical prompt')
  writeFileSync(portablePromptPath, `${readFileSync(join(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md'), 'utf8')}\nRead <verified-repository-root>/packages/design-system/src.\n`)
  assert.equal(run(fixture).status, 0, 'portable verified repository-root placeholder was rejected')

  install(fixture)
  assert.equal(run(fixture).status, 0, 'restored canonical fixture must pass')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

console.log('✅ provider-neutral SSOT residue guard rejects fixed/future provider review routes, legacy codex-collab navigation, owner/read/build-source drift, and bare CLAUDE.md authority while ignoring poisoned adapter views')
