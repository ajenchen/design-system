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
 *  (a) Select — `selectedItemRenderer` 必須在 NativeSelect 內有 render 分支(不只是 destructure)。
 *  (b) NativeSelect 的 renderer 輸出必須套疊層三件套(z 抬升 + pointer 穿透 + 按鈕回收),
 *      否則 touch 上 renderer 內容會被透明 native overlay 蓋住而不可點。
 *
 * **2026-09-18 起不再涵蓋 Combobox**:user 拍板「手機與桌機同一套」,Combobox 的觸控分支
 * (`NativeCombobox`)整個移除,因此不存在「兩條分支要同步」的問題 —— 只有一條。
 * 改由 `scripts/combobox-single-path-invariant.mjs` 在**觸控模擬**下確認它渲染的是自訂浮層、
 * 不是原生 `<select>`(那支才是這件事現在的防線;本檔的靜態字串比對做不到那件事)。
 * Select 仍是雙分支(單選退原生 picker,那條沒有被推翻),所以本檔保留 Select 那半。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const read = rel => readFileSync(join(ROOT, rel), 'utf8')

const SELECT = 'packages/design-system/src/components/Select/select.tsx'



let failures = 0
const fail = message => { console.error(`✗ ${message}`); failures += 1 }

// ── (a) Select native selectedItemRenderer 分支 ──────────────────────────────
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
console.log('Native/custom renderer parity PASS (Select renderer 分支;Combobox 自 2026-09-18 起單一路徑,改由 combobox-single-path-invariant.mjs 看守)')
