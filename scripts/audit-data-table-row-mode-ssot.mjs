#!/usr/bin/env node
// audit-data-table-row-mode-ssot.mjs — Per-row state SSOT canonical mechanical enforcement
//
// 2026-05-12 Round 4.5 codify(per user 拍板「下次遇到類似場景可以完美使用」):
//   任何 cell-render wrapper(items-X / row-conditional class)必 consume `effectiveAutoRowForCell`
//   per-row state,**禁** consume global `autoRowHeight` prop。
//
//   為何:`autoRowHeight` 是 table 級 prop;row 可能 per-row 撐高(rowHasAnyError → effectiveAutoRow=true),
//   此時該 row 內所有 cells 該全 top-align,不論 global autoRowHeight 設啥。
//   Round 4 修了 line 1559 non-error wrapper;Round 4.5 補修 line 1512 error-cell flex-col 內部 wrapper
//   (codex M31 dual-track 抓漏)。本 audit script 機械化攔未來再 regress。
//
// 對齊 Material X-DataGrid `getRowHeight` per-row override priority(https://mui.com/x/react-data-grid/row-height/)
// + AG Grid `rowHeight: 'auto'` per-row dynamic — per-row state 永遠 override global table-level prop。
//
// Run: `node scripts/audit-data-table-row-mode-ssot.mjs`

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FILE = join(__dirname, '..', 'packages/design-system/src/components/DataTable/data-table.tsx')

const src = readFileSync(FILE, 'utf8')
const lines = src.split('\n')

// Cell render scope:2026-05-31 fix(infra-audit P1/P2 — 原硬編 line 1000-1700,data-table.tsx 行數變動
// 就掃錯區=partial fake-green。實測 cell render 已移到 ~1499)。改動態錨點:從 `effectiveAutoRowForCell`
// 定義行起,到下一個 `// ──` section marker 止 = 精確的 cell-level alignment 決策區。
// 在此 scope 內 `autoRowHeight ?` 三元式 = cell-level 決策 = 應改 `effectiveAutoRowForCell`。
let CELL_RENDER_START = lines.findIndex((l) => /const effectiveAutoRowForCell\s*=/.test(l))
if (CELL_RENDER_START === -1) CELL_RENDER_START = lines.findIndex((l) => /Cell render/.test(l))
if (CELL_RENDER_START === -1) {
  // fail-closed:錨點不存在 = code 結構大改,gate 不該靜默 pass(原 fake-green failure mode)
  console.error('✗ audit anchor not found(`effectiveAutoRowForCell` / `Cell render`)— data-table.tsx 結構變,需更新 audit 錨點')
  process.exit(1)
}
// **2026-09-21 修:範圍塌掉,這支閘一直在掃 1 行還報「無違規」。**
//
// 舊寫法是「從錨點到**下一個 `// ──`**」。但 `// ──` 在這份檔案裡不是區段分隔,
// 而是**函式內部的註解區塊標題** —— 2026-09-04 有人在 `effectiveAutoRowForCell` 定義的
// **下一行**加了一個 `// ── L4 巢狀列的展開箭頭 ──`,範圍就從此塌成 1 行。
// 實測:錨點 3221、marker 3222、真正的違規在 3300 → 在範圍外 → 閘報綠。
// 而能抓到這件事的 meta-test,因為治理 harness 從 8/11 起被擋住,一直沒跑。
//
// 這是拿「下一個註解標題」當「作用域結束」的代理(M37)。改成直接算**大括號深度**:
// 從定義行往後走,回到定義所在層級之外就是作用域結束 —— 那才是
// 「`effectiveAutoRowForCell` 看得到的地方」這個要保證的性質本身。
let CELL_RENDER_END = lines.length
{
  let depth = 0
  for (let i = CELL_RENDER_START; i < lines.length; i += 1) {
    // 去掉字串與註解裡的括號,避免誤算(行內 `'{'` / `// {` 之類)
    const code = lines[i].replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``')
    for (const ch of code) {
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
    }
    if (i > CELL_RENDER_START && depth < 0) { CELL_RENDER_END = i; break }
  }
}

// **Fail-closed:範圍塌掉不得靜默放行。**
// 這是上面那個 bug 的上游防線 —— 不管未來誰又改了結構,只要掃描語料異常小,
// 這支閘就必須紅並指名該處,而不是回報「無違規」(M37:零筆 ≠ 沒發生)。
const MIN_CELL_RENDER_SCOPE_LINES = 40
if (CELL_RENDER_END - CELL_RENDER_START < MIN_CELL_RENDER_SCOPE_LINES) {
  console.error(`✗ cell-render 掃描範圍只有 ${CELL_RENDER_END - CELL_RENDER_START} 行(需 ≥ ${MIN_CELL_RENDER_SCOPE_LINES})`)
  console.error('  範圍塌掉時的「無違規」是零證據,不是通過。data-table.tsx 結構變了,請更新本閘的錨點。')
  process.exit(1)
}

// 允許 exception:row outer level(line 2000+)真用 global autoRowHeight 是合法
// 因為 row outer mode 是整 row 設定,不是 cell-level

const violations = []
for (let i = CELL_RENDER_START; i < Math.min(CELL_RENDER_END, lines.length); i++) {
  const ln = i + 1
  const line = lines[i]
  // Detect `autoRowHeight ?` ternary in cell render scope
  if (/\bautoRowHeight\s*\?\s*'/.test(line)) {
    // Allow if explicit @row-mode-global-allow marker on same/prev line
    const prevLine = lines[i - 1] || ''
    if (!/@row-mode-global-allow/.test(line) && !/@row-mode-global-allow/.test(prevLine)) {
      violations.push({ ln, line: line.trim().slice(0, 120) })
    }
  }
}

console.log('=== DataTable per-row state SSOT audit ===\n')
if (violations.length === 0) {
  console.log('✓ No violations — all cell-render wrappers consume per-row state correctly')
  process.exit(0)
} else {
  console.log(`✗ ${violations.length} violation(s) — cell-render scope using global \`autoRowHeight\` instead of \`effectiveAutoRowForCell\`:\n`)
  for (const v of violations) {
    console.log(`  data-table.tsx:${v.ln}`)
    console.log(`    > ${v.line}`)
  }
  console.log(`\n  Fix: replace \`autoRowHeight ?\` with \`effectiveAutoRowForCell ?\`(per-row state SSOT)`)
  console.log(`  Exception: add \`// @row-mode-global-allow: <reason>\` comment on prev or same line if row-outer level真用 global`)
  process.exit(1)
}
