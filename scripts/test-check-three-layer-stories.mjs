#!/usr/bin/env node
// meta-test for check-three-layer-stories — 暫時 rename 一個 principles 檔 → gate 必 exit 1 → 還原
import { execSync } from 'node:child_process'
import { renameSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/check-three-layer-stories.mjs --check'
const f = 'packages/design-system/src/components/Accordion/accordion.principles.stories.tsx'
const hidden = f + '.metatest-hidden'

if (run(GATE) !== 0) { console.error('✗ baseline 應 PASS'); process.exit(1) }
let ok = true
try {
  renameSync(f, hidden)
  if (run(GATE) === 0) { console.error('✗ 缺層未被抓'); ok = false } else console.log('✓ 缺層被抓')
} finally { renameSync(hidden, f) }
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL'); process.exit(ok ? 0 : 1)
