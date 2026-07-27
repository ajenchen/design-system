import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { classifyCanonicalWorkingTreePaths } from '../bin/audit-activation-readiness.mjs'
import { auditCompletionReadiness } from '../lib/completion-readiness.mjs'
import { readJson } from '../lib/common.mjs'
import { validateProtectedRootClassification } from '../../../scripts/lib/governance-protected-roots.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-07-21T00:00:00.000Z')
const permissiveSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: true,
}

function governanceModels() {
  return {
    inventory: readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json')),
    desired: readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json')),
    rings: readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json')),
    certifications: readJson(resolve(GOVERNANCE_ROOT, 'providers/certifications.json')),
    waivers: readJson(resolve(GOVERNANCE_ROOT, 'waivers.json')),
    activationRequirements: readJson(resolve(GOVERNANCE_ROOT, 'external-activation-requirements.json')),
    activationPolicy: readJson(resolve(GOVERNANCE_ROOT, 'external-activation-policy.json')),
    mutationBoundaryContract: readJson(resolve(GOVERNANCE_ROOT, 'providers/github-mutation-boundary-contract.json')),
    issuerRegistry: readJson(resolve(GOVERNANCE_ROOT, 'trust/issuers.json')),
    runtimeProfile: readJson(resolve(GOVERNANCE_ROOT, 'providers/runtime-conformance.json')),
  }
}

function classificationFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'activation-readiness-classification-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const files = [
    'workspace/source.json',
    'workspace/ignored-authority.json',
    'workspace/generated/view.json',
    'workspace/dist/bundle.js',
    'workspace/node_modules/pkg/index.js',
    'workspace/runtime/cache.json',
    'delivery/view.json',
  ]
  for (const path of files) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    writeFileSync(resolve(root, path), '{}\n')
  }
  const document = {
    $schema: 'schemas/protected-root-classification.schema.json',
    schemaVersion: 1,
    protectedRoots: ['workspace', 'delivery'],
    entries: [
      {
        id: 'workspace-authority',
        path: 'workspace',
        match: 'tree',
        classification: 'canonical-source',
        excludes: ['workspace/generated', 'workspace/dist', 'workspace/node_modules', 'workspace/runtime'],
        allowAbsent: false,
        reason: 'fixture canonical authority',
      },
      { id: 'workspace-generated', path: 'workspace/generated', match: 'tree', classification: 'generated-output', excludes: [], allowAbsent: false, reason: 'fixture generated output' },
      { id: 'workspace-dist', path: 'workspace/dist', match: 'tree', classification: 'non-authority-exclusion', excludes: [], allowAbsent: false, reason: 'fixture build output' },
      { id: 'workspace-node-modules', path: 'workspace/node_modules', match: 'tree', classification: 'non-authority-exclusion', excludes: [], allowAbsent: false, reason: 'fixture installed dependencies' },
      { id: 'workspace-runtime', path: 'workspace/runtime', match: 'tree', classification: 'non-authority-exclusion', excludes: [], allowAbsent: false, reason: 'fixture runtime state' },
      { id: 'delivery-generated', path: 'delivery', match: 'tree', classification: 'generated-output', excludes: [], allowAbsent: false, reason: 'fixture generated delivery' },
    ],
  }
  const stages = [
    {
      id: 'producer',
      sources: ['workspace/source.json'],
      sourceExcludes: [],
      outputs: ['workspace/generated/'],
    },
    {
      id: 'metadata',
      sources: ['workspace/'],
      sourceExcludes: ['workspace/dist/', 'workspace/node_modules/', 'workspace/runtime/'],
      outputs: ['delivery/'],
    },
  ]
  const classification = validateProtectedRootClassification({
    root,
    document,
    schema: permissiveSchema,
    stages,
    trackedPaths: files.map(path => ({ path, mode: '100644' })),
    ignoredPaths: [],
  })
  return { graph: { schemaVersion: 1, stages }, classificationRecords: classification.records }
}

test('readiness counts only canonical authority and keeps ignored authority fail-closed', t => {
  const fixture = classificationFixture(t)
  const classified = classifyCanonicalWorkingTreePaths({
    ...fixture,
    untrackedPaths: [
      'workspace/source.json',
      'workspace/generated/view.json',
      'workspace/dist/bundle.js',
      'workspace/node_modules/pkg/index.js',
      'workspace/runtime/cache.json',
    ],
    ignoredPaths: [
      'workspace/ignored-authority.json',
      'workspace/generated/view.json',
      'workspace/dist/bundle.js',
      'workspace/node_modules/pkg/index.js',
      'workspace/runtime/cache.json',
    ],
    modifiedPaths: ['workspace/source.json', 'workspace/generated/view.json'],
    specialIndexPaths: ['workspace/ignored-authority.json', 'workspace/generated/view.json'],
  })

  assert.deepEqual(classified, {
    untrackedCanonicalInputs: ['workspace/source.json'],
    ignoredCanonicalInputs: ['workspace/ignored-authority.json'],
    modifiedCanonicalInputs: ['workspace/source.json'],
    specialIndexCanonicalInputs: ['workspace/ignored-authority.json'],
  })

  const report = auditCompletionReadiness({
    ...governanceModels(),
    now: NOW,
    local: { buildGraph: { pass: true }, ...classified, headSha: '1'.repeat(40) },
    livePlan: { error: 'offline fixture' },
    liveObservation: { source: 'offline', defaultModels: true, productionEligible: false },
  })
  const versioned = report.checks.find(check => check.id === 'canonical-inputs-versioned')
  assert.equal(versioned.pass, false)
  assert.deepEqual(versioned.evidence.ignoredPaths, ['workspace/ignored-authority.json'])
})

test('readiness rejects poison paths instead of normalizing or silently ignoring them', t => {
  const fixture = classificationFixture(t)
  for (const path of ['/workspace/source.json', 'workspace\\source.json', 'workspace/../source.json', 'workspace\0source.json']) {
    assert.throws(
      () => classifyCanonicalWorkingTreePaths({ ...fixture, untrackedPaths: [path] }),
      /repository-relative POSIX path|unsafe segment/,
      path,
    )
  }
})

test('readiness fails closed on missing, unknown, or ambiguous protected-root classification', t => {
  const fixture = classificationFixture(t)
  const missing = fixture.classificationRecords.filter(record => record.path !== 'workspace/source.json')
  assert.throws(
    () => classifyCanonicalWorkingTreePaths({ ...fixture, classificationRecords: missing, untrackedPaths: ['workspace/source.json'] }),
    /has no protected-root classification:workspace\/source.json/,
  )

  const unknown = fixture.classificationRecords.map(record => record.path === 'workspace/source.json'
    ? { ...record, classification: 'future-provider-maybe' }
    : record)
  assert.throws(
    () => classifyCanonicalWorkingTreePaths({ ...fixture, classificationRecords: unknown, untrackedPaths: ['workspace/source.json'] }),
    /unknown class:workspace\/source.json:future-provider-maybe/,
  )

  assert.throws(
    () => classifyCanonicalWorkingTreePaths({
      ...fixture,
      classificationRecords: [...fixture.classificationRecords, fixture.classificationRecords[0]],
      untrackedPaths: ['workspace/source.json'],
    }),
    /classification record is ambiguous/,
  )
})
