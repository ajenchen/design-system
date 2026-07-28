#!/usr/bin/env node
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadHookEvidencePlan,
  validateHookEvidencePlanDocument,
} from './lib/hook-evidence-plan.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const loaded = loadHookEvidencePlan({ repoRoot: ROOT })
assert.equal(loaded.plan.dimensions.length, 39)
assert.deepEqual(
  loaded.plan.dimensions.map(dimension => dimension.dim),
  loaded.hookDimensions.map(dimension => dimension.dim),
)
assert.ok(loaded.boundRegistrations.some(binding => binding.mode === 'file-replay'))
assert.ok(loaded.boundRegistrations.some(binding => binding.mode === 'focused-contract' && binding.event === 'SessionStart'))
assert.ok(loaded.boundRegistrations.some(binding => binding.mode === 'focused-contract' && binding.event === 'UserPromptSubmit'))
assert.ok(loaded.boundRegistrations.some(binding => binding.mode === 'focused-contract' && binding.tool === 'Bash'))

const mutate = callback => {
  const plan = structuredClone(loaded.plan)
  callback(plan)
  return () => validateHookEvidencePlanDocument({ repoRoot: ROOT, plan })
}

assert.throws(mutate(plan => plan.dimensions.pop()), /exactly cover ordered HOOK-ENFORCED matrix/)
assert.throws(mutate(plan => { plan.dimensions[1].dim = plan.dimensions[0].dim }), /exactly cover ordered HOOK-ENFORCED matrix/)
assert.throws(mutate(plan => { plan.dimensions[0].ruleId = 'DS-DIM-999' }), /ruleId mismatches/)
assert.throws(mutate(plan => { plan.dimensions[0].mechanismRefs = ['invented-hook.mjs'] }), /absent from canonical matrix/)
assert.throws(mutate(plan => { plan.dimensions[0].enforcementTests = ['test_missing_hook.sh'] }), /is missing/)
assert.throws(mutate(plan => { plan.dimensions[0].fileReplays[0].hook = 'unregistered-hook.sh' }), /unregistered or event\/tool is ambiguous/)
assert.throws(mutate(plan => {
  plan.dimensions[0].fileReplays[0].hook = 'check_escape_marker_abuse.sh'
}), /lacks its canonical hook test/)
assert.throws(mutate(plan => { plan.dimensions[0].fileReplays[0].event = 'PreToolUse' }), /unregistered or event\/tool is ambiguous/)
assert.throws(mutate(plan => {
  plan.dimensions[19].focusedContracts[0].test = 'test_check_story_invariants.sh'
}), /not bound to enforcementTests/)
assert.throws(mutate(plan => {
  plan.dimensions[19].focusedContracts = []
  plan.dimensions[19].fileReplays = []
}), /no executable evidence route/)
assert.throws(mutate(plan => { plan.inventory.minimumFiles = 0 }), /schema failure/)
assert.throws(mutate(plan => { plan.enforcementSuite.command = ['bash', 'other.sh'] }), /canonical full suite/)

console.log('✓ hook evidence plan closes 39 dims, mechanism/test/registration bindings, behavioral contracts, and poison gaps')
