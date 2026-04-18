# Separator 設計原則

Separator 是語意分隔元件，用於標示內容群組之間的邊界。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：基於 Radix Separator（shadcn passthrough）——提供正確的 ARIA `role="separator"` + orientation 語意。

## 定位

**Separator 只用於 consumer 手動放置的分隔線。** 元件固定結構（header/footer 邊框）和裝飾性邊框不使用 Separator。

## 何時用 / 何時不用（判斷法）

判斷核心：**誰決定「這裡要分隔」？**

### Consumer 手動放 → Separator 元件

Consumer 在 JSX 裡明確放置分隔線的場景：
- `<SidebarSeparator />` 在 sidebar 群組間
- `<DropdownMenuSeparator />` 在操作選單項目間
- `<ButtonDivider />` 在按鈕群組內

為什麼：Consumer 控制的分隔點需要語意標記（`role="separator"`），讓輔助技術能辨識內容群組邊界。

### 元件自動分隔相鄰群組 → CSS `[&+&]`

元件內部自動在相鄰同類群組間產生分隔線：
- `MenuGroup`：`[&+&]:border-t border-divider`
- `SidebarGroup`：`[&+&]::before` pseudo-element

為什麼：Consumer 只需要思考「分組」，不需要記得放分隔線。CSS 相鄰選擇器無法用元件替代（無處插入 DOM node）。

### 元件固定結構 → CSS `border-t/b border-divider`

元件內部固定存在的結構性分隔：
- Dialog Header/Footer
- Sidebar Header/Footer
- NameCard 各 section
- SelectMenu 搜尋框下方

為什麼：這些分隔線是元件自身結構的一部分（如視窗標題列底線），不由 consumer 控制，不需要語意標記。

### 控件外框 / 容器輪廓 → CSS `border border-border`

視覺裝飾性邊框，不分隔內容：
- Input / Checkbox / Radio 外框
- Card / Dialog / Sheet 容器邊線
- DataTable 格線
- Tabs 底線基準

## Token 規則

| 用途 | Token | 值 |
|------|-------|----|
| 分隔線（content separation） | `--divider`（neutral-4） | 較淡 |
| 控件邊框（container/control edge） | `--border`（neutral-5） | 較深 |

**分隔線一律用 `--divider`，不用 `--border`。** 兩者視覺上接近但語意不同：`--divider` 是「這裡有群組邊界」，`--border` 是「這是元件的邊緣」。

## 禁止事項

- ❌ 用 Separator 元件做元件固定結構的分隔（那是 CSS border 的工作）
- ❌ 用 `--border` token 做分隔線（應該用 `--divider`）
- ❌ 用 `bg-border` 做 ButtonDivider 等 consumer 放置的分隔線

## 相關

- `../../tokens/color/color.spec.md` — `--divider` / `--border` token 定義（「邊框 / 分隔」節）
- `../Button/button-group.tsx` — ButtonDivider 實作
- `../Sidebar/sidebar.tsx` — SidebarSeparator（Radix Separator 消費者）
- `../DropdownMenu/dropdown-menu.tsx` — DropdownMenuSeparator（Radix Menu Separator）
- `../Menu/menu-item.tsx` — MenuGroup 自動分隔 CSS pattern（`[&+&]:border-t`）
- `../Sidebar/sidebar.tsx` — SidebarGroup 自動分隔 pseudo-element pattern
