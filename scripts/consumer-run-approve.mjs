#!/usr/bin/env node
// 2026-08-12 governed workflow-run approve(anti-self-lock SSOT 配套,與 consumer-pr-*.mjs 成對)。
// 用途:sync bot 開的自動化 PR,其 Actions run 需「批准執行」(GitHub 對 bot PR 的預設保護)。
// 本 script 只批准「本 fleet 自家 sync 產生的 automation PR」的 run — fail-closed:
// run 必須 action_required、且其 head branch 必須是 automation/release-v* 命名。
// 使用:node scripts/consumer-run-approve.mjs <owner/repo> <run-id>
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const [repository, runId] = process.argv.slice(2)
if (!repository || !runId) { console.error('usage: consumer-run-approve.mjs <owner/repo> <run-id>'); process.exit(2) }
const token = readFileSync(join(homedir(), '.config', 'qijenchen-governance', 'github-token'), 'utf8').trim()
const api = (method, path) => {
  const args = ['-sS', '-X', method, '-H', `Authorization: Bearer ${token}`,
    '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: consumer-run-approve',
    '-w', '\n__HTTP__:%{http_code}', `https://api.github.com/${path}`]
  const result = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error) throw result.error
  const raw = result.stdout
  const marker = raw.lastIndexOf('__HTTP__:')
  const code = Number(raw.slice(marker + 9).trim())
  let body = null
  try { body = JSON.parse(raw.slice(0, marker)) } catch { /* empty */ }
  return { code, ok: code >= 200 && code < 300, body }
}
const run = api('GET', `repos/${repository}/actions/runs/${runId}`)
if (!run.ok) { console.error('run 讀取失敗:', run.code); process.exit(1) }
if (run.body.conclusion !== 'action_required') { console.error('run 非待批准狀態:', run.body.conclusion); process.exit(1) }
const branch = run.body.head_branch || ''
if (!/^automation\/(release-v|design-system-)/.test(branch)) { console.error('非自家 automation release branch:', branch); process.exit(1) }
const approve = api('POST', `repos/${repository}/actions/runs/${runId}/approve`)
if (!approve.ok) { console.error('批准失敗:', approve.code, JSON.stringify(approve.body).slice(0, 200)); process.exit(1) }
console.log(`approved run ${runId} on ${branch}`)
