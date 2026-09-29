#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: scripts/visual-audit.mjs 的幾何 / 顏色斷言引擎(契約 + 讀值 + 判定都住 lib/visual-audit-geometry.mjs)在該紅的時候會紅、該放的時候會放:
 *         padding4Sided 認得 symmetric(all / horizontal / vertical);gap 逐軸讀 row-gap / column-gap,computed `normal` 讀成 0、不再是 parseFloat NaN → 0 的假讀值;
 *         equalHeight / padding4Sided / gap / color 都對選到的全部元素判;選不到 = selectorMissing;場景的 globals(theme / density)與斷言契約壞了在載入時就 throw
 *   紅: (判定表)Field 控件水平內距 {0,12,0,12} 用 symmetric:'all' 判 → 紅;column-gap 12 的 grid(row 是 normal)用 axis:'both' 判 expected 12 → 紅;
 *        expected 對不上 / 第二顆矮 4px / 選不到元素 / 期望色不是合法顏色 / 第三顆顏色不同 → 紅;
 *        未知 type、未知欄位、symmetric 亂寫、axis 亂寫、globals 用 hc / rtl → 載入即 throw
 *        (瀏覽器)合成頁 grid `column-gap:12px` 若讀成 {row:12} 或 {column:0}、`padding:0 12px` 若讀成四邊相等 → 紅;
 *        把讀值函式換回舊寫法(parseFloat(computed gap) || 0)時,同一張合成頁必須讀出 0 而被判紅 —— 證明對照組咬得到舊缺陷
 *   綠: (判定表)同一份 Field 讀值用 symmetric:'horizontal' → 綠;column-gap 12 用 axis:'column' → 綠;四顆等高 → 綠;
 *        (瀏覽器)合成頁讀值:grid `column-gap:12px` 讀到 {row:null,column:12};`padding:0 12px` 讀到 {0,12,0,12};
 *        flex `gap:8px 16px` 讀到 {row:8,column:16};color 正規化把 `#ff0000` / `rgb(255, 0, 0)` / `rgb(255 0 0)` 比成同一字串、把 `not-a-color` 判成 null
 *
 * 為什麼有這支(2026-09-29,待辦總帳 OE8):引擎 2026-09-12 起有兩個缺陷從沒有對照組 —— padding4Sided 只會四邊互比(Field 家族恆假紅),
 * gap 用 parseFloat(computed gap)||0(grid 只設 column-gap 時 computed 是 `normal 12px` → NaN → 0 → 假紅;row / column 不同值只讀到 row)。
 * 判定抽成純函式後這裡不開 Storybook 就能證明兩面;瀏覽器那半用 page.setContent 的合成 DOM 證明「讀值」本身,與 story 內容無關。
 * 起不了 Chromium 走 lib/launch-browser.mjs 的唯一政策(一般環境印 SKIPPED-ENV;GOVERNANCE_BROWSER_REQUIRED=1 的 lane 紅),
 * 但判定表那一半在那之前就已經跑完 —— 「沒有瀏覽器」不會讓純函式的兩面對照組也跟著沒驗。
 *
 * Run: node scripts/test-visual-audit.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exitOnBrowserLaunchFailure, launchBrowser } from './lib/launch-browser.mjs'
import {
  judgeGeometryAssertion,
  normalizeGeometryAssertion,
  normalizeScenarioGlobals,
  readGeometryInPage,
  storybookGlobalsQuery,
} from './lib/visual-audit-geometry.mjs'

let checks = 0
const ok = (condition, message) => {
  checks += 1
  if (!condition) { console.error(`✗ ${message}`); process.exit(1) }
  console.log(`✓ ${message}`)
}
const throwsContract = (fn, pattern, message) => {
  let threw = null
  try { fn() } catch (error) { threw = error }
  ok(threw && pattern.test(String(threw.message)), `${message}(${threw ? threw.message.slice(0, 90) : '沒有 throw'})`)
}
const judge = (assertion, measured) => judgeGeometryAssertion(normalizeGeometryAssertion(assertion), measured)

// ── 1. 契約:壞的在載入就停 ──────────────────────────────────────────────────
console.log('── 契約(載入即停)──')
throwsContract(() => normalizeGeometryAssertion({ name: 'x', type: 'width', selector: 'a' }), /type must be one of/, '未知 type → throw')
throwsContract(() => normalizeGeometryAssertion({ name: 'x', type: 'gap', selector: 'a', expected: 8, delay: 1 }), /unknown keys:delay/, '未知欄位 → throw')
throwsContract(() => normalizeGeometryAssertion({ name: 'x', type: 'gap', selector: 'a' }), /expected must be a finite number/, 'gap 缺 expected → throw')
throwsContract(() => normalizeGeometryAssertion({ name: 'x', type: 'gap', selector: 'a', expected: 8, axis: 'x' }), /axis must be one of/, 'gap axis 亂寫 → throw')
throwsContract(() => normalizeGeometryAssertion({ name: 'x', type: 'padding4Sided', selector: 'a', symmetric: 'left' }), /symmetric must be one of/, 'padding4Sided symmetric 亂寫 → throw')
throwsContract(() => normalizeGeometryAssertion({ name: 'x', type: 'color', selector: 'a', property: 'width', expected: 'red' }), /property must be one of/, 'color property 不是顏色屬性 → throw')
throwsContract(() => normalizeGeometryAssertion({ name: ' x', type: 'equalHeight', selector: 'a' }), /name must be a non-empty string/, 'name 前後有空白 → throw')
throwsContract(() => normalizeScenarioGlobals({ theme: 'hc' }), /theme must be one of light \/ dark/, 'globals theme:hc(會被寫成 data-theme="hc" 但沒有那套 token,畫面仍淺色 —— 2026-06-11 假覆蓋那一種)→ throw')
throwsContract(() => normalizeScenarioGlobals({ dir: 'rtl' }), /dir is not a Storybook global/, 'globals dir:rtl(Storybook 會靜默忽略)→ throw')
throwsContract(() => normalizeScenarioGlobals({}), /must name at least one/, 'globals 空物件 → throw')
ok(normalizeGeometryAssertion({ name: 'p', type: 'padding4Sided', selector: 'a' }).symmetric === 'all', 'padding4Sided 預設 symmetric = all')
ok(normalizeGeometryAssertion({ name: 'g', type: 'gap', selector: 'a', expected: 8 }).axis === 'both', 'gap 預設 axis = both')
ok(normalizeScenarioGlobals(undefined) === undefined, 'globals 沒給 = undefined(Storybook 用預設 light / md)')
ok(storybookGlobalsQuery(normalizeScenarioGlobals({ theme: 'dark' })) === '&globals=theme:dark', 'globals {theme:dark} → &globals=theme:dark')
ok(storybookGlobalsQuery({ density: 'lg', theme: 'dark' }) === '&globals=theme:dark;density:lg', 'globals 兩個 → 固定順序 theme;density(與 --matrix 的寫法一致)')
ok(storybookGlobalsQuery(undefined) === '' && storybookGlobalsQuery({}) === '', 'globals 沒給 → 空字串')

// ── 2. 判定表:缺陷 1(padding4Sided 只會四邊互比)──────────────────────────
console.log('── 判定表:padding4Sided ──')
const fieldInput = { top: 0, right: 12, bottom: 0, left: 12 } // Field 家族實測讀值(水平 padding、垂直 flex 置中)
ok(judge({ name: 'Field 水平內距', type: 'padding4Sided', selector: 'x', symmetric: 'horizontal', expected: 12 }, { elements: [fieldInput] }).length === 0,
  'Field {0,12,0,12} + symmetric:horizontal expected 12 → 綠(舊引擎恆假紅的那一種)')
ok(judge({ name: 'Field 四邊', type: 'padding4Sided', selector: 'x' }, { elements: [fieldInput] }).length === 1,
  '同一份讀值 + symmetric:all → 紅(四邊本來就不等,要紅)')
ok(judge({ name: 'Field 垂直', type: 'padding4Sided', selector: 'x', symmetric: 'vertical', expected: 0 }, { elements: [fieldInput] }).length === 0,
  'symmetric:vertical expected 0 → 綠')
ok(judge({ name: 'Field 水平 expected 錯', type: 'padding4Sided', selector: 'x', symmetric: 'horizontal', expected: 16 }, { elements: [fieldInput] })[0]?.expected === 16,
  'symmetric:horizontal expected 16 → 紅,且違規記的是 expected 16')
ok(judge({ name: '十顆只壞第七顆', type: 'padding4Sided', selector: 'x', symmetric: 'all', expected: 8 },
  { elements: Array.from({ length: 10 }, (_, i) => ({ top: 8, right: 8, bottom: 8, left: i === 6 ? 12 : 8 })) })[0]?.index === 6,
  '十顆只有第七顆歪 → 紅,而且點名 index 6(舊引擎只量第一顆會放過)')

// ── 3. 判定表:缺陷 2(gap 的 `normal 12px` → NaN → 0)───────────────────────
console.log('── 判定表:gap ──')
const gridColumnOnly = { row: null, column: 12, raw: 'normal 12px' } // Field horizontal `grid gap-x-3` 的真實 computed
ok(judge({ name: 'Field horizontal 欄距', type: 'gap', selector: 'x', expected: 12, axis: 'column' }, { elements: [gridColumnOnly] }).length === 0,
  'grid column-gap 12(row normal)+ axis:column expected 12 → 綠(舊引擎 parseFloat("normal 12px") = NaN → 0 → 假紅)')
const both = judge({ name: '兩軸', type: 'gap', selector: 'x', expected: 12 }, { elements: [gridColumnOnly] })
ok(both.length === 1 && both[0].axis === 'row' && both[0].actual.row === null,
  '同一份讀值 + axis:both → 紅,點名 row 軸(normal = 0 ≠ 12),column 軸不誤報')
ok(judge({ name: 'row 0', type: 'gap', selector: 'x', expected: 0, axis: 'row' }, { elements: [gridColumnOnly] }).length === 0,
  'axis:row expected 0 → 綠(normal 就是 0)')
const flexTwoValues = { row: 8, column: 16, raw: '8px 16px' }
ok(judge({ name: '欄距', type: 'gap', selector: 'x', expected: 16, axis: 'column' }, { elements: [flexTwoValues] }).length === 0
  && judge({ name: '列距', type: 'gap', selector: 'x', expected: 8, axis: 'row' }, { elements: [flexTwoValues] }).length === 0,
  '`8px 16px` 兩軸各讀各的(舊引擎只讀到 8)')
ok(judge({ name: '兩軸 8', type: 'gap', selector: 'x', expected: 8 }, { elements: [flexTwoValues] })[0]?.axis === 'column',
  '`8px 16px` + axis:both expected 8 → 紅,點名 column')
ok(judge({ name: 'g', type: 'gap', selector: 'x', expected: 8 }, { elements: [{ row: 8, column: 8, raw: '8px' }, { row: 8, column: 12, raw: '8px 12px' }] })[0]?.index === 1,
  '兩個容器只有第二個歪 → 紅且點名 index 1')

// ── 4. 判定表:equalHeight / selectorMissing / color ──────────────────────────
console.log('── 判定表:equalHeight / selectorMissing / color ──')
ok(judge({ name: 'h', type: 'equalHeight', selector: 'x' }, { elements: [28, 28, 28, 28] }).length === 0, '四顆 28 → 綠')
ok(judge({ name: 'h', type: 'equalHeight', selector: 'x' }, { elements: [28, 24, 28, 28] })[0]?.actual?.[1] === 24, '第二顆 24 → 紅,actual 列出全部')
ok(judge({ name: 'h', type: 'equalHeight', selector: 'x' }, { elements: [28, 28.4] }).length === 0, '±0.5px 內算相等(次像素)')
for (const type of ['equalHeight', 'gap', 'padding4Sided', 'color']) {
  const a = { name: 'none', type, selector: 'x', ...(type === 'gap' ? { expected: 8 } : {}), ...(type === 'color' ? { property: 'color', expected: 'red' } : {}) }
  ok(judge(a, { elements: [], expected: '#ff0000' })[0]?.type === 'selectorMissing', `${type} 選不到元素 → selectorMissing(不是通過)`)
}
ok(judge({ name: 'c', type: 'color', selector: 'x', property: 'color', expected: 'red' }, { expected: '#ff0000', elements: [{ actual: '#ff0000', raw: 'rgb(255, 0, 0)' }] }).length === 0,
  'color 正規化後同字串 → 綠')
ok(judge({ name: 'c', type: 'color', selector: 'x', property: 'color', expected: 'red' }, { expected: '#ff0000', elements: [{ actual: '#ff0000', raw: 'rgb(255, 0, 0)' }, { actual: '#ff0000', raw: 'rgb(255, 0, 0)' }, { actual: '#00ff00', raw: 'rgb(0, 255, 0)' }] })[0]?.index === 2,
  '三顆只有第三顆不同色 → 紅且點名 index 2')
ok(judge({ name: 'c', type: 'color', selector: 'x', property: 'color', expected: 'not-a-color' }, { expected: null, elements: [{ actual: '#ff0000', raw: 'rgb(255, 0, 0)' }] })[0]?.error?.includes('不是瀏覽器認得的'),
  '期望色不合法 → 紅(斷言壞了不算通過)')
throwsContract(() => judge({ name: 'h', type: 'equalHeight', selector: 'x' }, { elements: ['28'] }), /readings must be numbers/, '讀值形狀不對 → throw(不是靜默判綠)')

// ── 5. 瀏覽器:讀值本身(合成 DOM,與 story 無關)────────────────────────────
console.log('── 瀏覽器讀值(合成 DOM)──')
let browser
try {
  browser = await launchBrowser()
} catch (error) {
  console.log(`判定表 ${checks} 題已全過;瀏覽器那半:`)
  await exitOnBrowserLaunchFailure(error, { hint: '讀值(readGeometryInPage)那半沒驗;判定表已過' })
}
try {
  const page = await browser.newPage()
  await page.setContent(`
    <style>
      #grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px; }
      #flex { display: flex; gap: 8px 16px; }
      #field { display: flex; align-items: center; padding: 0 12px; height: 32px; }
      #cell { padding: 8px; }
      .btn { display: inline-block; height: 28px; }
      .tall { height: 32px; }
      #red { color: #ff0000; background-color: rgb(255, 0, 0); border-top-color: rgb(255 0 0); }
      #teal { color: oklch(0.5 0.1 200); background-color: rgba(0, 0, 0, 0.45); }
    </style>
    <div id="grid"><span>a</span><span>b</span></div>
    <div id="flex"><span>a</span><span>b</span></div>
    <div id="field"><input></div>
    <div id="cell"></div>
    <button class="btn">1</button><button class="btn">2</button><button class="btn tall">3</button>
    <div id="red">r</div>
    <div id="teal">t</div>
  `)
  const read = (selector, assertion) => page.$$eval(selector, readGeometryInPage, normalizeGeometryAssertion(assertion))

  const grid = await read('#grid', { name: 'g', type: 'gap', selector: '#grid', expected: 12, axis: 'column' })
  ok(grid.elements[0].row === null && grid.elements[0].column === 12 && /normal/.test(grid.elements[0].raw),
    `grid column-gap:12px 讀到 {row:null,column:12,raw:"${grid.elements[0].raw}"}(舊引擎 parseFloat(raw)||0 = ${parseFloat(grid.elements[0].raw) || 0})`)
  ok(judge({ name: 'g', type: 'gap', selector: '#grid', expected: 12, axis: 'column' }, grid).length === 0, '→ axis:column expected 12 綠')
  ok(judge({ name: 'g', type: 'gap', selector: '#grid', expected: 12 }, grid).length === 1, '→ axis:both expected 12 紅(row 是 normal)')
  // 對照組:舊讀法在同一張頁上讀出 0 → 12 ≠ 0 → 舊引擎會假紅。這裡把舊讀法的結果餵進判定,證明對照組咬得到。
  const legacy = await page.$$eval('#grid', (els) => els.map((el) => parseFloat(getComputedStyle(el).gap) || 0))
  ok(legacy[0] === 0, `對照組:舊讀法 parseFloat(getComputedStyle(el).gap) || 0 在同一張頁讀出 ${legacy[0]}(假讀值)`)

  const flex = await read('#flex', { name: 'f', type: 'gap', selector: '#flex', expected: 8, axis: 'row' })
  ok(flex.elements[0].row === 8 && flex.elements[0].column === 16, `flex gap:8px 16px 讀到 {row:8,column:16}(raw "${flex.elements[0].raw}")`)

  const field = await read('#field', { name: 'p', type: 'padding4Sided', selector: '#field', symmetric: 'horizontal', expected: 12 })
  ok(JSON.stringify(field.elements[0]) === JSON.stringify({ top: 0, right: 12, bottom: 0, left: 12 }), 'padding:0 12px 讀到 {0,12,0,12}')
  ok(judge({ name: 'p', type: 'padding4Sided', selector: '#field', symmetric: 'horizontal', expected: 12 }, field).length === 0, '→ symmetric:horizontal expected 12 綠')
  ok(judge({ name: 'p', type: 'padding4Sided', selector: '#field' }, field).length === 1, '→ symmetric:all 紅(舊引擎唯一會做的判法,對 Field 恆紅)')
  const cell = await read('#cell', { name: 'p', type: 'padding4Sided', selector: '#cell', expected: 8 })
  ok(judge({ name: 'p', type: 'padding4Sided', selector: '#cell', expected: 8 }, cell).length === 0, 'padding:8px 四邊等 expected 8 → 綠')

  const buttons = await read('.btn', { name: 'h', type: 'equalHeight', selector: '.btn' })
  ok(buttons.elements.length === 3 && buttons.elements[2] === 32, `三顆按鈕全量到(${buttons.elements.join(',')}),不只第一顆`)
  ok(judge({ name: 'h', type: 'equalHeight', selector: '.btn' }, buttons)[0]?.actual?.[2] === 32, '→ 第三顆 32 紅')
  const missing = await read('.nope-xyz', { name: 'h', type: 'equalHeight', selector: '.nope-xyz' })
  ok(judge({ name: 'h', type: 'equalHeight', selector: '.nope-xyz' }, missing)[0]?.type === 'selectorMissing', '選不到 → selectorMissing')

  const color = await read('#red', { name: 'c', type: 'color', selector: '#red', property: 'color', expected: 'red' })
  const bg = await read('#red', { name: 'c', type: 'color', selector: '#red', property: 'backgroundColor', expected: '#ff0000' })
  const border = await read('#red', { name: 'c', type: 'color', selector: '#red', property: 'borderTopColor', expected: 'rgb(255 0 0)' })
  ok(color.expected === '#ff0000' && color.elements[0].actual === '#ff0000' && bg.elements[0].actual === '#ff0000' && border.elements[0].actual === '#ff0000',
    'color 正規化:red / #ff0000 / rgb(255, 0, 0) / rgb(255 0 0) 全成 #ff0000')
  const badColor = await read('#red', { name: 'c', type: 'color', selector: '#red', property: 'color', expected: 'not-a-color' })
  ok(badColor.expected === null && judge({ name: 'c', type: 'color', selector: '#red', property: 'color', expected: 'not-a-color' }, badColor)[0]?.error, 'not-a-color 正規化成 null → 紅')
  ok(judge({ name: 'c', type: 'color', selector: '#red', property: 'color', expected: 'blue' }, await read('#red', { name: 'c', type: 'color', selector: '#red', property: 'color', expected: 'blue' })).length === 1,
    'expected blue 但實際 red → 紅')
  // 本 repo 的 token 是 oklch:Chromium 的 fillStyle 會原樣回 oklch(...) 字串,拿它當正規化結果永遠比不過 hex 期望值(2026-09-29 實測);
  // 讀回像素才是兩邊共同的 sRGB。這裡同一個 oklch 用 oklch 寫期望 → 綠;用差一階的 hex 寫期望 → 紅
  const teal = await read('#teal', { name: 'c', type: 'color', selector: '#teal', property: 'color', expected: 'oklch(0.5 0.1 200)' })
  ok(/^#[0-9a-f]{6}$/.test(teal.expected) && teal.elements[0].actual === teal.expected,
    `oklch 期望值與 oklch 實際值都正規化成 sRGB hex(${teal.expected}),不是原樣的 oklch 字串`)
  ok(judge({ name: 'c', type: 'color', selector: '#teal', property: 'color', expected: '#000000' }, await read('#teal', { name: 'c', type: 'color', selector: '#teal', property: 'color', expected: '#000000' })).length === 1,
    'oklch 實際值 vs 錯的 hex 期望 → 紅')
  const alpha = await read('#teal', { name: 'c', type: 'color', selector: '#teal', property: 'backgroundColor', expected: 'oklch(0 0 0 / 0.45)' })
  ok(alpha.elements[0].actual === '#000000/0.45' && alpha.expected === '#000000/0.45',
    `半透明:rgba(0,0,0,.45) 與 oklch(0 0 0 / 0.45) 都正規化成 ${alpha.elements[0].actual}(fg-muted 那一類 token 才比得出來)`)
} finally {
  await browser.close()
}

// ── CLI 對照組:--scope=changed 的 base 解析(2026-09-29 接進 PR CI 前查實的假綠)──
// 明確給一個不存在的 base 必須 INSTRUMENT-FAIL 紅,而且要在開靜態站 / 檢查建置之前就紅(不依賴 storybook-static 存不存在);
// 全零 sha(首推 / force-push 的 event.before)視同沒指定 → 走 origin/main 預設鏈並印出用了哪個 base。
{
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
  // 腳本路徑寫成靜態字面值、以 cwd 定位(治理來源政策 harness-source-inventory:Node argv 的腳本運算元必須可審閱,計算出來的路徑不算)
  const runCli = (base) => spawnSync(process.execPath, ['scripts/visual-audit.mjs', '--static', '--scope=changed', '--no-diff', '--no-a11y', `--base=${base}`], { cwd: REPO, encoding: 'utf-8', timeout: 60_000 })
  const bad = runCli('no-such-ref-for-control')
  ok(bad.status === 1 && /INSTRUMENT-FAIL:--base=no-such-ref-for-control/.test(bad.stderr), `--base 指到不存在的 ref → exit 1 + INSTRUMENT-FAIL 指名(不退回 origin/main 猜;實得 exit ${bad.status})`)
  ok(!/owned static Storybook 就緒|build-info\.json/.test(`${bad.stdout}\n${bad.stderr}`), 'base 錯要在開靜態站 / 檢查建置之前就紅(與 storybook-static 存不存在無關)')
  const zero = runCli('0'.repeat(40))
  ok(/\[visual-audit\] scope=changed base=(origin\/main|main)\(/.test(zero.stdout), `全零 sha 視同沒指定 → 走預設鏈並印出 base(實得:${(zero.stdout.match(/scope=changed base=[^\n]*/) ?? ['沒印'])[0].slice(0, 80)})`)
}
console.log(`\n✅ test-visual-audit:${checks} 題全過(判定表 + 合成 DOM 讀值兩面 + CLI base 解析)`)
