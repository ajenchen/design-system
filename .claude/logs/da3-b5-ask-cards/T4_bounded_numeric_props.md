# T4 有界數值 prop 決策卡（bounded numeric props）

verdict: **MIXED** — 1 條降 AUTO（d72i7 Breadcrumb），3 條合成單一決策卡（d72i1 / d72i10 / d72i11）。

---

## SSOT-check 結果（先行、最重要）

| 查核點 | 結果 |
|---|---|
| grep 我方 spec/rules/references/memory「clamp/收窄/bounded/union」 | **無**任何 canonical 規定有界數值要型別收窄 |
| git log「clamp/precision/maxLines/收窄/union」 | 無專門拍板記錄；beta.84 有「型別誠實化收窄」但對象是**非功能 prop** |
| 既有 dev-warn canonical | **強命中** — Button / Chip / Notice / ProfileCard / SegmentedControl / SelectionItem / Tag 共 **7 個元件**都用「型別寬鬆 + dev mode `console.warn`」處理非法 prop 用法，且互相標「先例」（button.tsx:405「對齊既有 overlayBadge / iconOnly warn pattern」、tag.principles.stories.tsx:264「對齊 Button overlayBadge dev-warn 先例」）|
| select.tsx:57「全部收窄」先例（T1 引用） | 明文只適用「型別承諾了但**實作沒出口**」的 prop（asChild 靜默 no-op、`型別承諾 ≠ 實作出口`）。有界數值是「**有出口、只是超界降級**」，**不屬同類** |
| Rating 現況 | render fill ratio 已 clamp 0–1、鍵盤已 clamp 0–max（rating.tsx:142,145,151,189）；缺的只是 max>7 的 dev-warn |

**結論**：把「補 runtime clamp + dev-warn + 修 Tailwind 拼接」歸為 AUTO（對齊既有 canonical / 修真 bug）；殘留的真決策 = **要不要額外把型別收窄成 union（破壞性）**。

---

## World-class ≥3 cite（型別怎麼寫）

| DS | prop | 型別 | 收窄成 union？ |
|---|---|---|---|
| MUI Rating | `max` | `number`（default 5）| ❌ 否 |
| MUI Breadcrumbs | `maxItems` / `itemsBeforeCollapse` / `itemsAfterCollapse` | `number`（integer 語意，無組合驗證）| ❌ 否 |
| Ant InputNumber | `precision` / `max` / `min` | `number` | ❌ 否 |
| Chakra UI Text | `noOfLines` / `lineClamp` | `number`（或 responsive array）| ❌ 否 |

來源：mui.com/material-ui/api/rating、mui.com/material-ui/api/breadcrumbs（WebFetch 實證）；ant.design/components/input-number（WebFetch 實證）；chakra-ui.com/docs/components/text（WebSearch，search-only confidence）。**4 家一致保持 `number`，無一家收窄成 union。**

---

## 降 AUTO：d72i7（Breadcrumb maxItems / itemsBeforeCollapse / itemsAfterCollapse）

**為何 AUTO**：finding 提「改為單一 collapse config」＝ restructure（破壞性）。但 breadcrumb.tsx:155,184,193,195 明文「對齊 Material UI source」，而 MUI Breadcrumbs 本身就保持 3 個獨立 `number`（WebFetch 實證）→ M23「align 既有 mirror source」→ **拒絕 restructure**（無強理由背離刻意鏡像的 MUI 形狀）。殘項 = 修真 logic bug：`before+after > maxItems` 時 `items.slice(beforeN, len-afterN)` 產生空 ellipsis dropdown + 同一 index 同時落在 before/after 造成重複項（breadcrumb.tsx:238-245 實測）→ clamp 合法組合 + dev-warn，對齊 7-element dev-warn canonical（button.tsx:405 先例）。**無型別 contract 變更 → AUTO bug-fix。**

---

## 決策卡（d72i1 LineClamp / d72i10 precision / d72i11 Rating max）

【問題】
Rating 的滿分 `max`、NumberInput/DataTable 的小數位數 `precision`、清單/表格的截行 `maxLines`/`descriptionClamp` —— 這些「有明確上限」的數字 prop，規格都寫死了範圍（Rating max ≤7、precision ≤6、截行 1–6），但 TypeScript 型別現在寫的是「任意數字 `number`」。也就是說：consumer 傳 `max=10`、`precision=-1`、`截行=99` 都能通過型別檢查，執行時才靜默失效（截行變不截）或直接 crash（precision 負數讓 `Intl.NumberFormat` 拋 RangeError）。要不要把型別「收窄」成只允許合法值的 union？

【選項 A：型別層收窄成 union / branded】
`max: number` → `max: 1|2|3|4|5|6|7`、`precision: number` → `0|1|2|3|4|5|6`、截行改共用 `LineClamp = 1|2|3|4|5|6`。
- 好處：編譯期就擋掉非法值，「型別即文件」，延續 beta.84「型別誠實化收窄」的方向。
- 代價：(1) **破壞性型別變更** —— 任何 consumer 用 `const n: number = …` 變數傳進來的 code 會直接型別報錯，得全部改。(2) **與世界級全數背道而馳** —— MUI Rating.max、MUI Breadcrumbs、Ant InputNumber.precision、Chakra noOfLines 全部維持 `number`，無一家收窄（4 家實證）。(3) 未來若要放寬上限（precision 到 8）又是一次破壞性變更。(4) 與我方**自己**的既有慣例衝突 —— DS 對「非法 prop 用法」的 canonical 是「型別寬鬆 + dev-warn」（7 元件先例），不是型別收窄。

【選項 B：保持 `number` + 執行期 clamp + 開發期警告（推薦）】
型別維持 `number`，補上：超界值自動 clamp 回合法範圍 + dev mode `console.warn`；同時修掉 Tailwind 動態拼 class 隱患（item-anatomy `line-clamp-${n}` / DataTable `line-clamp-[${n}]` → 靜態對照表，抄 selection-item.tsx:121 已有的安全 switch）。
- 好處：(1) 不破壞任何 consumer 契約（additive）。(2) 對齊世界級 4 家。(3) 對齊我方 7 元件 dev-warn 既有 canonical（button.tsx:405 先例）。(4) 順手修真 bug：precision 負數/小數 crash、截行超界靜默失效、Tailwind 拼接 class 掃不到。
- 代價：沒有編譯期保護，只有執行/開發期才會發現（但這正是世界級與我方既有的一致做法）。

【推薦】**選項 B**。理由：世界級 4 家一致保持 `number`、無一收窄；我方對「非法 prop 用法」的既有 canonical 就是「寬型別 + dev-warn」（7 元件先例）；beta.84 的收窄先例（select.tsx:57）明文只適用「型別承諾了但實作沒出口」的 prop（asChild 靜默 no-op），而有界數值是「有出口、只是超界降級」，不屬同類、不該套同一收窄邏輯。B 同時把真 bug 一併修掉。

【AUTO 附帶（不管選 A 或 B 都先做）】precision 負數/小數 RangeError guard、截行 Tailwind `line-clamp-${n}`/`line-clamp-[${n}]` → 靜態對照表、超界值 dev-warn —— 全對齊既有 canonical / 是修 bug，屬 AUTO，無型別 contract 變更。

【SSOT 理由】選 A 會改動 Rating.max / NumberInput.precision / DataTable column-types（maxLines, precision）/ item-anatomy.descriptionClamp 的**公開型別 contract**（`number` → union，破壞性），並確立一條新的 DS-wide 設計語言 canonical：「有界數值 prop 的型別策略 —— 型別誠實是否延伸到值域」。跨元件 API contract + 新 canonical 語意 → 須 user 拍板。
