import assert from 'node:assert/strict'
import { chmodSync, linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { deriveProviderProtectedRootClassification, validateProtectedRootClassification } from './lib/governance-protected-roots.mjs'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: true,
}
const instructionMaterializerAuthority = {
  materializers: {
    instructionViews: {
      'markdown-relative-at-import-v1': {
        engine: 'markdown-relative-at-import-v1', ownershipPolicy: 'provider-generated-projection', supplementPolicy: 'optional',
      },
    },
    treeViews: {
      'closed-tree-copy-v1': {
        engine: 'closed-tree-copy-v1', transformPolicies: ['byte-exact'],
      },
    },
  },
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'protected-roots-'))
  mkdirSync(join(root, 'policy', 'runtime'), { recursive: true })
  mkdirSync(join(root, 'generated'), { recursive: true })
  writeFileSync(join(root, 'policy', 'source.json'), '{}\n')
  writeFileSync(join(root, 'policy', 'runtime', 'evidence.json'), '{}\n')
  writeFileSync(join(root, 'generated', 'view.json'), '{}\n')
  const document = {
    $schema: 'schemas/protected-root-classification.schema.json',
    schemaVersion: 1,
    protectedRoots: ['policy', 'generated'],
    entries: [
      { id: 'policy-source', path: 'policy', match: 'tree', classification: 'canonical-source', excludes: ['policy/runtime'], allowAbsent: false, reason: 'fixture canonical source' },
      { id: 'runtime-state', path: 'policy/runtime', match: 'tree', classification: 'non-authority-exclusion', excludes: [], allowAbsent: false, reason: 'fixture runtime evidence' },
      { id: 'generated-view', path: 'generated', match: 'tree', classification: 'generated-output', excludes: [], allowAbsent: false, reason: 'fixture generated output' },
    ],
  }
  const stages = [{ id: 'build', sources: ['policy/source.json'], outputs: ['generated/'] }]
  const trackedPaths = ['policy/source.json', 'policy/runtime/evidence.json', 'generated/view.json'].map(path => ({ path, mode: '100644' }))
  return { root, document, stages, trackedPaths, ignoredPaths: [] }
}

test('future provider projections derive protected roots and isolate unknown provider-local files', t => {
  const root = mkdtempSync(join(tmpdir(), 'protected-future-provider-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, '.future', 'skills', 'review'), { recursive: true })
  writeFileSync(join(root, 'AGENTS.md'), '# authority\n')
  writeFileSync(join(root, 'FUTURE.md'), '@AGENTS.md\n')
  writeFileSync(join(root, '.future', 'skills', 'review', 'WORKFLOW.md'), '# workflow\n')
  writeFileSync(join(root, '.future', 'hooks.json'), '{}\n')
  writeFileSync(join(root, '.future', 'local-cache.json'), '{}\n')
  const base = {
    providerProjectionPolicy: 'derive-active-generated-views',
    protectedRoots: ['AGENTS.md'],
    entries: [{ id: 'agents', path: 'AGENTS.md', match: 'file', classification: 'canonical-source', excludes: [], allowAbsent: false, reason: 'fixture authority' }],
  }
  const providerRegistry = { canonical: instructionMaterializerAuthority, providers: [{
    id: 'future', instructionEntry: 'FUTURE.md', adapter: {
      generate: true,
      instructionView: { materializerId: 'markdown-relative-at-import-v1' },
      repositoryInstructionSource: 'canonical/future.md',
      repositoryManagedTrees: {},
      skillView: { directory: '.future/skills' },
      hookView: { output: '.future/hooks.json' },
    },
  }] }
  const document = deriveProviderProtectedRootClassification(base, providerRegistry)
  assert.deepEqual(
    document.entries.filter(entry => entry.classification === 'generated-output').map(entry => [entry.path, entry.match]).sort(),
    [['.future/hooks.json', 'file'], ['.future/skills', 'tree'], ['FUTURE.md', 'file']],
  )
  const parent = document.entries.find(entry => entry.path === '.future')
  assert.equal(parent.classification, 'non-authority-exclusion')
  assert.deepEqual(parent.excludes, ['.future/hooks.json', '.future/skills'])
  const stages = [{ id: 'provider-adapters', sources: ['AGENTS.md'], sourceExcludes: [], outputs: ['FUTURE.md', '.future/hooks.json', '.future/skills/'] }]
  const trackedPaths = ['AGENTS.md', 'FUTURE.md', '.future/hooks.json', '.future/skills/review/WORKFLOW.md', '.future/local-cache.json'].map(path => ({ path, mode: '100644' }))
  const result = validateProtectedRootClassification({ root, document, schema, stages, trackedPaths, ignoredPaths: ['.future/local-cache.json'] })
  assert.equal(result.records.find(record => record.path === '.future/local-cache.json').classification, 'non-authority-exclusion')

  const duplicate = structuredClone(base)
  duplicate.protectedRoots.push('FUTURE.md')
  duplicate.entries.push({ id: 'manual-future', path: 'FUTURE.md', match: 'file', classification: 'generated-output', excludes: [], allowAbsent: false, reason: 'forbidden duplicate' })
  assert.throws(() => deriveProviderProtectedRootClassification(duplicate, providerRegistry), /duplicated in the static protected-root inventory/)

  const overlap = structuredClone(providerRegistry)
  overlap.providers[0].adapter.repositoryManagedTrees = { nested: '.future' }
  assert.throws(() => deriveProviderProtectedRootClassification(base, overlap), /projection paths overlap/)
})

test('future product projections derive template partitions and keep provider-local siblings non-authoritative', t => {
  const root = mkdtempSync(join(tmpdir(), 'protected-future-product-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const template = join(root, 'template/ds-product-template')
  mkdirSync(join(template, '.future', 'skills', 'review'), { recursive: true })
  mkdirSync(join(template, '.future', 'rules'), { recursive: true })
  mkdirSync(join(root, 'generated'), { recursive: true })
  writeFileSync(join(template, 'README.md'), '# product source\n')
  writeFileSync(join(template, 'FUTURE.md'), '@AGENTS.md\n')
  writeFileSync(join(template, '.future', 'hooks.json'), '{}\n')
  writeFileSync(join(template, '.future', 'skills', 'review', 'WORKFLOW.md'), '# workflow\n')
  writeFileSync(join(template, '.future', 'rules', 'policy.md'), '# policy\n')
  writeFileSync(join(template, '.future', 'local-cache.json'), '{}\n')
  writeFileSync(join(root, 'generated', 'metadata.json'), '{}\n')
  const base = {
    providerProjectionPolicy: 'derive-active-generated-views',
    protectedRoots: ['template/ds-product-template', 'generated'],
    entries: [
      { id: 'template', path: 'template/ds-product-template', match: 'tree', classification: 'canonical-source', excludes: [], allowAbsent: false, reason: 'fixture product authority' },
      { id: 'metadata', path: 'generated', match: 'tree', classification: 'generated-output', excludes: [], allowAbsent: false, reason: 'fixture generated metadata' },
    ],
  }
  const providerRegistry = { canonical: instructionMaterializerAuthority, providers: [{
    id: 'future', instructionEntry: 'FUTURE.md', hookConfig: '.future/hooks.json', skillDirectory: '.future/skills',
    adapter: {
      generate: true,
      instructionView: { materializerId: 'markdown-relative-at-import-v1' },
      productInstructionSource: 'canonical/FUTURE.md',
      repositoryManagedTrees: {},
      productManagedTrees: {
        rules: {
          sourceRoot: 'canonical/rules', destination: '.future/rules',
          materializerId: 'closed-tree-copy-v1', transformPolicy: 'byte-exact',
        },
      },
      skillView: { directory: '.future/skills' },
      hookView: { output: '.future/hooks.json' },
    },
  }] }
  const document = deriveProviderProtectedRootClassification(base, providerRegistry)
  assert.deepEqual(
    document.entries.filter(entry => entry.classification === 'generated-output').map(entry => [entry.path, entry.match]).sort(),
    [
      ['.future/hooks.json', 'file'],
      ['.future/skills', 'tree'],
      ['FUTURE.md', 'file'],
      ['generated', 'tree'],
      ['template/ds-product-template/.future/hooks.json', 'file'],
      ['template/ds-product-template/.future/rules', 'tree'],
      ['template/ds-product-template/.future/skills', 'tree'],
      ['template/ds-product-template/FUTURE.md', 'file'],
    ],
  )
  const productRoot = document.entries.find(entry => entry.path === 'template/ds-product-template')
  assert.deepEqual(productRoot.excludes, ['template/ds-product-template/.future', 'template/ds-product-template/FUTURE.md'])
  const local = document.entries.find(entry => entry.path === 'template/ds-product-template/.future')
  assert.equal(local.classification, 'non-authority-exclusion')
  assert.deepEqual(local.excludes, [
    'template/ds-product-template/.future/hooks.json',
    'template/ds-product-template/.future/rules',
    'template/ds-product-template/.future/skills',
  ])
  const stages = [
    {
      id: 'fork-template', sources: ['template/ds-product-template/README.md'], sourceExcludes: [],
      outputs: [
        'FUTURE.md', '.future/hooks.json', '.future/skills/',
        'template/ds-product-template/FUTURE.md', 'template/ds-product-template/.future/hooks.json',
        'template/ds-product-template/.future/rules/', 'template/ds-product-template/.future/skills/',
      ],
    },
    {
      id: 'metadata', sources: ['template/ds-product-template/'], sourceExcludes: ['template/ds-product-template/.future/'],
      outputs: ['generated/'],
    },
  ]
  const trackedPaths = [
    'template/ds-product-template/README.md', 'template/ds-product-template/FUTURE.md',
    'template/ds-product-template/.future/hooks.json', 'template/ds-product-template/.future/rules/policy.md',
    'template/ds-product-template/.future/skills/review/WORKFLOW.md', 'template/ds-product-template/.future/local-cache.json',
    'generated/metadata.json',
  ].map(path => ({ path, mode: '100644' }))
  const result = validateProtectedRootClassification({
    root, document, schema, stages, trackedPaths, ignoredPaths: ['template/ds-product-template/.future/local-cache.json'],
  })
  assert.equal(result.records.find(record => record.path.endsWith('local-cache.json')).classification, 'non-authority-exclusion')

  const duplicated = structuredClone(base)
  duplicated.entries[0].excludes.push('template/ds-product-template/FUTURE.md')
  duplicated.entries.push({ id: 'manual-future-product', path: 'template/ds-product-template/FUTURE.md', match: 'file', classification: 'generated-output', excludes: [], allowAbsent: false, reason: 'forbidden duplicate' })
  assert.throws(() => deriveProviderProtectedRootClassification(duplicated, providerRegistry), /duplicated in the static protected-root inventory/)
})

test('every protected leaf has exactly one source/output/non-authority classification', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  const result = validateProtectedRootClassification({ ...data, schema })
  assert.equal(result.pathCount, 3)
  assert.deepEqual(result.records.map(record => record.classification).sort(), ['canonical-source', 'generated-output', 'non-authority-exclusion'])
})

test('staged-deletion observations reuse the canonical protected-root partition', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  rmSync(join(data.root, 'policy', 'source.json'))
  rmSync(join(data.root, 'generated', 'view.json'))
  data.trackedPaths = data.trackedPaths.filter(entry => (
    entry.path !== 'policy/source.json' && entry.path !== 'generated/view.json'
  ))
  const result = validateProtectedRootClassification({
    ...data,
    schema,
    observedPaths: ['policy/source.json', 'generated/view.json'],
  })
  assert.equal(
    result.records.find(record => record.path === 'policy/source.json')?.classification,
    'canonical-source',
  )
  assert.equal(
    result.records.find(record => record.path === 'generated/view.json')?.classification,
    'generated-output',
  )

  assert.throws(
    () => validateProtectedRootClassification({
      ...data,
      schema,
      observedPaths: ['outside/deleted-governance.json'],
    }),
    /unclassified protected-root path:outside\/deleted-governance\.json/,
  )
  assert.throws(
    () => validateProtectedRootClassification({
      ...data,
      schema,
      observedPaths: ['policy/../source.json'],
    }),
    /unsafe segment/,
  )
})

test('template provider CLI schema has one exact generated owner and one producing graph stage', t => {
  const root = mkdtempSync(join(tmpdir(), 'protected-template-schema-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const templateRoot = 'template/ds-product-template'
  const schemaPath = `${templateRoot}/schemas/provider-cli-toolchain.schema.json`
  mkdirSync(join(root, templateRoot, 'schemas'), { recursive: true })
  writeFileSync(join(root, templateRoot, 'README.md'), '# canonical template source\n')
  writeFileSync(join(root, schemaPath), '{}\n')
  const document = {
    $schema: 'schemas/protected-root-classification.schema.json',
    schemaVersion: 1,
    protectedRoots: [templateRoot],
    entries: [
      {
        id: 'template-authority', path: templateRoot, match: 'tree', classification: 'canonical-source',
        excludes: [schemaPath], allowAbsent: false, reason: 'fixture template authority',
      },
      {
        id: 'template-provider-cli-schema', path: schemaPath, match: 'file', classification: 'generated-output',
        excludes: [], allowAbsent: false, reason: 'fixture exact generated schema',
      },
    ],
  }
  const stages = [{
    id: 'fork-template', sources: [`${templateRoot}/README.md`], sourceExcludes: [], outputs: [schemaPath],
  }]
  const trackedPaths = [
    { path: `${templateRoot}/README.md`, mode: '100644' },
    { path: schemaPath, mode: '100644' },
  ]
  assert.doesNotThrow(() => validateProtectedRootClassification({
    root, document: structuredClone(document), schema, stages: structuredClone(stages), trackedPaths, ignoredPaths: [],
  }))

  const overlapping = structuredClone(document)
  overlapping.entries[0].excludes = []
  assert.throws(
    () => validateProtectedRootClassification({ root, document: overlapping, schema, stages, trackedPaths, ignoredPaths: [] }),
    /classification entries overlap statically:template-authority:template-provider-cli-schema/,
    'the generated schema may not remain inside template canonical-source authority',
  )

  const ownerMissing = structuredClone(document)
  ownerMissing.entries.pop()
  assert.throws(
    () => validateProtectedRootClassification({ root, document: ownerMissing, schema, stages, trackedPaths, ignoredPaths: [] }),
    /classification exclusion requires one exact child owner:template-authority/,
    'excluding the schema without an exact generated owner must fail closed',
  )

  const outputMissing = structuredClone(stages)
  outputMissing[0].outputs = []
  assert.throws(
    () => validateProtectedRootClassification({ root, document: structuredClone(document), schema, stages: outputMissing, trackedPaths, ignoredPaths: [] }),
    /generated protected-root path is outside the build-graph outputs/,
    'the exact generated owner must be joined to a producing stage',
  )
})

test('unclassified, ambiguous, graph-missing, and forbidden source/output overlap fail closed', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  writeFileSync(join(data.root, 'policy', 'surprise.md'), 'drift\n')
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /canonical protected-root path is outside the build-graph sources:policy\/surprise.md/)

  data.document.entries.push({ id: 'duplicate', path: 'policy/source.json', match: 'file', classification: 'canonical-source', excludes: [], allowAbsent: false, reason: 'fixture duplicate rule' })
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /classification entries overlap statically:policy-source:duplicate/)
  data.document.entries.pop()
  data.stages[0].outputs.push('policy/source.json')
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /output declaration is not generated or an allowed exact transform/)
})

test('tree-leaf deletions are valid while an exact protected file remains fail-closed', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  data.trackedPaths.push({ path: 'policy/missing-but-tracked.md', mode: '100644' })
  data.stages[0].sources = ['policy/']
  data.stages[0].sourceExcludes = ['policy/runtime/']
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
  data.document.protectedRoots.push('required.md')
  data.document.entries.push({ id: 'required-file', path: 'required.md', match: 'file', classification: 'canonical-source', excludes: [], allowAbsent: false, reason: 'fixture exact source' })
  data.stages[0].sources.push('required.md')
  data.trackedPaths.push({ path: 'required.md', mode: '100644' })
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /tracked exact protected-root path is absent but its classification is required/)
})

test('symlink can only be an exact generated-output leaf', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  symlinkSync('../generated', join(data.root, 'policy', 'source-link'))
  data.stages[0].sources.push('policy/source-link')
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /only exact generated outputs may be symlinks/)

  rmSync(join(data.root, 'policy', 'source-link'))
  symlinkSync('missing-target', join(data.root, 'generated', 'dangling-link'))
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /only exact generated outputs may be symlinks/)
  data.stages[0].outputs.push('generated/dangling-link')
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
})

test('a tracked symlink absent from the worktree may be intentionally deleted', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  data.trackedPaths = [...data.trackedPaths, { path: 'generated/absent-link', mode: '120000' }]
  data.document.entries.find(entry => entry.id === 'generated-view').allowAbsent = true
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
})

test('an existing non-authority symlink is still rejected', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  data.document.entries[0].excludes.push('policy/local-link')
  data.document.entries.push({ id: 'local-link', path: 'policy/local-link', match: 'file', classification: 'non-authority-exclusion', excludes: [], allowAbsent: false, reason: 'fixture non-authority alias' })
  symlinkSync('../generated', join(data.root, 'policy', 'local-link'))
  data.trackedPaths.push({ path: 'policy/local-link', mode: '120000' })
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /only exact generated outputs may be symlinks.*policy\/local-link/)
})

test('graph declarations are classified even when their outputs do not exist yet', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  data.stages[0].outputs.push('outside/generated/')
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /output declaration is outside the protected-root classification/)
  data.stages[0].outputs.pop()
  data.stages[0].sources.push('outside/source.json')
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /source declaration is outside the protected-root classification/)
})

test('a later source stage may consume generated children but must exclude non-authority state', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  mkdirSync(join(data.root, 'policy', 'derived'), { recursive: true })
  writeFileSync(join(data.root, 'policy', 'derived', 'view.json'), '{}\n')
  data.document.entries[0].excludes.push('policy/derived')
  data.document.entries.push({ id: 'policy-derived', path: 'policy/derived', match: 'tree', classification: 'generated-output', excludes: [], allowAbsent: false, reason: 'fixture prior-stage output' })
  data.trackedPaths.push({ path: 'policy/derived/view.json', mode: '100644' })
  data.stages = [
    { id: 'producer', sources: ['policy/source.json'], sourceExcludes: [], outputs: ['policy/derived/'] },
    { id: 'consumer', sources: ['policy/'], sourceExcludes: [], outputs: ['generated/'] },
  ]
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /source tree crosses non-authority boundary without exclusion:policy\/:policy\/runtime/)
  data.stages[1].sourceExcludes = ['policy/runtime/']
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
  data.stages.reverse()
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /consumes generated output before its producer/)
})

test('a newly declared generated output may be absent from both worktree and index before first generation', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  data.document.protectedRoots.push('future-provider.json')
  data.document.entries.push({ id: 'future-provider', path: 'future-provider.json', match: 'file', classification: 'generated-output', excludes: [], allowAbsent: false, reason: 'first materialization fixture' })
  data.stages[0].outputs.push('future-provider.json')
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
  data.stages[0].outputs.pop()
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /classification entry matches no path:future-provider/)
})

test('static policy overlap and exclusion holes fail without filesystem leaves', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  data.document.entries.push({ id: 'absent-overlap', path: 'policy/absent', match: 'tree', classification: 'canonical-source', excludes: [], allowAbsent: true, reason: 'overlapping absent fixture' })
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /classification entries overlap statically/)
  data.document.entries.pop()
  data.document.entries[0].excludes.push('policy/absent')
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /exclusion requires one exact child owner/)
})

test('index modes and worktree types are closed and exact', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  for (const mode of ['160000', '100664', null]) {
    const mutation = { ...data, trackedPaths: [...data.trackedPaths, { path: 'policy/submodule', mode }] }
    assert.throws(() => validateProtectedRootClassification({ ...mutation, schema }), /unsupported index mode/)
  }
  const mismatch = { ...data, trackedPaths: data.trackedPaths.map(entry => entry.path === 'policy/source.json' ? { ...entry, mode: '120000' } : entry) }
  assert.throws(() => validateProtectedRootClassification({ ...mismatch, schema }), /index\/worktree type mismatch/)
  chmodSync(join(data.root, 'policy', 'source.json'), 0o755)
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }), 'canonical executable-mode authoring must not require staging before generation')
})

test('generated outputs may repair missing or stale index modes before pure drift check', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  chmodSync(join(data.root, 'generated', 'view.json'), 0o755)
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
  rmSync(join(data.root, 'generated', 'view.json'))
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
})

test('an exact generated symlink may replace an unstaged tracked tree without classifying stale index children', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  rmSync(join(data.root, 'generated'), { recursive: true })
  symlinkSync('policy', join(data.root, 'generated'))
  const entry = data.document.entries.find(candidate => candidate.id === 'generated-view')
  entry.match = 'file'
  data.stages[0].outputs = ['generated']
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
  data.stages[0].outputs = ['generated/recreated-view.json']
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /only exact generated outputs may be symlinks|output declaration/)
})

test('ignored leaves require an explicit non-authority owner', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  data.ignoredPaths = ['policy/source.json']
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /ignored protected-root path is not explicitly non-authority/)
  data.ignoredPaths = ['policy/runtime/evidence.json']
  assert.doesNotThrow(() => validateProtectedRootClassification({ ...data, schema }))
})

test('unsafe observed paths are rejected instead of normalized', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  for (const path of ['policy\\generated.json', 'policy/../generated.json', 'policy\0generated.json']) {
    const mutation = { ...data, trackedPaths: [...data.trackedPaths, { path, mode: '100644' }] }
    assert.throws(() => validateProtectedRootClassification({ ...mutation, schema }), /repository-relative POSIX path|unsafe segment/)
  }
})

test('a protected root may not traverse a symbolic-link ancestor', t => {
  const root = mkdtempSync(join(tmpdir(), 'protected-roots-ancestor-'))
  const external = mkdtempSync(join(tmpdir(), 'protected-roots-external-'))
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }) })
  writeFileSync(join(external, 'source.json'), '{}\n')
  symlinkSync(external, join(root, 'policy'))
  const document = {
    $schema: 'schemas/protected-root-classification.schema.json',
    schemaVersion: 1,
    protectedRoots: ['policy/source.json'],
    entries: [{ id: 'source', path: 'policy/source.json', match: 'file', classification: 'canonical-source', excludes: [], allowAbsent: false, reason: 'external traversal fixture' }],
  }
  assert.throws(() => validateProtectedRootClassification({ root, document, schema, stages: [{ id: 'build', sources: ['policy/source.json'], outputs: [] }], trackedPaths: [], ignoredPaths: [] }), /symbolic-link ancestor/)
})

test('a protected file cannot hard-link an inode outside its declared authority path', t => {
  const data = fixture()
  t.after(() => rmSync(data.root, { recursive: true, force: true }))
  linkSync(join(data.root, 'policy', 'source.json'), join(data.root, 'policy', 'hardlink.json'))
  data.stages[0].sources.push('policy/hardlink.json')
  assert.throws(() => validateProtectedRootClassification({ ...data, schema }), /hard-link alias/)
})
