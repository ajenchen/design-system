#!/usr/bin/env node
// 2026-08-11 governed consumer PR merge(anti-self-lock SSOT 配套)。
// 用途:consumer repo 的前置修復 PR(如依賴安全修補)在 required check 綠燈後,
// 由本 governed script 以 canonical credential reference 完成 exact-head squash merge。
// 與 release-orchestrator 的 shim 同傳輸(curl;sandbox 內 gh 的 Go TLS 不可用)。
// 使用:node scripts/consumer-pr-merge.mjs <owner/repo> <pr-number>
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
const runs = checks.body?.check_runs || []
const bad = runs.filter(run => run.status !== 'completed' || !['success', 'neutral', 'skipped'].includes(run.conclusion))
if (bad.length) { console.error('checks 未綠:', bad.map(run => `${run.name}:${run.conclusion || run.status}`).join(',')); process.exit(1) }
const merge = api('PUT', `repos/${repository}/pulls/${number}/merge`, { merge_method: 'squash', sha: head })
if (!merge.ok) { console.error('merge 失敗:', merge.code, JSON.stringify(merge.body).slice(0, 200)); process.exit(1) }
console.log(`merged ${repository}#${number} → ${merge.body.sha}`)
api('DELETE', `repos/${repository}/git/refs/heads/${encodeURIComponent(pull.body.head.ref)}`)
