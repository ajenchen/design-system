# Input 設計原則

## 定位

Input 是**純文字**的輸入與顯示元件。格式化邏輯為 identity（value → value）——使用者打什麼就存什麼、顯示什麼。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 Input 特有的原則。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## 何時用

- **純文字資料**：姓名、標題、搜尋字串、slug、ID、隨意 label
- **email / URL / password** 等特殊但仍屬「文字」的資料（搭配 `type="email" / "url" / "password"` + 適合的 `startIcon`）
- **格式化邏輯是 identity** 的場景——value → value，不需要千分位、不需要 locale、不需要 picker
- **單行** 輸入（多行用 Textarea）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 數字 / 金額 / 百分比 | `NumberInput` | 需要千分位、prefix/suffix、locale、precision |
| 日期 / 日期時間 | `DatePicker` | 需要原生 picker、`Intl.DateTimeFormat` 顯示 |
| URL + 預覽 / open in new tab | `LinkInput` | 需要 URL 解析、favicon、外開按鈕 |
| 多行文字（description、note、備註）| `Textarea` | Input 是單行 |
| 密碼且需複雜性檢查 | `Input` + 外掛驗證 | Input 本身只負責輸入，驗證是 form 層 |

---

## startIcon 的使用場景

startIcon 用於輔助使用者理解「這個 input 是做什麼的」，不是描述 value 的類型。

| 適合 | 範例 |
|------|------|
| 搜尋 | `Search` |
| Email | `Mail` |
| 密碼 | `Lock` |
| URL | `Globe` |

startIcon 不隨 value 變化——它描述的是 input 的用途，不是 value 的狀態。

---

## endAction 的常見模式

使用宣告式 API（`InlineActionConfig`），Field 自動根據 size 渲染：

```tsx
// 顯示/隱藏密碼
<Input
  endAction={{ icon: showPwd ? EyeOff : Eye, label: showPwd ? '隱藏密碼' : '顯示密碼', onClick: () => setShowPwd(!showPwd) }}
/>

// 清除內容（有值時才顯示）
<Input
  endAction={query ? { icon: X, label: '清除搜尋', onClick: () => setQuery('') } : undefined}
/>
```

| 模式 | Icon | 行為 |
|------|------|------|
| 顯示/隱藏密碼 | `Eye` / `EyeOff` | toggle `type="password"` ↔ `type="text"` |
| 清除內容 | `X` | 清空 value，有值時出現、清空後消失 |

清除按鈕消失後不佔位——input 自然擴展。

---

## Display

`InputDisplay` 是 identity 顯示：
- 有值：原樣輸出
- null / undefined / 空字串：`—`（em dash），`text-fg-muted`

---

## 禁止事項

- ❌ startIcon 不可隨 value 變化——它描述用途，不是狀態
- ❌ 不可用 Input 顯示需要格式化的資料（數字、日期、貨幣）——用對應的 Field 元件

---

## Mode / Validation / a11y

詳見 `../Field/field-controls.spec.md`(Mode / Validation)+ `../Field/form-validation.spec.md`(驗證時機)。

---

## Variant(visual chrome,正交於 mode)

Input 有兩個 visual chrome variant,**獨立於 mode**(mode 是 state,variant 是 chrome look):

| Variant | 視覺 | 適用場景 | 世界級對照 |
|---------|------|---------|-----------|
| `'default'`(預設) | bg-surface + 明顯 border + hover/focus 回饋 | 表單 / Field 內嵌 / 標準 edit UI | Material Input / Ant Input default |
| `'bare'` | 透明 chrome,hover / focus 才出現 border;保留 padding / typography / height | **Toolbar inline editing**(FileViewer zoom input / chart config / rich text toolbar number input / Sidebar inline rename) | VS Code settings input / Figma toolbar number / Notion prop input |

**判斷法**:Input 放在表單或 Field 內 → `default`;放在 Toolbar chrome 或 page-body inline → `bare`。

**`bare` 使用情境的 canonical 要求**:
- 外層 chrome 必須已提供「這是可編輯」的 affordance(Toolbar 的 icon / prop label / row structure);否則 user 看不到 input chrome 找不到可編輯位置
- 保留 DS field-height(`h-field-sm/md/lg`)、typography、icon tier、error 視覺——**bare 只動 chrome 不動 sizing**

**禁止**:
- ❌ 在**表單** context 用 `bare`——表單需要明確的 field chrome 邀請輸入,bare 會失去 affordance
- ❌ 拿 `bare` 來當「空白 div 替代品」——variant 不是拿掉視覺的工具,而是特定 chrome context 的 canonical

---

## Auto-width(AR46,2026-04-21)

`autoWidth` prop:Input 寬度自動等於「內容寬(value / placeholder)+ startIcon + endAction + padding」,基於 CSS `field-sizing: content`(Chrome 123+ / Safari 17.4+)。

| 屬性 | 行為 |
|------|------|
| `autoWidth={false}`(預設)| 走 Field canonical(w-full 或 Field wrapper 規則),寬度固定、跟欄位對齊 |
| `autoWidth={true}` | wrapper 改 `inline-flex w-auto`;input 改 `field-sizing:content w-auto min-w-0`,寬度隨 value 文字變化 |

**使用情境**:
- **Inline edit**:FileViewer `ZoomInput`(輸入「100%」縮到三位數寬)、Figma toolbar number input、VS Code setting row
- **Tag / Chip rename**:選中 chip 進入 inline edit,寬度跟 chip 內容保持視覺一致
- **Spreadsheet-like cells**:內容寬度自動跟字數走

**禁止**:
- ❌ **表單 Field 內**——Field 欄位必須欄寬對齊,寬度隨值跳動會破壞 grid layout
- ❌ **搭配 `variant="default"` 放在主表單區**——auto-width 預設搭 `variant="bare"`(toolbar inline 語意),default chrome 自動對齊 Field canonical

**世界級對照**:VS Code settings inline input 用同 pattern;Notion property field、Airtable cell edit 皆 auto-size。

---

## 相關

- `../NumberInput/number-input.spec.md` — 數值資料
- `../DatePicker/date-picker.spec.md` — 日期
- `../LinkInput/link-input.spec.md` — URL + 預覽 / 外開
- `../Textarea/textarea.spec.md` — 多行文字
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `time-picker.spec.md`
