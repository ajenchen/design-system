#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: `<Field>` 內的可編輯控件不得自帶 `id` —— 否則 FieldLabel 的 htmlFor 會指向不存在的元素,
 *         標籤與控件的關聯**沉默斷掉**(畫面正常,只有輔助技術壞掉;axe 報 label,critical)。
 *   紅: 控件自帶 id 且同一個 Field 內有 FieldLabel、而 Field 自己沒有 id → 列出檔名行號並 exit 1
 *        (--selftest 以合成片段驗過會紅)。
 *   綠: 沒有這種寫法時綠;id 給 Field 的、沒有 FieldLabel 的、不在 Field 內的三種合法樣本
 *        都不得誤報(--selftest 一併驗)。不是抽籤 —— 純原始碼掃描,同一份 worktree 恆等。
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
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

if (violations.length) {
  console.error(`❌ Field 內的控件自帶 id,標籤關聯會沉默斷掉(${violations.length} 處):`)
  for (const v of violations) console.error(`   - ${v}`)
  console.error('   正解:把 id 給 <Field id="...">,控件經 fieldCtx 繼承同一個 id,FieldLabel 的 htmlFor 才對得上。')
  process.exit(1)
}
console.log(`✅ field-label-binding-invariant PASS(掃 ${files.length} 個 .tsx;Field 內的控件都沒有自帶 id)`)
