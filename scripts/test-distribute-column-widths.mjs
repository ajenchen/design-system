#!/usr/bin/env node
// `distributeColumnWidths` 純函式單測 —— 補上「凍結 → 重分配」這條路徑的 runtime 證據。
//
// 為什麼需要:I11 / I11b 跑的 story 沒有任何 `meta.maxWidth`,所以撞上限後凍結、重分配剩餘空間
// 的那條分支**永遠不會被走到** —— CI 綠不代表它對(2026-09-03 跨模型對照時發現)。
// 對照的是 AG Grid v33 `ColumnFlexService.refreshFlexedColumns`(CSS Flexbox
// 「Resolve Flexible Lengths」的 JS 直譯):前綴和游標取整、餘數補最後一個未凍結欄、
// 撞 max 的欄凍結後重跑。
//
// Run: `node scripts/test-distribute-column-widths.mjs`

// 載入方式:被測目標是**零依賴的純模組**(`column-widths.ts`),所以只需要 esbuild 的單檔 transform
// —— 不 bundle、不 stub、不需要 react。這樣測到的就是 source 本身,不會因為忘了 build:lib 而測到舊的。
import { transform } from 'esbuild'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'packages/design-system/src/components/DataTable/column-widths.ts')
const { code } = await transform(readFileSync(SRC, 'utf8'), { loader: 'ts', format: 'esm' })
const outfile = join(mkdtempSync(join(tmpdir(), 'dtw-')), 'column-widths.mjs')
writeFileSync(outfile, code)
const { distributeColumnWidths } = await import(outfile)
if (typeof distributeColumnWidths !== 'function') {
  console.error('✗ 取不到 distributeColumnWidths(export 名稱改了?)')
  process.exit(1)
}

let fail = 0
const eq = (label, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) { console.log(`✓ ${label}`); return }
  console.error(`✗ ${label}\n   得到 ${a}\n   預期 ${e}`)
  fail++
}
const ok = (label, cond, detail = '') => {
  if (cond) { console.log(`✓ ${label}`); return }
  console.error(`✗ ${label}${detail ? ' | ' + detail : ''}`)
  fail++
}

// 1) 放不下 → 原封不動回 base(整數化),不縮
eq('放不下時回 base 不縮', distributeColumnWidths([100, 200, 300], [undefined, undefined, undefined], 400), [100, 200, 300])
eq('剛好放得下也回 base', distributeColumnWidths([100, 200], [undefined, undefined], 300), [100, 200])

// 2) 有餘裕 → 等額均分,總和恰為 available(取整殘差不累積)
{
  const w = distributeColumnWidths([100, 100, 100], [undefined, undefined, undefined], 1000)
  ok('等額均分:總和 === available', w.reduce((a, b) => a + b, 0) === 1000, `Σ=${w.reduce((a, b) => a + b, 0)}`)
  ok('等額均分:每欄彼此差 ≤ 1px', Math.max(...w) - Math.min(...w) <= 1, JSON.stringify(w))
}

// 3) 除不盡:7 欄分 1000 —— 這是使用者最初回報「愈右邊差愈多」的那個形狀
{
  const bases = [100, 100, 100, 100, 100, 100, 100]
  const w = distributeColumnWidths(bases, bases.map(() => undefined), 1000)
  ok('7 欄除不盡:總和 === available', w.reduce((a, b) => a + b, 0) === 1000, `Σ=${w.reduce((a, b) => a + b, 0)}`)
  ok('7 欄除不盡:誤差不隨欄數累積(彼此差 ≤ 1px)', Math.max(...w) - Math.min(...w) <= 1, JSON.stringify(w))
}

// 4) 撞上限 → 該欄凍結在 cap,剩餘空間重新分配給其他欄
{
  const w = distributeColumnWidths([100, 100, 100], [120, undefined, undefined], 900)
  eq('撞上限的欄凍在 cap', w[0], 120)
  ok('撞上限後總和仍 === available', w.reduce((a, b) => a + b, 0) === 900, `Σ=${w.reduce((a, b) => a + b, 0)}`)
  ok('未凍結欄吸收剩餘空間(兩欄各 ≈390)', Math.abs(w[1] - w[2]) <= 1 && w[1] > 380, JSON.stringify(w))
}

// 5) 連鎖凍結:第二輪又有欄撞上限
{
  const w = distributeColumnWidths([100, 100, 100, 100], [110, 150, undefined, undefined], 1000)
  eq('第一輪凍結的欄', w[0], 110)
  eq('第二輪凍結的欄', w[1], 150)
  ok('連鎖凍結後總和仍 === available', w.reduce((a, b) => a + b, 0) === 1000, `Σ=${w.reduce((a, b) => a + b, 0)}`)
}

// 6) 全部撞上限 → 總和可以小於 available(表格右側留白,不是錯誤)
{
  const w = distributeColumnWidths([100, 100], [120, 120], 1000)
  ok('全部撞上限時不硬塞', w[0] === 120 && w[1] <= 880, JSON.stringify(w))
}

// 7) 退化輸入
eq('零欄回空陣列', distributeColumnWidths([], [], 500), [])
eq('available 非有限值 → 回 base', distributeColumnWidths([100, 200], [undefined, undefined], Number.POSITIVE_INFINITY), [100, 200])

// 8) 小數 base(density token 造成)→ 輸出全整數
{
  const w = distributeColumnWidths([100.4, 100.4, 100.4], [undefined, undefined, undefined], 500)
  ok('輸出全為整數', w.every((x) => Number.isInteger(x)), JSON.stringify(w))
  ok('小數 base 也讓總和 === available', w.reduce((a, b) => a + b, 0) === 500, `Σ=${w.reduce((a, b) => a + b, 0)}`)
}

if (fail) {
  console.error(`\n✗ distributeColumnWidths:${fail} 條失敗`)
  process.exit(1)
}
console.log('\n✓ distributeColumnWidths 全過')
