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
assert.equal(loaded.plan.dimensions.length, 37)
assert.deepEqual(
  loaded.plan.dimensions.map(dimension => dimension.dim),
  loaded.hookDimensions.map(dimension => dimension.dim),
)
assert.ok(loaded.boundRegistrations.some(binding => binding.mode === 'file-replay'))
// 2026-11-21:原本這一格驗 SessionStart(dims 58 / 75 的 check_plugin_fork_health.sh);那支退場、兩維改 DETERMINISTIC 後,
// 行為契約剩 Stop / UserPromptSubmit / Bash 三種事件,逐一鎖住。
assert.ok(loaded.boundRegistrations.some(binding => binding.mode === 'focused-contract' && binding.event === 'Stop'))
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
// 只靠行為契約、沒有檔案重播的那一維(用找的,不寫死索引:2026-11-21 dims 58 / 75 移出後原本的 [19] 換成別的維度)
const focusedOnly = loaded.plan.dimensions.findIndex(dimension => dimension.fileReplays.length === 0 && dimension.focusedContracts.length > 0)
assert.ok(focusedOnly >= 0, 'hook evidence plan must keep at least one focused-contract-only dimension for the poison cases below')
assert.throws(mutate(plan => {
  plan.dimensions[focusedOnly].focusedContracts[0].test = 'test_check_story_invariants.sh'
}), /not bound to enforcementTests/)
assert.throws(mutate(plan => {
  plan.dimensions[focusedOnly].focusedContracts = []
  plan.dimensions[focusedOnly].fileReplays = []
}), /no executable evidence route/)
assert.throws(mutate(plan => { plan.inventory.minimumFiles = 0 }), /schema failure/)
assert.throws(mutate(plan => { plan.enforcementSuite.command = ['bash', 'other.sh'] }), /canonical full suite/)

console.log('✓ hook evidence plan closes 37 dims, mechanism/test/registration bindings, behavioral contracts, and poison gaps')
