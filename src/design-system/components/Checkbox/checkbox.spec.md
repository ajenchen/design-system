---
component: Checkbox
family: 4
variants: {}
sizes:
  sm:
    when: "form field-height 28 / compact chrome / dialog / panel context"
  md:
    when: "default general UI"
  lg:
    when: "touch / prominent CTA / stakeholder-facing surface"
traits:
  - isSelectionMulti
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Checkbox 設計原則

(Radio 共用本規格,詳見 `../RadioGroup/radio-group.spec.md`;本文件通用於兩者視覺與行為,名稱保留 Checkbox 為主體)

## 定位

Checkbox 和 Radio 是**表單內的選擇控件**，視覺語言完全一致，差異只有形狀和語意。兩者都綁在 form state、隨 submit 才生效（非即時套用——這是與 Switch 的根本差異，見下「與 Switch 的分界」）。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：Checkbox 基於 Radix Checkbox、Radio 基於 Radix RadioGroup（皆 shadcn 包裝 + 橋接 DS token）。

| | Checkbox | Radio |
|---|---|---|
| 形狀 | `rounded-md`（方） | `rounded-full`（圓） |
| 指示器 | Check icon | Filled dot |
| 語意 | 獨立 toggle（多選） | 互斥選擇（單選，必須在 RadioGroup 內） |

---

## 何時用 Checkbox

- **表單多選**：通知類型、權限授予、標籤群組
- **單一同意**：服務條款、隱私政策、訂閱行銷訊息（勾選才送出表單）
- **indeterminate 半選**：階層式表格的「全選」checkbox 反映部分子項已選
- **部分綁定的布林欄位**：form 裡的 is_public / is_featured（**但若是即時套用 → 用 Switch**）

## 何時用 Radio

- **表單單選且 2-5 個選項全部可見**：付款方式、訂閱方案、權限角色、票種
- **選項需要描述文字**（法律條款、方案比較、feature list）
- **決策節點**（使用者需要對比評估才能選）

**Radio vs Select 的分界詳見 `../Select/select.spec.md`「與 RadioGroup 的分界」**（SSOT 在 Select spec）。

## 何時不用（Checkbox / Radio 皆不適合）

| 場景 | 改用 | 原因 |
|------|------|------|
| 布林且即時套用（bluetooth、notification enable）| `Switch` | 見下「與 Switch 的分界」 |
| 單選但 6+ 選項 / 空間受限 | `Select` | Radio 全可見會佔滿頁面 |
| 多選但 6+ 選項 / 空間受限 | `Combobox` | Checkbox stack 全可見會佔滿頁面 |
| 階層結構（部門 / 資料夾）| `TreeView` | Checkbox 是平面選項 |
| 純視覺切換（側欄收合）| `Button pressed` | 切換狀態屬於介面行為，不是 form value |

---

## 與 Switch 的分界

兩者都是布林 on/off，常被誤用互換。判斷**不是視覺形狀**，而是以下三個角度——**任何一個明確傾向哪邊就選哪邊**：

### 1. 套用時機

- **Checkbox**：值隨 form submit 才套用。使用者勾選 → 按「儲存」→ 生效。中途可反悔
- **Switch**：值即時套用。使用者切換 → 立刻生效（呼叫 API / 改 URL / 觸發副作用）。沒有「取消」

### 2. 心智模型

- **Checkbox**：選擇 / 同意——「我選這個項目」、「我同意這個條件」。與書面表單類比
- **Switch**：開啟 / 關閉——「這個功能我要開」、「這個設定我要關」。與物理開關（牆上 light switch、iPhone settings 開關）類比

### 3. 結果可逆性的即時感

- **Checkbox**：勾選不代表生效——送出前可反悔。視覺語言強調「尚未確定」
- **Switch**：切換即結果——使用者按下那刻就改變系統狀態。視覺語言強調「現在是這樣」

### Fallback heuristic

- 在 form 裡、旁邊有 submit button / cancel button → **Checkbox**
- 獨立的 inline control、旁邊沒有 submit 流程 → **Switch**

### 情境對照表

| 場景 | 選哪個 | 原因 |
|------|-------|------|
| 我同意服務條款 | Checkbox | 隨 form submit 才成立 |
| 通知類型勾選（email / SMS / push）| Checkbox | form 設定，按儲存才套用 |
| Bluetooth on/off | Switch | 立刻開 / 關，不經 submit |
| Wi-Fi on/off | Switch | 立刻生效 |
| Dark mode 切換 | Switch | 即時套用 |
| Push 通知開關（settings 頁）| Switch | 立刻生效 |
| 訂閱行銷訊息 | Checkbox | form 內，按儲存才套用 |
| is_public / is_featured（編輯表單）| Checkbox | form field，送出才生效 |
| is_public（admin 即時切換）| Switch | 切換立刻套用 |

**本節是 Checkbox vs Switch 的 SSOT**，未來 Switch 建立 spec 時用一行 pointer 指回本節。

---

## 尺寸

三種尺寸（sm/md = 16px、lg = 20px），對齊 icon 系統。sm 和 md 視覺相同，純粹是命名 mapping 讓消費者直接傳同一個 size。

| Size | 控件尺寸 | 內部 icon | 配對 field |
|------|---------|----------|-----------|
| sm | 16px | 12px | field sm |
| md | 16px | 12px | field md |
| lg | 20px | 16px | field lg |

### 為什麼不完全對齊 `--field-height-*`

- **現況**:控件 sm=16 / md=16 / lg=20px(不等於 `--field-height-sm/md/lg` = 28/32/36px)
- **Rationale**:Checkbox 控件是**選擇指示器**(indicator),不是容器;field-height 是「可編輯 control 的容器高度」,indicator 視覺上要明顯小於容器,才符合「選項前有個小方框」的心智模型。控件本體走 icon tier(sm/md=16, lg=20),行高對齊透過 SelectionItem 的 `py = (field-height - 1lh) / 2` 保證(控件垂直置中於 1lh 容器)
- **世界級對照**:Material 3 Checkbox = 18px touch target 內的 18px container / Ant Design Checkbox = 16px 控件 / Polaris Checkbox = 16px——全部獨立於 field-height,控件 icon 與 field 分離是共識

---

## Label 對齊

Checkbox/Radio 不內建 label。Label 組合使用 `SelectionItem` 元件。

對齊機制：
1. 外層 `<div>` 設 `text-body` / `text-body-lg`（建立 line-height context）
2. 控件包在 `h-[1lh]` 的容器內（容器高度 = 一行文字高度）
3. `flex items-center`（控件在文字行高內垂直置中）
4. 外層 `flex items-start`（多行時控件對齊第一行）

`1lh` 在 `<div>` 上正常繼承，改字體自動重算。

---

## SelectionItem 佈局

垂直排列和水平排列共用 `SelectionItem`。

| | 垂直 | 水平 |
|---|---|---|
| Item 間距 | 0（padding 處理） | 24px（gap-6） |
| Item padding | `py = (field-height - 1lh) / 2` | 同左 |
| Label ↔ Description | 2px（`--item-gap-label-desc-reading` / `-reading-lg`,size-aware） | 同左 |
| 單行高度 | = field-height（對齊 Input） | 同左 |
| 多行高度 | padding 不變，自然撐高 | — |

---

## Clamp 政策(Label / Description 行數)

| Prop | 預設 | 理由 |
|---|---|---|
| `labelMaxLines` | `'none'`(∞) | Form 欄位的選項標籤可能很長,絕不可截斷 |
| `descMaxLines` | `'none'`(∞) | Form 欄位的補充說明、條款、隱私聲明必須完整呈現 |

**為什麼預設不截斷?**

Checkbox / Radio 在 form 內承載的常常是:
- **法律條款**(「我同意服務條款 + 隱私政策...」)
- **隱私聲明**(「允許 Cookie 用於...」)
- **複雜條件描述**(「啟用此功能會...」)

**任何截斷都是違法或誤導**——使用者必須完整看到他正在同意什麼。MenuItem 的「掃視優先」不適用,SelectionItem 的核心訴求是「**完整閱讀後同意**」。

### Per-instance override

若 consumer 有合理理由(例如 settings 頁的選項列表想截斷過長 label 維持掃視節奏),可以顯式覆寫:

```tsx
<SelectionItem labelMaxLines={1} descMaxLines={2} ... />
```

**注意:不能傳 `undefined` 表達「不截」**——React 的 destructure default 會把 undefined 當「沒傳」、fallback 到預設值。要明確表達「不截」傳 `'none'`(雖然語意等同預設,但更明確)。

### 為什麼不像 MenuItem 強制截斷?

| | MenuItem | SelectionItem |
|---|---|---|
| 使用情境 | 浮層選單,挑一個 | Form 內,**同意**或**選擇**內容本身 |
| 內容性質 | 選項名稱(短) | 條款 / 聲明 / 條件描述(可長) |
| 截斷後果 | 失去 context,但可重開選單看完 | **法律或道德問題**(同意了沒看到的內容) |
| 預設政策 | label / desc 都 `1`(掃視優先) | label / desc 都 `'none'`(完整閱讀優先) |

---

## 狀態

### Checkbox

| 狀態 | 邊框 | 底色 | 指示器 |
|------|------|------|--------|
| unchecked | border | surface | 無 |
| checked | primary | primary | white check |
| indeterminate | primary | primary | white minus |
| hover unchecked | neutral-6 | surface | 無 |
| hover checked | primary-hover | primary-hover | white check |
| hover indeterminate | primary-hover | primary-hover | white minus |
| disabled unchecked | 無 | neutral-2 | 無 |
| disabled checked | 無 | neutral-2 | fg-disabled check |
| disabled indeterminate | 無 | neutral-2 | fg-disabled minus |

### Indeterminate（半選）

`checked="indeterminate"` 表示「部分子項被選中」。視覺上與 checked 相同（藍底白圖示），只是圖示從 Check 換成 Minus。

典型場景：SelectMenu 的「全選」checkbox——當部分選項被勾選時顯示 indeterminate。

Indeterminate 是由父層邏輯控制的狀態，Checkbox 本身不會自動進入 indeterminate——必須明確傳入 `checked="indeterminate"`。

### Radio

| 狀態 | 邊框 | 底色 | 指示器 |
|------|------|------|--------|
| unchecked | border | surface | 無 |
| checked | primary | surface | primary dot |
| hover unchecked | neutral-6 | surface | 無 |
| hover checked | primary-hover | surface | primary-hover dot |
| disabled unchecked | 無 | neutral-2 | 無 |
| disabled checked | 無 | neutral-2 | fg-disabled dot |

---

## 群組模式(CheckboxGroup)

**`<CheckboxGroup>`** 是多選 Checkbox 的 layout primitive,跟 `<Checkbox>` **同資料夾**(合併於 2026-04-21,原單獨 `CheckboxGroup/` folder 併入)。對齊 Ant Design `Checkbox.Group` / Chakra `CheckboxGroup` / Mantine `Checkbox.Group` 世界級:standalone + group 家族同資料夾。

### Canonical 鐵律:零外部 gap

**垂直 CheckboxGroup item 之間沒有外部 gap**。間距完全靠每個 Checkbox 內部的 SelectionItem `py = (field-height - 1lh) / 2` 公式生成 — 單行高度對齊 field-height,多 row stacked 時 row-to-row 自然有 py × 2 的呼吸空間。

**禁止**外層加 `gap-y-*` / `space-y-*` / margin → double padding,違反 canonical。

### 為什麼 zero gap 也好看

SelectionItem py 公式保證:
1. 單行 checkbox 高度 = field-height(對齊 Input 高度,row align)
2. 多行堆疊時相鄰 row 的 py 各自擴散 = 2×py 真實視覺呼吸空間
3. Density 切換時 py 自動跟 field-height 縮放,間距等比例變化

外加 gap → double-padding 視覺斷裂。

### 世界級對照

- **Atlassian / Radix**:row 間距由 item 自身 py 擁有,group 無 gap
- **Ant Design / Chakra**:依賴 Checkbox 自帶 line-height,group 無 spacing 或預設 0
- **流派:row 高度定義 gap,不加外部 gap** — 本 DS 採此

### CheckboxGroupContext(隔離 fieldCtx)

Group 內的 Checkbox 透過 `CheckboxGroupContext` 知道自己在 group 裡:
- `insideGroup && insideField` → 保留 label(每個 Checkbox 是 group 內選項)
- `insideField && !insideGroup` → 抑制 label(let FieldLabel 接管,solo-in-Field 場景)

每個 Checkbox 自己的 `id` 透過 `useId` 生成(不共用 fieldCtx.id)→ 修了 2026-04-21「點擊只 toggle 第一個」bug。

### Orientation

| 值 | Layout | 典型場景 |
|---|---|---|
| `vertical`(預設) | `grid`(無 gap,靠 SelectionItem py) | 篩選條件、偏好設定、權限組 |
| `horizontal` | `flex flex-wrap gap-4` | 短 label 並排(Email / Push / SMS) |

Horizontal 需 `gap-4` 因 row 的 py 不擴散到左右。

### Field 整合

`<CheckboxGroup>` 有 `fieldLayout: 'block'` 屬性(跟 RadioGroup 一致),在 `<Field orientation="horizontal">` 內 control area 自動切 `items-start` + padding-top 對齊第一個 item 的 label 第一行。

### 用法範例

```tsx
<CheckboxGroup>
  <Checkbox label="待處理" defaultChecked />
  <Checkbox label="進行中" defaultChecked />
  <Checkbox label="已完成" />
</CheckboxGroup>

<Field orientation="horizontal">
  <FieldLabel>通知方式</FieldLabel>
  <CheckboxGroup orientation="horizontal">
    <Checkbox label="Email" />
    <Checkbox label="Push" />
    <Checkbox label="SMS" />
  </CheckboxGroup>
</Field>
```

---

## 禁止事項

- ❌ Radio 不可單獨使用——必須在 RadioGroup 內
- ❌ Checkbox 不內建 label——label 組合用 SelectionItem
- ❌ 垂直 CheckboxGroup 加 `gap-y-*` / `space-y-*`——違反 zero-gap canonical
- ❌ 多選一不用 Checkbox——用 Radio 或 Select
- ❌ 即時套用的布林開關用 Checkbox——用 Switch（見「與 Switch 的分界」）
- ❌ Form 內同意條款用 Switch——條款是「勾選送出才成立」的書面行為，用 Checkbox

---

## 相關

- `../Switch/switch.spec.md` — 即時套用的布林開關（Checkbox vs Switch SSOT 在本 spec「與 Switch 的分界」）
- `../Select/select.spec.md` — 單選下拉（Radio vs Select SSOT 在 Select spec）
- `../Combobox/combobox.spec.md` — 多選下拉（Checkbox stack vs Combobox 對照在 Combobox spec）
- `../RadioGroup/radio-group.spec.md` — Radio 的 group 容器 + 結構對稱 reciprocal
- `../SelectionControl/selection-item.spec.md` — Checkbox / Radio 共用的 SelectionItem 佈局 primitive（本 spec 的 Clamp 政策為其 SSOT）
- `../Field/field-controls.spec.md` — Field Control 共用規則

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `menu-item.spec.md`
- `segmented-control.spec.md`
