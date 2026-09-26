#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 有 JS 雙生的 CSS token,兩邊的值逐對相等 —— `--stack-gap` ↔ `STACK_GAP_PX`(tokens/uiSize/stack-gap.ts)、
 *         `--avatar-stack-overlap` ↔ `AVATAR_STACK_OVERLAP_PX`(components/Avatar/avatar.tsx)。
 *   紅: 任一對值不相等 → 印出那一對、兩邊的值與檔案,exit 1;任一邊讀不到(檔案不在、宣告被改名)也是紅(儀器失效不當通過)。
 *   綠: 每一對兩邊都讀得到且相等。純靜態讀檔,結果不隨時間 / 機器變。
 *
 * 為什麼要有這支:遮罩幾何與 outline 內距在 JS 裡要用數字算,CSS 變數進不去那些運算,所以同一個值有 CSS / JS 兩份。
 * 兩份 = 會漂;這支閘是讓「只改一邊」當場紅的唯一機制(M17 SSOT 必可傳播;M37「兩份平行實作」)。
 * `--selftest`:對注入不相等 / 缺宣告的文字跑同一套判定,必須紅;對現行檔必須綠。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 用 fileURLToPath,不用 URL.pathname:repo 路徑含中文,pathname 是百分號編碼,直接拿去 resolve 會指到不存在的目錄
//(第一版就這樣寫,閘以「讀不到 = 儀器失效」紅掉,沒有被讀成通過 —— M37 第八個形狀的反面證據)。
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 雙生對照表(SSOT):新增雙生 token 時在這裡登記一列。 */
export const TWIN_PAIRS = [
  {
    css: 'packages/design-system/src/tokens/uiSize/uiSize.css', cssVar: '--stack-gap',
    ts: 'packages/design-system/src/tokens/uiSize/stack-gap.ts', tsConst: 'STACK_GAP_PX',
  },
  {
    css: 'packages/design-system/src/tokens/uiSize/uiSize.css', cssVar: '--avatar-stack-overlap',
    ts: 'packages/design-system/src/components/Avatar/avatar.tsx', tsConst: 'AVATAR_STACK_OVERLAP_PX',
  },
]

/** 讀 CSS 裡 `--name: <數字>px;` 的數字;讀不到回 null。 */
export function readCssPx(text, cssVar) {
  const m = text.match(new RegExp(`${cssVar.replace(/[-]/g, '\\-')}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px\\s*;`))
  return m ? Number(m[1]) : null
}
/** 讀 TS 裡 `export const NAME = <數字>` 的數字;讀不到回 null。 */
export function readTsNumber(text, tsConst) {
  const m = text.match(new RegExp(`export\\s+const\\s+${tsConst}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\b`))
  return m ? Number(m[1]) : null
}

/**
 * 判定(純函式):給每一對兩邊的文字,回 { ok, problems }。
 * 讀不到 = 儀器失效,列進 problems(不是通過)。
 */
export function judge(pairs, readText) {
  const problems = []
  for (const p of pairs) {
    const cssText = readText(p.css), tsText = readText(p.ts)
    const cssVal = cssText == null ? null : readCssPx(cssText, p.cssVar)
    const tsVal = tsText == null ? null : readTsNumber(tsText, p.tsConst)
    if (cssVal == null) problems.push(`INSTRUMENT-FAIL 讀不到 ${p.css} 的 ${p.cssVar}(檔案不在或宣告被改)`)
    if (tsVal == null) problems.push(`INSTRUMENT-FAIL 讀不到 ${p.ts} 的 ${p.tsConst}(檔案不在或宣告被改)`)
    if (cssVal != null && tsVal != null && cssVal !== tsVal) {
      problems.push(`${p.cssVar} = ${cssVal}px(${p.css})≠ ${p.tsConst} = ${tsVal}(${p.ts})—— 兩邊要一起改`)
    }
  }
  return { ok: problems.length === 0, problems }
}

function selftest() {
  const good = { 'a.css': ':root { --stack-gap: 2px; --avatar-stack-overlap: 2px; }', 'b.ts': 'export const STACK_GAP_PX = 2\n', 'c.tsx': 'export const AVATAR_STACK_OVERLAP_PX = 2\n' }
  const pairs = [
    { css: 'a.css', cssVar: '--stack-gap', ts: 'b.ts', tsConst: 'STACK_GAP_PX' },
    { css: 'a.css', cssVar: '--avatar-stack-overlap', ts: 'c.tsx', tsConst: 'AVATAR_STACK_OVERLAP_PX' },
  ]
  const cases = [
    ['現行:兩對都相等 → 綠', good, true],
    ['注入:JS 改成 3、CSS 仍 2 → 紅', { ...good, 'b.ts': 'export const STACK_GAP_PX = 3\n' }, false],
    ['注入:CSS 改成 4px、JS 仍 2 → 紅', { ...good, 'a.css': ':root { --stack-gap: 4px; --avatar-stack-overlap: 2px; }' }, false],
    ['注入:CSS 宣告被改名(讀不到)→ 紅(儀器失效,不是通過)', { ...good, 'a.css': ':root { --stack-gap-px: 2px; --avatar-stack-overlap: 2px; }' }, false],
    ['注入:TS 檔不在 → 紅', { 'a.css': good['a.css'], 'c.tsx': good['c.tsx'] }, false],
  ]
  let ok = true
  for (const [name, files, expectGreen] of cases) {
    const r = judge(pairs, (f) => files[f] ?? null)
    const pass = r.ok === expectGreen
    console.log(`${pass ? '✓' : '✗'} selftest ${name}${pass ? '' : ` —— 實得 ${r.ok ? '綠' : '紅'}:${r.problems.join(' / ')}`}`)
    if (!pass) ok = false
  }
  return ok
}

if (process.argv.includes('--selftest')) {
  process.exit(selftest() ? 0 : 1)
}

const r = judge(TWIN_PAIRS, (f) => { try { return readFileSync(resolve(ROOT, f), 'utf8') } catch { return null } })
for (const p of TWIN_PAIRS) console.log(`  ${p.cssVar} ↔ ${p.tsConst}`)
if (!r.ok) { for (const m of r.problems) console.error(`✗ token-twin | ${m}`); process.exit(1) }
console.log(`✅ token-twin PASS(${TWIN_PAIRS.length} 對 CSS / JS 雙生 token 相等)`)
