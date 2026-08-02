#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadActiveDeepAuditRun,
  prepareDeepAuditRun,
  stableStringify,
} from './lib/deep-audit-evidence-contract.mjs'
import { resolveGitRuntimeRoots } from './lib/governance-runtime-evidence.mjs'
import {
  importWaivedSelfReviewBundle,
  loadAuditCoverageTiers,
  loadWaivedSelfReviewBundle,
  validateWaivedSelfReviewBundle,
  waivedSelfReviewContract,
} from './lib/waived-self-review.mjs'
import {
  summarizeDeepAuditCompliance,
  verifyDeepAuditCoverage,
} from './verify-deep-audit-coverage.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inputRoot = mkdtempSync(resolve(tmpdir(), 'waived-self-review-input-'))
const explicitRoot = `tests/waived-self-review-${randomUUID()}`
const evidenceRoot = resolveGitRuntimeRoots(ROOT, { create: true }).evidence
const explicitAbsolute = resolve(evidenceRoot, explicitRoot)

function buildBundle(activeRun, tiers) {
  const { manifest, manifestSha256 } = activeRun
  return {
    schemaVersion: 1,
    evidenceKind: waivedSelfReviewContract.evidenceKind,
    runId: manifest.runId,
    manifestSha256,
    head: manifest.head,
    tree: manifest.tree,
    indexDigest: manifest.indexDigest,
    inventoryDigest: manifest.inventoryDigest,
    rubricDigest: manifest.rubricDigest,
    worktreeFingerprint: manifest.worktreeFingerprint,
    authorProvider: manifest.authorProvider,
    providerIdentityDigest: manifest.providerIdentityDigest,
    reviewSelectionDigest: manifest.reviewSelection.selectionDigest,
    provider: structuredClone(manifest.providers.self),
    reviewedAt: new Date().toISOString(),
    reviewMethod: 'local-self-review-import',
    independent: false,
    assurance: 'self-attested',
    secondOpinionPerformed: false,
    judgmentReviews: tiers['PURE-JUDGMENT'].map((dim) => ({
      dim,
      status: 'UNOBSERVED',
      summary: 'Focused test fixture records no substantive review claim.',
      findings: [],
    })),
    componentA1bReviews: manifest.components.map((component) => ({
      component: component.name,
      status: 'UNOBSERVED',
      summary: 'Focused test fixture records no component claim-verification claim.',
      claimsReviewed: 0,
      findings: [],
    })),
  }
}

function rejects(bundle, mutate, pattern) {
  const poison = structuredClone(bundle)
  mutate(poison)
  assert.throws(
    () => validateWaivedSelfReviewBundle(poison, { activeRun: active, tiers, repoRoot: ROOT }),
    pattern,
  )
}

let active
let tiers
try {
  prepareDeepAuditRun({
    repoRoot: ROOT,
    explicitRoot,
    selfProvider: 'codex',
    authorProvider: 'codex',
    selfRuntime: 'codex-desktop',
    selfSurface: 'local',
    secondOpinionWaiver: 'user',
  })
  active = loadActiveDeepAuditRun({ repoRoot: ROOT, explicitRoot, requireCurrent: true })
  tiers = loadAuditCoverageTiers(ROOT)
  const bundle = buildBundle(active, tiers)

  assert(tiers['PURE-JUDGMENT'].length > 0)
  assert.equal(bundle.judgmentReviews.length, tiers['PURE-JUDGMENT'].length)
  assert.equal(bundle.componentA1bReviews.length, active.manifest.components.length)
  assert.equal(validateWaivedSelfReviewBundle(bundle, { activeRun: active, tiers, repoRoot: ROOT }), true)

  rejects(bundle, value => { value.runId = randomUUID() }, /runId differs/)
  rejects(bundle, value => { value.head = 'f'.repeat(40) }, /head differs/)
  rejects(bundle, value => { value.manifestSha256 = 'f'.repeat(64) }, /manifestSha256 differs/)
  rejects(bundle, value => { value.provider.displayName = 'Foreign provider' }, /provider differs/)
  rejects(bundle, value => { value.judgmentReviews.pop() }, /dimensions do not exactly match/)
  rejects(bundle, value => { value.judgmentReviews[1].dim = value.judgmentReviews[0].dim }, /dimensions do not exactly match/)
  rejects(bundle, value => { value.componentA1bReviews.pop() }, /components do not exactly match/)
  rejects(bundle, value => { value.independent = true }, /contract schema failed|identity or assurance is invalid/)
  rejects(bundle, value => { value.secondOpinionPerformed = true }, /contract schema failed|identity or assurance is invalid/)
  rejects(bundle, value => { value.model = 'forbidden-model-claim' }, /contract schema failed|invalid or open shape/)
  rejects(bundle, value => {
    value.judgmentReviews[0] = {
      ...value.judgmentReviews[0],
      status: 'FINDINGS',
      findings: [{
        severity: 'material',
        path: '../escape.md',
        line: 1,
        claim: 'escaped path',
        actual: 'outside frozen inventory',
        recommendation: 'reject the bundle',
      }],
    }
  }, /contract schema failed|unsafe segment/)

  const missingImportCoverage = verifyDeepAuditCoverage({
    repoRoot: ROOT,
    explicitRoot,
    selfProvider: 'codex',
    authorProvider: 'codex',
  })
  assert.deepEqual(missingImportCoverage.gaps.judgment.codex, tiers['PURE-JUDGMENT'])
  assert.deepEqual(
    missingImportCoverage.gaps.componentA1b.codex,
    active.manifest.components.map((component) => component.name),
  )

  const inputPath = resolve(inputRoot, 'waived-self-review.json')
  writeFileSync(inputPath, `${stableStringify(bundle, 2)}\n`)
  const cli = spawnSync(process.execPath, [
    'scripts/import-waived-self-review.mjs',
    '--repo-root', ROOT,
    '--evidence-root', explicitRoot,
    '--input', inputPath,
    '--json',
  ], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  const imported = JSON.parse(cli.stdout)
  assert.equal(imported.relativePath, waivedSelfReviewContract.relativePath)
  assert.equal(imported.independent, false)
  assert.equal(imported.assurance, 'self-attested')
  assert.equal(imported.secondOpinionPerformed, false)
  assert.equal(loadWaivedSelfReviewBundle({ activeRun: active, explicitRoot, tiers }).sha256, imported.sha256)
  assert.throws(
    () => importWaivedSelfReviewBundle({ repoRoot: ROOT, explicitRoot, inputPath }),
    /already exists/,
  )
  assert.throws(
    () => importWaivedSelfReviewBundle({ repoRoot: ROOT, explicitRoot, inputPath: '../escape.json' }),
    /unsafe segment|escapes/,
  )

  const coverage = verifyDeepAuditCoverage({ repoRoot: ROOT, explicitRoot, selfProvider: 'codex', authorProvider: 'codex' })
  assert.deepEqual(coverage.gaps.judgment.codex, [])
  assert.deepEqual(coverage.gaps.componentA1b.codex, [])
  assert.equal(coverage.trustDowngrades.unverifiedModelCoverage, 1)
  assert.equal(coverage.promotionEligible, false)
  const completeSelfAttested = summarizeDeepAuditCompliance({
    totalGaps: 0,
    envelopes: [],
    waivedSelfReview: bundle,
  })
  assert.equal(completeSelfAttested.coverageStatus, 'complete')
  assert.equal(completeSelfAttested.complianceStatus, 'blocked')
  assert.equal(completeSelfAttested.promotionEligible, false)
  assert.equal(completeSelfAttested.trustDowngrades.unverifiedModelCoverage, 1)

  const implementation = [
    readFileSync(resolve(ROOT, 'scripts/lib/waived-self-review.mjs'), 'utf8'),
    readFileSync(resolve(ROOT, 'scripts/import-waived-self-review.mjs'), 'utf8'),
  ].join('\n')
  assert.doesNotMatch(implementation, /node:child_process|run-model-deep-audit|OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN/)
  prepareDeepAuditRun({
    repoRoot: ROOT,
    explicitRoot,
    selfProvider: 'codex',
    authorProvider: 'codex',
    selfRuntime: 'codex-desktop',
    selfSurface: 'local',
    peerProvider: 'claude',
    peerRuntime: 'claude-code-cli',
    peerSurface: 'local',
    replaceActive: true,
  })
  const ordinary = loadActiveDeepAuditRun({ repoRoot: ROOT, explicitRoot, requireCurrent: true })
  assert.notEqual(ordinary.manifest.reviewSelection.kind, 'provider-review-capability-selection-waived')
  assert.throws(
    () => validateWaivedSelfReviewBundle(bundle, { activeRun: ordinary, tiers, repoRoot: ROOT }),
    /active run is not an exact user-waived/,
  )
  console.log(`✓ waived self-review dynamically covered ${bundle.judgmentReviews.length} PURE-JUDGMENT dimensions and ${bundle.componentA1bReviews.length} frozen components`)
  console.log('✓ non-waiver/foreign/stale/missing/duplicate/open/path-escape poisons fail closed; import is fixed-path and no-replace')
  console.log('✓ complete self-attested coverage keeps unverifiedModelCoverage and promotionEligible=false')
} finally {
  rmSync(inputRoot, { recursive: true, force: true })
  rmSync(explicitAbsolute, { recursive: true, force: true })
}

console.log('✅ waived self-review import route focused tests PASS')
