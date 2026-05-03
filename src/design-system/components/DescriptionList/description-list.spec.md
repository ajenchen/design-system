---
component: DescriptionList
family: null
variants: {}
sizes: {}
traits:
  - isStructural
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# DescriptionList 設計原則

唯讀 label + value 展示元件，用於呈現結構化的屬性資訊。HTML 語義為 `dl` + `dt` + `dd`，對齊 Atlassian、Shopify Polaris 慣例。

## 定位

- **是**：唯讀資訊展示（profile card 的欄位、detail panel 的屬性列表）
- **不是**：表單輸入——需要編輯的 label + value 用 Field 系統（Input / Select 等）

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **Profile / detail panel 的屬性列表**：使用者資料（Email / Phone / Role / Created at）
- **NameCard 的 info fields**：HoverCard 內的次要資訊展示
- **固定資訊展示**：產品規格、訂單明細、設定值（唯讀）
- **HTML 語義為 `dl` + `dt` + `dd`**：對 screen reader 明確表達「屬性-值」關係

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 需要編輯的 label + value | `Field` 系統（`Input` / `Select` / `DatePicker` 等）| DescriptionList 是唯讀，編輯用 Field |
| Table 式資料展示（多 row 相同結構）| `DataTable` | DescriptionList 是單實體屬性，Table 是多筆同結構 |
| 單一 label + value（只有一組）| 自訂 layout | DescriptionList 設計為多組屬性；單組殺雞用牛刀 |
| 需要 cell 編輯的表格 | `DataTable` + inline edit | DescriptionList 無 cell 編輯 |

## 結構

- `DescriptionList`：外層 `dl`，vertical 模式為 CSS grid、horizontal 模式為 flex column
- `DescriptionItem`：一組 `dt`（label）+ `dd`（value），透過 context 知道當前 direction 自動切 layout

## Direction(2026-04-20 新增)

| direction | Layout | 典型情境 | 世界級對照 |
|-----------|--------|---------|-----------|
| `vertical`(預設)| label 在上 / value 在下 | NameCard detail、sidebar 長 value(地址、bio) | Atlassian DescriptionList、Polaris DescriptionList |
| `horizontal` | label 左 / value 右對齊 | **file info panel / 訂單詳情 / settings summary**(短 value 的 metadata 列) | Google Drive file info、Notion file panel、iOS Settings |

**判斷法**:
- value 預期長(多字、可能換行)→ vertical(讓 value 佔滿寬)
- value 短(檔名、日期、大小、類型)+ 強調 label↔value 對應 → horizontal

### divided(horizontal 專用)

每個 item 下方加 `border-b border-divider`,rows 之間有視覺格線。**長列表 / key 長度不一**時建議開;短列表(< 4 rows)或單一相似長度 keys 不需要。

```tsx
// 短 metadata 列,無需 divider
<DescriptionList direction="horizontal">
  <DescriptionItem label="建立">2026-04-20</DescriptionItem>
  <DescriptionItem label="修改">2026-04-20</DescriptionItem>
</DescriptionList>

// 檔案資訊 — 多 row + key 長度不一 → divided 對齊格線
<DescriptionList direction="horizontal" divided>
  <DescriptionItem label="檔名">Q1 財報分析.xlsx</DescriptionItem>
  <DescriptionItem label="類型">application/vnd.xlsx</DescriptionItem>
  <DescriptionItem label="大小">1.2 MB</DescriptionItem>
</DescriptionList>
```

## Typography（閱讀模式）

層級靠色彩區分，不靠字體大小：

- **label (dt)**：`text-body`（14px）`text-fg-secondary`（neutral-8）
- **value (dd)**：`text-body`（14px）`text-foreground`（neutral-9）
- 兩者行高均為 1.5（閱讀模式）

## 間距

### Vertical direction

- **label → value**(同 item 內):`--item-gap-label-desc-reading` token(2px)——極小間距,視覺上 label 與 value 緊密配對
- **items 之間垂直 gap**:`gap-y-[var(--layout-space-tight)]`——density-aware,跟隨系統密度設定
- **columns 之間水平 gap**:`gap-x-4`(16px)

### Horizontal direction(divided=false)

- **items 之間垂直 gap**:`mb-[var(--layout-space-tight)]` per item(last:mb-0)——density-aware,等同 vertical 的 items gap
- label ↔ value 水平距離:`justify-between` + `gap-4`(最小 16px,content 之間拉開)

### Horizontal direction(divided=true)

- 每個 item `py-[var(--layout-space-tight)]`(density-aware,形成 cell-like row 高度)
- 每個 item 底部 `border-b border-divider`,`last:border-b-0`——row 之間視覺格線,key 長度不一時易於對齊掃描
- **何時開 divided**:長列表(≥ 4 rows)/ key 長度差異大(短 vs 長 label 並排易顯亂) → divided 可對齊格線;短列表(< 4 rows)且 key 長度相近 → 不需 divided(border 反而噪音)
- **世界級對照**:Google Drive 詳細資訊面板 / Notion 檔案屬性 / iOS Settings list rows,divided 是 file info / settings 的 canonical 呈現

## Props

### `direction`:vertical / horizontal

見上「Direction」段。

### `divided`:horizontal 專用 row divider

見上「divided」段。

### `cols`:grid 欄數(vertical 才生效)

| 值 | 用途 |
|---|---|
| `1`(預設)| 垂直堆疊,適合窄容器(NameCard、sidebar detail)|
| `2` | 兩欄並排,適合中等寬度(NameCard info fields)|
| `3` | 三欄,適合寬容器(detail panel)|

Horizontal 模式永遠單欄(label + value 排列就是橫向,不再有欄概念)。

## Section heading 模式(consumer pattern)

consumer 要在 DL 上方加 section heading(「基本資料」/「團隊資訊」等)時,**heading → first-item 的 gap 必須等於 item → item 的 gap**(都走 `var(--layout-space-tight)` density-aware token):

```tsx
<div>
  <div className="text-body font-medium mb-[var(--layout-space-tight)]">基本資料</div>
  <DescriptionList>
    <DescriptionItem label="姓名">Ada Chen</DescriptionItem>
    <DescriptionItem label="Email">ada.chen@example.com</DescriptionItem>
  </DescriptionList>
</div>
```

**為什麼相等**(Gestalt proximity canonical):heading 與下方 items 的關係是「擁有 / 歸屬」—— 相同距離讓視覺上 heading 與 items 形成一個群組。若拉大 gap(例 `mb-4`),heading 看似與 items「分離」,失去歸屬感;若縮小 gap(例 `mb-0`),heading 與 items 黏在一起無呼吸。

**世界級對照**:iOS Settings / Notion properties / Ant Descriptions / Polaris Card.Section — heading 和 items 之間的 gap 皆與 item-item gap 相等(或近似)。

**Heading typography 建議**:`text-body font-medium text-foreground`(同 item label size,靠 weight 區分層級),不用加粗 / 放大 / 換色——讓 heading 是「標籤」不是「標題」。

---

## vs Field 系統

| | DescriptionList | Field |
|---|---|---|
| 用途 | 唯讀展示 | 表單輸入（含 read-only mode） |
| 語義 | `dl/dt/dd` | `label` + input control |
| 互動 | 無 | 輸入、驗證、提交 |
| 密度感知 | 垂直 gap 跟隨 layout-space | 高度、padding 跟隨 ui-size |

---

## 禁止事項

- ❌ 不要把 DescriptionList 拿來做 Form field label——表單需要編輯的 label + control 對應關係由 `Field`(含 `FieldLabel`)承載;DL 是唯讀 `<dl>` 語意,沒有 `<label for>` 對 input 的綁定
- ❌ 不要在同一資料卡內混用 Field 和 DescriptionList——同一 section 的 label / value 語意必須一致,否則 screen reader 會讀出混淆的 term/description 對話。要編輯用全 Field,要唯讀全 DL
- ❌ 不要用 DescriptionList 展示多筆同結構資料(使用者清單、訂單清單)——DL 是單實體屬性列表,多筆用 `DataTable`
- ❌ 不要在 `<dt>` / `<dd>` 內嵌互動元件(Button / Input)——DL 是 `<dl>` 唯讀語意,塞互動會破壞 SR 敘事流;需要互動改用 Field 或 action row
- ❌ 不要覆寫 label / value typography token(例改 `<dt>` 成 `text-heading-sm`)——DL 層級靠色彩區分不靠 size,改 size 會破壞「屬性-值」對應感

---

## 無障礙

- **語意 HTML**:外層 `<dl>`,每組內 `<dt>` 為 term、`<dd>` 為 description——screen reader 會讀成「term X, description Y」對話,明確表達屬性-值關係
- **DT / DD 配對**:每個 `<dt>` 必須有對應的 `<dd>`(不可孤立),否則 SR 敘事會中斷;元件內建一組 `DescriptionItem` 強制配對,不分開暴露 `<dt>` / `<dd>` primitive
- **空值呈現**:value 空時以 `—` 占位(由 consumer 填入或於 DL 內 normalize),`text-fg-muted` 降低視覺重量;SR 會讀出「長破折號」,比空 `<dd>` 更明確
- **多欄 `cols > 1`**:視覺為 grid 欄位,但 DOM 順序為 item 順序——SR 仍依 DOM 敘事(term1 → desc1 → term2 → desc2),不依視覺欄位;設計時確保 DOM 順序符合語意分組
- **長值換行**:value 內長字串(URL / ID)以 `break-words` 處理,避免撐破 grid;不強制單行 truncate,長內容保留可讀完整性
- **列表識別**:預設 `<dl>` 有部分瀏覽器 SR 不視為 list,若需明確 list 語意,DL 根容器可搭配 `role="list"` + `<div role="listitem">`(目前預設不加,保留標準 `<dl>` 語意,consumer 可自行加 role 覆蓋)

---

## 為何無 Inspector / ColorMatrix / SizeMatrix

DescriptionList 是**唯讀 label / value 資料呈現**(非互動 / 非 variant 驅動):

- **無 Inspector**:DL 的決策維度是 columns(單欄 / 雙欄 / 多欄)已在 `ColsMatrix` 覆蓋。互動 Inspector 無進一步 prop(value 呈現由資料決定,非 prop 切換)。
- **無 ColorMatrix**:DL 固定 semantic token(label `text-fg-secondary` / value `text-foreground`),無自己的色彩變體,dark mode 由 semantic token 自動切換。加 color variant 不符語意(DL 是資訊展示,非狀態載體)。
- **無 SizeMatrix**:DL 無 size prop——垂直間距隨 `layout-space` token 感知 density(見「間距」段),但 label / value typography 走 reading mode 固定 tier,不提供 sm / md / lg 變體。不同 density 由 token 自動處理,非 prop 切換。

對應 anatomy story:保留 `Overview` + `ColsMatrix`(元件特有 1 / 2 / auto 欄對照) + `StateBehavior`(空值 `—` / 長值 / 多行)。

---

## 相關

- `../Field/field.spec.md` — 表單輸入（需要編輯的對應元件）
- `../DataTable/data-table.spec.md` — 多筆同結構資料（table 對應）
- `../NameCard/name-card.spec.md` — NameCard info fields 的消費者
- `../../tokens/layoutSpace/layoutSpace.spec.md` — 垂直 gap 的 density 感知 token

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `item-anatomy.spec.md`
