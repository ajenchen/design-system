#!/usr/bin/env node
/**
 * `consumer-pr-merge.mjs` 合併前置判定的判定表。
 *
 * 錨例(2026-09-18 beta.134):原本的寫法是 `const bad = runs.filter(未綠); if (bad.length) 退出` ——
 * **清單為空時 `bad` 也是空的,零筆 check 因此被當成全綠**。實測某些 repo/token 組合下
 * `check-runs` 回空陣列(不是 403),WM #82 當時就是這樣;那次底下的 CI 其實是綠的,
 * 但腳本並不知道,它只是剛好猜對。**「看不到」不等於「通過」。**
 *
 * 本表把四種情況釘死,其中「兩邊都讀不到 → 必須拒絕」就是當時會放行的那格。
 */
import { mergeEvidenceVerdict } from './consumer-pr-merge.mjs'

const green = (name) => ({ name, status: 'completed', conclusion: 'success' })
const red = (name) => ({ name, status: 'completed', conclusion: 'failure' })
const running = (name) => ({ name, status: 'in_progress', conclusion: null })

const cases = [
  ['check-runs 全綠 → 放行', { checkRuns: [green('Verify consumer'), green('lint')] }, true],
  ['check-runs 有紅 → 拒絕', { checkRuns: [green('lint'), red('Verify consumer')] }, false],
  ['check-runs 還在跑 → 拒絕', { checkRuns: [running('Verify consumer')] }, false],
  ['check-runs 讀不到、workflow runs 全綠 → 放行', { checkRuns: [], workflowRuns: [green('Audit')] }, true],
  ['check-runs 讀不到、workflow runs 有紅 → 拒絕', { checkRuns: [], workflowRuns: [red('Audit')] }, false],
  ['check-runs 讀不到、workflow runs 還在跑 → 拒絕', { checkRuns: [], workflowRuns: [running('Audit')] }, false],
  ['兩邊都讀不到 → 拒絕(舊寫法會放行,本表的重點)', { checkRuns: [], workflowRuns: [] }, false],
  ['完全沒給參數 → 拒絕', undefined, false],
]

let failed = 0
for (const [name, input, expected] of cases) {
  const got = mergeEvidenceVerdict(input)
  const ok = got.ok === expected
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${name} | ok=${got.ok}(期望 ${expected})— ${got.reason}`)
}

if (failed) { console.error(`\n✗ ${failed} 格判定不符`); process.exit(1) }
console.log('\n✓ 合併前置判定表全過(含「兩邊都讀不到 → 拒絕」)')
