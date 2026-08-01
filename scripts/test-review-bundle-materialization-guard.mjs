#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeProviderNeutralReviewBundle } from './run-model-deep-audit.mjs'

const root = mkdtempSync(join(tmpdir(), 'blocked-review-materialization-'))
try {
  const blockedPrepared = {
    run: { manifest: {} },
    reviewGraph: {},
    taskSet: {},
    taskDescriptors: [],
    carrierMetadata: [],
    contentSet: {},
    reviewSelectionStatus: 'REVIEW-BLOCKED',
    reviewSelection: {
      kind: 'provider-review-capability-selection-blocked',
      selectionStatus: 'REVIEW-BLOCKED',
    },
    reviewerProviderId: null,
    requestModelId: null,
    exchangeSchedule: null,
  }
  const blockedPattern = /materialization\/dispatch is REVIEW-BLOCKED until a selected peer and dispatch schedule are frozen/
  assert.throws(
    () => writeProviderNeutralReviewBundle({ repoRoot: root, prepared: blockedPrepared }),
    blockedPattern,
  )
  assert.throws(
    () => writeProviderNeutralReviewBundle({
      repoRoot: root,
      prepared: {
        ...blockedPrepared,
        reviewSelectionStatus: 'selected',
        reviewSelection: { kind: 'provider-review-capability-selection' },
        requestModelId: 'fixture-model',
        exchangeSchedule: {},
      },
    }),
    blockedPattern,
  )
  assert.deepEqual(readdirSync(root), [])
  console.log('✓ REVIEW-BLOCKED and peer-null preparations cannot materialize a portable review bundle')
} finally {
  rmSync(root, { recursive: true })
}
