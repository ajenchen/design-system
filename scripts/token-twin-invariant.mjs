#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 有 JS 雙生的 CSS token,兩邊的值逐對相等 —— `--stack-gap` ↔ `STACK_GAP_PX`(tokens/uiSize/stack-gap.ts)、
 *         `--avatar-stack-overlap` ↔ `AVATAR_STACK_OVERLAP_PX`(components/Avatar/avatar.tsx)、
 *         `--tree-indent-{sm,md,lg}` ↔ `INDENT_STEP`(components/TreeView/tree-view.tsx)、
 *         `--tag-height-{sm,md,lg}` ↔ `TAG_HEIGHT_PX`(components/Tag/tag.tsx)—— 後兩組 2026-11-11 加(token 分類落地計畫檢查 8)。
 *   紅: 任一對值不相等 → 印出那一對、兩邊的值與檔案,exit 1;CSS 端**每一個**宣告(預設值與密度段的重設)都要等於程式常數,
 *       任一處不等就紅;任一邊讀不到(檔案不在、宣告被改名、分類表查不到住處)也是紅(儀器失效不當通過)。
 *   綠: 每一對兩邊都讀得到且相等。純靜態讀檔,結果不隨時間 / 機器變。
 *
 * 為什麼要有這支:遮罩幾何與 outline 內距在 JS 裡要用數字算,CSS 變數進不去那些運算,所以同一個值有 CSS / JS 兩份。
 * 兩份 = 會漂;這支閘是讓「只改一邊」當場紅的唯一機制(M17 SSOT 必可傳播;M37「兩份平行實作」)。
 * `--selftest`:對注入不相等 / 缺宣告 / 密度段不等 / 查不到住處的輸入跑同一套判定,必須紅;對現行檔必須綠。
 *
 * CSS 住處從分類表讀(2026-11-11 審查補):原本四組全寫死 `tokens/uiSize/uiSize.css`,而分類表裡標籤高與頭像重疊量的
 * `target` 已指向別的檔 —— 第 2、3 批搬家時這支必以 INSTRUMENT-FAIL 紅、要另改一處。現在住處 = 分類表
 * `tokens/token-registry.json` 該名字最長吻合那一列的 `home`(查法用 token-creation-invariant 的 lookup,
 * 與 `ds-canonical/hooks/lib/_tab_lg_chrome_header_equal.sh` 同一個來源),搬家只改分類表一列。
 * 只比第一個宣告(`:root`)也是同一次補的:`--tree-indent-*` 在 `:root` 與「鎖回一般密度」段各宣告一次,
 * 程式常數不分密度,所以每一個宣告都必須等於它。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lookup, DS_ROOT, REGISTRY_PATH } from './token-creation-invariant.mjs'

// 用 fileURLToPath,不用 URL.pathname:repo 路徑含中文,pathname 是百分號編碼,直接拿去 resolve 會指到不存在的目錄
//(第一版就這樣寫,閘以「讀不到 = 儀器失效」紅掉,沒有被讀成通過 —— M37 第八個形狀的反面證據)。
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * 雙生對照表(SSOT):新增雙生 token 時在這裡登記一列。
 * 單值:`cssVar` ↔ `tsConst`(`export const NAME = 2`);
 * 一組級距(2026-11-11,token 分類落地計畫檢查 8):`cssVars: { 級距: '--名字' }` ↔ `tsConst` 是 `{ 級距: 數字 }` 的物件常數。
 * CSS 端 rem 一律以 16px 換算(全 DS 的 rem 基準)。CSS 住處不寫在這裡 —— 由 withCssHomes() 從分類表的 home 補上(見檔頭)。
 */
export const TWIN_PAIRS = [
  { cssVar: '--stack-gap', ts: 'packages/design-system/src/tokens/uiSize/stack-gap.ts', tsConst: 'STACK_GAP_PX' },
  { cssVar: '--avatar-stack-overlap', ts: 'packages/design-system/src/components/Avatar/avatar.tsx', tsConst: 'AVATAR_STACK_OVERLAP_PX' },
  // 樹狀縮排:CSS 給表格巢狀列,程式常數給 TreeView 的縮排與拖放命中計算(tree-view.tsx 註解:「必須同步維護」,之前沒有任何檢查鎖住)
  { cssVars: { sm: '--tree-indent-sm', md: '--tree-indent-md', lg: '--tree-indent-lg' }, ts: 'packages/design-system/src/components/TreeView/tree-view.tsx', tsConst: 'INDENT_STEP' },
  // 標籤盒高:原本只有瀏覽器閘 tag-field-vertical-inset I7 拿寫死的 20/24 量畫面,CSS 與程式常數兩邊沒有靜態鎖
  { cssVars: { sm: '--tag-height-sm', md: '--tag-height-md', lg: '--tag-height-lg' }, ts: 'packages/design-system/src/components/Tag/tag.tsx', tsConst: 'TAG_HEIGHT_PX' },
]

/**
 * 每一對的 CSS 住處 = 分類表裡該名字最長吻合那一列的 home(必須恰好一列、home 是單一路徑)。
 * 一組級距裡每一顆都要對到同一個住處;查不到或不一致 → css = null(judge 以 INSTRUMENT-FAIL 紅,不當通過)。
 */
export function withCssHomes(pairs, registryText) {
  let rows = []
  try { rows = JSON.parse(registryText)?.rows ?? [] } catch { rows = [] }
  const homeOf = (name) => {
    const hit = lookup(Array.isArray(rows) ? rows : [], name)
    return hit.length === 1 && typeof hit[0].home === 'string' ? `${DS_ROOT}/${hit[0].home}` : null
  }
  return pairs.map((p) => {
    const homes = [...new Set((p.cssVars ? Object.values(p.cssVars) : [p.cssVar]).map(homeOf))]
    return { ...p, css: homes.length === 1 ? homes[0] : null }
  })
}

const declRe = (cssVar) => new RegExp(`(?<![\\w-])${cssVar.replace(/[-]/g, '\\-')}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)(px|rem)\\s*;`, 'g')
const toPx = (m) => Number(m[1]) * (m[2] === 'rem' ? 16 : 1)
/** 讀 CSS 裡 `--name: <數字>px|rem;` 的第一個宣告(`:root` 預設值),換成 px;讀不到回 null。 */
export function readCssPx(text, cssVar) {
  const m = declRe(cssVar).exec(text)
  return m ? toPx(m) : null
}
/** 同上,但回傳**每一個**宣告(預設值 + 密度段重設)的 px,照出現順序。 */
export function readCssPxAll(text, cssVar) {
  return [...text.matchAll(declRe(cssVar))].map(toPx)
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
  // 每一個宣告都比:第 1 個是預設值,其後是密度段的重設(只比第一個 = 密度段改了沒人知道)
  const compare = (cssVar, cssText, css, want, wantLabel, ts) => {
    const vals = cssText == null ? [] : readCssPxAll(cssText, cssVar)
    if (!vals.length) { problems.push(`INSTRUMENT-FAIL 讀不到 ${css} 的 ${cssVar}(檔案不在或宣告被改)`); return }
    vals.forEach((v, i) => {
      if (v !== want) problems.push(`${cssVar} 第 ${i + 1} 個宣告 = ${v}px(${css})≠ ${wantLabel} = ${want}(${ts})—— 兩邊要一起改`)
    })
  }
  for (const p of pairs) {
    const names = p.cssVars ? Object.values(p.cssVars).join(' / ') : p.cssVar
    if (p.css == null) { problems.push(`INSTRUMENT-FAIL 分類表查不到 ${names} 的住處(home)—— 每一顆都要恰好對到一列、home 是單一路徑`); continue }
    const cssText = readText(p.css), tsText = readText(p.ts)
    if (p.cssVars) {
      const rec = tsText == null ? null : readTsRecord(tsText, p.tsConst)
      if (rec == null) { problems.push(`INSTRUMENT-FAIL 讀不到 ${p.ts} 的 ${p.tsConst}(檔案不在或宣告被改)`); continue }
      for (const [k, v] of Object.entries(p.cssVars)) {
        if (!(k in rec)) { problems.push(`INSTRUMENT-FAIL ${p.ts} 的 ${p.tsConst} 沒有 ${k} 這一階`); continue }
        compare(v, cssText, p.css, rec[k], `${p.tsConst}.${k}`, p.ts)
      }
      continue
    }
    const tsVal = tsText == null ? null : readTsNumber(tsText, p.tsConst)
    if (tsVal == null) { problems.push(`INSTRUMENT-FAIL 讀不到 ${p.ts} 的 ${p.tsConst}(檔案不在或宣告被改)`); continue }
    compare(p.cssVar, cssText, p.css, tsVal, p.tsConst, p.ts)
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
    // 密度段的重設也要比(2026-11-11 審查:原本只比第一個宣告)
    ['密度段重設與預設同值 → 綠', { ...good, 'a.css': `${css}\n[data-density="md"] { --fixture-step-sm: 1.5rem; --fixture-gap: 2px; }` }, true],
    ['注入:密度段重設寫成別的值、預設仍相等 → 紅', { ...good, 'a.css': `${css}\n[data-density="md"] { --fixture-step-sm: 1.25rem; }` }, false],
    ['注入:單值的第二個宣告不等 → 紅', { ...good, 'a.css': `${css}\n[data-density="lg"] { --fixture-gap: 3px; }` }, false],
  ]
  // 住處從分類表讀:查得到 → 補上 home;查不到 / 一組級距對到兩個住處 → css = null → 紅(儀器失效)
  const reg = JSON.stringify({ rows: [
    { match: '--fixture-gap', home: 'fx/a.css' }, { match: '--fixture-overlap', home: 'fx/a.css' },
    { match: '--fixture-step-', home: 'fx/a.css' }, { match: '--fixture-step-lg', home: 'fx/other.css' },
  ] })
  const resolved = withCssHomes([pairs[0], pairs[2]], reg)
  const homeCases = [
    ['分類表有該列 → 住處 = home', resolved[0].css === `${DS_ROOT}/fx/a.css`],
    ['一組級距對到兩個住處 → css = null', resolved[1].css === null],
    ['分類表讀不到 → css = null', withCssHomes([pairs[0]], 'not json')[0].css === null],
    ['css = null 時 judge 必紅(不當通過)', !judge([{ ...pairs[0], css: null }], (f) => good[f] ?? null).ok],
  ]
  let ok = true
  for (const [name, pass] of homeCases) {
    console.log(`${pass ? '✓' : '✗'} selftest 住處:${name}`)
    if (!pass) ok = false
  }
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
  const read = (f) => { try { return readFileSync(resolve(ROOT, f), 'utf8') } catch { return null } }
  const pairs = withCssHomes(TWIN_PAIRS, read(REGISTRY_PATH) ?? '')
  const r = judge(pairs, read)
  for (const p of pairs) console.log(`  ${p.cssVar ?? Object.values(p.cssVars).join(' / ')}(${p.css ?? '分類表查不到住處'})↔ ${p.tsConst}`)
  if (!r.ok) { for (const m of r.problems) console.error(`✗ token-twin | ${m}`); process.exit(1) }
  console.log(`✅ token-twin PASS(${TWIN_PAIRS.length} 對 CSS / JS 雙生 token 相等)`)
}
