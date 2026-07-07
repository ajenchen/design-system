#!/usr/bin/env node
// verify-backlog.mjs — 證據鏈 backlog 對帳 runner(2026-07-07 治理進化軌道 3)
//
// Why:deep-audit backlog 清單會過期(anchor:2026-07-07 C1 十筆殘項考古半小時,
// 9 筆早已修好)。每筆 finding 出生時附 verifyCmd(+ fixedSignal),對帳 = 跑本 runner 30 秒。
//
// 輸入格式(JSON array 或 JSONL,每筆):
//   { "id": "C1-3", "desc": "TimePicker handleNow 邊界", "verifyCmd": "grep -n alignToStep packages/.../time-picker.tsx",
//     "fixedSignal": "alignToStep" }   // 輸出含 fixedSignal = RESOLVED;省略 fixedSignal → exit 0 = RESOLVED
//
// 用法:node scripts/verify-backlog.mjs <backlog.json|jsonl>
// 輸出:每筆 RESOLVED / OPEN + 總結;有 OPEN → exit 1(對帳即紅綠燈,非散文)。
//
// ⚠️ verifyCmd 必用可攜指令(grep -Rn / node scripts/... / bash ...)——`rg` 在 Claude Code
// 環境是 shell function 非 PATH binary,子行程 /bin/sh 解析不到(2026-07-07 首跑實測 127)。
// runner 對 127 fail-loud 不靜默(沉默陷阱鐵律)。

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const file = process.argv[2]
if (!file) {
  console.error('用法: node scripts/verify-backlog.mjs <backlog.json|jsonl>')
  process.exit(1)
}
const raw = readFileSync(file, 'utf8').trim()
const items = raw.startsWith('[')
  ? JSON.parse(raw)
  : raw.split('\n').filter(Boolean).map((l) => JSON.parse(l))

let open = 0
for (const it of items) {
  if (!it.verifyCmd) {
    console.log(`⚠️  ${it.id ?? '?'} 無 verifyCmd — 不合格 backlog 項(出生時必附),視為 OPEN`)
    open++
    continue
  }
  let out = ''
  let ok = false
  try {
    out = execSync(it.verifyCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
    ok = it.fixedSignal ? out.includes(it.fixedSignal) : true
  } catch (e) {
    if (e.status === 127) {
      console.log(`💥 ${it.id ?? '?'} verifyCmd 指令不存在(127):${it.verifyCmd} — 換可攜指令(grep -Rn / node),見檔頭`)
      open++
      continue
    }
    out = String(e.stdout ?? '')
    ok = it.fixedSignal ? out.includes(it.fixedSignal) : false
  }
  if (ok) {
    console.log(`✅ RESOLVED  ${it.id ?? '?'} — ${it.desc ?? ''}`)
  } else {
    console.log(`❌ OPEN      ${it.id ?? '?'} — ${it.desc ?? ''}(cmd: ${it.verifyCmd})`)
    open++
  }
}
console.log(`\n═══ ${items.length - open}/${items.length} RESOLVED${open ? `,${open} OPEN` : ''} ═══`)
process.exit(open ? 1 : 0)
