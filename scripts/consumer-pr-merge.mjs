#!/usr/bin/env node
// 2026-08-11 governed consumer PR merge(anti-self-lock SSOT 配套)。
// 用途:consumer repo 的前置修復 PR(如依賴安全修補)在 required check 綠燈後,
// 由本 governed script 以 canonical credential reference 完成 exact-head squash merge。
// 與 release-orchestrator 的 shim 同傳輸(curl;sandbox 內 gh 的 Go TLS 不可用)。
// 使用:node scripts/consumer-pr-merge.mjs <owner/repo> <pr-number>
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 合併前置的判定(純函式,供 scripts/test-consumer-pr-merge-evidence.mjs 驗四種情況)。
// **「看不到」不等於「通過」**(2026-09-18 beta.134 錨例):原本的寫法是
//   `const bad = runs.filter(未綠); if (bad.length) 退出`
// —— 清單為空時 `bad` 也是空的,於是**零筆 check 被當成全綠**。實測某些 repo/token 組合下
// `check-runs` 回空陣列(不是 403),WM #82 當時就是這樣;那次底下的 CI 其實是綠的,
// 但腳本並不知道,它只是剛好猜對。空綠比沒有閘更危險。
// **比 repo 政策更嚴 ≠ 更安全**(2026-09-19 錨例):原本要求「所有 check 全綠」,比 consumer repo
// 自己宣告的必過清單還嚴,結果被一個**結構上永遠跑不起來**的 check 鎖死。
//
// 實況:WM 的 protected-main ruleset(`fleet/verified-main`)只要求一個 check —— `Verify consumer`。
// 它有兩個生產者,而且是刻意的:
//   - 一般人開的 PR → `audit.yml` 的 job(job 名就叫 `Verify consumer`)實跑 typecheck/lint/build。
//   - bot 開的同步 PR → 該 job 被 GitHub 擋在 `action_required`(自家 GITHUB_TOKEN 開的 PR,
//     GitHub 刻意不讓它跑以防遞迴),所以改由 `sync-design-system.yml` 在**真的跑完**
//     typecheck/lint:imports/build/governance:check 之後(該檔 :316-331),用 API 補發同名 check-run。
// 於是每次發版都有一個永遠停在 `action_required` 的 Audit run。它不是必過項,卻讓這支腳本拒絕合併,
// beta.135 / beta.136 各因此空等 45 分鐘 + 人工清一次。
//
// 改法:**以 repo 自己宣告的必過清單為準**,非必過的 run 照印但不阻擋。這不是放寬 ——
// ruleset 才是「什麼必須過」的 authority,而 GitHub 自己也會在必過項未綠時拒絕合併。
// 仍然 fail closed 的兩種情況:(a) 讀不到任何 check/run 證據;(b) 讀得到證據但讀不到政策
// (沒有政策就沒有「必過」的定義,不得自行放行)。
export const ALLOWED_CONCLUSIONS = Object.freeze(['success', 'neutral', 'skipped'])
const isGreen = (r) => r.status === 'completed' && ALLOWED_CONCLUSIONS.includes(r.conclusion)
const label = (r) => `${r.name}:${r.conclusion || r.status}`

export function mergeEvidenceVerdict({ checkRuns = [], workflowRuns = [], requiredContexts = null } = {}) {
  const runs = checkRuns.length ? checkRuns : workflowRuns
  const source = checkRuns.length ? `${checkRuns.length} 筆 check-runs` : `${workflowRuns.length} 筆 workflow runs(check-runs 讀不到)`

  // **「看不到」不等於「通過」**(2026-09-18 beta.134 錨例):原本是
  //   `const bad = runs.filter(未綠); if (bad.length) 退出`
  // —— 清單為空時 `bad` 也是空的,零筆 check 被當成全綠。空綠比沒有閘更危險。
  if (!runs.length) {
    return { ok: false, reason: '既讀不到 check-runs 也讀不到 workflow runs —— 沒有通過的證據,不等於通過' }
  }

  // 沒有政策 = 沒有「必過」的定義。退回舊行為(全綠才放行),不得自行決定哪些可以不過。
  if (!requiredContexts) {
    const red = runs.filter((r) => !isGreen(r))
    return red.length
      ? { ok: false, reason: `讀不到 repo 的必過清單 → 退回全綠判定;未綠:${red.map(label).join(',')}` }
      : { ok: true, reason: `讀不到必過清單 → 退回全綠判定,${source} 全綠` }
  }
  if (!requiredContexts.length) {
    return { ok: false, reason: 'repo 未宣告任何必過 check —— 沒有政策就沒有通過的定義,不合併' }
  }

  const required = new Set(requiredContexts)
  const missing = requiredContexts.filter((c) => !runs.some((r) => r.name === c))
  if (missing.length) {
    return { ok: false, reason: `必過 check 沒有任何結果:${missing.join(',')}` }
  }
  // 同名多筆(本例就是):**全部**都要綠,不能挑一筆綠的當證據。
  const redRequired = runs.filter((r) => required.has(r.name) && !isGreen(r))
  if (redRequired.length) {
    return { ok: false, reason: `必過 check 未綠:${redRequired.map(label).join(',')}` }
  }
  const advisory = runs.filter((r) => !required.has(r.name) && !isGreen(r))
  const note = advisory.length ? `;非必過但未綠(僅提示,不阻擋):${advisory.map(label).join(',')}` : ''
  return { ok: true, reason: `必過 check 全綠(${requiredContexts.join(',')};證據來源 ${source})${note}` }
}

/** 從 rulesets + branch protection 取得該分支的必過 check 名單。讀不到回 null(呼叫端退回全綠判定)。 */
export function requiredContextsFrom({ rulesets = null, protection = null } = {}) {
  const out = []
  let sawPolicy = false
  for (const rs of rulesets || []) {
    for (const rule of rs.rules || []) {
      if (rule.type !== 'required_status_checks') continue
      sawPolicy = true
      for (const c of rule.parameters?.required_status_checks || []) if (c.context) out.push(c.context)
    }
  }
  const legacy = protection?.required_status_checks
  if (legacy) {
    sawPolicy = true
    for (const c of legacy.contexts || []) out.push(c)
    for (const c of legacy.checks || []) if (c.context) out.push(c.context)
  }
  return sawPolicy ? [...new Set(out)] : null
}

// CLI:只有被直接執行才跑(被 import 當模組時不得有副作用 —— 判定表測試要 import 這支)
function main() {
  const [repository, number] = process.argv.slice(2)
  if (!repository || !number) {
    console.error('usage: consumer-pr-merge.mjs <owner/repo> <pr-number>')
    process.exit(2)
  }
  const token = readFileSync(join(homedir(), '.config', 'qijenchen-governance', 'github-token'), 'utf8').trim()
  const api = (method, path, body = null) => {
    const args = ['-sS', '-X', method, '-H', `Authorization: Bearer ${token}`,
      '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: consumer-pr-merge',
      '-w', '\n__HTTP__:%{http_code}']
    if (body !== null) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body))
    args.push(`https://api.github.com/${path}`)
    const result = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (result.error) throw result.error
    const raw = result.stdout
    const marker = raw.lastIndexOf('__HTTP__:')
    const code = Number(raw.slice(marker + 9).trim())
    let parsed = null
    try { parsed = JSON.parse(raw.slice(0, marker)) } catch { /* 204 等空回應 */ }
    return { code, ok: code >= 200 && code < 300, body: parsed }
  }

  // fail-closed 前置:PR 開啟、required check 全綠、head 綁定
  const pull = api('GET', `repos/${repository}/pulls/${number}`)
  if (!pull.ok || pull.body.state !== 'open') { console.error('PR 非 open:', pull.body?.state); process.exit(1) }
  const head = pull.body.head.sha
  // 先取 repo 自己宣告的必過清單(ruleset 優先,legacy branch protection 補位)。
  // 讀不到就是 null → mergeEvidenceVerdict 退回舊的「全綠才放行」,不自行放寬。
  const base = pull.body.base.ref
  const rulesets = api('GET', `repos/${repository}/rulesets?includes_parents=true`)
  const detailed = []
  for (const rs of Array.isArray(rulesets.body) ? rulesets.body : []) {
    const one = api('GET', `repos/${repository}/rulesets/${rs.id}`)
    if (one.ok && one.body) detailed.push(one.body)
  }
  const protection = api('GET', `repos/${repository}/branches/${encodeURIComponent(base)}/protection`)
  const requiredContexts = requiredContextsFrom({
    rulesets: detailed,
    protection: protection.ok ? protection.body : null,
  })
  console.log(`必過清單(${base}):${requiredContexts ? (requiredContexts.join(',') || '(空)') : '讀不到 → 退回全綠判定'}`)

  const checks = api('GET', `repos/${repository}/commits/${head}/check-runs?per_page=100`)
  let verdict = mergeEvidenceVerdict({ checkRuns: checks.body?.check_runs || [], requiredContexts })
  if (!verdict.ok && String(verdict.reason).startsWith('既讀不到')) {
    const wf = api('GET', `repos/${repository}/actions/runs?head_sha=${head}&per_page=100`)
    verdict = mergeEvidenceVerdict({ checkRuns: [], workflowRuns: wf.body?.workflow_runs || [], requiredContexts })
  }
  if (!verdict.ok) { console.error(`拒絕合併(head ${head}):${verdict.reason}`); process.exit(1) }
  console.log(verdict.reason)
  const merge = api('PUT', `repos/${repository}/pulls/${number}/merge`, { merge_method: 'squash', sha: head })
  if (!merge.ok) { console.error('merge 失敗:', merge.code, JSON.stringify(merge.body).slice(0, 200)); process.exit(1) }
  console.log(`merged ${repository}#${number} → ${merge.body.sha}`)
  api('DELETE', `repos/${repository}/git/refs/heads/${encodeURIComponent(pull.body.head.ref)}`)

}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
