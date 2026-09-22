#!/usr/bin/env node
// meta-test for closed-git-foreign-owner-invariant(gate-meta-test 家族)。
// (1) 判定表:accepted / refused-dubious / other 三種結果各有輸入;(2) 非 root:不帶 --require 必 SKIPPED-ENV + exit 0,
// 帶 --require 必 exit 1(略過不准算綠 —— 否則 CI 的容器 job 可以什麼都沒跑就綠);(3) root(CI 容器):閘本身必 exit 0 且 A/B/C/D 四面都印出 ✓。
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { classifyOwnershipOutcome, FACES } from './closed-git-foreign-owner-invariant.mjs'

const table = [
  [{ status: 0, stderr: '' }, 'accepted'],
  [{ status: 0, stderr: 'warning: whatever' }, 'accepted'],
  [{ status: 128, stderr: "fatal: detected dubious ownership in repository at '/__w/design-system/design-system'" }, 'refused-dubious'],
  [{ status: 128, stderr: Buffer.from('fatal: detected dubious ownership in repository') }, 'refused-dubious'],
  [{ status: 128, stderr: 'fatal: not a git repository' }, 'other'],
  [{ status: 1, stderr: 'fatal: detected dubious ownership' }, 'other'],
  [{ status: null, stderr: '' }, 'other'],
]
for (const [input, expected] of table) assert.equal(classifyOwnershipOutcome(input), expected, JSON.stringify(input))
assert.deepEqual(Object.keys(FACES), ['A', 'B', 'C', 'D'])
console.log(`✓ 判定表 ${table.length} 格`)

const run = (args) => spawnSync(process.execPath, ['scripts/closed-git-foreign-owner-invariant.mjs', ...args], { encoding: 'utf8' })
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
if (!isRoot) {
  const lenient = run([])
  assert.equal(lenient.status, 0, lenient.stdout + lenient.stderr)
  assert.match(lenient.stdout, /SKIPPED-ENV/)
  const strict = run(['--require'])
  assert.equal(strict.status, 1, '--require 下略過必須是紅的:' + strict.stdout + strict.stderr)
  assert.match(strict.stderr, /SKIPPED-ENV/)
  console.log('✓ 非 root:略過誠實(exit 0 + SKIPPED-ENV),--require 咬得住(exit 1)')
} else {
  const strict = run(['--require', `--workspace=${process.cwd()}`])
  assert.equal(strict.status, 0, strict.stdout + strict.stderr)
  for (const face of Object.keys(FACES)) assert.match(strict.stdout, new RegExp(`✓ ${face} `), `面 ${face} 沒有 ✓:\n${strict.stdout}`)
  console.log('✓ root:四面全綠')
}
