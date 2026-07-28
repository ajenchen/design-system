#!/usr/bin/env node
import { loadManagedCiTrustedExecutionPlan } from '../../../../scripts/lib/managed-ci-trusted-execution-plan.mjs'

const [repoRoot, observedAt] = process.argv.slice(2)
if (
  process.argv.length !== 4
  || typeof repoRoot !== 'string'
  || repoRoot.length === 0
  || typeof observedAt !== 'string'
  || !Number.isFinite(Date.parse(observedAt))
) {
  process.stderr.write('managed CI immutable snapshot probe inputs are invalid\n')
  process.exitCode = 64
} else {
  const state = loadManagedCiTrustedExecutionPlan({
    repoRoot,
    now: new Date(observedAt),
  })
  process.stdout.write(JSON.stringify({
    active: state.active,
    bindingDigest: state.activationTrustBundle.bindingDigest,
    inputDigest: state.activationTrustBundle.controlPlaneLock.inputDigest,
    filesDigest: state.activationTrustBundle.gitTree.filesDigest,
    sourceSetDigest: state.activationTrustBundle.receiptBinding.sourceSetDigest,
    snapshotDigest: state.activationTrustBundle.controlPlaneLock.snapshotDigest,
    commit: state.activationTrustBundle.gitTree.executorSourceCommit,
    tree: state.activationTrustBundle.gitTree.executorSourceTree,
  }))
}
