#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 有 JS 雙生的 CSS token,兩邊的值逐對相等 —— `--stack-gap` ↔ `STACK_GAP_PX`(tokens/uiSize/stack-gap.ts)、
 *         `--avatar-stack-overlap` ↔ `AVATAR_STACK_OVERLAP_PX`(components/Avatar/avatar.tsx)、
 *         `--tree-indent-{sm,md,lg}` ↔ `INDENT_STEP`(components/TreeView/tree-view.tsx)、
 *         `--tag-height-{sm,md,lg}` ↔ `TAG_HEIGHT_PX`(components/Tag/tag.tsx)—— 後兩組 2026-11-11 加(token 分類落地計畫檢查 8)。
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

/**
 * 雙生對照表(SSOT):新增雙生 token 時在這裡登記一列。
 * 單值:`cssVar` ↔ `tsConst`(`export const NAME = 2`);
 * 一組級距(2026-11-11,token 分類落地計畫檢查 8):`cssVars: { 級距: '--名字' }` ↔ `tsConst` 是 `{ 級距: 數字 }` 的物件常數。
 * CSS 端 rem 一律以 16px 換算(全 DS 的 rem 基準)。
 */
const UI_SIZE_CSS = 'packages/design-system/src/tokens/uiSize/uiSize.css'
export const TWIN_PAIRS = [
  { css: UI_SIZE_CSS, cssVar: '--stack-gap', ts: 'packages/design-system/src/tokens/uiSize/stack-gap.ts', tsConst: 'STACK_GAP_PX' },
  { css: UI_SIZE_CSS, cssVar: '--avatar-stack-overlap', ts: 'packages/design-system/src/components/Avatar/avatar.tsx', tsConst: 'AVATAR_STACK_OVERLAP_PX' },
  // 樹狀縮排:CSS 給表格巢狀列,程式常數給 TreeView 的縮排與拖放命中計算(tree-view.tsx 註解:「必須同步維護」,之前沒有任何檢查鎖住)
  { css: UI_SIZE_CSS, cssVars: { sm: '--tree-indent-sm', md: '--tree-indent-md', lg: '--tree-indent-lg' }, ts: 'packages/design-system/src/components/TreeView/tree-view.tsx', tsConst: 'INDENT_STEP' },
  // 標籤盒高:原本只有瀏覽器閘 tag-field-vertical-inset I7 拿寫死的 20/24 量畫面,CSS 與程式常數兩邊沒有靜態鎖
  { css: UI_SIZE_CSS, cssVars: { sm: '--tag-height-sm', md: '--tag-height-md', lg: '--tag-height-lg' }, ts: 'packages/design-system/src/components/Tag/tag.tsx', tsConst: 'TAG_HEIGHT_PX' },
]

/** 讀 CSS 裡 `--name: <數字>px|rem;` 的第一個宣告(`:root` 預設值),換成 px;讀不到回 null。 */
export function readCssPx(text, cssVar) {
  const m = text.match(new RegExp(`${cssVar.replace(/[-]/g, '\\-')}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)(px|rem)\\s*;`))
  return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null
}
/** 讀 TS 裡 `export const NAME = <數字>` 的數字;讀不到回 null。 */
export function readTsNumber(text, tsConst) {
  const m = text.match(new RegExp(`export\\s+const\\s+${tsConst}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\b`))
  return m ? Number(m[1]) : null
}
/** 讀 TS 裡 `[export] const NAME[: 型別] = { sm: 24, md: 24 } [as const]` 的物件;讀不到回 null。 */
export function readTsRecord(text, tsConst) {
  const m = text.match(new RegExp(`(?:export\\s+)?const\\s+${tsConst}\\s*(?::[^=]+)?=\\s*\\{([^}]*)\\}`))
  if (!m) return null
  const out = {}
  for (const kv of m[1].matchAll(/([A-Za-z_]\w*)\s*:\s*(-?\d+(?:\.\d+)?)/g)) out[kv[1]] = Number(kv[2])
  return Object.keys(out).length ? out : null
}

/**
 * 判定(純函式):給每一對兩邊的文字,回 { ok, problems }。
 * 讀不到 = 儀器失效,列進 problems(不是通過)。
 */
export function judge(pairs, readText) {
  const problems = []
  for (const p of pairs) {
    const cssText = readText(p.css), tsText = readText(p.ts)
    if (p.cssVars) {
      const rec = tsText == null ? null : readTsRecord(tsText, p.tsConst)
      if (rec == null) { problems.push(`INSTRUMENT-FAIL 讀不到 ${p.ts} 的 ${p.tsConst}(檔案不在或宣告被改)`); continue }
      for (const [k, v] of Object.entries(p.cssVars)) {
        const cssVal = cssText == null ? null : readCssPx(cssText, v)
        if (cssVal == null) { problems.push(`INSTRUMENT-FAIL 讀不到 ${p.css} 的 ${v}(檔案不在或宣告被改)`); continue }
        if (!(k in rec)) { problems.push(`INSTRUMENT-FAIL ${p.ts} 的 ${p.tsConst} 沒有 ${k} 這一階`); continue }
        if (cssVal !== rec[k]) problems.push(`${v} = ${cssVal}px(${p.css})≠ ${p.tsConst}.${k} = ${rec[k]}(${p.ts})—— 兩邊要一起改`)
      }
      continue
    }
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
  // 夾具用自己的名字(FIXTURE_*),不寫真 token 的名字:同名常數閘(scripts 全掃,連註解都掃)會把
  // 夾具裡「真名 = 別的值」那一行當成第二份不同值的常數而紅(2026-09-27 CI 抓到)。
  const css = ':root { --fixture-gap: 2px; --fixture-overlap: 2px; --fixture-step-sm: 1.5rem; --fixture-step-lg: 1.75rem; }'
  const good = { 'a.css': css, 'b.ts': 'export const FIXTURE_GAP_PX = 2\n', 'c.tsx': 'export const FIXTURE_OVERLAP_PX = 2\n', 'd.tsx': 'const FIXTURE_STEP: Record<K, number> = { sm: 24, lg: 28 }\n' }
  const pairs = [
    { css: 'a.css', cssVar: '--fixture-gap', ts: 'b.ts', tsConst: 'FIXTURE_GAP_PX' },
    { css: 'a.css', cssVar: '--fixture-overlap', ts: 'c.tsx', tsConst: 'FIXTURE_OVERLAP_PX' },
    { css: 'a.css', cssVars: { sm: '--fixture-step-sm', lg: '--fixture-step-lg' }, ts: 'd.tsx', tsConst: 'FIXTURE_STEP' },
  ]
  const cases = [
    ['現行:三對都相等(含 rem 換算與一組級距)→ 綠', good, true],
    ['注入:JS 改成 3、CSS 仍 2 → 紅', { ...good, 'b.ts': 'export const FIXTURE_GAP_PX = 3\n' }, false],
    ['注入:CSS 改成 4px、JS 仍 2 → 紅', { ...good, 'a.css': css.replace('--fixture-gap: 2px', '--fixture-gap: 4px') }, false],
    ['注入:CSS 宣告被改名(讀不到)→ 紅(儀器失效,不是通過)', { ...good, 'a.css': css.replace('--fixture-gap:', '--fixture-gap-px:') }, false],
    ['注入:TS 檔不在 → 紅', { 'a.css': good['a.css'], 'c.tsx': good['c.tsx'], 'd.tsx': good['d.tsx'] }, false],
    ['注入:級距常數 lg 改成 32、CSS 仍 1.75rem → 紅', { ...good, 'd.tsx': 'const FIXTURE_STEP: Record<K, number> = { sm: 24, lg: 32 }\n' }, false],
    ['注入:CSS 級距 sm 改成 1.25rem、常數仍 24 → 紅', { ...good, 'a.css': css.replace('--fixture-step-sm: 1.5rem', '--fixture-step-sm: 1.25rem') }, false],
    ['注入:級距常數少了 lg 那一階 → 紅(儀器失效)', { ...good, 'd.tsx': 'const FIXTURE_STEP = { sm: 24 }\n' }, false],
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

/** 讀某組級距常數(給瀏覽器閘拿 TAG_HEIGHT_PX 當期望值用,不另寫一份數字)。 */
export function readTwinRecord(tsConst) {
  const p = TWIN_PAIRS.find((x) => x.tsConst === tsConst)
  if (!p) return null
  try { return readTsRecord(readFileSync(resolve(ROOT, p.ts), 'utf8'), tsConst) } catch { return null }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  const r = judge(TWIN_PAIRS, (f) => { try { return readFileSync(resolve(ROOT, f), 'utf8') } catch { return null } })
  for (const p of TWIN_PAIRS) console.log(`  ${p.cssVar ?? Object.values(p.cssVars).join(' / ')} ↔ ${p.tsConst}`)
  if (!r.ok) { for (const m of r.problems) console.error(`✗ token-twin | ${m}`); process.exit(1) }
  console.log(`✅ token-twin PASS(${TWIN_PAIRS.length} 對 CSS / JS 雙生 token 相等)`)
}
