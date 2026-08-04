#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  resolvePublishedTemplateMirrorPolicy,
  validateMirrorInventory,
  validateMirrorRoot,
} from './verify-mirror-evidence.mjs'
import {
  buildProductTemplateScaffoldLock,
  verifyProductTemplateScaffold,
} from './product-template-scaffold-lock.mjs'
import {
  copyVerifiedForkManagedSurfaces,
  loadVerifiedForkSurfaceAuthority,
} from './lib/published-template-provider-surfaces.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const policy = { schemaVersion: 1, exactPaths: ['package.json'], generatedExactPaths: [], pathPrefixes: ['apps/template/'] }
const canonicalMaterializers = JSON.parse(readFileSync(new URL('../packages/governance/canonical/providers.json', import.meta.url), 'utf8')).canonical.materializers
const file = path => ({ path, mode: '644', sha256: 'a'.repeat(64) })

test('fresh writer accepts only the protected-base mirror inventory', () => {
  assert.equal(validateMirrorInventory({ files: [file('package.json'), file('apps/template/src/main.ts')], policy }), true)
})

for (const [label, files, pattern] of [
  ['out-of-scope build output', [file('package.json'), file('backdoor.sh')], /outside protected-base allowlist/],
  ['newline/PATH poison path', [file('package.json'), file('apps/template/a\nGITHUB_PATH=/tmp/evil')], /unsafe path/],
  ['duplicate path', [file('package.json'), file('package.json')], /duplicate mirror path/],
  ['missing required file', [file('apps/template/src/main.ts')], /required mirror path is missing/],
]) {
  test(`rejects ${label} before mirror token`, () => {
    assert.throws(() => validateMirrorInventory({ files, policy }), pattern)
  })
}

test('mirror policy resolution is closed: exact shape, no duplicates, no static/generated/tree overlap', () => {
  const resolved = resolvePublishedTemplateMirrorPolicy({ policy })
  assert.deepEqual([...resolved.exact], ['package.json'])
  assert.deepEqual([...resolved.generated], [])
  assert.deepEqual(resolved.prefixes, ['apps/template/'])
  assert.deepEqual(resolved.requiredPathPrefixes, [])
  for (const [label, mutate, pattern] of [
    ['undeclared policy key', value => { value.unreviewed = true }, /open or invalid shape/],
    ['unsupported schema version', value => { value.schemaVersion = 3 }, /open or invalid shape/],
    ['absolute exact path', value => { value.exactPaths.push('/etc/passwd') }, /unsafe path/],
    ['parent-escaping exact path', value => { value.exactPaths.push('../escape.json') }, /non-canonical path/],
    ['git metadata path', value => { value.exactPaths.push('.git/config') }, /git metadata is forbidden/],
    ['duplicated exact path', value => { value.exactPaths.push('package.json') }, /paths are duplicated/],
    ['static path doubling as generated', value => { value.generatedExactPaths.push('package.json') }, /cannot be both static\/provider-managed and post-release generated/],
    ['exact path inside a tree policy', value => { value.exactPaths.push('apps/template/package.json') }, /exact mirror path overlaps a tree policy/],
    ['overlapping tree policies', value => { value.pathPrefixes.push('apps/') }, /mirror tree policies overlap/],
  ]) {
    const poisoned = structuredClone(policy)
    mutate(poisoned)
    assert.throws(() => resolvePublishedTemplateMirrorPolicy({ policy: poisoned }), pattern, label)
  }
})

const sha256 = body => createHash('sha256').update(body).digest('hex')
const temporary = []
test.after(() => { for (const path of temporary) rmSync(path, { recursive: true, force: true }) })

function mirrorFixture() {
  const base = mkdtempSync(join(tmpdir(), 'mirror-root-validation-'))
  temporary.push(base)
  const mirror = join(base, 'mirror')
  mkdirSync(join(mirror, 'apps/template/src'), { recursive: true })
  writeFileSync(join(mirror, 'package.json'), '{"name":"ds-product-template"}\n')
  writeFileSync(join(mirror, 'apps/template/src/main.ts'), 'export {}\n')
  return { base, mirror }
}

test('mirror root validation walks the real tree into a byte-ordered inventory', () => {
  const { mirror } = mirrorFixture()
  const files = validateMirrorRoot({ mirrorRoot: mirror, policy })
  assert.deepEqual(files.map(item => item.path), ['apps/template/src/main.ts', 'package.json'])
  for (const item of files) {
    assert.match(item.mode, /^[0-7]{3}$/)
    assert.equal(item.sha256, sha256(readFileSync(join(mirror, item.path))))
  }
})

test('mirror root validation rejects symlinks, git metadata, and symlinked roots', () => {
  const linked = mirrorFixture()
  symlinkSync(join(linked.mirror, 'package.json'), join(linked.mirror, 'apps/template/link.json'))
  assert.throws(() => validateMirrorRoot({ mirrorRoot: linked.mirror, policy }), /mirror contains symlink/)

  const withGit = mirrorFixture()
  mkdirSync(join(withGit.mirror, '.git'))
  writeFileSync(join(withGit.mirror, '.git/config'), '[core]\nrepositoryformatversion = 0\n')
  assert.throws(() => validateMirrorRoot({ mirrorRoot: withGit.mirror, policy }), /git metadata is forbidden/)
  assert.deepEqual(
    validateMirrorRoot({ mirrorRoot: withGit.mirror, policy, allowRootGitMetadata: true }).map(item => item.path),
    ['apps/template/src/main.ts', 'package.json'],
  )

  const aliased = mirrorFixture()
  const rootLink = join(aliased.base, 'mirror-link')
  symlinkSync(aliased.mirror, rootLink)
  assert.throws(() => validateMirrorRoot({ mirrorRoot: rootLink, policy }), /mirror root must be a real directory/)
})

test('verified future provider surfaces flow into mirror policy and scaffold evidence without provider hard-coding', () => {
  const authorityRoot = mkdtempSync(join(tmpdir(), 'future-provider-mirror-authority-'))
  temporary.push(authorityRoot)
  const forkRoot = join(authorityRoot, 'packages/design-system/ds-canonical/fork')
  const templateRoot = join(authorityRoot, 'template/ds-product-template')
  const mirrorRoot = join(authorityRoot, 'mirror')
  mkdirSync(forkRoot, { recursive: true }); mkdirSync(templateRoot, { recursive: true }); mkdirSync(mirrorRoot)
  const write = (root, path, body) => {
    const absolute = join(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, body)
  }
  const commonBody = '# common AGENTS\n'
  const instructionBody = '# FUTURE provider\n'
  const hookBody = '{"events":[]}\n'
  const skillBody = '# future workflow\n'
  const rulesBody = '# future product rules\n'
  write(forkRoot, 'common/instruction.md', commonBody)
  write(forkRoot, 'providers/future/instruction.md', instructionBody)
  write(forkRoot, 'providers/future/hook-config.json', hookBody)
  write(forkRoot, 'providers/future/skills/review/WORKFLOW.md', skillBody)
  write(forkRoot, 'providers/future/trees/rules/policy.md', rulesBody)
  write(templateRoot, 'AGENTS.md', commonBody)
  write(templateRoot, 'FUTURE.md', instructionBody)
  write(templateRoot, '.future/hooks.json', hookBody)
  write(templateRoot, '.future/skills/review/WORKFLOW.md', skillBody)
  write(templateRoot, '.future/rules/policy.md', rulesBody)
  const manifest = {
    schemaVersion: 2,
    kind: 'provider-neutral-fork-manifest',
    materializers: structuredClone(canonicalMaterializers),
    consumer: {
      commonInstruction: {
        schemaVersion: 1, artifact: 'common/instruction.md', destination: 'AGENTS.md', materializerId: 'shared-instruction-v1',
      },
      launcherDestination: 'governance/bin',
      managedFiles: {},
    },
    providerSurfaces: {
      future: {
        schemaVersion: 3,
        generated: true,
        capabilities: { nativeHooks: true, hookEnforcement: 'native-feedback-plus-ci', hardGate: 'provider-neutral-ci-required' },
        instructionArtifact: 'providers/future/instruction.md',
        instructionDestination: 'FUTURE.md',
        instructionMaterializerId: 'markdown-relative-at-import-v1',
        hookArtifact: 'providers/future/hook-config.json',
        hookDestination: '.future/hooks.json',
        hookMaterializerId: 'command-hooks-json-v1',
        skillArtifactRoot: 'providers/future/skills',
        skillDestination: '.future/skills',
        skillMaterializerId: 'markdown-workflows-directory-v1',
        skillEntryFile: 'WORKFLOW.md',
        skills: ['review'],
        trees: [{
          schemaVersion: 1,
          name: 'rules',
          artifactRoot: 'providers/future/trees/rules',
          destination: '.future/rules',
          materializerId: 'closed-tree-copy-v1',
          transformPolicy: 'byte-exact',
        }],
        managedSurfaces: [
          { path: '.future/hooks.json', kind: 'file' },
          { path: '.future/rules', kind: 'tree' },
          { path: '.future/skills', kind: 'tree' },
          { path: 'FUTURE.md', kind: 'file' },
        ],
        nativeHookCoverage: {
          schemaVersion: 2,
          canonicalEvents: ['PreToolUse'],
          projectedEvents: ['PreToolUse'],
          projectedNativeEvents: [{ canonicalEvent: 'PreToolUse', nativeEvent: 'beforeWrite' }],
          excludedEvents: [],
        },
        environmentMap: {},
        exclusions: [],
      },
    },
  }
  write(forkRoot, 'manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  const lockedPaths = [
    'common/instruction.md', 'manifest.json', 'providers/future/hook-config.json',
    'providers/future/instruction.md', 'providers/future/skills/review/WORKFLOW.md',
    'providers/future/trees/rules/policy.md',
  ].sort(compareUtf8Bytes)
  const lock = {
    schemaVersion: 1,
    kind: 'fork-governance-corpus-lock',
    hashAlgorithm: 'sha256',
    _purpose: 'synthetic authenticated future-provider corpus',
    entries: lockedPaths.map(path => ({
      schemaVersion: 1, file: path, sha256: sha256(readFileSync(join(forkRoot, path))),
      source: null, classification: null, destination: null,
    })),
  }
  write(forkRoot, 'governance.lock', `${JSON.stringify(lock, null, 2)}\n`)
  const authority = loadVerifiedForkSurfaceAuthority({
    authorityRoot,
    manifestPath: 'packages/design-system/ds-canonical/fork/manifest.json',
    lockPath: 'packages/design-system/ds-canonical/fork/governance.lock',
  })
  const mismatchedInstructionMirror = join(authorityRoot, 'mismatched-instruction-mirror')
  mkdirSync(mismatchedInstructionMirror)
  write(templateRoot, 'FUTURE.md', '# drifted generated instruction\n')
  assert.throws(
    () => copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot: mismatchedInstructionMirror, authority }),
    /instruction differs from its authenticated fork artifact/,
  )
  assert.deepEqual(readdirSync(mismatchedInstructionMirror), [], 'template drift must fail before the first mirror write')
  write(templateRoot, 'FUTURE.md', instructionBody)
  const mismatchedHookMirror = join(authorityRoot, 'mismatched-hook-mirror')
  mkdirSync(mismatchedHookMirror)
  write(templateRoot, '.future/hooks.json', '{"events":["drift"]}\n')
  assert.throws(
    () => copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot: mismatchedHookMirror, authority }),
    /hook config differs from its authenticated fork artifact/,
  )
  write(templateRoot, '.future/hooks.json', hookBody)
  const mismatchedSkillMirror = join(authorityRoot, 'mismatched-skill-mirror')
  mkdirSync(mismatchedSkillMirror)
  write(templateRoot, '.future/skills/review/UNLOCKED.md', '# unlocked drift\n')
  assert.throws(
    () => copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot: mismatchedSkillMirror, authority }),
    /skills differ from their authenticated fork artifact tree/,
  )
  rmSync(join(templateRoot, '.future/skills/review/UNLOCKED.md'))
  const mismatchedProductTreeMirror = join(authorityRoot, 'mismatched-product-tree-mirror')
  mkdirSync(mismatchedProductTreeMirror)
  write(templateRoot, '.future/rules/policy.md', '# drifted product tree\n')
  assert.throws(
    () => copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot: mismatchedProductTreeMirror, authority }),
    /product tree rules differs from its authenticated fork artifact tree/,
  )
  write(templateRoot, '.future/rules/policy.md', rulesBody)
  copyVerifiedForkManagedSurfaces({ templateRoot, mirrorRoot, authority })
  for (const path of ['AGENTS.md', 'FUTURE.md', '.future/hooks.json', '.future/rules/policy.md', '.future/skills/review/WORKFLOW.md']) {
    assert.equal(readFileSync(join(mirrorRoot, path), 'utf8').length > 0, true, `${path} is absent from the synthetic mirror`)
  }
  const dynamicPolicy = {
    schemaVersion: 2,
    exactPaths: [],
    generatedExactPaths: [],
    pathPrefixes: [],
    providerSurfaceAuthority: {
      derivationPolicy: 'verified-fork-managed-surfaces-v1',
      manifestPath: 'packages/design-system/ds-canonical/fork/manifest.json',
      lockPath: 'packages/design-system/ds-canonical/fork/governance.lock',
    },
  }
  assert.equal(validateMirrorRoot({ mirrorRoot, policy: dynamicPolicy, requireGenerated: false, authorityRoot }).length, 5)
  assert.throws(() => validateMirrorRoot({
    mirrorRoot,
    policy: {
      ...dynamicPolicy,
      providerSurfaceAuthority: { ...dynamicPolicy.providerSurfaceAuthority, undeclared: true },
    },
    requireGenerated: false,
    authorityRoot,
  }), /provider surface authority has an open or invalid shape/)
  assert.throws(() => validateMirrorRoot({
    mirrorRoot,
    policy: { ...dynamicPolicy, generatedExactPaths: ['AGENTS.md'] },
    requireGenerated: false,
    authorityRoot,
  }), /cannot be both static\/provider-managed and post-release generated/)
  const scaffoldLock = buildProductTemplateScaffoldLock({ root: mirrorRoot, releaseVersion: '1.2.3' })
  assert.equal(scaffoldLock.entries.some(entry => entry.path === 'FUTURE.md'), true)
  assert.equal(scaffoldLock.entries.some(entry => entry.path === '.future/hooks.json'), true)
  assert.equal(scaffoldLock.entries.some(entry => entry.path === '.future/skills/review/WORKFLOW.md'), true)
  write(mirrorRoot, 'FUTURE.md', '# tampered\n')
  assert.throws(() => verifyProductTemplateScaffold({ root: mirrorRoot, lock: scaffoldLock, phase: 'source' }), /bytes\/mode drifted/)

  const overlappingManifest = structuredClone(manifest)
  overlappingManifest.providerSurfaces.future.managedSurfaces.unshift({ path: '.future', kind: 'tree' })
  write(forkRoot, 'manifest.json', `${JSON.stringify(overlappingManifest, null, 2)}\n`)
  lock.entries.find(entry => entry.file === 'manifest.json').sha256 = sha256(readFileSync(join(forkRoot, 'manifest.json')))
  write(forkRoot, 'governance.lock', `${JSON.stringify(lock, null, 2)}\n`)
  assert.throws(() => loadVerifiedForkSurfaceAuthority({
    authorityRoot,
    manifestPath: 'packages/design-system/ds-canonical/fork/manifest.json',
    lockPath: 'packages/design-system/ds-canonical/fork/governance.lock',
  }), /managedSurfaces contain overlapping portable paths|managedSurfaces trees must exactly match|published provider surfaces overlap/)
})
