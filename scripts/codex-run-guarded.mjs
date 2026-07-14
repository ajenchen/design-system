#!/usr/bin/env node
/**
 * codex-run-guarded.mjs — codex exec 單一守衛入口(2026-07-10 user directive)
 *
 * user verbatim:「如果 codex 用量不足你會知道嗎?應該要通知你,然後你要通知我才對,
 * 讓我可以處理」。缺口:codex quota/rate 耗盡 → codex exit≠0 + last-message 空 →
 * 若把「空輸出」當「codex 0 findings = 全乾淨」= false-green,且 user 不知情無法處理。
 *
 * 本守衛:跑 codex exec,把結果分類成明確 outcome,**任何非 SUCCESS 都 fail-loud**
 * (stdout 印 `CODEX-OUTCOME: <class>` + 建議 user 動作),caller(Claude)據此
 * 必 STOP + PushNotification user,禁當 clean 續跑。
 *
 * Outcome 分類(codex CLI 0.144 錯誤格式:`ERROR: {"type":"error","status":NNN,...}`,exit≠0):
 *   SUCCESS   exit 0 + last-message 非空
 *   QUOTA     輸出含 status 429 / usage limit / rate limit / quota / insufficient — **通知 user**
 *   AUTH      status 401/403 / unauthorized / login — **通知 user 重新登入**
 *   EMPTY     exit 0 但 last-message 空(codex 只 echo / plan-turn 燒光)— 縮 brief 重試
 *   ERROR     其他非 0(bad model / network / crash)
 *
 * 用法:
 *   node scripts/codex-run-guarded.mjs --brief <briefFile> [--out <lastMsgFile>] [--effort <t>]
 *   (不帶 --effort → 繼承 config.toml 最強;守衛內不降檔,對齊 freshness canonical)
 *   stdin brief:… | node scripts/codex-run-guarded.mjs --stdin --out <file>
 *   exit code:0=SUCCESS,其餘=非 SUCCESS(caller fail-loud)
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const argv = process.argv.slice(2)
const get = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }
const briefFile = get('--brief')
const outFile = get('--out') || '/tmp/codex-guarded-last.txt'
const logFile = get('--log') || '/tmp/codex-guarded.log'
const useStdin = argv.includes('--stdin')

// ── classify(pure)— outcome + action + exit code from (status, log, lastMsg)──
// 2026-07-11 修 false-positive:原 has('429'/'quota'/'credit'/'auth') 會撞 codex echo 的檔案行號
//   (`429\t<tbody>`)+ 散文(CLAUDE.md 含 "quota"/"credit"/"auth")→ 誤判 QUOTA/AUTH。
//   codex API 錯誤格式 = `ERROR: {"type":"error","status":NNN,...}`(且 exit≠0)。故只在「真 error
//   語境」(該 ERROR: JSON 行 + status≠0 時的全文)判 quota/auth;status===0 乾淨退出不掃散文。
export function classify(status, signal, out, lastMsg) {
  const text = out || ''
  const hasMsg = (lastMsg || '').trim().length > 0
  if (status === 0 && hasMsg) return { outcome: 'SUCCESS', action: '', code: 0 }

  const errLine = (text.match(/ERROR:\s*\{[^\n]*\}/i) || [''])[0]
  const errCtx = errLine + '\n' + (status !== 0 ? text : '')  // 乾淨退出(status 0)不掃全文,避免 echo 撞號
  const QUOTA_RE = /"status"\s*:\s*429|\b429 too many|too many requests|usage limit|rate[ -]?limit|quota exceeded|insufficient_quota|out of (usage )?credit|billing.{0,20}limit|you've (hit|reached|exceeded)[^.\n]{0,40}(limit|quota|credit)/i
  const AUTH_RE  = /"status"\s*:\s*40[13]|\bunauthorized\b|\bforbidden\b|please login|not logged in|invalid api key|authentication (failed|error)/i
  if (QUOTA_RE.test(errCtx))
    return { outcome: 'QUOTA', action: '🚨 codex 額度/rate 耗盡 → **PushNotification 通知 user 處理**(充值 / 換帳號 / 等重置);STOP,禁當 clean 續跑', code: 4 }
  if (AUTH_RE.test(errCtx))
    return { outcome: 'AUTH', action: '🚨 codex 認證失效 → **PushNotification 通知 user** 跑 `codex login`;STOP', code: 5 }
  if (status === 0 && !hasMsg)
    return { outcome: 'EMPTY', action: 'codex exit 0 但無 verdict(只 echo / plan-turn 燒光)→ 縮小 brief / 減軸重試,不當 0 findings', code: 6 }
  return { outcome: 'ERROR', action: `codex exit=${status}${signal ? ' signal=' + signal : ''}(bad model / network / crash)→ 讀 log;通知 user`, code: 7 }
}

// import 時只匯出 classify,不跑 CLI(單元測用)
import { pathToFileURL } from 'node:url'
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (!isMain) { /* imported for testing — skip CLI */ }
else {

// ── --classify dev/test mode:不跑 codex,只分類既有 log(breadth-test 用)──
if (argv.includes('--classify')) {
  const status = parseInt(get('--status') ?? '0', 10)
  const log = get('--log-file') ? fs.readFileSync(get('--log-file'), 'utf8') : (get('--log-text') || '')
  const last = get('--last-text') ?? ''
  const c = classify(status, null, log, last)
  console.log(`CODEX-OUTCOME: ${c.outcome}`)
  process.exit(c.code)
}

const CODEX = 'node_modules/.bin/codex'
if (!fs.existsSync(CODEX)) {
  console.log('CODEX-OUTCOME: TRANSPORT_MISSING — node_modules/.bin/codex 不存在,跑 npm i;通知 user')
  process.exit(3)
}

const input = useStdin ? fs.readFileSync(0, 'utf8')
  : briefFile ? fs.readFileSync(briefFile, 'utf8')
  : (() => { console.error('need --brief <file> or --stdin'); process.exit(2) })()

try { fs.writeFileSync(outFile, '') } catch {}
const args = ['exec', '--skip-git-repo-check', '-C', process.cwd(), '--dangerously-bypass-approvals-and-sandbox', '--output-last-message', outFile]
const r = spawnSync(CODEX, args, { input, encoding: 'utf8', timeout: 40 * 60 * 1000 })
const out = `${r.stdout || ''}\n${r.stderr || ''}`
fs.writeFileSync(logFile, out)
const lastMsg = (() => { try { return fs.readFileSync(outFile, 'utf8').trim() } catch { return '' } })()

// ── classify(單一 SSOT:直接消費 classify(),不再 inline 複製邏輯 → 避免 drift)──
const { outcome, action, code } = classify(r.status, r.signal, out, lastMsg)

console.log(`CODEX-OUTCOME: ${outcome}`)
if (outcome === 'SUCCESS') {
  console.log(`  ✅ last-message: ${outFile}(${lastMsg.length} chars)`)
} else {
  const errLine = (out.match(/ERROR:.*$/m) || [''])[0].slice(0, 200)
  console.log(`  exit=${r.status} | ${action}`)
  if (errLine) console.log(`  codex said: ${errLine}`)
}
process.exit(code)

}
