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
import { mergeEvidenceVerdict, requiredContextsFrom } from './consumer-pr-merge.mjs'

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

  // 2026-09-19:改成「以 repo 宣告的必過清單為準」之後的判定。
  // 錨例 —— WM 的 ruleset 只要求 `Verify consumer`,但 `audit.yml` 的同名 job 在 bot 開的 PR 上
  // 被 GitHub 擋在 action_required(自家 GITHUB_TOKEN 開的 PR 不讓 workflow 跑),於是每次發版
  // 都有一個永遠跑不起來的 run。舊寫法「全部要綠」被它鎖死,beta.135/136 各空等 45 分鐘。
  ['必過的綠、非必過的紅 → 放行(WM 那格:Audit 卡 action_required 不阻擋)',
    { checkRuns: [green('Verify consumer'), red('Audit')], requiredContexts: ['Verify consumer'] }, true],
  ['必過的紅、其他全綠 → 拒絕',
    { checkRuns: [red('Verify consumer'), green('Audit')], requiredContexts: ['Verify consumer'] }, false],
  ['必過的那個同名有兩筆、其中一筆紅 → 拒絕(不准挑綠的那筆當證據)',
    { checkRuns: [green('Verify consumer'), red('Verify consumer')], requiredContexts: ['Verify consumer'] }, false],
  ['必過的 check 根本沒有任何結果 → 拒絕',
    { checkRuns: [green('Audit')], requiredContexts: ['Verify consumer'] }, false],
  ['repo 宣告了空的必過清單 → 拒絕(沒有政策就沒有通過的定義)',
    { checkRuns: [green('Audit')], requiredContexts: [] }, false],
  ['讀不到政策(null)+ 全綠 → 放行(退回舊判定)',
    { checkRuns: [green('Audit')], requiredContexts: null }, true],
  ['讀不到政策(null)+ 有紅 → 拒絕(退回舊判定,不因讀不到政策而放寬)',
    { checkRuns: [green('Audit'), red('x')], requiredContexts: null }, false],
  ['必過清單存在但完全沒證據 → 拒絕(空綠防線仍在)',
    { checkRuns: [], workflowRuns: [], requiredContexts: ['Verify consumer'] }, false],
]

let failed = 0
for (const [name, input, expected] of cases) {
  const got = mergeEvidenceVerdict(input)
  const ok = got.ok === expected
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${name} | ok=${got.ok}(期望 ${expected})— ${got.reason}`)
}

// 必過清單的解析:政策從哪讀、讀不到要回 null(而不是空陣列 —— 空陣列的語意是「宣告了但沒有必過項」)。
const policyCases = [
  ['ruleset 有 required_status_checks → 取出 context',
    { rulesets: [{ rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'Verify consumer' }] } }] }] },
    ['Verify consumer']],
  ['ruleset 只有 deletion/linear-history 之類 → 沒宣告必過 = null',
    { rulesets: [{ rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }] }] }, null],
  ['legacy branch protection 的 contexts 也要吃到',
    { protection: { required_status_checks: { contexts: ['build'] } } }, ['build']],
  ['legacy 的 checks[].context 形狀也要吃到',
    { protection: { required_status_checks: { checks: [{ context: 'build' }] } } }, ['build']],
  ['兩邊都有 → 去重合併',
    { rulesets: [{ rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'a' }] } }] }],
      protection: { required_status_checks: { contexts: ['a', 'b'] } } }, ['a', 'b']],
  ['兩邊都讀不到 → null(呼叫端退回全綠判定,不得當成「沒有必過項」)', {}, null],
  ['ruleset 宣告了 required_status_checks 但清單是空的 → 空陣列(不是 null)',
    { rulesets: [{ rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [] } }] }] }, []],
]
for (const [name, input, expected] of policyCases) {
  const got = requiredContextsFrom(input)
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} 必過清單|${name} | ${JSON.stringify(got)}(期望 ${JSON.stringify(expected)})`)
}

if (failed) { console.error(`\n✗ ${failed} 格判定不符`); process.exit(1) }
console.log('\n✓ 合併前置判定表全過(含「兩邊都讀不到 → 拒絕」與「非必過的紅不阻擋」)')
