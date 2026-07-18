# 元件 Props 命名 — 詳細對照表

`.claude/rules/ui-development.md`「元件 Props 命名」的詳細展開(callback / Badge / icon canonical)。

## 關閉 / 移除類 callback canonical(按語意分層,不合併)

四個名稱各有語意,不可替換:

| Callback | 語意 | 典型元件 | 世界級對照 |
|----------|------|---------|-----------|
| `onClose` | **關閉 overlay session** — 浮層關閉回背景 | Dialog / Sheet / Popover / FileViewer / HoverCard | React Aria `onClose` / Material `DialogProps.onClose` |
| `onDismiss` | **通知被忽略** — 暫時訊息被關,不影響流程 | Alert / Notice / Toast / Coachmark | Polaris `Toast.onDismiss` / iOS `dismiss()` |
| `onRemove` | **從集合移除 item** — parent collection 狀態變化 | PeoplePicker / Combobox multi-select tag / Tag(in list) | Material `Chip.onDelete` / React Aria `onRemove` |
| `onClear` | **欄位內容清空** — value 設 empty,元件不關 | Input / Select / Combobox / DatePicker clear | Ant `allowClear` + `onClear` / Polaris `clearButton` |
| `onClearSelection` | **清空多選集合** — 取消所有勾選項(非清欄位內容)| BulkActionBar | Polaris `ResourceList` bulk clear / Material DataGrid `onRowSelectionModelChange([])` |

**禁止**:用同一名 cover 多語意(`onClose` 同時表達 Tag 的 `onRemove`;`onClear` 同時表達「清欄位」與「清勾選」→ 後者必用 `onClearSelection`,2026-07-18 決策12)。spec 寫 callback 時必明示哪一類。

## Badge 類 prop 名 canonical(按放置,不按「是 badge」籠統命名)

Badge 在不同 anchor 有兩種截然不同視覺 / 語意,prop 名區分:

| Prop | 用途 | 典型 anchor | Badge 型態 |
|------|------|------------|----------|
| `badge` | **Pill 內 inline badge** — label 右側 flex | Button(有 label)/ Tab item / Chip | inline count |
| `overlayBadge` | **疊視覺重心** — absolute 於 icon/avatar 角 | iconOnly Button / pure Icon | top-right count overlay |
| `badgeCount`(Avatar 專用) | count overlay,內部用 `<Badge variant="critical">`,貼 avatar 右上 | Avatar | overlay but Avatar 語意 |
| `status`(presence dot — Avatar / ProfileCard / PeoplePicker) | **非 Badge** — SVG presence dot,貼右下 | Avatar | presence indicator |

**禁止**:同 prop 名兼 inline + overlay。世界級 Material `BadgedBox`(overlay)vs `Chip.label`(inline)分開;Ant `<Badge overflowCount>` vs `<Tag>` 分開。

**`status` 兩個 value-set family(刻意 overload,非隱性衝突)**:(1) **presence** `'online' | 'away' | 'busy' | 'offline'` — Avatar / ProfileCard / PeoplePicker;(2) **lifecycle** `'uploading' | 'completed' | 'error'`(FileItem / FileUpload)/ `'inProgress' | 'success' | 'error'`(ProgressBar)。兩 family 各自 self-consistent,prop 名沿用同一 presence/lifecycle 軸。

**禁止組合**:有 label 的 Button / Chip 疊 `overlayBadge`(badge 飄到 chrome 邊緣遠離 icon 語義) → 計數改用 `badge` inline。詳 `badge.spec.md`「Overlay 適用元件 canonical」。

## `prefix` / `suffix` canonical(按「prop 型別」判,非按位置一刀切)

`prefix` / `suffix` 這對字在 DS 有 3 種身份,**只有當它是「放 ReactNode 的內容插槽 prop」時才禁**:

| 形態 | 判定 | 改用 / 對齊 |
|------|------|-----------|
| **ReactNode 內容插槽 prop**(`prefix?: ReactNode`)| ❌ **禁** — 位置名不傳達放什麼 | 內容描述名:`startIcon`/`endIcon`(icon)、`avatar`(ReactNode)、`endContent`/`endAction`(trailing slot)。對齊 Material `startIcon`/`endIcon`、Atlassian `iconBefore`/`iconAfter` |
| **值格式 affix 字串 prop**(`prefix?: string`)| ✅ **允許** — 黏在值上的貨幣/單位符號,屬格式化非插槽 | `NumberInput.prefix='$'`/`suffix='kg'`。對齊 Ant `InputNumber.prefix` |
| **結構 anatomy 詞彙 / 內部原語 / CSS 變數**(`ItemPrefix`/`ItemSuffix`、`--item-prefix-slot`、`data-prefix-type`、spec 的 `[prefix][content][suffix]` 骨架)| ✅ **允許** — 位置就是結構槽的身分(類比 CSS `::before`/`::after`),非 consumer 內容 prop | item-anatomy SSOT(`item-anatomy.spec.md`)|

**一句話判準**:**「是 ReactNode 內容插槽 consumer prop 嗎?是 → 禁(改內容名);否(格式字串 / 結構原語)→ 合法。」** `ui-development.md`「Props 命名」禁令的標的是**內容插槽**,非格式字串或結構詞彙——三者程式碼裡 0 衝突(全庫掃證實無任何元件暴露 ReactNode prefix/suffix 插槽 prop)。

## 常用 icon canonical

| 語義 | Icon | 反例 |
|------|------|------|
| 溢出選單 / 更多動作 | **`MoreVertical`** | ❌ `MoreHorizontal`(row 內水平排 icon 跟水平動作按鈕群視覺混淆,縱向三點更明確) |
| 路徑收合(Breadcrumb ellipsis)| `MoreHorizontal` | 唯一保留 `MoreHorizontal` — 沿路徑方向省略,非 overflow menu |
| 關閉(Close / Dismiss)| `X` | ❌ `XCircle`(error status,語義衝突) |
| 成功 / 完成 | `Check` / `CircleCheck` | — |
| 失敗 / 錯誤 | `XCircle` | — |
| 警告 / 提醒 | `TriangleAlert` | — |
| 資訊 / 說明 | `Info` | — |

**世界級對照**:Linear / Notion / GitHub / Figma 全部用 vertical 3-dots 作 overflow;horizontal 3-dots 專給 path/truncation(Breadcrumb / text ellipsis)。
