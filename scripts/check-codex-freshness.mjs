#!/usr/bin/env node
/**
 * check-codex-freshness.mjs — codex 最新最強自動保證(deep-audit B.0 前置閘)
 *
 * 2026-07-10 user directive 兩波:
 *   (1)「怎麼確保每次都能即時自動叫 codex 用最新的,不用我提醒?」— 錨例:裝 0.134.0 vs
 *       npm latest 0.144.1(落後 10 版)+ config pin model="gpt-5.5"(鎖舊)。
 *   (2)「最高算力也不見得永遠是 xhigh 吧?你有辦法自動自主總是調整到最強嗎?」— 錨例:
 *       codex source enum(codex-rs/protocol/src/openai_models.rs)已有 max/ultra 高於 xhigh,
 *       且 2026-07-10 實測 ultra 可用(1 行 prompt 回 OK)→ xhigh pin 已非最強。
 *
 * 機制(三道,fail-closed):
 *   1. CLI 版本:installed vs `npm view @openai/codex version` — 落後 → exit 1
 *      (B.0 直接自動 `npm i -D @openai/codex@latest`,不問 user)
 *   2. model pin:config.toml 含 `model =` → exit 1(pin 鎖舊;CLI default 隨版本跟最新 model)
 *   3. effort = 探測出的最高檔:effort 檔位是否可用由伺服器/帳號在執行期決定(source:
 *      supported_reasoning_levels 為 runtime 資料),靜態查不到 → **`--probe` 由高往低實測**
 *      (1 行 prompt,~3k tokens),落在最高可用檔 → **自動改寫 config.toml pin** + 寫 cache
 *      (.claude/logs/codex-effort-probe.json 記 CLI 版本)。平時 --check:cache 的 CLI 版本
 *      != 現裝(= 換版可能開新檔位)或 pin != cache top → exit 1 指示跑 --probe(B.0 自動跑)。
 *      注意:effort **預設是 medium**(enum #[default])→ 「刪 effort pin」= 降檔,pin 必須存在
 *      且 = 探測 top。
 *
 * 檔位階梯 SSOT:openai_models.rs enum 宣告順序(低→高):
 *   none < minimal < low < medium < high < xhigh < max < ultra
 *   出現階梯外的新名字(enum Custom)→ exit 1 要求更新本階梯(半自動:偵測全自動,新名排序需一次確認)。
 *
 * 用法:
 *   node scripts/check-codex-freshness.mjs            # check(1+2+3 cache 對照)
 *   node scripts/check-codex-freshness.mjs --probe    # 實測定檔 + 自動改 config pin + 寫 cache
 *   node scripts/check-codex-freshness.mjs --offline  # 跳過 npm view(只查 pin + cache)
 */

import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PROBE = process.argv.includes('--probe')
const OFFLINE = process.argv.includes('--offline')
const ROOT = process.cwd()
const CFG = path.join(os.homedir(), '.codex/config.toml')
const CACHE = path.join(ROOT, '.claude/logs/codex-effort-probe.json')

// SSOT:codex-rs/protocol/src/openai_models.rs enum ReasoningEffort 宣告順序(2026-07-10 snapshot)
const LADDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
const PROBE_FLOOR = 'high' // 探測只走 high 以上(以下無意義)

const errors = []

function installedVersion() {
  return execSync('node_modules/.bin/codex --version', { encoding: 'utf8' })
    .trim().replace(/^codex-cli\s+/, '')
}

function readEffortPin() {
  if (!fs.existsSync(CFG)) return null
  const line = fs.readFileSync(CFG, 'utf8').split('\n').find((l) => /^\s*model_reasoning_effort\s*=/.test(l))
  const m = line && line.match(/"([^"]+)"/)
  return m ? m[1] : null
}

function writeEffortPin(tier) {
  const lines = fs.readFileSync(CFG, 'utf8').split('\n')
  const idx = lines.findIndex((l) => /^\s*model_reasoning_effort\s*=/.test(l))
  const newLine = `model_reasoning_effort = "${tier}"`
  if (idx >= 0) lines[idx] = newLine
  else lines.unshift(newLine)
  fs.writeFileSync(CFG, lines.join('\n'))
}

let lastResolvedModel = null
function probeTier(tier) {
  // 1 行 prompt 實測;成功 = exit 0 且輸出含 OK(~3k tokens/次,只在 --probe 跑)
  const out = spawnSync('node_modules/.bin/codex', [
    'exec', '--skip-git-repo-check', '-c', `model_reasoning_effort=${tier}`,
    '--output-last-message', `/tmp/codex-probe-${tier}.txt`,
  ], { input: 'Reply with exactly: OK', encoding: 'utf8', timeout: 150000 })
  // 解析 exec header 的實際解析 model(ground truth:設定最終跑成什麼;2026-07-10 user 圖一
  // ChatGPT 推薦「GPT-5.6 Sol + Ultra」→ 實測 unpin 後 default 正是 gpt-5.6-sol,記錄防回退)
  const m = `${out.stdout}\n${out.stderr}`.match(/^model:\s*(\S+)/m)
  if (m) lastResolvedModel = m[1]
  if (out.status !== 0) return false
  try { return fs.readFileSync(`/tmp/codex-probe-${tier}.txt`, 'utf8').includes('OK') } catch { return false }
}

// ── 1) CLI freshness ──
let installed = null
try {
  installed = installedVersion()
  if (!OFFLINE) {
    const latest = execSync('npm view @openai/codex version', { encoding: 'utf8', timeout: 15000 }).trim()
    if (installed !== latest) {
      errors.push(`codex CLI 過時:installed ${installed} < npm latest ${latest} → 跑 npm i -D @openai/codex@latest 後再 --probe(B.0 全自動,不問 user)`)
    } else console.log(`✅ codex CLI ${installed} = npm latest`)
  } else console.log(`ℹ️  codex CLI ${installed}(--offline)`)
} catch (e) {
  errors.push(`codex CLI 不可用:${e.message.split('\n')[0]}`)
}

// ── 2) model pin 禁止 ──
if (fs.existsSync(CFG)) {
  const pin = fs.readFileSync(CFG, 'utf8').split('\n').find((l) => /^\s*model\s*=/.test(l))
  if (pin) errors.push(`config.toml pin 了 model(${pin.trim()})— 刪該行讓 CLI default 隨版本跟最新`)
  else console.log('✅ 無 model pin(CLI default 自動跟最新)')
}

// ── 3) effort = 探測 top ──
const pin = readEffortPin()
if (pin && !LADDER.includes(pin)) {
  errors.push(`effort pin "${pin}" 不在已知階梯(codex 出了新檔位?)→ 更新本 script LADDER(對照 openai_models.rs enum 順序)後重跑 --probe`)
} else if (PROBE) {
  if (installed) {
    console.log('… 由高往低實測 effort 檔位(每檔 1 行 prompt)')
    const candidates = LADDER.slice(LADDER.indexOf(PROBE_FLOOR)).reverse()
    let top = null
    for (const tier of candidates) {
      process.stdout.write(`   probe ${tier} … `)
      if (probeTier(tier)) { console.log('✅ 可用'); top = tier; break }
      console.log('✗')
    }
    if (!top) errors.push('連 high 都探不到可用檔位 — codex auth / 網路問題,人工查')
    else {
      if (pin !== top) { writeEffortPin(top); console.log(`✅ config pin 自動改為最高可用檔:${pin ?? '(無)'} → ${top}`) }
      else console.log(`✅ pin 已是最高可用檔 ${top}`)
      fs.mkdirSync(path.dirname(CACHE), { recursive: true })
      fs.writeFileSync(CACHE, JSON.stringify({ cliVersion: installed, top, resolvedModel: lastResolvedModel, probedAt: new Date().toISOString() }, null, 2))
      if (lastResolvedModel) console.log(`✅ 實際解析 model:${lastResolvedModel}(unpin 後 CLI default;B.0 報告必 relay 此值)`)
    }
  }
} else {
  // check mode:cache 必存在、CLI 版本一致、pin == cache top
  if (!fs.existsSync(CACHE)) {
    errors.push('effort 探測 cache 不存在 → 跑 node scripts/check-codex-freshness.mjs --probe(B.0 自動)')
  } else {
    const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
    if (installed && cache.cliVersion !== installed) {
      errors.push(`CLI 換版(cache ${cache.cliVersion} → 現裝 ${installed})可能開新檔位 → 重跑 --probe(B.0 自動)`)
    } else if (pin !== cache.top) {
      errors.push(`effort pin "${pin}" != 探測 top "${cache.top}" → 重跑 --probe 或修 pin`)
    } else console.log(`✅ effort pin = 探測最高可用檔 ${cache.top}(CLI ${cache.cliVersion};model ${cache.resolvedModel ?? '未記錄,重跑 --probe 補'})`)
  }
}

if (errors.length) {
  console.error('\n❌ codex freshness 違規:')
  errors.forEach((e) => console.error(`  - ${e}`))
  process.exit(1)
}
process.exit(0)
