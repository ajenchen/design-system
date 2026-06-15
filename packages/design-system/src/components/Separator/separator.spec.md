---
component: Separator
family: self-contained
traits: []
variants: {}
sizes: {}
benchmark:
  - Radix Separator primitive: github.com/radix-ui/primitives/tree/main/packages/react/separator
  - Ant Design Divider: github.com/ant-design/ant-design/tree/master/components/divider
  - MUI Divider: github.com/mui/material-ui/tree/master/packages/mui-material/src/Divider
---

# Separator 設計原則

Separator 是語意分隔元件，用於標示內容群組之間的邊界。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：基於 Radix Separator（shadcn passthrough）——提供正確的 ARIA 語意：預設 `decorative=true` 時 render `role="none"`（SR 跳過），`decorative={false}` 時 render `role="separator"` + orientation 語意。詳 A11y 段。

## 定位

**Separator 只用於 consumer 手動放置的分隔線。** 元件固定結構（header/footer 邊框）和裝飾性邊框不使用 Separator。

## 何時用 / 何時不用（判斷法）

判斷核心：**誰決定「這裡要分隔」？**

### Consumer 手動放 → Separator 元件

Consumer 在 JSX 裡明確放置分隔線的場景：
- `<SidebarSeparator />` 在 sidebar 群組間（消費 DS Separator）
- `<DropdownMenuSeparator />` 在操作選單項目間（Radix Menu 自有 separator primitive，非 DS Separator）
- `<ButtonDivider />` 在按鈕群組內（raw div + `role="separator"`，非 DS Separator）

為什麼：Consumer 控制的分隔點由放置者宣告語意——DS Separator 預設 decorative（`role="none"`，SR 靜默），真實切分內容區段時 `decorative={false}` 才輸出 `role="separator"`（詳「A11y 預設」段）。

### 元件自動分隔相鄰群組 → CSS `[&+&]`

元件內部自動在相鄰同類群組間產生分隔線：
- `MenuGroup`:相鄰同類群組之間自動出現 `border-divider` 分隔(見 `menu-item.tsx`)
- `SidebarGroup`:相鄰群組之間自動產生分隔線(見 `sidebar.tsx`)

為什麼：Consumer 只需要思考「分組」，不需要記得放分隔線。CSS 相鄰選擇器無法用元件替代（無處插入 DOM node）。

### 元件固定結構 → CSS `border-t/b border-divider`

元件內部固定存在的結構性分隔：
- Dialog Header/Footer
- Sidebar Header/Footer
- ProfileCard 各 section
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

## 邊界案例

- **Vertical 方向**：`h-full` 取父容器高度——父容器無確定高度（auto）時 separator 高度為 0、不可見；需父容器有確定高度或 flex row 的 stretch 對齊
- **空容器 / 0 寬**：horizontal `w-full` 隨父寬，父寬為 0 時無可見線；Separator 不自帶 min-width / min-height
- **厚度固定 1px**（`h-px` / `w-px`）、非互動無 hover / focus——無 size / state 變體（見下「為何無 …」段）

## 為何無 Inspector / ColorMatrix / SizeMatrix / StateBehavior

Separator 是**視覺分隔 primitive**(一條 1px 線),結構極薄:

- **無 Inspector**:Separator 唯一變因是 `orientation`(horizontal / vertical),已在 `TokenMatrix` 對照呈現。互動 Inspector 無進一步可調 prop。
- **無 ColorMatrix**:Separator 固定用 `--divider` token(比 border 更淡的語意分隔色),dark mode 由 semantic token 自動切換。無變體。加 color variant 會誤用成「狀態訊號」(分隔應是中性的)。
- **無 SizeMatrix**:Separator 固定 1px 厚度(線應該是線),長度由 container 決定(`w-full` / `h-full`)。無 sm/md/lg tier。
- **無 StateBehavior**:非互動元件,無 hover / focus / active / selected / disabled。

對應 anatomy story:保留 `Overview` + `TokenMatrix`(horizontal × vertical + `--divider` vs `--border` 用法對照)。

---

## A11y 預設

Separator 是**純視覺 divider**,預設 ARIA 行為(對齊 Radix Separator primitive):

- **預設 `role="none"`(decorative)**:純視覺分隔,SR 不朗讀(避免「separator」/「horizontal rule」雜訊干擾 list 朗讀)
- **語意分隔場景(`decorative=false`)**:當 Separator 真實切分內容區段(`<nav>` 內分 navigation group / Menu 分群),Radix 自動 render `<div role="separator">`,SR 讀「separator」幫助理解結構。`aria-orientation` 僅在 `orientation="vertical"` 時輸出(`aria-orientation="vertical"`);`horizontal`(WAI-ARIA separator 預設方向)時 Radix 刻意省略冗餘屬性,故 DOM 不出現 `aria-orientation="horizontal"`
- **判斷**:同 list 內 item 之間的視覺隔線 = decorative(預設);跨 region 的結構分隔(sidebar group / menu group)= semantic(`decorative={false}`)
- **不取得 focus**:Separator 永遠 non-interactive,無鍵盤行為
- **驗證**:Storybook a11y addon panel 0 critical violation;對齊 [Radix Separator a11y](https://www.radix-ui.com/primitives/docs/components/separator#accessibility)

## 相關

- `../../tokens/color/color.spec.md` — `--divider` / `--border` token 定義（「邊框 / 分隔」節）
- `../Button/button-group.tsx` — ButtonDivider 實作
- `../Sidebar/sidebar.tsx` — SidebarSeparator（Radix Separator 消費者）
- `../DropdownMenu/dropdown-menu.tsx` — DropdownMenuSeparator（Radix Menu Separator）
- `../Menu/menu-item.tsx` — MenuGroup 自動分隔 CSS pattern（`[&+&]:border-t`）
- `../Sidebar/sidebar.tsx` — SidebarGroup 自動分隔 pseudo-element pattern
