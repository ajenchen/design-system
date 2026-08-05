#!/usr/bin/env node
/**
 * test-native-custom-renderer-parity.mjs — 觸控(native)分支與桌機(custom)分支的
 * display-layer prop 同步契約的機械強制。
 *
 * Anchor(2026-08-05):PeoplePicker 在手機上掉回文字 pill / 單人無 avatar,root cause 是
 * `NativeCombobox` 沒有消費 `tagRenderer` 等 renderer/overflow props、`NativeSelect` 沒有
 * 消費 `selectedItemRenderer`。combobox.spec.md /(select.spec.md)已把「新增 renderer-affecting
 * prop 必同步 native 分支」寫成 root invariant,但當時**沒有任何 deterministic script**
 * 看守 —— M23「mindset 沒有 hook 兜底 = 紙老虎」的實例。本檔補上該防線。
 *
 * 契約:
 *  (a) Combobox — 下列 display-layer props 若出現在 CustomCombobox 的 OverflowTagList 呼叫,
 *      就必須同時出現在 NativeCombobox 的 destructure 與其 OverflowTagList 呼叫。
 *  (b) Select — `selectedItemRenderer` 必須在 NativeSelect 內有 render 分支(不只是 destructure)。
 *  (c) 兩者的 renderer 輸出都必須套疊層三件套(z 抬升 + pointer 穿透 + 按鈕回收),
 *      否則 touch 上 renderer 內容會被透明 native overlay 蓋住而不可點。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const read = rel => readFileSync(join(ROOT, rel), 'utf8')

const COMBOBOX = 'packages/design-system/src/components/Combobox/combobox.tsx'
const SELECT = 'packages/design-system/src/components/Select/select.tsx'

// display-layer prop 清單(新增同類 prop 時一併加入此陣列)
const DISPLAY_PROPS = [
  'tagRenderer',
  'renderHiddenTag',
  'tagWrapperClassName',
  'overflowWrapperClassName',
  'overflowShape',
  'visibleCountOverride',
  'tagAreaGapPx',
  'tagAreaPaddingLeftPx',
]

function sliceFunction(source, header) {
  const start = source.indexOf(header)
  if (start < 0) return null
  // 取到下一個 top-level `function ` 或 `const X = React.forwardRef` 之前
  const rest = source.slice(start + header.length)
  const nextIdx = rest.search(/\n(?:function |const [A-Z][A-Za-z]* = React\.forwardRef)/)
  return rest.slice(0, nextIdx < 0 ? rest.length : nextIdx)
}

let failures = 0
const fail = message => { console.error(`✗ ${message}`); failures += 1 }

// ── (a) Combobox native/custom display prop parity ───────────────────────────
const comboboxSource = read(COMBOBOX)
const nativeCombobox = sliceFunction(comboboxSource, 'function NativeCombobox(')
if (!nativeCombobox) fail(`${COMBOBOX}: NativeCombobox 函式找不到(檔案結構已改?)`)
else {
  // 只認 destructure 區塊:prop 出現在 body(如 renderTag callback 內)不算「有消費」——
  // 沒解構就取不到值,那是 2026-08-05 regression 的確切形狀。
  const destructureEnd = nativeCombobox.indexOf('}: ComboboxInternalProps')
  const destructure = destructureEnd < 0 ? '' : nativeCombobox.slice(0, destructureEnd)
  if (!destructure) fail(`${COMBOBOX}: NativeCombobox destructure 區塊解析失敗`)
  for (const prop of DISPLAY_PROPS) {
    if (!comboboxSource.includes(prop)) continue // prop 已從公開面移除 → 不強制
    if (!new RegExp(`(^|[\\s,{])${prop}([\\s,:}]|$)`).test(destructure)) {
      fail(`${COMBOBOX}: NativeCombobox 未消費 display-layer prop \`${prop}\` —— 觸控分支會掉回預設 <Tag>,桌機/手機視覺分岔(combobox.spec.md「Display 層雙分支同 SSOT」)`)
    }
  }
  // (c) 疊層三件套
  const hasLift = /relative z-10[^"'`]*shrink-0|shrink-0[^"'`]*relative z-10/.test(nativeCombobox)
  const hasPassThrough = nativeCombobox.includes('pointer-events-none')
  const hasButtonRecovery = nativeCombobox.includes('[&_button]:pointer-events-auto')
  if (!(hasLift && hasPassThrough && hasButtonRecovery)) {
    fail(`${COMBOBOX}: NativeCombobox 的 renderer 輸出缺疊層三件套(z 抬升 / pointer-events-none 穿透 / [&_button]:pointer-events-auto 回收)—— 透明 native <select> overlay 會蓋住 renderer 內容`)
  }
}

// ── (b) Select native selectedItemRenderer 分支 ──────────────────────────────
const selectSource = read(SELECT)
// 用 displayName 當結束界標(比「下一個 top-level 宣告」穩:ReadonlyDisplay 等共用 renderer
// 也含同名呼叫,切太寬會讓 gate 空轉,2026-08-05 負例實測補強)
const nsStart = selectSource.indexOf('const NativeSelect = React.forwardRef')
const nsEnd = selectSource.indexOf("NativeSelect.displayName")
const nativeSelect = nsStart >= 0 && nsEnd > nsStart ? selectSource.slice(nsStart, nsEnd) : null
if (!nativeSelect) fail(`${SELECT}: NativeSelect 找不到(檔案結構已改?)`)
// 必須是實際呼叫(render 出來),不是只在布林條件裡被提及 —— 後者在 overlay-class
// 條件式也會出現,會讓 gate 空轉(2026-08-05 負例實測補強)。
else if (!/selectedItemRenderer\(/.test(nativeSelect)) {
  fail(`${SELECT}: NativeSelect 沒有 selectedItemRenderer render 分支 —— 觸控單選只會顯示 option 純文字(select.spec.md「雙分支同 SSOT」)`)
}

if (failures) {
  console.error(`\n❌ native/custom display-layer parity 契約失敗 ${failures} 項`)
  process.exit(1)
}
console.log(`Native/custom renderer parity PASS (${DISPLAY_PROPS.length} display props + overlay 三件套 + Select renderer 分支)`)
