<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Inline Action 設計規格(SSOT)

**定位**:嵌入在其他元件內部的互動觸發點(Tag dismiss / Field endAction / Row suffix action)。不是獨立 Button,由宿主元件渲染 + 控制。

**本 spec 是 Inline Action 的獨立 SSOT**(2026-04-24 從 `item-anatomy.spec.md` 抽出,避免單一 spec 過長)。Row primitive 結構走 `item-anatomy.spec.md`;本 spec 含「確定用 Inline Action」後的完整視覺 / API / predicate / same-row consistency 規格。

### 視覺規則

1. **Icon 視覺尺寸跟隨宿主 tier**，排版以 icon 為準
2. **平時透明**，視覺上等同靜態 icon
3. **Hover 時顯示背景色區域**，提示可點擊。背景色區域 = icon + 2px（直徑，即每邊 +1px），不影響排版（用 absolute positioning 或 negative margin 溢出）

### 互動狀態

與 Button text variant 一致：

| 狀態 | 背景 | 過渡 |
|---|---|---|
| 預設 | transparent | — |
| hover | `bg-neutral-hover` | transition-colors |
| active(mouse down) | `bg-neutral-active` | transition-colors |
| **overlay 開啟**(`data-state=open`)| **同 host hover**(該元件 hover 什麼樣就維持) | transition-colors |
| focus-visible | `outline: 2px solid var(--ring)` | — |
| 宿主 disabled | 不渲染 inline action | — |

**Overlay trigger canonical**(2026-04-29 訂 / 2026-05-02 改):trigger 透過 `asChild` 作 DropdownMenu / Popover / Tooltip trigger 時,Radix 自動 set `data-state="open"`,**trigger 維持 host hover 樣式**直到浮層關閉。對齊**狀態極簡派**(shadcn / Radix Themes / Material — 不另開 4th token);避免 state 增生 + 跨 host(neutral / colored)規則同步。落實:`ItemInlineActionButton` / Button text/secondary/tertiary / `fieldWrapperStyles` `data-[state=open]` 全走「等同 hover」。

### Icon 色彩（按 host 分兩類,2026-04-21 D6 矛盾解）

Inline action icon 色彩規則 **依 host 是否有自帶色彩分兩支**。共同精神:inline action 視覺融入 host — neutral host 的融入方式是「退到 muted」,colored host 的融入方式是「接收 host 色」。

**預設（neutral host）**:預設 `fg-muted`,hover / active 時變 `foreground`
- 適用:Field endAction（Input clear button）/ TreeItem inline action / Menu inline action / DropdownMenu trigger inline action 等 **neutral 容器內**的 inline action
- 語意:utility icon 是輔助操作,預設退到背景,hover 時提示可操作

**例外（colored host）**:**繼承 host 文字色**（非 `fg-muted`）
- 適用:**Tag dismiss** / 未來任何 **宿主自帶 branded / categorical 色彩** 的 inline action
- 語意:宿主 bg 有色（Tag subtle blue 底 + blue-text 文字）,inline action icon 用 `fg-muted` 會視覺不連貫（視覺斷裂 / 顏色不連貫）;繼承 host 文字色維持「一個整體視覺單元」
- Hover / active 背景:跟 host 同色系的 hover / active token（例 Tag solid blue dismiss → `--blue-hover`）

**判斷法**:宿主 bg 是 surface / transparent（neutral）→ 走預設;宿主有 branded / categorical 色彩 → 走 colored host 例外。

**現況清單**:
| Host | 規則分類 | Icon 色 |
|------|---------|--------|
| Field / Input / NumberInput / DatePicker / Combobox endAction | neutral host | `fg-muted` → `foreground` |
| TreeItem / Menu / DropdownMenu inline action | neutral host | `fg-muted` → `foreground` |
| Tag dismiss | colored host | 繼承 Tag 文字色 |

### 尺寸對照

| 宿主 | Icon 視覺 | Hover 背景 | 圓角 | 排版佔位 |
|---|---|---|---|---|
| Tag sm (20px) | 16px | 18px | rounded-md | 16px |
| Tag md/lg (24px) | 16px | 18px | rounded-md | 16px |
| Field sm/md | 16px | 18px | rounded-md | 16px |
| Field lg | 20px | 22px | rounded-md | 20px |
| TreeItem sm/md | 16px | 18px | rounded-md | 16px |
| TreeItem lg | 20px | 22px | rounded-md | 20px |
| Panel list row(visibility / sort / filter panels)| 16px | 18px | rounded-md | 16px |

**Consumer wrapping rule**:當 consumer 包 `ItemInlineActionButton` 在 reserve slot(如 hover-reveal opacity wrapper),**reserve 寬度 = 排版佔位**(sm/md=16,lg=20),**禁止自訂為 24 / 28**(過大會在 cell 留 phantom space)。歷史:DataTable header reserve 24 → 16 修正(2026-04-29)。

### 多個 Inline Action 並排

當一個宿主有多個 inline action(如 Select 的 clear X + ChevronDown,或 TreeItem 的 ⋯ + ＋)時:

- **間距**:`gap-2`(8px)——跟 fieldWrapperStyles 的元素間距一致(Select 的 clear X 和 ChevronDown 就是 gap-2)
- **對齊**:全部垂直置中在同一行(`flex items-center`)
- **出現時機**:全部一起出現(TreeItem 的 hover-reveal 是同時淡入所有 action,不逐個)

### API 設計

Inline action 由宿主元件渲染，消費者只需宣告 intent：

```tsx
// ❌ 舊：消費者自行決定 Button size、icon size
<Input endAction={<Button size="xs" iconOnly startIcon={X} aria-label="清除" onClick={...} />} />

// ✅ 新：宣告式，Field 自己根據 size tier 渲染
<Input endAction={{ icon: X, label: '清除', onClick: handleClear }} />
```

Field 內部根據自己的 size 決定 icon 尺寸、hover 背景大小、視覺層級。消費者不需要知道這些。

### 實作要求

- 必須是 `<button>` 元素，不是 `<span>` + onClick
- 必須有 `aria-label`
- 必須有 `cursor-pointer`——可點擊的元素必須有明確的游標指引
- 必須有 Tooltip（`label` 欄位同時作為 `aria-label` 和 tooltip 內容）——icon-only 控件沒有可見文字，tooltip 是使用者理解功能的唯一視覺提示
- 宿主 disabled 時不渲染（不可操作就不該暗示可以操作）

### Predicate:Inline Action vs Button iconOnly(canonical)

DS 跨元件 icon action primitive 的 canonical。接到 icon 相關決策,跑下面決策樹。

#### 三種 icon primitive 的身份

| Primitive | 定義 | 實作 |
|-----------|------|------|
| **Decorative indicator** | 純視覺提示(點了不做事,host 是 click target)| Host 內 `<Icon aria-hidden pointer-events-none />` |
| **Inline Action** | **可點擊的 icon**,embedded 在 host 內部(content flow / chrome padding)| `ItemInlineAction` / `ItemInlineActionButton`(詳下方 API 區)|
| **Button** | **獨立按鈕**,有 chrome,可參與 action group | `<Button iconOnly />`(詳 button.spec.md)|

#### 決策樹(3 步)

```
Q1. icon 點了要做事嗎?
    ├─ 否 → Decorative indicator(host 內 <Icon aria-hidden />,本 spec 不討論)
    └─ 是 ↓
Q2. 位置在哪?
    ├─ Host 內部(chrome padding / content flow / row inline suffix)→ Inline Action
    ├─ Row 獨立 action slot(跟 content 視覺分開,有獨立 column/分隔線)→ 看 Q3
    └─ Action group region(toolbar / chrome corner / standalone)→ Button
Q3. Row 多大?
    ├─ ≤ 24(compact / xs row)→ Inline Action(Button xs 24 填滿 row,無呼吸)
    └─ ≥ 28(sm/md/lg row)→ Button iconOnly xs(固定 24,不隨 row 放大)
```

#### Row action 絕對值 cap(核心原則)

**Row dedicated action 永遠 ≤ 24px**,不隨 row tier 放大。超過 24 action 會搶 content 視覺焦點,違反「資料 > 行動」的視覺階層。

**世界級對照**:Material DataGrid / Polaris ResourceList / Atlassian Table / Ant Design Table / Apple HIG — **全部固定小尺寸 icon button**,不依 row height 放大 action。

#### 3 條關鍵補充

1. **Inline Action 不參與 action group 規則** — 沒有 Button 的 variant chrome / Separator 分群 / size 對稱要求;只是 host 內部 tap target
2. **Button 必對齊 action group 規則** — 同 size、Separator 分群(詳 `patterns/action-bar.spec.md`)
3. **Dismiss X(close)特殊弱化** — Inline Action default 已 `fg-muted`;Button 需加 `dismiss` prop 才 override(詳本 spec 下方 dismiss 節)

#### Real case 表(所有 DS 用法一覽)

| Host | Context | Primitive | Why |
|------|---------|-----------|-----|
| Input / NumberInput / Combobox clear X | Field chrome padding | Inline Action | Embedded |
| Tag dismiss X | Pill body | Inline Action(colored host 繼承色)| Embedded |
| Menu / TreeView / SidebarMenuButton / SelectionItem suffix | Row inline flow | Inline Action | Inline with content |
| SidebarGroup header chevron | Aux toggle | Inline Action | Inline header toggle |
| Select ChevronDown / DatePicker Calendar / Combobox ChevronDown | Field chrome(裝飾)| **Decorative**(不是 action)| Click falls through;host 是 trigger |
| **FileItem compact**(row 24)| Row slot | Inline Action | Row 太小容不下 Button xs 24 |
| **FileItem rich**(row 56 sm/md rich)| Row slot | Button xs iconOnly(24 固定)| ≤ 24 cap,不放大 |
| **DataTable header cell internal**(sort indicator / ⌄ menu / filter funnel / pin)| Header cell host internal | **Inline Action**(`ItemInlineActionButton` asChild for DropdownMenu)| Embedded inline,跟 label 一體 |
| **DataTable body cell internal**(display endAction / clear / edit indicator)| Cell content host internal | **Inline Action**(自動繼承 Field family endAction)| Field display 元件已對齊 |
| **DataTable row dedicated action column**(編輯 / 刪除 / 更多 ⋯)| Row dedicated column | Button xs iconOnly(24 固定)| ≤ 24 cap;有獨立 column divider 視覺分離 |
| **Dialog / Sheet / Popover / Alert corner close** | Chrome corner | Button iconOnly `dismiss`(size sm)| Action group region |
| **Toolbar commands**(FileViewer zoom / editor bold)| Toolbar | Button iconOnly(md 常見)| Action group region |
| FileViewer / rich text editor formatting group | Toolbar action group | Button iconOnly 同 size + Separator | Action group 完整範例 |

#### Content-role vs action-role 分層(附補充原理)

Row 內元件分兩類,**size 規則不同**:
- **Content-role**(display 資料):InputDisplay / Badge / Avatar / Tag → size 對應 row tier(sm row → sm)
- **Action-role**(互動觸發):row action icon → **固定 ≤ 24**,不參與 content size-pair

Row action 的 affordance 是「次要功能」,不是 primary CTA。Button chrome 過度強調;用 **Button xs 24 固定** 提供 command affordance 但不侵蝕 content hierarchy。

### Same-row consistency rule(防混用)

**同一 row 所有 icon action 必同一類**(不混 Inline Action + Button)— 消除 box size 不一致造成 gap 斷裂(InlineAction 16+18 vs Button text sm 28)。

**範例(panel list row 內 inline action)**:
```
✅ DataTable column visibility row(panel list):
[⋮⋮ drag] [label] [👁️ toggle]   ← 全 ItemInlineActionButton size=md(16+18 hover bg)

❌ 混用 anti-pattern:
[⋮⋮ ItemInlineActionButton] [label] [Button text sm Eye 28x28]  ← box size 不一致 gap 斷裂
```

**chrome corner action group(Alert / Toast / Dialog / Popover header corner)** 屬 **Button family**(action group region,不是 inline action)。Canonical 不在本 spec — 詳:
- 尺寸:`patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」(overlay sm + v5 trick / banner xs explicit)
- variant / divider:`patterns/action-bar/action-bar.spec.md`(corner action group)

### Inline action 共用元件(`ItemInlineAction` / `ItemSuffix`)

Canonical 實作於 `item-anatomy.tsx`,匯出 `ItemInlineAction` / `ItemSuffix`(從 `RowSizeContext` 自動查 icon size / hover bg / tooltip / aria-label / fg-muted → foreground 全內建)。

```tsx
// 單一 action
<ItemInlineAction action={{ icon: X, label: '清除', onClick: handleClear }} />
// 多個 + hover-reveal
<ItemSuffix hoverReveal>{actions.map((a) => <ItemInlineAction action={a} />)}</ItemSuffix>
```

**Host 走宣告式 API**(`inlineActions?: InlineActionConfig[]` prop)— 不自刻 button JSX。已遷移:`SidebarMenuButton`。Pending refactor:`Input` / `NumberInput` / `Tag` / `LinkInput` / `Combobox`。

### Dismiss canonical — X close only

**Dismiss 語意嚴格定義**:「**關閉 surface / 忽略訊息**」— **只屬 X(close)icon**。

**不是 dismiss 的情境**(常被誤判):
- Trash / Delete / Remove — destructive action(破壞性移除),不是 dismiss
- Clear — 欄位清空(value 設 empty,元件本身不關),不是 dismiss
- 以上三者**禁止套 dismiss 弱化**

**世界級對照**:
- Dismiss:Material `IconButton` close / Polaris `Banner.onDismiss` / Ant Design `Alert.closable` / Apple HIG window close → 一律 icon = `X`
- Destructive:Material `IconButton` Delete(red)/ Polaris `Button destructive` / 我們的 row Trash → 一般 primitive(無 dismiss 弱化)

#### Dismiss X 的實作(按 position 決定)

| 位置 | 實作 | 視覺弱化 |
|------|------|---------|
| Chrome corner(Dialog / Sheet / Popover / Alert / Toast / Coachmark 右上 X)| **Button iconOnly + `dismiss` prop**(Cat 3)| `dismiss` prop 套 fg-muted override |
| Host chrome padding 內(Input clear X / Tag 內 X)| **Inline Action**(Cat 1)| default 已 fg-muted(內建)|
| 獨立 standalone close(罕見)| **Button iconOnly + `dismiss` prop**(Cat 3)| `dismiss` prop 套 fg-muted override |

#### `dismiss` prop 觸發條件(Button 限定)

**明示**:`<Button dismiss />` 或 callback = `onClose` / `onDismiss` → 觸發弱化 override(icon fg-muted → hover foreground;variant 強制 text)

**不觸發**:callback = `onRemove`(collection 操作)/ `onClear`(欄位清空)/ `onDelete` — 這些不是 dismiss 語意,Button 用對應 variant 即可

#### Colored host 例外(Tag 內 X)

Tag solid / branded color variant(`red / blue / orange`)→ Tag 內 X **繼承 host 文字色**(非 fg-muted),hover bg 配色相。詳「Icon 色彩原則」段。

#### ❌ 禁止

- 帶文字 label 的 Button 作 dismiss(「關閉」字按鈕)— 雙重 affordance
- 自刻 `<button><X /></button>` — 繞過 `ItemInlineAction` / Button `dismiss` 的 a11y + 尺寸自動化
- **Trash / Clear / Delete 套 `dismiss` prop** — 語意誤用,destructive 本身已有破壞性意涵不需再弱化
- Button dismiss 用 `variant="primary/secondary/tertiary"` — `dismiss` prop 強制 `variant="text"`
- Chrome corner close 用 Inline Action — corner 屬 action group region,必用 Button

#### 第三方 managed 不是例外

sonner toast auto-dismiss / Radix Dialog `DialogClose` wiring — 第三方只管 state logic(何時關),**我們渲染的視覺按鈕必套對應 canonical**(chrome corner → Button dismiss;chrome padding → Inline Action)。

hook `check_story_anatomy.sh` 規則 B 已在 stories 層攔 label Button 作 dismiss。

---

## Escape hatch — config 表達不出時的 10% case

**90% case 走 `InlineActionConfig` 宣告式 API**(host 根據 size tier 自動渲染 — 視覺一致 / a11y 內建 / drift 杜絕)。

少數 config 結構表達不出的場景:
- 自訂 popover trigger(DropdownMenuTrigger asChild + 自家 anchor)
- 多 tier 動作(stepper button group / 多個 chevron)
- 跟 host 自帶 chrome 互動的元素(如 Combobox 的 ChevronDown 不屬 endAction)

**Canonical**:每個 inline-action host 必須提供 `xxxSlot?: React.ReactNode` 作 escape hatch:

| Host family | Config prop | Escape hatch slot prop |
|---|---|---|
| Field family(Input / NumberInput / DatePicker / Combobox / LinkInput / TimePicker) | `endAction?: InlineActionConfig` | `endSlot?: React.ReactNode` |
| Row family(TreeView.TreeItem / SidebarMenuButton)| `inlineActions?: InlineActionConfig[]` | `inlineActionsSlot?: React.ReactNode` |

```tsx
// ✅ 90% case
<Input endAction={{ icon: X, label: '清除', onClick: handleClear }} />
<TreeItem inlineActions={[{ icon: MoreVertical, label: '更多', onClick: ... }]} />

// ✅ 10% case(escape hatch)
<Input endSlot={<DropdownMenuTrigger asChild><MyChevron /></DropdownMenuTrigger>} />
<TreeItem inlineActionsSlot={<MyCustomActionGroup />} />
```

**規則**:
- Slot 跟 config 互斥(slot 優先,config 被忽略)
- `disabled / readonly` 模式 / Sidebar `collapsible=icon` 模式跟 config 一致(slot 也要被相同條件隱藏)
- Reveal 模式(`actionsReveal="hover"`)、絕對定位 chrome 跟 config 共用,consumer 不需重做
- Padding budget(Sidebar)slot mode 預設按 1 icon 寬度預留,多 icon 寬度需 consumer 自控 className
- 視覺一致性 by consumer — 但 **app-code 不可直接 import L3 primitive**(`ItemInlineActionButton` / `ItemInlineAction` / `RowSizeProvider`),由 `check_l3_primitive_import.sh` 攔截。需要視覺一致 inline-action button 時,(a) 用 host 自帶 slot(此 escape hatch)、(b) 用 `<Button iconOnly variant="text" />`、(c) 走 spec rationale 例外申請

**現況清單**(2026-04-25 補完):
- ✅ `Input.endSlot`
- ✅ `NumberInput.endSlot`
- ✅ `TreeView.TreeItem.inlineActionsSlot`
- ✅ `SidebarMenuButton.inlineActionsSlot`

**不適用清單**:DatePicker / Combobox / Select / TimePicker / LinkInput 右側由元件自帶 chrome 獨佔(Calendar / ChevronDown / Clock / ExternalLink 等 intrinsic affordance),不開放 consumer 放置 endAction/endSlot — 這些元件的 inline-action 需求走**內建 clear X**(consumer 透過 `clearable` prop opt-in)或 `<Button iconOnly />` 放在 Field 外側。Escape hatch canonical 不涵蓋此類 host(本質上非 consumer-facing slot)。

**世界級對照**:
- Material UI:`InputAdornment` ReactNode slot(無 config,純 escape hatch 派 — 我們的 90/10 比 Material 更有結構)
- Polaris:`TextField.connectedRight` ReactNode 只接 Button,但無 config-based 簡化,API 一致性差
- Ant Design:`Input.suffix` ReactNode slot,跟 Material 同派
- Atlassian:`Textfield.elementAfterInput` ReactNode

我們採「config-first + slot escape hatch」屬刻意 deviation,rationale:90% case 宣告式 API 阻止 visual drift / a11y 漏失;10% case 仍提供逃生口,不強迫 consumer fork 元件。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `alert.spec.md`
- `data-table.spec.md`
- `field-controls.spec.md`
- `popover.spec.md`
