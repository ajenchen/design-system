#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: `<Field>` 內的可編輯控件不得自帶 `id` —— 否則 FieldLabel 的 htmlFor 會指向不存在的元素,
 *         標籤與控件的關聯**沉默斷掉**(畫面正常,只有輔助技術壞掉;axe 報 label,critical)。
 *   紅: 控件自帶 id 且同一個 Field 內有 FieldLabel、而 Field 自己沒有 id → 列出檔名行號並 exit 1
 *        (--selftest 以合成片段驗過會紅)。
 *   綠: 沒有這種寫法時綠;id 給 Field 的、沒有 FieldLabel 的、不在 Field 內的三種合法樣本
 *        都不得誤報(--selftest 一併驗)。不是抽籤 —— 純原始碼掃描,同一份 worktree 恆等。
 *   保證(二,2026-11-26 產品 canary 回報 C8 (b)):`<FieldLabel info>` 渲染出的 `<label>` 裡**沒有其他可被標籤的元素**
 *        (button / input / select / textarea / meter / output / progress —— WHATWG HTML「The label element」內容模型)、
 *        label 的文字不含 ⓘ 的說明文字(否則控件經 aria-labelledby / <label for> 算出的讀屏名稱會把說明一起念進去),
 *        且 for / id 仍指向 Field 的 id。量法:esbuild 把 DS 原始碼(Field + Input + Tooltip)打包、renderToStaticMarkup 出 HTML 再比對
 *        —— 測原始碼本身,不需要 build:lib / storybook / 瀏覽器(scripts/lib/ds-source-harness.mjs)。
 *   紅(二): 上述任一條不成立 → 指名哪一條 exit 1;--selftest 把 field.tsx 的 ⓘ 改回住在 <label> 裡(2026-11-26 前的結構)必紅,
 *        現行原始碼必綠;打包不起來 / 渲染不出 label = 儀器失效(exit 2),不讀成通過。
 * Field 內的控件不得自帶 `id` —— 否則標籤與控件的關聯會**沉默斷掉**(2026-09-21)
 *
 * 形狀:
 *   <Field>                       ← Field 自己 useId() 產生 id,FieldLabel 的 htmlFor 指向它
 *     <FieldLabel>標題</FieldLabel>
 *     <Input id="my-input" />     ← 控件用自己的 id(`idProp ?? fieldCtx?.id`),覆蓋掉 Field 的
 *   </Field>
 * 結果:label 的 htmlFor 指向一個**不存在的元素**,axe 報 `label`(critical,WCAG 1.3.1 / 4.1.2),
 * 螢幕閱讀器唸不出欄位名稱,點標籤也不會聚焦到輸入框。
 *
 * 關鍵在於它**沒有任何錯誤訊息** —— 畫面完全正常,只有輔助技術壞掉。
 * 全庫掃到 4 處,全都是為了讓測試抓得到元素而給控件一個穩定 id,寫法看起來完全合理。
 *
 * 正解:id 給 `<Field id="...">`,控件透過 fieldCtx 繼承同一個 id,標籤自然對得上。
 *
 * 對照組:`--selftest` 合成兩段(壞的必須抓到、好的不得誤報)。
 *
 * Run: node scripts/field-label-binding-invariant.mjs [--selftest]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InstrumentError, bundleDsHarness, mutantFor, replaceOnce } from './lib/ds-source-harness.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

// ── 保證(二):FieldLabel info 渲染出的 <label> 不含可被標籤的元素 ──
const INFO_TEXT = '開立公司發票才需要填寫;個人發票可以留空'
const LABEL_HARNESS = `
import { renderToStaticMarkup } from 'react-dom/server'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
globalThis.__fieldLabelMarkup = renderToStaticMarkup(
  <TooltipProvider><Field id="tax-id"><FieldLabel info=${JSON.stringify(INFO_TEXT)}>統一編號</FieldLabel><Input placeholder="8 碼數字" /></Field></TooltipProvider>
)
`
const LABELABLE = /<(button|input|select|textarea|meter|output|progress)\b/u

/** 純函式:渲染出的 HTML → 違反了哪幾條(空陣列 = 綠) */
export function labelMarkupProblems(html) {
  const labels = [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gu)]
  if (labels.length !== 1) throw new InstrumentError(`渲染出 ${labels.length} 個 <label>(應為 1)—— harness 或 FieldLabel 結構變了`)
  const [, attrs, inner] = labels[0]
  const problems = []
  const nested = inner.match(LABELABLE)
  if (nested) problems.push(`<label> 裡有可被標籤的 <${nested[1]}>(HTML 不准;ⓘ 要是 label 的兄弟)`)
  const text = inner.replace(/<[^>]+>/gu, '')
  if (text.includes(INFO_TEXT) || inner.includes(INFO_TEXT)) problems.push('<label> 的內容含 ⓘ 的說明文字(控件的讀屏名稱會把說明一起念進去)')
  if (!/\sfor="tax-id"/u.test(attrs)) problems.push('<label> 的 for 沒有指向 Field 的 id(tax-id)')
  if (!/\sid="tax-id-label"/u.test(attrs)) problems.push('<label> 的 id 不是 Field 推出的 tax-id-label(控件的 aria-labelledby 會接不到)')
  if (!html.includes(`aria-label="${INFO_TEXT}"`)) problems.push('ⓘ 鈕不見了(找不到帶說明文字的 aria-label)—— 不能靠拿掉 ⓘ 讓這條綠')
  return problems
}

/** 打包 + 渲染(mutate = selftest 的突變);回傳違反清單 */
async function renderedLabelProblems(mutate) {
  const code = await bundleDsHarness({ root: ROOT, harness: LABEL_HARNESS, harnessName: 'field-label-info-harness.tsx', mutate })
  delete globalThis.__fieldLabelMarkup
  try { new Function(code)() } catch (error) { throw new InstrumentError(`harness 執行失敗:${String(error?.message ?? error).split('\n')[0]}`) }
  const html = globalThis.__fieldLabelMarkup
  if (typeof html !== 'string' || !html) throw new InstrumentError('harness 沒有渲染出任何 HTML')
  return labelMarkupProblems(html)
}

/** 2026-11-26 前的結構:ⓘ 住在 <label> 裡(split 恆 false = 單一 <label> 包住文字與 ⓘ) */
const mutantInfoInsideLabel = () => mutantFor(ROOT, 'components/Field/field.tsx',
  (src) => replaceOnce(src, /const split = showInfo && !isViewMode/u, 'const split = false'))
const SCAN_ROOTS = ['packages/design-system/src', 'apps']
// Field 家族的可編輯控件(field-controls.spec.md「4 Field control」)
const CONTROLS = 'Input|Textarea|Select|Combobox|DatePicker|TimePicker|DateTimePicker|NumberInput|PeoplePicker|SearchInput'
const CONTROL_WITH_ID = new RegExp(`<(?:${CONTROLS})\\b[^>]*\\sid=`, 'u')
// 往前看的視窗:Field 開標籤到控件之間通常 1-6 行,給 12 行餘裕
const LOOKBACK = 12

/** @returns {{line:number, text:string}[]} 這份原始碼裡的違規 */
export function findFieldLabelBindingViolations(source) {
  const lines = source.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!CONTROL_WITH_ID.test(lines[i])) continue
    const window = lines.slice(Math.max(0, i - LOOKBACK), i + 1)
    // 必須是「這個控件所在的 Field」:視窗內最後一個 <Field 之後不得有 </Field>
    const text = window.join('\n')
    const openAt = text.lastIndexOf('<Field')
    if (openAt < 0) continue
    const after = text.slice(openAt)
    if (after.includes('</Field>')) continue
    // 沒有 FieldLabel 就沒有 htmlFor 要對,不算違規
    if (!after.includes('<FieldLabel')) continue
    // Field 自己帶了 id → 消費端已經走正解(控件那個 id 才是多餘的,但不會斷關聯)
    const fieldTag = after.slice(0, after.indexOf('>') + 1)
    if (/\sid=/.test(fieldTag)) continue
    out.push({ line: i + 1, text: lines[i].trim().slice(0, 110) })
  }
  return out
}

if (SELFTEST) {
  const bad = `
    <Field>
      <FieldLabel>標題</FieldLabel>
      <Input id="my-input" value={v} />
    </Field>`
  const goodFieldId = `
    <Field id="my-input">
      <FieldLabel>標題</FieldLabel>
      <Input value={v} />
    </Field>`
  const goodNoLabel = `
    <Field>
      <Input id="my-input" value={v} />
    </Field>`
  const goodOutside = `
    <div>
      <Input id="my-input" value={v} />
    </div>`
  const results = [
    ['壞的必須抓到', findFieldLabelBindingViolations(bad).length === 1],
    ['id 給 Field 的不得誤報', findFieldLabelBindingViolations(goodFieldId).length === 0],
    ['沒有 FieldLabel 的不得誤報', findFieldLabelBindingViolations(goodNoLabel).length === 0],
    ['不在 Field 內的不得誤報', findFieldLabelBindingViolations(goodOutside).length === 0],
  ]
  // 保證(二)的對照組:突變(ⓘ 住回 label 裡)必紅、現行必綠;純函式的合成樣本各紅一面
  try {
    const mutate = mutantInfoInsideLabel()
    const mutantProblems = await renderedLabelProblems(mutate)
    mutate.assertApplied()
    const currentProblems = await renderedLabelProblems()
    results.push(
      ['(二)ⓘ 住回 <label> 裡(2026-11-26 前的結構)必紅', mutantProblems.some((p) => p.includes('<button>')) && mutantProblems.some((p) => p.includes('說明文字'))],
      ['(二)現行原始碼必綠', currentProblems.length === 0],
      ['(二)合成:label 沒有 for 必紅', labelMarkupProblems(`<span><label id="tax-id-label">統一編號</label><button aria-label="${INFO_TEXT}"></button></span>`).some((p) => p.includes('for'))],
      ['(二)合成:拿掉 ⓘ 不得讓它綠', labelMarkupProblems('<label for="tax-id" id="tax-id-label">統一編號</label>').some((p) => p.includes('ⓘ 鈕不見了'))],
    )
  } catch (error) {
    if (error instanceof InstrumentError) { console.error(`INSTRUMENT-FAIL field-label-binding(二):${error.message}`); process.exit(2) }
    throw error
  }
  let ok = true
  for (const [name, pass] of results) { if (!pass) ok = false; console.log(`${pass ? '✓' : '✗'} selftest:${name}`) }
  console.log(ok ? '✓ selftest:壞的抓得到、好的不誤報' : '✗ selftest 不符')
  process.exit(ok ? 0 : 1)
}

const files = []
const walk = (dir) => {
  let names
  try { names = readdirSync(dir) } catch { return }
  for (const name of names) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (full.endsWith('.tsx')) files.push(full)
  }
}
for (const root of SCAN_ROOTS) walk(join(ROOT, root))

const violations = []
for (const file of files.sort()) {
  for (const hit of findFieldLabelBindingViolations(readFileSync(file, 'utf8'))) {
    violations.push(`${relative(ROOT, file)}:${hit.line}  ${hit.text}`)
  }
}

let labelProblems
try {
  labelProblems = await renderedLabelProblems()
} catch (error) {
  if (error instanceof InstrumentError) { console.error(`INSTRUMENT-FAIL field-label-binding(二):${error.message}`); process.exit(2) }
  throw error
}

if (violations.length || labelProblems.length) {
  if (violations.length) {
    console.error(`❌ Field 內的控件自帶 id,標籤關聯會沉默斷掉(${violations.length} 處):`)
    for (const v of violations) console.error(`   - ${v}`)
    console.error('   正解:把 id 給 <Field id="...">,控件經 fieldCtx 繼承同一個 id,FieldLabel 的 htmlFor 才對得上。')
  }
  if (labelProblems.length) {
    console.error(`❌ <FieldLabel info> 渲染出的 <label> 不合規(${labelProblems.length} 條;packages/design-system/src/components/Field/field.tsx FieldLabel):`)
    for (const p of labelProblems) console.error(`   - ${p}`)
    console.error('   正解:有 ⓘ 時外層 span 帶版面,<label> 只包星號與標籤文字,ⓘ 是它的兄弟(field.spec.md「FieldLabel `info` icon」)。')
  }
  process.exit(1)
}
console.log(`✅ field-label-binding-invariant PASS(掃 ${files.length} 個 .tsx;Field 內的控件都沒有自帶 id;<FieldLabel info> 的 <label> 裡沒有可被標籤的元素、不含說明文字)`)
