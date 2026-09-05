#!/usr/bin/env node
// codex-exec — 在 Claude Code 沙箱內直接跑 codex,不需要 user 開終端機。
//
// ── 為什麼之前跑不起來(2026-09-05 更正) ──
// 舊結論(`governance/memory/feedback_codex_full_access_standing_auth.md` B.2 與
// `scripts/codex-worker.sh` 檔頭)寫「Claude 沙箱把 unix socket 全關,所以 codex CLI 起不來,
// 這是平台安全邊界」。**那個歸因是錯的**,而且因此每次要第二意見都得請 user 開一次終端機。
//
// 實測(2026-09-05):
//   `npx @openai/codex exec …` 用 user 的 `~/.codex`      → failed to initialize in-process
//                                                            app-server client: Operation not permitted
//   同一個指令,CODEX_HOME 換成**沒有 mcp_servers 的複本** → 正常啟動並回話
//
// 真正的成因是我們**自家的 `~/.codex/config.toml` 裡有三個 MCP server**
// (pencil 的 .app 二進位、`npx @playwright/mcp`、node_repl):codex 啟動時會去 spawn 它們,
// 那一步在沙箱裡被擋,於是整個 app-server 初始化失敗。這是 M36(b) 的典型自鎖 ——
// 被自家設定擋住,卻歸因成平台邊界、把動作丟回 user。
//
// 解法就是本檔:用一份**只刪掉 `[mcp_servers.*]`、其餘逐字保留**的臨時 CODEX_HOME 跑。
//
// ── 不變條件 ──
// 1. **禁降檔**(memory B.3;user 2026-07-10「應強制使用 codex 最新最強的模型與算力」):
//    config 從 `~/.codex/config.toml` **逐字複製**,只移除 mcp_servers 區段;不帶 `-m`、
//    不帶 `-c model_reasoning_effort`。model / effort / service_tier 全部沿用 user 的設定,
//    這裡不寫死任何一個值 —— 值改了自動跟著改。
// 2. **brief 唯讀**(memory A 的邊界):固定 `--sandbox read-only`,codex 不會寫/刪/改 source。
//    這是收緊而非放寬(全域 config 是 danger-full-access)。
// 3. **守衛入口**(memory B.4;user 2026-07-10「codex 額度不足你會知道嗎?應通知你」):
//    結束後一律經 `codex-run-guarded.mjs --classify` 判 outcome,非 SUCCESS 如實回報,
//    **禁把空輸出當 0 findings**。
// 4. auth 只從 user 既有的 `~/.codex/auth.json` 沿用(複製進臨時 home,跑完刪除),
//    不讀進本程序、不外送、不落地到 repo。
//
// ── 用法 ──
//   node scripts/codex-exec.mjs --brief <path> [--out <path>] [--label <id>]
//   node scripts/codex-exec.mjs --check          # 只驗傳輸是否可用
//
// 輸出:stdout 印 `CODEX-OUTCOME: <SUCCESS|QUOTA|AUTH|EMPTY|ERROR|TRANSPORT_MISSING>`;
// `--out` 給定時把 codex 的回覆寫進該檔。exit code 沿用 guarded 的分類碼。

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { classify } from './codex-run-guarded.mjs'

const REAL_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')

/**
 * 逐字保留 user 的 config,只移除 `[mcp_servers.*]` 區段。
 * TOML 的區段從 `[header]` 開到下一個同層 `[…]` 為止,所以掃行判斷即可 —— 不解析、不重寫其他值,
 * 這樣「禁降檔」是結構上成立的(我們沒有能力改到 model / effort)。
 */
export function stripMcpServers(toml) {
  const out = []
  let skipping = false
  for (const line of toml.split('\n')) {
    const header = line.match(/^\s*\[\[?([^\]]+)\]?\]\s*$/)
    if (header) skipping = /^mcp_servers(\.|$)/.test(header[1].trim())
    if (!skipping) out.push(line)
  }
  return out.join('\n')
}

function makeSandboxHome() {
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'codexhome-'))
  const cfgPath = join(REAL_HOME, 'config.toml')
  writeFileSync(
    join(dir, 'config.toml'),
    existsSync(cfgPath) ? stripMcpServers(readFileSync(cfgPath, 'utf8')) : '',
  )
  const auth = join(REAL_HOME, 'auth.json')
  if (existsSync(auth)) copyFileSync(auth, join(dir, 'auth.json'))
  return dir
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

async function run(prompt, { timeoutMs = 45 * 60 * 1000 } = {}) {
  const home = makeSandboxHome()
  try {
    return await new Promise((resolve) => {
      const child = spawn(
        'npx',
        ['--yes', '@openai/codex', 'exec', '--sandbox', 'read-only', '--skip-git-repo-check', prompt],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            CODEX_HOME: home,
            NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || join(process.env.TMPDIR || tmpdir(), 'npmcache'),
            // 第二道自鎖:sandbox 的過濾代理做 TLS 攔截,codex(Rust/rustls)不認它的 CA,
            // 連線一律 `invalid peer certificate: UnknownIssuer` 然後無限重連。curl 走系統
            // 憑證庫就通(`curl -v` 顯示 `CAfile: /etc/ssl/cert.pem`,TLS 1.3 握手成功),
            // 所以把同一份指給 rustls 即可 —— 這是「換一條已驗證可通的等價傳輸」,
            // 不放寬任何安全邊界(仍走同一個代理、同一份系統信任庫)。
            SSL_CERT_FILE: process.env.SSL_CERT_FILE || '/etc/ssl/cert.pem',
          },
        },
      )
      let out = ''
      child.stdout.on('data', (c) => { out += c })
      child.stderr.on('data', (c) => { out += c })
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
      child.on('close', (status, signal) => {
        clearTimeout(timer)
        // codex exec 的最終回覆是輸出的最後一段;前面是它自己的執行紀錄。
        const reply = out.split(/^\[[^\]]+\]\s*codex\s*$/m).pop()?.trim() || ''
        resolve({ status, signal, out, reply })
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({ status: 127, signal: null, out: `${out}\nERROR: ${err.message}`, reply: '' })
      })
    })
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

const briefPath = arg('--brief')
const outPath = arg('--out')
const checkOnly = process.argv.includes('--check')

const prompt = checkOnly
  ? 'Reply with exactly: TRANSPORT_OK'
  : (briefPath ? readFileSync(briefPath, 'utf8') : null)

if (!prompt) {
  process.stderr.write('usage: node scripts/codex-exec.mjs --brief <path> [--out <path>] | --check\n')
  process.exit(2)
}

const r = await run(prompt)
const verdict = classify(r.status, r.signal, r.out, r.reply)
if (outPath) {
  mkdirSync(join(outPath, '..'), { recursive: true })
  writeFileSync(outPath, r.reply || r.out)
}
process.stdout.write(`CODEX-OUTCOME: ${verdict.outcome}\n`)
if (verdict.outcome !== 'SUCCESS') process.stdout.write(`${verdict.action}\n${r.out.slice(-1200)}\n`)
else if (!outPath) process.stdout.write(`${r.reply}\n`)
process.exit(verdict.code)
