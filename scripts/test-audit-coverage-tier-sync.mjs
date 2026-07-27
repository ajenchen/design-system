#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MATRIX_PATH = resolve(ROOT, 'scripts/audit-coverage-matrix.mjs')
const RUBRIC_PATH = resolve(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md')
const TIERS = new Set(['DETERMINISTIC', 'HOOK-ENFORCED', 'PURE-JUDGMENT', 'CI-ENFORCED'])

const matrixSource = readFileSync(MATRIX_PATH, 'utf8')
const rubric = readFileSync(RUBRIC_PATH, 'utf8')
const matrix = new Map()

for (const match of matrixSource.matchAll(/^\s*(\d+):\s*\{\s*tier:\s*'([^']+)'/gm)) {
  const dim = Number(match[1])
  const tier = match[2]
  assert(TIERS.has(tier), `dim ${dim} has unknown tier ${tier}`)
  assert(!matrix.has(dim), `dim ${dim} is classified more than once`)
  matrix.set(dim, tier)
}

assert.deepEqual([...matrix.keys()].sort((left, right) => left - right), Array.from({ length: 91 }, (_, index) => index + 1), 'coverage matrix must classify exactly dims 1-91')
for (const tier of TIERS) assert(matrixSource.includes(`- ${tier}:`), `coverage matrix charter does not define ${tier}`)

for (const match of rubric.matchAll(/^##\s+(\d+)\.[^\n]*?\((DETERMINISTIC|HOOK-ENFORCED|PURE-JUDGMENT|CI-ENFORCED)[^)]*\)/gm)) {
  const dim = Number(match[1])
  assert(matrix.has(dim), `rubric labels unknown dim ${dim}`)
  assert.equal(match[2], matrix.get(dim), `dim ${dim} rubric tier drifted from the coverage-matrix SSOT`)
}

console.log('✅ audit coverage tier SSOT sync test PASS')
