#!/usr/bin/env node
// check-field-cascade-resolve.mjs — 機械防複發:Field 控件必經 resolver hook 解析 cascade(size / mode / disabled)
//
// 2026-06-08(取代舊 check-field-size-resolve.mjs,擴 size → size+mode+disabled cascade SSOT):
//   size B 組 + mode/disabled cascade bug = **同一根因**:控件各自手刻 fieldCtx 解析、precedence 不一、漏接 channel。
//     - picker `resolvedMode = disabled ? 'disabled' : mode`,不讀 fieldCtx.mode → <Field mode="display"> 失效
//     - PeoplePicker/Switch/Checkbox/RadioGroup/Slider/Avatar 漏讀 fieldCtx.disabled / 漏讀 fieldCtx.mode → <Field disabled>/<Field mode> 失效
//   根治後全控件改用 field-context.ts 的 useResolvedFieldSize / useResolvedFieldMode / useResolvedFieldDisabled SSOT。
//
// 2026-06-08 v2(對抗稽核 Lens 4 補洞):原 v1 三破綻 —
//   (a) Check 1 只驗 hook **名字存在**(string),不驗 **被呼叫** → import 了但沒 call 也綠燈。改驗 `hook(`。
//   (b) Check 2 只掃 fieldWrapperStyles importer → 漏 group 控件(Checkbox/RadioGroup/SegmentedControl)。改掃**全 components**。
//   (c) 漏「有 display/readonly branch 但不走 mode helper」的控件(此類根本不讀 fieldCtx,Check 2 抓不到)。新增 Check 1b。
//
// Run:required CI —— ci.yml verify-static「Static gates that used to run only nightly」直呼本檔,接著跑配對測試
//   scripts/test-check-field-cascade-resolve.mjs(2026-11-20 knowledge-prune WP-21 接上;2026-11-17 到接上之前只有夜間
//   governance-harnesses.yml 經配對測試帶跑,8f824bc7 當時照實寫過)。deterministic source grep,無 build 依賴。
//
// @gate-contract
//   保證: packages/design-system/src/components 底下(Field/ 本身、stories、test 除外)的控件 .tsx,
//         消費 fieldWrapperStyles / bareInputStyles 的都呼叫了 useResolvedFieldSize( 與 useResolvedFieldMode((Check 1);
//         有 'display' / 'readonly' 分支又讀 Field context 的都呼叫了 useResolvedFieldMode((Check 1b);
//         程式碼裡沒有任何一行直接讀 fieldCtx.size / fieldCtx.mode / fieldCtx.disabled(Check 2a / 2b,行註解與單行區塊註解先剝掉)
//   紅: 任一檢查有命中 → 印出「檔案: 該行 / 缺哪個 hook」並 exit 1;配對測試在 Badge 末尾注入一行 `fieldCtx.size` 直讀,
//       本閘必須 exit 非 0,否則配對測試以「detection 失效」紅
//   綠: 現行原始碼 0 筆時 exit 0,印出檢查了幾個 fieldWrapperStyles 控件;只讀檔與正規表示式,不讀時間、不開瀏覽器,重複跑結果相同

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const COMPONENTS = join(__dirname, '..', 'packages/design-system/src/components')

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const fp = join(dir, e)
    if (statSync(fp).isDirectory()) out.push(...walk(fp))
    else if (e.endsWith('.tsx') && !e.includes('.stories.') && !e.endsWith('.test.tsx')) out.push(fp)
  }
  return out
}

// 逐行剝行尾(含整行)// 註解後回傳 code-only 文本(避免 SSOT 註解 prose 的 'fieldCtx.mode' 誤判)
function codeOnly(src) {
  return src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
}

const FIELD_STYLE_IMPORT = /(fieldWrapperStyles|bareInputStyles)/
const v1 = []           // Check 1:fieldWrapperStyles 控件缺 size/mode resolver call
const v1b = []          // Check 1b:有 display/readonly branch 但沒 call useResolvedFieldMode
const scatteredSize = []     // Check 2a:散落直讀 fieldCtx.size
const scatteredCascade = []  // Check 2b:散落直讀 fieldCtx.mode/disabled
let checked = 0

for (const f of walk(COMPONENTS)) {
  if (f.includes('/Field/')) continue // Field 基建本身豁免
  const raw = readFileSync(f, 'utf8')
  const code = codeOnly(raw)
  const rel = f.replace(/.*packages\/design-system\/src\//, 'src/')

  const importsWrapper =
    /from '@\/design-system\/components\/Field\/field-wrapper'/.test(raw) && FIELD_STYLE_IMPORT.test(raw)
  const callsSize = /useResolvedFieldSize\(/.test(code)
  const callsMode = /useResolvedFieldMode\(/.test(code)
  // field-context-aware = 消費 Field context(讀 / resolve),非單純 host(只 provide surface)
  const fieldContextAware = /useFieldContext\b|useResolvedFieldMode\b|useResolvedFieldDisabled\b/.test(code)
  const hasModeBranch = /===\s*'(display|readonly)'/.test(code)

  // ── Check 1:fieldWrapperStyles 控件必 **呼叫** useResolvedFieldSize + useResolvedFieldMode ──
  if (importsWrapper) {
    checked++
    const missing = []
    if (!callsSize) missing.push('useResolvedFieldSize()')
    if (!callsMode) missing.push('useResolvedFieldMode()')
    if (missing.length) v1.push(`${rel}: 未呼叫 ${missing.join(' + ')}`)
  }

  // ── Check 1b:有 display/readonly mode branch + 消費 Field context 的控件,必呼叫 useResolvedFieldMode ──
  //   (抓「ignore fieldCtx.mode、用 raw mode prop 判 display」的 bug pattern — Check 2 抓不到因為它沒讀 fieldCtx)
  if (hasModeBranch && fieldContextAware && !callsMode) {
    v1b.push(`${rel}: 有 'display'/'readonly' mode branch + 消費 Field context,但沒呼叫 useResolvedFieldMode()`)
  }

  // ── Check 2(全 components 掃):散落直讀 fieldCtx.size / .mode / .disabled(該走 resolver hook)──
  for (const rawLine of raw.split('\n')) {
    // 剝 `//` 行註解 + 單行 `/* */` block/JSDoc 註解 —— 本 gate 只查「code 直讀 fieldCtx.size」,
    // 註解裡描述性提及 fieldCtx.size(如 InlineEdit JSDoc 說明 resolver fallback 行為)非違規。
    // (2026-07-18:原僅剝 `//`,漏 `/** … */` 單行 JSDoc → InlineEdit:84 誤報;補剝 block 註解修根。)
    const c = rawLine.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '')
    if (/fieldCtx\??\.size/.test(c)) { scatteredSize.push(`${rel}: ${rawLine.trim().slice(0, 80)}`); }
    if (/fieldCtx\??\.(mode|disabled)\b/.test(c)) { scatteredCascade.push(`${rel}: ${rawLine.trim().slice(0, 80)}`); }
  }
}

const fail = v1.length || v1b.length || scatteredSize.length || scatteredCascade.length
if (fail) {
  if (v1.length) { console.error('❌ fieldWrapperStyles 控件未呼叫 size/mode resolver:'); v1.forEach((x) => console.error('   - ' + x)) }
  if (v1b.length) { console.error('❌ 有 display/readonly branch 卻沒走 useResolvedFieldMode(<Field mode> 不會 cascade):'); v1b.forEach((x) => console.error('   - ' + x)) }
  if (scatteredSize.length) { console.error('❌ 散落直讀 fieldCtx.size(應走 useResolvedFieldSize):'); scatteredSize.forEach((x) => console.error('   - ' + x)) }
  if (scatteredCascade.length) { console.error('❌ 散落直讀 fieldCtx.mode/disabled(應走 useResolvedFieldMode / useResolvedFieldDisabled):'); scatteredCascade.forEach((x) => console.error('   - ' + x)) }
  console.error('\n   修:改用 field-context.ts 的 useResolvedFieldSize / useResolvedFieldMode({ mode, disabled, readOnly }) / useResolvedFieldDisabled(prop)。')
  console.error('   SSOT:components/Field/field-context.ts + field-controls.spec.md「Field context cascade — SSOT」。')
  process.exit(1)
}
console.log(`✓ Field cascade-resolve gate:${checked} 個 fieldWrapperStyles 控件全呼叫 size+mode resolver;display-branch 控件全走 useResolvedFieldMode;0 散落 fieldCtx.size/mode/disabled(cascade SSOT 統一)`)
