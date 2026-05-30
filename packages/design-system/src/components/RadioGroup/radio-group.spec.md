---
component: RadioGroup
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
  - hasSizes
  - hasInteractiveStates
  - isSelectionMulti
benchmark:
  - Radix RadioGroup primitive: github.com/radix-ui/primitives/tree/main/packages/react/radio-group
  - Ant Design Radio: github.com/ant-design/ant-design/tree/master/components/radio
  - MUI Radio: github.com/mui/material-ui/tree/master/packages/mui-material/src/Radio
  - Polaris RadioButton: github.com/Shopify/polaris/tree/main/polaris-react/src/components/RadioButton
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# RadioGroup 設計原則

## 定位

RadioGroup 是**互斥單選且全選項可見**的表單控件——從 2-5 個選項中挑恰好一個，每個選項一行獨立呈現（支援 label + description + 完整閱讀）。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：基於 Radix RadioGroup（shadcn 包裝）+ 橋接 DS token。

共用規則見 `../Checkbox/checkbox.spec.md`（Checkbox & RadioGroup 設計原則，含 SelectionItem 佈局與 clamp 政策）。

---

## 何時用

- **決策節點的互斥單選**：付款方式、訂閱方案、票種、權限角色——使用者需要**對比評估**
- **選項需要描述文字**：法律條款、方案價格、feature 比較（Radio 的 description 支援完整閱讀，不截斷）
- **2-5 個選項且全部可見**：讓使用者一眼看完所有選項，不需要點兩次（Select）
- **空間允許 O(n) 垂直展開**：form 內、dialog 內、setting section 內

## 何時不用

**與 Select 的分界詳見 `../Select/select.spec.md` 的「與 RadioGroup 的分界」**（SSOT）——Select 是 Select vs RadioGroup 判斷的 owner。簡言：RadioGroup 用於「使用者需對比評估的決策節點」，Select 用於「label 自帶語意、空間受限、使用者熟悉選項」。

| 場景 | 改用 | 原因 |
|------|------|------|
| 空間受限 / 選項超過 5 個 | `Select` | RadioGroup 全可見，O(n) 垂直空間成本過高 |
| 2-5 個緊湊切換（toolbar / filter） | `SegmentedControl` | compact control，pill 尺寸融入 toolbar |
| 多選（可選多個）| `Checkbox` | Radio 是互斥單選，Checkbox 是獨立 toggle |
| 布林 on/off | `Switch`（即時）/ 單個 `Checkbox`（on-submit） | 布林不需要「選一個」的心智模型 |
| 大量選項需要搜尋 | `Select` + `searchable` | RadioGroup 不支援搜尋 |

---

## 與 Checkbox 的差異

視覺語言共用（見 Checkbox spec），差異僅在：

- **形狀**：`rounded-full`（Checkbox 是 `rounded-md`）
- **指示器**：filled dot（Checkbox 是 check / minus icon）
- **語意**：互斥單選（Checkbox 可多選）
- **`fieldLayout`**：`'block'`（放進 `<Field>` 時 Field 自動切 block 模式；Checkbox 沒有此 static 屬性，因為單個 Checkbox 是 inline primitive）

---

## 尺寸

共用 Checkbox 的 sm/md/lg 控件尺寸(sm/md=16px, lg=20px),詳見 `../Checkbox/checkbox.spec.md`「尺寸」。

### 為什麼不完全對齊 `--field-height-*`

- **現況**:控件 sm=16 / md=16 / lg=20px(不等於 `--field-height-sm/md/lg` = 28/32/36px)
- **Rationale**:Radio 與 Checkbox 視覺語言共用(只是形狀 round vs square),rationale 完全繼承 Checkbox——控件是選擇指示器(indicator)不是容器,走 icon tier(16/16/20),行高對齊透過 SelectionItem 的 `py = (field-height - 1lh) / 2` 保證
- **世界級對照**:Material 3 Radio = 20px / Ant Design Radio = 16px / Polaris RadioButton = 16px——全部獨立於 field-height,與 Checkbox 控件尺寸對齊 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## StateBehavior(RadioGroup 層級特有)

Item-level default / hover / active / checked / disabled **色彩**與 Checkbox 共用同一套 SelectionItem 規則,由 `ColorMatrix` story 承載;RadioGroup 的 `StateBehavior` story 展示**群組層級的互斥行為**(單選模型 / 個別 disabled / 整組 disabled),這是 Checkbox 沒有的維度。

---

## Mode / disabled / readonly / 驗證 / a11y

繼承 Field family,詳見 `../Field/field-controls.spec.md` + `../Field/form-validation.spec.md`。

---

## 禁止事項

- ❌ 單選卻用 Checkbox 群組模擬——selection model 不對,keyboard navigation 與 a11y 角色錯誤
- ❌ RadioGroup 沒有 group label(`<Field>` 的 label 或 `aria-labelledby`)——螢幕閱讀器無法念出這是哪組選項
- ❌ 巢狀 RadioGroup(radio 內包 radio)——互斥模型只適用單層,需要階層選擇改用樹狀 Select
- ❌ 選項數量超過 5 或空間受限時硬用 RadioGroup,不改 Select(見「何時不用」)

---

## 邊界案例

- **Disabled**:Group-level `disabled` 套用至所有 radio items;item-level `disabled` 單獨 disable 該選項。視覺繼承 SelectionItem SSOT(`text-fg-disabled` + 灰 radio circle + 不可點 + 鍵盤導覽自動 skip)。
- **Loading(async option fetch)**:async option list 載入時 consumer 應渲 `<Skeleton>` 對應 radio item count(常見 3-5 行 skeleton),而非空 RadioGroup;RadioGroup 自身不獨立 own loading prop。
- **Empty(no options)**:罕見場景。應由 consumer 條件性渲 `<Empty>` placeholder(「無可選項目」)取代空 RadioGroup,不渲 0-radio 空 group(SR 會讀「empty group」造成混淆)。
- **No value selected**:`value=null` 為合法 initial state(所有 radio 都 unchecked);Field validation 在 required + null 時觸發 error。
- **Dark mode / density**:走 SelectionItem semantic token 自動 adapt;垂直 gap 隨 layoutSpace token density-aware。

---

## 相關

- `../Checkbox/checkbox.spec.md` — 共用規則（SelectionItem 佈局 / clamp 政策 / 視覺語言）
- `../Select/select.spec.md` — 「與 RadioGroup 的分界」SSOT（Select vs RadioGroup 決策的 owner）
- `../SegmentedControl/segmented-control.spec.md` — compact 互斥切換的替代
- `../Switch/switch.spec.md` — 布林開關
- `../Field/field.spec.md` — RadioGroup 作為 Field control 時的 block layout 整合

## A11y 預設

**ARIA / Pattern**:繼承 Radix `radio-group` primitive a11y 預設(role / aria-* / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/radio-group#accessibility)。

**Keyboard 行為**:

- Tab — 進入 group
- ↑/↓ — 切 option
- Space — 選擇

**Focus**:Radix primitive 以 roving tabindex 管理群組內焦點(整組只佔一個 Tab 停留點,方向鍵在選項間移動);**非** focus trap——Tab 仍會離開群組、跳到下一個表單欄位。聚焦時顯示 visible ring(`outline: 2px solid var(--ring)` per design-system focus-visible canonical)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `selection-item.spec.md`
- `steps.spec.md`
