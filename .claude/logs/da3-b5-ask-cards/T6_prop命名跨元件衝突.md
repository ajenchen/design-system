# 決策卡 — T6 prop 命名跨元件衝突

**verdict**:MIXED（2 個真決策 d14i6 / d14i8 送拍板；1 個 d14i7 降 AUTO）

---

## SSOT-check 結果（拍板前的自查）

| Finding | 我方是否已有 canonical / 拍板過 | 結論 |
|---|---|---|
| **d14i6** `onClear`（BulkActionBar 清 selection） | **有**：props-naming.md:14 明訂 `onClear` = 欄位內容清空（Input/Select/Combobox/DatePicker）；button.spec.md:355 + inline-action.spec.md:236 呼應。BulkActionBar 用 `onClear` 清勾選 = **違反已定 canonical**。但更名動已發佈公開 prop → **真決策** | ASK |
| **d14i7** `createLabel`（SelectMenu formatter vs Calendar 靜態字串） | SelectMenu 是 **isInternal**（select-menu.spec.md:8）且**未從 root barrel 匯出**（index.ts:597 僅註解）→ 改 SelectMenu 的 `createLabel` 是 DS 內部重構、零外部消費者影響；Calendar.createLabel（公開、靜態字串）本身命名正確不動 → **非拍板題** | **降 AUTO** |
| **d14i8** `direction` vs `orientation` | **無 canonical**：props-naming.md 沒有這條軸線規則。DS **分裂**：`direction`=DescriptionList(:33,49) + **ButtonGroup**(button-group.tsx:33)；`orientation`=Field/CheckboxGroup/RadioGroup/Steps/Slider/Separator/SegmentedControl/Switch（8+）。原 codex 發現「其他都用 orientation」**不精確**（漏了 ButtonGroup 也用 direction，已補正）。統一需新增 canonical + 改 2 個公開元件 → **真決策** | ASK |

**先例（我方拍板紀錄，git 74512a11，2026-06-05）**：Tag `onDismiss → onRemove` 曾由 user 逐項拍板，做法 = **硬改名、無 deprecated alias**，理由「pre-1.0 + 乾淨先例」，改前先 `rg apps/template = 0` 確認無外部消費者 = 受控破壞。本主題的更名與該先例同構，應沿用同一 policy（M23 我方 canonical 優先）。

---

## 世界級對照（≥3 家）

**orientation vs direction（d14i8 核心）**：
- **ARIA `aria-orientation`**（W3C/MDN）：軸線的無障礙語意屬性，值 = `horizontal | vertical` —— 「軸線」的標準詞就是 **orientation**。
- **Radix UI**：Slider / NavigationMenu / Tabs 等軸線一律 `orientation`（對齊 ARIA）。
- **MUI**：ToggleButtonGroup 用 `orientation`（`horizontal`/`vertical`）；`direction` 保留給 Stack 的 flex flow（`row`/`column`）。MUI RFC #33770 明確建議：**軸線 → orientation、flow/移動感 → direction**。
- **React Aria / Chakra**：同走 `orientation`（`data-orientation` hook 進 Tailwind）。

→ 世界級共識：**當值是 `horizontal`/`vertical`（軸線）就該叫 `orientation`；`direction` 留給 `row`/`column`（flex flow）或 `ltr`/`rtl`（文字方向）**。我方 DescriptionList / ButtonGroup 的 `direction` 值正是 `horizontal`/`vertical` → 按世界級應為 `orientation`。DescriptionList 自身 verifyReason 也提到 `direction` 易與 LTR/RTL 混淆，與此區分一致。

**clear selection 命名（d14i6）**：PatternFly / Helios / Emplifi Soul 的 bulk-action 慣例用「Clear」「Deselect all」；`onClearSelection` / `onDeselectAll` 皆 idiomatic。關鍵只是要與「欄位清空」的 `onClear` 區隔開。

來源：MDN aria-orientation；Radix Primitives（Slider/NavigationMenu）；MUI ToggleButtonGroup + RFC #33770；React Aria styling docs；PatternFly Bulk selection / Helios Table multi-select。

---

## 決策卡

### 【問題】
DS 有兩處**公開 prop 命名跨元件衝突**要拍板，兩者都會動到已發佈的 npm 公開 prop：
1. **BulkActionBar 的 `onClear`** 實際是「清空勾選」，但我方命名 canonical 早就把 `onClear` 綁死成「清空欄位內容」（props-naming.md:14）——同名不同義。
2. **DescriptionList 與 ButtonGroup 用 `direction`**（值 `horizontal`/`vertical`）表達版面軸線，但 DS 內 8+ 個元件同一軸線都叫 `orientation`，兩套詞並存、無 canonical 收斂。

（第三個發現 `createLabel` 已降 AUTO：SelectMenu 是內部元件、不對外，改名不影響任何外部消費者。）

### 【選項】

**選項 A — 硬改名、不留舊名**（對齊我方 Tag onRemove 先例）
- `onClear` → `onClearSelection`；DescriptionList / ButtonGroup 的 `direction` → `orientation`
- 前置動作：先 `rg` 掃 apps/ 確認外部消費者 = 0（同 Tag 先例的受控破壞判準）
- tradeoff：命名一次乾淨、與世界級 + 我方 canonical 完全對齊、無雙 API 殘留；但若有外部 app 用到即編譯錯（故需先掃 = 0）

**選項 B — 改名 + 留 deprecated alias**（過渡雙軌）
- 新名為 canonical，舊名標 `@deprecated` 仍可用、console warn 引導，下個 major 移除
- tradeoff：向後相容、消費者可漸進遷移；但暫時雙 API surface、型別/文件短期並存（與我方 pre-1.0「乾淨先例」不一致）

**選項 C — 維持現狀 + 補 spec 例外**
- 保留 `onClear` / `direction`，在 spec 記載例外
- tradeoff：零破壞；但永久保留兩套不一致命名，違反一致設計語言（mindset #1），每個新元件都要重新面對「該用哪個」

### 【推薦】選項 A（硬改名、無 alias，前置 `rg apps/ = 0`）
- **為何**：
  - **我方已有乾淨先例**（M23 優先）：Tag `onDismiss→onRemove`（git 74512a11）user 拍板走的就是「硬改名無 alias，pre-1.0 乾淨先例」，本題同構，沿用一致。
  - **世界級一致指向 `orientation`**：ARIA `aria-orientation` 用 horizontal/vertical、Radix/MUI/React Aria/Chakra 軸線都用 orientation；MUI RFC #33770 明確把 orientation 留給軸線、direction 留給 flow/LTR-RTL。我方 direction 的值正是 horizontal/vertical → 應為 orientation。
  - **onClear 我方 canonical 早已拍板** = 欄位清空，BulkActionBar 借用屬違規，改名是回歸既定 canonical。
- **必涵蓋範圍**：direction→orientation 要**同時改 DescriptionList 與 ButtonGroup**（不能只改 DescriptionList——原 codex 發現漏了 ButtonGroup，SSOT-check 已補正），並在 props-naming.md 新增一條「軸線用 orientation、flow/LTR-RTL 才用 direction」的命名 canonical。
- **若掃出有外部 consumer** → 退回選項 B（該 prop 加 deprecated alias 過渡），其餘無 consumer 者仍走 A。

### 【SSOT 理由】
這是「**改 canonical 語意 + 新增 canonical**」的公開 API/UX 增刪改：
- `onClear` 更名動**已發佈的公開 prop 契約**（BulkActionBar 在 root barrel，index.ts:69）。
- `direction→orientation` 不只改 2 個公開元件的 prop 名，還要在 **props-naming.md 新增一條命名 canonical**（目前無此軸，DS 因此分裂）。
- 命中「改 canonical 語意 + 新增 API/命名 canonical」——需 user 拍板。

---

## 附:個別 finding 歸屬

| id | fileLine | 歸屬 | 一句話 |
|---|---|---|---|
| d14i6 | bulk-action-bar.tsx:44 | **ASK**（併入本卡） | onClear 清 selection 違反 props-naming.md:14 canonical；改名動公開 API |
| d14i7 | select-menu.tsx:83 / calendar.tsx:110 | **AUTO** | SelectMenu isInternal 未對外，createLabel→formatCreateLabel 為內部重構零消費者影響 |
| d14i8 | description-list.tsx:33,49 / button-group.tsx:33 | **ASK**（併入本卡） | direction vs orientation 無 canonical、DS 分裂;統一需新 canonical + 改 2 公開元件 |
