---
component: DropdownMenu
family: 1
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isOverlay
benchmark:
  - Radix DropdownMenu primitive: github.com/radix-ui/primitives/tree/main/packages/react/dropdown-menu
  - Ant Design Dropdown: github.com/ant-design/ant-design/tree/master/components/dropdown
  - Polaris ActionList: github.com/Shopify/polaris/tree/main/polaris-react/src/components/ActionList
---

# DropdownMenu 設計原則

## 定位

DropdownMenu 是按鈕觸發的**動作選單**——使用者從中選擇一個動作並立即執行。
基於 Radix DropdownMenu（shadcn 包裝），item 佈局消費 MenuItem primitive。

**Layout Family**：CLAUDE.md 4-Family Model **Family 1（Menu item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「Menu item layout」章節的 scanning-mode 規格。

### 與 SelectMenu 的區別

SelectMenu 是**選值**(選完後值留在 field 裡),DropdownMenu 是**執行**(選完後觸發動作,選單關閉)。判斷標準:「選完之後,畫面上是否需要保留選中狀態?」需要 → SelectMenu;不需要 → DropdownMenu。

心智模型:SelectMenu 的選單是 **field 的延伸**(使用者在「編輯欄位裡的值」,trigger 持續顯示當前值);DropdownMenu 的選單是**動作清單**(執行一次性動作後選單消失,畫面不留痕)。CheckboxItem / RadioItem 雖涉「選擇」,屬即時生效設定非選值(見「Item 類型」)。

---

## 何時用

- **次要動作集合**：卡片右上角 `⋮` 三點選單（複製、刪除、分享、匯出）
- **工具列的溢出動作**：ToolBar 放不下的次要操作集中在 more menu
- **即時生效的設定 toggle**：顯示 / 隱藏欄位、排序方式、主題切換
- **需要分群或子選單的動作清單**：export as PDF / CSV / JSON 這類多層結構

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 選值（選項留在 field 裡）| `Select` / `SelectMenu` | DropdownMenu 點完即關閉，不保留選中狀態 |
| 主要 CTA（儲存、送出）| `Button` | 主要動作應該直接可見，不該隱藏在選單裡 |
| 切換平行視圖 | `Tabs` / `SegmentedControl` | view 切換應該持續可見，不是 one-shot |
| 少於 3 個動作 | 直接放 Button | 2 個動作用 menu 是多餘的藏匿 |
| 複雜表單 / 多步驟流程 | `Dialog` / `Sheet` | menu item 是單次點擊動作，不承載流程 |

---

## 結構

```
DropdownMenu                    ← Radix Root，管理開關狀態
  DropdownMenuTrigger           ← 觸發按鈕（通常是 Button）
  DropdownMenuContent           ← 浮層容器，提供 size context
    DropdownMenuGroup           ← 邏輯群組容器（自動分隔相鄰 Group，見下）
      DropdownMenuItem          ← 基本動作項目
      DropdownMenuCheckboxItem  ← 可勾選的切換項目（如顯示/隱藏欄位）
    DropdownMenuRadioGroup      ← 單選群組容器
      DropdownMenuRadioItem     ← 單選項目（如排序方式）
    DropdownMenuSub             ← 子選單容器
      DropdownMenuSubTrigger    ← 子選單觸發項目（自動附加 ChevronRight）
      DropdownMenuSubContent    ← 子選單浮層
    DropdownMenuLabel           ← 群組標題（不可互動）
    DropdownMenuSeparator       ← 明確分隔線（consumer 手動放置）
    DropdownMenuShortcut        ← 鍵盤快捷鍵提示 child(composition escape-hatch;canonical 用 item `shortcut` prop)
```

**快捷鍵提示 API（兩條,擇一不混用）**：
- **Canonical:`<DropdownMenuItem shortcut="⌘C">`** prop —— 渲染進 MenuItem `endContent` 正規後綴 slot(跟 badge / endIcon 同槽,gap / 對齊一致)。**標準場景一律用 prop。**
- **Escape-hatch:`<DropdownMenuShortcut>` child** —— 對齊 shadcn DropdownMenuShortcut idiom,供需手動 compose children 的少數場景(用 `ml-auto` 塞 children,繞過 endContent slot)。
- 兩者**視覺統一**(`text-caption` + `tracking-shortcut` + `fg-muted`,與 CommandShortcut 一致);**同一 item 只用一種**(見「禁止事項」)。
- 為何不砍 child 只留 prop:`DropdownMenuShortcut` 是 npm published API(對齊 shadcn,fork repo 可能用),硬砍 = breaking;故保留為 escape-hatch,prop 為 canonical preferred。

### DropdownMenuGroup 的自動分隔

`DropdownMenuGroup` 對齊 `MenuGroup` 的 group separation 設計語言——相鄰的 Group 自動透過 `border-divider` 分隔，**consumer 不需要自己加 `DropdownMenuSeparator`**。

**設計語言**（跨 Menu-like 元件統一，SSOT 見 `../../patterns/element-anatomy/item-anatomy.spec.md`「Group auto-separation」）：
- 每個 group 上下各 **8px padding**
- 相鄰 group 之間用 **border-divider** 分隔
- 兩個 group 之間視覺 gap = 8（上一 bottom）+ 8（下一 top）= **16px + border**

**MenuGroup vs DropdownMenuGroup CSS 實作對照**（視覺結果 100% 等價，差別只是 padding 住在哪層）：

| | MenuGroup | DropdownMenuGroup |
|---|---|---|
| CSS | `py-2 [&+&]:border-t [&+&]:border-divider` | `[&+&]:mt-2 [&+&]:pt-2 [&+&]:border-t [&+&]:border-divider` |
| 邊界 padding 來源 | 每個 Group 自己的 py-2（Command.List 無 py） | Content 的 py-2（Group 不套 py-2 避免 double） |
| Group 間 gap | 8 + 8 = 16 + border | 0 + 8 + 8 = 16 + border |

**為什麼不直接套 `py-2`**：`DropdownMenuContent` 已有 `py-2` 提供 Content 邊界 padding（Radix 預期行為，移除會影響 trigger focus offset）。若 Group 再套 `py-2` 會 double padding。改用 `mt-2 pt-2` 只加在第二個 Group 起，視覺等價但不 double。

兩種分隔機制的選擇：
- **用 `DropdownMenuGroup` 包裝同類 items** → 自動分隔（零手動，跟 MenuGroup 理念一致）
- **用 `DropdownMenuSeparator` 明確插入** → 明確控制分隔位置（如群組內部的子分組、破壞性動作前的強調分隔）

---

## Item 類型

| 類型 | 用途 | 選中行為 |
|---|---|---|
| **Item** | 執行一次性動作（複製、刪除、開啟連結） | 執行後關閉選單 |
| **CheckboxItem** | 切換開關狀態（顯示/隱藏欄位） | 勾選/取消，選單保持開啟 |
| **RadioItem** | 從互斥選項中選一（排序方式） | 選中後選單保持開啟 |
| **SubTrigger** | 展開下一層選單 | 不執行動作，展開子選單 |
| **Label** | 群組標題，提供語義分類 | 不可互動 |
| **Separator** | 視覺分隔，劃分邏輯群組 | 不可互動 |

CheckboxItem 和 RadioItem 雖然涉及「選擇」，但它們控制的是**即時生效的設定**（toggle），不是「選一個值填回 field」。

---

## Item 佈局

遵循 item-layout 設計原則：

```
[prefix]  [label]  [suffix]
```

- prefix：由 `DropdownMenuItem` 的 `startIcon` prop 傳入，經 MenuItem 內部的 prefix 對齊容器（消費 item-anatomy 的 `itemPrefixAlignVariants`，`h-[1lh]` 對齊第一行 label）渲染。icon 跟 label 同色（foreground）
- label：文字內容，`flex-1`
- suffix：canonical 走 item prop（`shortcut` / `badge` / `endIcon` → MenuItem `endContent` 正規 slot）；`DropdownMenuShortcut` child 僅 escape-hatch（`ml-auto` 靠右，見「快捷鍵提示 API」段）。指示型 icon 用 `fg-muted`

padding 公式：`py = (field-height - 1lh) / 2`，單行時總高度等於同 size 的 Button / Input。

---

## Suffix 模式

| Pattern | 內部 gap | 內容 | 用途 |
|---|---|---|---|
| **獨立後綴** | `gap-2` (8px) | `[badge?] [endIcon?]` | 狀態指示（未讀數）、導覽提示（ExternalLink） |
| **子選單指示** | `gap-1` (4px) | `[value?] [badge?] [ChevronRight]` | 展開下一層，value 顯示目前狀態（如 "深色"） |

SubTrigger 的 ChevronRight 由元件自動渲染，不需手動加。子選單指示中的 value 和 badge 是可選的——讓使用者不用展開就能看到下一層的目前狀態。

---

## 浮層規格

所有 elevation-200 浮層共用同一套視覺規格：

| 屬性 | Token |
|---|---|
| 背景 | `bg-surface-raised` |
| 陰影 | `--elevation-200` |
| 圓角 | `rounded-lg` (8px) |
| 邊框 | `border border-border` |
| 間距 | `sideOffset={8}`（見 `../Popover/popover.spec.md` SSOT） |
| Align | **跟隨 trigger 位置:左 → `start` / 中 → `center` / 右 → `end`**,見 `../Popover/popover.spec.md`「Align 對齊 canonical(跨浮層 SSOT)」|
| 最小寬度 | `max(180px, 觸發元件寬度)`——窄 trigger 時吃 180px 地板；可用 `minWidth` prop override |

SubContent 使用相同規格，包括 sideOffset。

---

## Size

透過 `DropdownMenuContent` 的 `size` prop 設定，經 SizeContext 向下傳遞，所有子項目自動套用。

| Size | Label | Icon | Checkbox/Radio 控件 |
|---|---|---|---|
| sm | `text-body leading-compact` (14px, 1.3) | 16px | 16px |
| md | `text-body leading-compact` (14px, 1.3) | 16px | 16px |
| lg | `text-body-lg leading-compact` (16px, 1.3) | 20px | 20px |

DropdownMenu 是掃描模式——使用者快速瀏覽選項，所有尺寸使用 `leading-compact`。

---

## 鍵盤操作

由 Radix DropdownMenu 提供：

| 按鍵 | 行為 |
|---|---|
| `↑` `↓` | 移動焦點 |
| `Home` / `End` | 跳到第一／最後一個 item（`PageUp` / `PageDown` 同） |
| 首字 typeahead | 打字元自動跳到符合的 item |
| `Enter` / `Space` | 執行目前焦點的動作 |
| `Escape` | 關閉整個選單（含所有展開子層；Radix root close）。逐層收合用 `←` |
| `→` | 展開子選單 |
| `←` | 收合子選單，焦點回到 SubTrigger |

---

## 破壞性動作

刪除等不可逆動作的 **prefix icon 和 label 都使用 `text-error`**——prefix icon 是 label 的視覺延伸，與 label 同色。Suffix shortcut 維持 `fg-muted`。

---

## 禁止事項

- ❌ 不要用 DropdownMenu 做選值——「選一個值填回 field」用 SelectMenu
- ❌ 不要在 item 內放獨立互動元素（如 Button、Switch）——item 本身就是互動單位
- ❌ disabled item 不可有 hover 效果
- ❌ Label 不可被點擊或取得焦點
- ❌ 不要手動在 SubTrigger 內加 ChevronRight——元件自動渲染
- ❌ 不要在同一 item 混用 `shortcut` prop 與 `<DropdownMenuShortcut>` child(兩條後綴 API 擇一;canonical 用 prop)——同一個 item 只用一種後綴

---

## StateBehavior(DropdownMenu 層級特有)

Item-level default / hover / focused / selected / disabled **色彩**由 MenuItem primitive SSOT 擁有(`patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」),在本元件 `ColorMatrix` story 承載並直接引用 MenuItem token。DropdownMenu 的 `StateBehavior` story 展示**浮層層級特有的動態行為**:open / close 動畫(Radix `data-state` 驅動)、Submenu 展開 / 收起、CheckboxItem toggle(多選不 close)——這些是 item primitive 沒有的維度。

---

## 邊界案例

- **Disabled trigger**:由 trigger Button 的 `disabled` prop 控,該 Button 自動繼承 disabled token(M24 state precedence);click trigger 不開 menu。
- **Disabled item**:`<DropdownMenuItem disabled>`(Radix 內建支援),視覺繼承 MenuItem SSOT(`text-fg-disabled` + `aria-disabled=true` + 鍵盤導覽 skip + 不觸發 onSelect)。
- **Loading(async submenu / async items)**:DropdownMenu primitive 不獨立 own loading prop。async submenu 場景應由 consumer 在 `<DropdownMenuSub>` 內條件性渲 `<DropdownMenuItem disabled>` + spinner label(如「載入中...」);或 fetch options 前先 disable 整個 menu trigger。完整 loading body 替換 pattern 屬 SelectMenu scope,不在 DropdownMenu scope。
- **Empty(no items / async fetch result empty)**:consumer 應條件性渲 `<DropdownMenuItem disabled>` 顯示「無可用動作」字樣;不渲空 menu。
- **Dark mode / density**:走 MenuItem + Popover SSOT 自動 adapt;density 預設 lock `md`(M3 portal subtree convention)。

---

## 相關

- `../Menu/menu-item.spec.md` — 共用的 MenuItem primitive（prefix 對齊、尺寸、狀態）
- `../SelectMenu/select-menu.spec.md` — 選值（選完留在 field 裡）的對應元件
- `../Button/button.spec.md` — 通常作為 DropdownMenuTrigger
- `../Dialog/dialog.spec.md` — 複雜流程時的改用選擇

## A11y 預設

**ARIA / Pattern**:繼承 Radix `dropdown-menu` primitive a11y 預設(role / aria-* / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/dropdown-menu#accessibility)。

**Keyboard 行為**:

- Tab — focus trigger
- Enter / Space / ↓ — 開啟
- ↑/↓ — 導覽 items（Home/End 跳首尾項，PageUp/PageDown 同）
- 首字 typeahead — 打字元自動跳到符合的 item
- Enter / Space — 選擇目前焦點的選項
- Esc — 關閉

**Focus**:Radix primitive 自管 focus trap / restoration。鍵盤導覽到的項目以 highlight **底色**標示(Radix `data-[highlighted]:bg-neutral-hover`,本元件刻意採 `data-highlighted` 而非 `:focus-visible` outline ring,跨瀏覽器一致 — 見 dropdown-menu.tsx docblock「Hover / highlight canonical」),不畫 `outline: 2px solid var(--ring)` 外框。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `action-bar.spec.md`
- `command.spec.md`
- `file-viewer.spec.md`
- `menu-item.spec.md`
- `popover.spec.md`
- `select-menu.spec.md`
- `sheet.spec.md`
- `sidebar.spec.md`
- `tree-view.spec.md`
