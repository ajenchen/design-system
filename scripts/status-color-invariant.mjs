#!/usr/bin/env node
// status-color-invariant.mjs — 守 color.spec.md L200/L208/L216-217 的「狀態色用 --info,絕不混入 --primary」鐵律。
//
// Why(2026-06-05 user「圖一 bg-primary 不是 bg-info?」抓出 + 拍板「改用 --info」):
//   color.spec.md(token 字典 SSOT)明列 progress fill / in-progress / active 指示 / step indicator
//   屬 --info 用途(L200),且「絕不混入 --primary」(L208),並把 <Progress bg-primary> 標 ❌(L216-217)。
//   但 ProgressBar / CircularProgress / Steps / Calendar-today 過去用 --primary = spec-vs-spec drift。
//   已遷 --info;本 invariant 鎖住,防回潮(grep 機械驗,零 false-positive — 這些是純 status 顯示元件,
//   不該出現 --primary 狀態填色;真有互動 --primary 需求 → 加 per-line `// status-color-allow: <理由>` 逃生)。
//
// 對齊 feedback_ssot_mechanical_p0_not_p1_warn(SSOT canonical = P0 機械強制 with per-line escape)。
// Run: `node scripts/status-color-invariant.mjs`(deterministic audit chain)。fail → exit 1。

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// 純 status-display 元件 + 檔:狀態填色/進度色必走 --info,禁 --primary 家族 token 形式。
const GUARDED = [
  'packages/design-system/src/components/ProgressBar/progress-bar.tsx',
  'packages/design-system/src/components/CircularProgress/circular-progress.tsx',
  'packages/design-system/src/components/Steps/steps.tsx',
  'packages/design-system/src/components/Calendar/calendar.tsx',
]

// token 使用形式(非 JSX `variant="primary"` prop — 那是 Button 互動入口,合法)。
const PRIMARY_TOKEN = /\b(bg-primary|text-primary|border-primary|ring-primary|var\(--primary(?:-hover|-active|-subtle)?\)|--primary(?:-hover|-active)\b)/
const ESCAPE = /status-color-allow:/

const failures = []
let scanned = 0

for (const rel of GUARDED) {
  let src
  try { src = readFileSync(join(ROOT, rel), 'utf8') } catch { failures.push(`✗ 找不到 ${rel}`); continue }
  scanned++
  src.split('\n').forEach((line, i) => {
    // 跳過註解行裡單純提到 "primary" 作命名說明(非 token 使用)+ 有逃生註解的行
    if (ESCAPE.test(line)) return
    // 跳過 JSX variant="primary"(Button 互動入口合法) — 該形式不含 bg-/text-/var(--primary)
    if (PRIMARY_TOKEN.test(line)) {
      // 排除純命名 rationale 註解(如「`primary` 會撞 Button」)— 這類不含 token 形式,上面 regex 也不會中
      failures.push(`✗ ${rel}:${i + 1} 出現 --primary 狀態填色(應 --info)— ${line.trim().slice(0, 90)}`)
    }
  })
}

console.log('\n=== Status-Color Invariant(progress/step/in-progress 必 --info,禁 --primary)===')
console.log(`Scanned: ${scanned}/${GUARDED.length} files   FAIL: ${failures.length}\n`)
if (failures.length) {
  console.log(failures.join('\n'))
  console.error(`\n✗ ${failures.length} 處狀態填色誤用 --primary。color.spec.md L200/L208/L216-217:狀態色用 --info,絕不混入 --primary。`)
  console.error(`  修:--primary→--info / --primary-hover→--info-hover / bg-primary→bg-info(同色 blue-6,零視覺差,語義正確)。`)
  console.error(`  若真為互動入口需 --primary → 加 per-line \`// status-color-allow: <理由>\`。`)
  process.exit(1)
}
console.log(`✓ ${scanned} 個 status 元件全用 --info(無 --primary 狀態填色回潮).`)
process.exit(0)
