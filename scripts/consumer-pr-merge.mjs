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
export const ALLOWED_CONCLUSIONS = Object.freeze(['success', 'neutral', 'skipped'])
export function mergeEvidenceVerdict({ checkRuns = [], workflowRuns = [] } = {}) {
  const bad = (list) => list.filter((r) => r.status !== 'completed' || !ALLOWED_CONCLUSIONS.includes(r.conclusion))
  if (checkRuns.length) {
    const red = bad(checkRuns)
    return red.length
      ? { ok: false, reason: `checks 未綠:${red.map((r) => `${r.name}:${r.conclusion || r.status}`).join(',')}` }
      : { ok: true, reason: `checks 全綠(${checkRuns.length} 筆 check-runs)` }
  }
  if (!workflowRuns.length) {
    return { ok: false, reason: '既讀不到 check-runs 也讀不到 workflow runs —— 沒有通過的證據,不等於通過' }
  }
  const redWf = bad(workflowRuns)
  return redWf.length
    ? { ok: false, reason: `workflow runs 未綠:${redWf.map((r) => `${r.name}:${r.conclusion || r.status}`).join(',')}` }
    : { ok: true, reason: `checks 全綠(check-runs 讀不到,改以 ${workflowRuns.length} 筆 workflow runs 為證)` }
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
  const checks = api('GET', `repos/${repository}/commits/${head}/check-runs?per_page=100`)
  let verdict = mergeEvidenceVerdict({ checkRuns: checks.body?.check_runs || [] })
  if (!verdict.ok && String(verdict.reason).startsWith('既讀不到')) {
    const wf = api('GET', `repos/${repository}/actions/runs?head_sha=${head}&per_page=100`)
    verdict = mergeEvidenceVerdict({ checkRuns: [], workflowRuns: wf.body?.workflow_runs || [] })
  }
  if (!verdict.ok) { console.error(`拒絕合併(head ${head}):${verdict.reason}`); process.exit(1) }
  console.log(verdict.reason)
  const merge = api('PUT', `repos/${repository}/pulls/${number}/merge`, { merge_method: 'squash', sha: head })
  if (!merge.ok) { console.error('merge 失敗:', merge.code, JSON.stringify(merge.body).slice(0, 200)); process.exit(1) }
  console.log(`merged ${repository}#${number} → ${merge.body.sha}`)
  api('DELETE', `repos/${repository}/git/refs/heads/${encodeURIComponent(pull.body.head.ref)}`)

}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
