---
component: Sidebar
family: 1
variants:
  default:
    when: "標準導覽 row — 參與 single-selection,fg-secondary → hover foreground / active neutral-selected"
    world-class: ["Linear sidebar nav item", "Notion sidebar item", "VS Code Activity Bar primary item"]
  meta:
    when: "Section 底部命令 row(「Show more」「載入更多」「+ 新增專案」);font-normal + fg-muted,不參與 selection"
    world-class: ["Linear 'Show N more'", "Notion 'Show N more'", "Slack 'Show more'", "Gmail Labels 'More'"]
sizes:
  sm:
    px: 28
    when: "次導覽 / 設定頁分類 / 緊湊空間;對齊 field-height-sm"
    world-class: ["VS Code Settings sidebar(28)", "Atlassian secondary nav compact"]
  md:
    px: 32
    when: "預設 — 應用程式主導覽 row;對齊 TreeView / MenuItem 同 size 視覺無縫"
    world-class: ["Linear sidebar default", "Notion sidebar default", "Figma left panel"]
  lg:
    px: 36
    when: "重要主導覽(高 touch 區、horizontal headroom 大)、icon-prominent workspace switcher"
    world-class: ["Slack workspace sidebar large", "Discord server list large"]
traits:
  - hasVariants
  - hasSizes
  - hasInteractiveStates
  - isStructural
benchmark:
  - Ant Design Layout (Sider): github.com/ant-design/ant-design/tree/master/components/layout
  - MUI Drawer: github.com/mui/material-ui/tree/master/packages/mui-material/src/Drawer
  - Polaris Navigation: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Navigation
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Sidebar 設計原則

> **Foundational SSOT rationale**(2026-04-24 approved,cap 800):
> Sidebar 有獨立 `sidebarMenuButtonVariants` cva(對齊 MenuItem 但獨立實作,同步風險見 item-anatomy.spec「SidebarMenuButton 獨立實作風險」)+ 20+ Sidebar-specific features SSOT(Chrome header/footer 高度 / Collapsible / Icon 模式 / SidebarTrigger 位置 / Mobile 行為 / 持久化 / 快捷鍵 / Group 收合 / Single selection / Inline actions / Keyboard shortcuts),scope > 單一 MenuItem consumer。Full cva consume 提案經二次評估 declined(2026-04-24,詳 `.claude/planning/row-primitive-consolidation.md.rejected.20260424.md`)— ROW_PADDING_BY_SIZE token SSOT 已是 practical best。

## 定位

**應用程式的主導覽外殼**——頁面固定的側邊導覽容器，支援展開 / 收合、桌機與行動裝置的不同形態、扁平選單與階層樹兩種內容。

**實作基礎**：基於 Radix Collapsible + Radix Slot（shadcn Sidebar 模式改寫）+ 橋接 DS token。

**Layout Family**：CLAUDE.md 4-Family Model **Family 1（Menu item layout）** 消費者。結構繼承 `patterns/element-anatomy/item-anatomy.spec.md`「Menu item layout」章節的 scanning-mode 規格。

**不是**：NavigationMenu（水平導覽）、Tabs（同層切換）、Command Palette（跨頁搜尋）、Sheet / Drawer（暫時性面板）。Sidebar 是**持續存在**的主骨架。

---

## 何時用

- **多頁 app 的主導覽**：Slack、Linear、Notion、Figma 的左側 workspace + channel / project 清單
- **需要在所有頁面持續存在的次導覽**：settings 頁的分類、文件的章節跳轉
- **workspace 切換 + 功能分組並存**：頂部 workspace switcher + 下方常用功能 + 底部 settings
- **需要展開 / 收合但不消失**：小螢幕收合為 icon bar，大螢幕展開完整 label

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 頁面頂部水平導覽（單頁品牌、行銷站、電商）| 自訂 Nav / NavigationMenu | Sidebar 專於垂直結構、持續存在 |
| 同層切換內容（總覽 / 成員 / 設定）| `Tabs` | Tabs 切換的是平行視圖，不是跨頁導覽 |
| 暫時性的側邊面板（filter、detail pane）| `Sheet` | Sheet 可以被關閉消失，Sidebar 持續存在 |
| 跨頁搜尋 / 快速跳轉 | `Command`（Cmd+K palette）| Sidebar 是持久清單，Command 是即時查詢 |
| 少於 3 個頂層項目的 app | 頂部 tab bar 或直接頁面 | Sidebar 的視覺成本對小 app 過高 |

---

## 結構

```
SidebarProvider              ← 全域 context（open 狀態、cookie、快捷鍵）
  Sidebar                    ← 主容器（variant + collapsible + side）
    SidebarHeader            ← 頂部：logo、workspace switcher
    SidebarContent           ← 中間可捲動區
      SidebarGroup           ← 分組容器（可多個，純視覺分段）
        SidebarGroupLabel    ← 分組標題（icon 模式自動隱藏）
        SidebarGroupContent  ← 放以下其中一種：
          │
          ├─ SidebarMenu           扁平選單（1 層、有限可列舉）
          │    SidebarMenuItem
          │      SidebarMenuButton   ← 必須有 icon
          │      SidebarMenuBadge    ← 右側 badge
          │      SidebarMenuAction   ← hover 浮出的 action
          │
          └─ TreeView              階層樹（user data、任意深度）
    SidebarFooter            ← 底部：user menu、settings 觸發器
  SidebarTrigger             ← 展開 / 收合按鈕（放 sidebar 外，詳「SidebarTrigger 位置」段）
```

**不使用 shadcn 原版的 `SidebarMenuSub` / `SidebarMenuSubItem`**——見下方內容形態規則。

---

## Size（sm / md / lg）— 透過 SidebarProvider 一次設定

`SidebarProvider` 接受 `size` prop（預設 `"md"`），透過 context 傳給所有 row 元件（`SidebarMenuButton` / `SidebarGroupLabel` / `SidebarMenuSkeleton`）。這對齊 `DropdownMenu` 的 `SizeContext` 架構——**consumer 設一次，整個 sidebar 的 row 都跟著變**。

```tsx
<SidebarProvider size="lg">
  <Sidebar>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {/* 這裡所有 button 自動繼承 size="lg",不用一個一個傳 */}
            <SidebarMenuItem>
              <SidebarMenuButton startIcon={Inbox}>Inbox</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</SidebarProvider>
```

**個別覆寫**（少見）：若某個 button 特別需要不同 size，可在 `SidebarMenuButton` 傳 `size` prop 覆寫 context 值。

**Row geometry 對齊 item-layout**：sm/md/lg 三個 size 的 row height / text size / icon size 跟 `TreeView` / `MenuItem` 完全一致——跨元件視覺無縫。

**Row size 跟 density 的差別**：
- **Size variant**（sm/md/lg）是 **consumer 的風格選擇**，決定 sidebar 整體 row 大小
- **Density**（md/lg）是**全域 UI 設定**,影響所有 `--field-height-*` tokens 的實際值
- 兩者**獨立**:size="md" 在 density="md" 下是 32px row、在 density="lg" 下自動變 36px row

**Chrome header 不跟 size 變**：`SidebarHeader` 固定用 `var(--chrome-header-height)`,只跟 **density** 連動,不跟 `size` prop 變——因為 header 是結構槽位,不是 row。**SidebarFooter 修正(2026-06-12 doc-to-code)**:footer 實作自 2026-04-14 起為 content-based(`flex flex-col py-2`,sidebar.tsx SidebarFooter,行為同 SidebarGroup),**非** fixed-h——單行高度由下方內容紀律保證,非結構鎖。

**SidebarFooter user 區必單行(2026-06-12 明文,fork drift 防線)**:名字單行(`text-body-lg` truncate);職稱/email/工號等身份資訊歸 `ItemAvatar hoverCard` 的 ProfileCard(UserFooter canonical,sidebar.stories.tsx)。shadcn nav-user 的「name + email `text-xs` 兩行」是 demo 慣例非本 DS canonical(`text-xs` 同時違反下方 chrome typography 一律 `text-body-lg` 條);registry antiPattern `sidebar-footer-two-line` 機械攔。

**SidebarHeader brand 必單行(2026-06-12 明文,fork drift anchor)**:Avatar 24 + 名稱單行,**無副標 slot**——Fixed-h chrome 結構上不可成長;plan/org 等第二行資訊歸 workspace switcher dropdown row,對齊 Slack/Notion/Linear 現行版單行。shadcn TeamSwitcher demo 的「Acme Inc + Enterprise」兩行是 demo 慣例非本 DS canonical(fork repo AI 曾以訓練先驗在 spec 沉默處回填此副標)。Registry antiPattern `sidebar-header-subtitle-second-line` 機械攔(flex-col 直接子層簽名)。

---

## 內容形態選擇（核心設計決策）

Sidebar 有兩種正交的內容形態，consumer 嚴格擇一或混用：

| 形態 | 元件 | 深度 | 數量 | Icon 模式 |
|------|------|------|------|----------|
| **扁平導覽** | `SidebarMenu` | **嚴格 1 層** | **有限可列舉** | ✅ 顯示 icon + tooltip |
| **階層樹** | `TreeView` | 任意 | 任意 | ❌ 整區隱藏 |

### 判斷規則

> **SidebarMenu 只接受「1 層 + designer 能在設計時列舉所有項目」**。
> 任何不符合的情況——深度 > 1、數量不可列舉、使用者可 runtime 新增——一律 TreeView。

### 為什麼只有 1 層

Linear、Notion、Slack、VS Code、Figma、Gmail——**沒有任何頂級產品在 sidebar 主選單用語意階層**。凡有階層都是 TreeView（user data）或 SidebarGroup（純視覺分段）。shadcn 的 `SidebarMenuSub` 是 demo 便利 API，本 design system 完全不 export，避免誤用。

### 「Projects > A / B」這類

User-generated data **一律 TreeView**，不論數量——即使現在只有 3 個 project，未來會長。唯一例外是 designer 在設計時就固定死的 5 個 module 後台，這種情境極少。

### Settings 這類有子頁的頁面

三條正確路徑，**全部不用 SidebarMenuSub**：

#### 路徑 A：In-page secondary nav（推薦，最世界級）

Sidebar 只放一顆 `Settings`，點進去後在 **Settings 頁面內部**用左側 rail 或 Tabs 呈現子頁。子頁屬於 Settings 頁面的內部狀態，不佔 sidebar 位置。

代表：Linear（modal + 左 rail）、GitHub（repo settings 頁內 rail）、Notion（modal + tabs）。

#### 路徑 B：SidebarGroup 扁平化

子頁等重要、都需一鍵直達時，用 SidebarGroupLabel 當純視覺分段標題，**子項全部是獨立頂層 SidebarMenuItem**（各自有 icon、各自在 icon 模式顯示）。

僅在子項確實高頻使用時才用，少見。

#### 路徑 C：User menu modal

Settings 不在 sidebar，從 footer 的 avatar / user menu 觸發 modal 或快捷鍵（`Cmd+,`）。適合低頻操作。

代表：Linear、Slack、Discord。

#### A 和 C 並用

大型產品通常**同時有 A 和 C**，依設定性質分流（Linear 的實際做法）：

- **路徑 A**：功能性設定（workspace settings、project settings、team members、integrations）—— sidebar 有入口，點進去是完整頁面 + 內部 secondary nav
- **路徑 C**：個人偏好（theme、language、keyboard shortcuts、personal notifications）—— 從 user menu 叫出 modal，不佔 sidebar

判斷：**需要協作、會分享連結給別人看的設定 → A**；**只影響自己、低頻的偏好 → C**。

### 混用

Gmail / Linear 的標準版型：上方 SidebarGroup 放扁平主導覽（SidebarMenu），下方 SidebarGroup 放 user data（TreeView）。icon 模式下，扁平區顯示 icon + tooltip，TreeView 整段隱藏。

---

## Variant（視覺形態）

目前只有一種：**`sidebar`**（貼齊 viewport 邊緣、與主內容共用邊界）。

**已移除 / 未實作的 variant**：
- **`floating`**（脫離邊緣的浮動面板）：**刻意不做**。沒有可靠的「收合後預覽」互動（hover flyout 是 NN/g 反模式），單純換個圓角陰影的 floating 跟 `sidebar` 在功能上無差，徒增維護成本。如果未來需要卡片感，改用 `inset`
- **`inset`**（主內容浮起卡片）：規劃中，未實作

---

## Chrome header / footer 高度：density-responsive shared token

`SidebarHeader` 的高度 = `var(--chrome-header-height)`，**不是寫死**，也**不是完全 content-based**(SidebarFooter 為 content-based,見上方 2026-06-12 修正)。這個 token：

> **跨家族 SSOT pointer**:本元件 SidebarHeader 屬 **Chrome header(Fixed-h)家族**;border / padding / dismiss size / withTabs(tabs 進 header 時 border auto-suppress + tabs size 對應 + flush stack)的跨家族視覺契約 SSOT 詳 `patterns/header-canonical/header-canonical.spec.md`。本節僅 codify Sidebar 特有的高度 + token rationale。

- md density: `3rem`（48px）
- lg density: `3.5rem`（56px）
- **跨元件共享**：sidebar header、主內容 page header 都用同一個 token(sidebar footer 為 content-based,見上方 2026-06-12 修正)
- **隨 density 同步變**

### 為什麼是這個設計（不是 h-12 寫死 或 py-3 純 padding）

| 方案 | 外部對齊 | 內部 padding 比例 | 世界級？ |
|---|---|---|---|
| A. 寫死 `h-12`（48px） | ✅ 跨元件同高 | ❌ lg density 下 button 撐高,chrome 固定 → padding 被擠壓到不足,比例破壞 | ❌ 破功 |
| B. 純 padding `py-3` | ❌ 不同 header 因 content 高度不同，無法對齊 | ✅ 內部 padding 固定 | ❌ 對齊破功 |
| C. **Density-responsive token**（本方案） | ✅ 跨元件同高（共享 token） | ✅ token 隨 density 放大，padding 比例維持 | ✅ |

**關鍵洞察**：chrome 的 content（button、icon）本身就是 density-responsive 的（綁 `--field-height-*`），chrome 容器如果不跟著 density 變，必然會擠壓。所以 chrome **必須跟 density 連動**，但**透過專屬 token，不直接綁 item size**。

### 比例驗證

| Density | Header | Button md | 上下 padding |
|---|---|---|---|
| md | 48px | 32px | 8px |
| lg | 56px | 36px | 10px |

比例維持一致，跨 density 視覺一致。

### 不隨 item size variant 變

`SidebarMenuButton` 的 `size="sm/md/lg"` 是 **row 層級的選擇**（consumer 決定內容列的尺寸），跟 chrome 無關。Header 只跟 **density**（全域設定）綁定。

### Chrome 內容的約束

放在 SidebarHeader / SidebarFooter 裡的元件必須能容納在這個高度內：

- Avatar: `size={24}` —— **chrome header avatar canonical（density-fixed / row-size-fixed）**。consumer 用 **raw `<Avatar size={24}>`**（chrome header 不是 row context → 不該用 `<ItemAvatar>`）。對應 CSS local token `--chrome-header-avatar-size: 1.5rem`（`header-canonical.css`），sidebar 收合對齊公式消費此 token。詳 `header-canonical.spec.md`「4.5 Chrome header avatar SSOT」段 + `item-anatomy.spec.md`「Scope 例外:Chrome header 不是 row context」段。
- Button: `size="sm"` 或 `size="md"`
- 單排 title 文字 + icon button

**不要**放超出高度的內容（多行 title、大按鈕等）——如果需要，代表誤用 header，改用獨立的 `SidebarContent` 區塊。

### 跟 Modal header 的差別

Modal header 用 **padding-based**（`py-3` + content），因為 modal 是 ephemeral（自成一體），不需要外部對齊。兩種規則都是世界級，各自適用：

- **Chrome**（sidebar / page header）：共享固定高度 token，density-responsive → 保證跨元件對齊
- **Ephemeral**（modal / dialog）：padding-based → 保證內容適應性

### Chrome 內的 text element:統一 typography

所有住在 chrome header / footer 裡的 text element(workspace brand、page title、user name)**一律使用 `text-body-lg font-medium`**。

**原則:chrome 元素是 sibling,不用 size/weight 製造假階層**
- 不同 size → 會造成假階層,好像「A 是 B 的副標題」;chrome elements 實際上是並排的結構槽位,沒有從屬關係
- 不同 weight → 會造成「哪個比較重要」的語意混淆
- **「當前位置」的訊號由 sidebar active item(`bg-neutral-selected`)負責**,不靠 page title 的字重搶戲

### 對照 Linear / Slack / Discord / Figma <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

| 產品 | Chrome text size | 做法 |
|---|---|---|
| Linear | 14-15px medium | 同 size 同 weight |
| Slack | 15-18px bold | 同 weight,稍有 size 差異 |
| Discord | 16px semibold | 同 size 同 weight |
| Figma | 13px regular | 同 size 同 weight |

我們選 **`text-body-lg font-medium` 統一**,是世界級 chrome typography 的中庸做法——比 Linear（14-15px medium）字級大 1px / weight 一致，比 Slack（15-18px bold）字級略小且 weight 較輕避免 navigation 過度搶 attention，對齊 Discord（16px semibold）。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## Collapsible（收合模式）

| Mode | 說明 | 適合 |
|------|------|------|
| **`offcanvas`** | 整個 sidebar 滑出畫面 | 內容優先、低頻導覽（Notion、Figma） |
| **`icon`** | 收合為 icon-only 細列，頂層 icon 仍可見可點 | 扁平導覽、高頻跨頁切換（Gmail、Slack）。**前提：所有 SidebarMenuItem 必須有 icon + 可導覽** |
| **`none`** | 不可收合 | 超簡單應用或 sidebar 是頁面核心（file explorer） |

---

## Icon 模式的行為規則

### 規則 1：icon rail 上的每顆 icon 必須可導覽

絕對不可有「點了沒反應」或「點了只是展開選單」的 icon。icon 列是收合狀態下唯一的導覽介面。

### 規則 2：純分組 header 不可用 SidebarMenuItem

只是用來分組下方 children（沒有自己的頁面）的項目，**必須用 SidebarGroup + SidebarGroupLabel**。`SidebarGroupLabel` 在 icon 模式自動隱藏，子 items 照常顯示；`SidebarMenuItem` 則會變成死 icon。

### 規則 3：TreeView 在 icon 模式整個隱藏

不做 icon 化、不做 flyout、不做 popover。Tree 無法壓縮成單排 icon，Gmail / Linear / Notion 一致隱藏。

### 規則 4：重新看階層資料的唯一路徑 = 展開 sidebar

不提供「點 icon 順便展開」的副作用——行為不可預測，熟練使用者要收合兩次。逃生艙由應用層搭配 Command Palette（Cmd+K）提供，不是 Sidebar 的責任。

---

## SidebarTrigger 位置(兩種 canonical pattern)

**核心判準**(唯一):**trigger 必須在 sidebar 任何 state(offcanvas 收掉 / icon / expanded)下都保持可見**。違反這條 = dead state(offcanvas 收掉就再也打不開)。

兩種 canonical pattern,都符合判準,選哪種看 app shell 的整體 layout:

### Pattern A:Full-height sidebar + 主內容 header

- Sidebar 從畫面頂部一路延伸到底部
- 主內容區自帶 header(page title bar)
- **Trigger 位置**:主內容 header 的最左(在 page title 之前)
- **代表**:Linear / Notion / Figma / Cursor / VS Code / Slack

### Pattern B:Global top app bar + sidebar drawer

- 頂部 bar 跨整個畫面寬度(包含 sidebar 跟 main content 的水平範圍)
- Sidebar 在 top bar **下方**,只佔頁面剩餘高度
- **Trigger 位置**:top bar 的最左(視覺位置在 sidebar 上方對齊,實際屬於 top bar 的一部分;top bar 永遠存在,所以 offcanvas 收掉 sidebar 後 trigger 仍然在)
- **代表**:**Gmail / Google Calendar / Google Drive / Material Design apps** / 多數企業 dashboard

### 判斷:trigger 在哪 = top bar 在哪

```
Pattern A(無 global top bar):
┌────────┬─────────────────┐
│        │ ☰  Page Title   │  ← trigger 在主內容 header 最左
│Sidebar │                 │
│        │  (content)      │
└────────┴─────────────────┘

Pattern B(有 global top bar):
┌──────────────────────────┐
│ ☰  Logo  Search    Nav   │  ← trigger 在 global top bar 最左
├────────┬─────────────────┤
│        │                 │
│Sidebar │  (content)      │
│        │                 │
└────────┴─────────────────┘
```

**搭配鍵盤快捷**:`⌘B` / `Ctrl+B` 是 industry-standard,已內建,不該改。

**禁止**:

- ❌ Trigger 放在 sidebar **內部** sidebar 元件之內(SidebarHeader 內)——offcanvas 收掉就消失,dead state
- ❌ 放在 header **最右**——違反 F-pattern 閱讀動線
- ❌ 使用浮動按鈕 / FAB——mobile app pattern,跟桌面 sidebar 語意不合
- ❌ 同一 app 內混用兩種 pattern——使用者肌肉記憶失效

**判斷你的 app 該用哪個**:

- 有 global top bar(logo / search / 全域 nav 在頂部)→ **Pattern B**,trigger 在 top bar 最左
- 沒有 global top bar(每個頁面自己 header)→ **Pattern A**,trigger 在主內容 header 最左
- 介於兩者之間 → 看主導需求,但 **不要混用**

---

## Sidebar 全域 prefix 對齊(`uniformPrefix`,預設關閉)

`<SidebarProvider>` 預設 `uniformPrefix={false}`——大宗情境(全 icon 主導覽 / 全 avatar user 列表 / 純 TreeView)各自獨立節奏即可,**不需要這個 prop**。

### 什麼時候 opt-in `uniformPrefix={true}`

**唯一明確的場景:sidebar 內有大量 brand logo 和一般 icon 混用,使用者期待 label 齊左**。

具體 use case:

- **Linear / Raycast / Notion 風格的 integrations 清單**:主導覽是 lucide icon(Home / Inbox / Team,16px),底下接著一串 integrations(GitHub / Slack / Figma / Jira,24px brand logo)。兩種 prefix 都是「導覽目的地」,語意等價,只是 visual hint 不同——使用者期待 label 齊左掃視
- **App launcher / workspace switcher**:每個 workspace 有自己的 brand logo,夾雜系統性的 icon-based 項目
- **CMS / connected apps**:每個來源(Notion / Google Docs / Confluence)有自己的 logo,跟 icon-based 的「我的草稿」「最近開啟」等並列

**不是這個 use case 就不要開**:

- ❌ 全 icon 主導覽 + 全 avatar 的 user footer → 語意不同層級,應該分 SidebarGroup,不該強迫對齊
- ❌ 純美感「我覺得對齊比較整齊」沒有真實混用情境 → 預設行為已經對(全 icon 自然就齊左)
- ❌ 偶爾一兩個 avatar 混在 icon 群裡 → 通常代表設計分組沒做好,先檢查語意,別用 `uniformPrefix` 補

### API

```tsx
// 預設:大宗情境,不需要這個 prop
<SidebarProvider>
  <Sidebar>...</Sidebar>
</SidebarProvider>

// Opt-in:有 brand logo + icon 混用的 integration sidebar
<SidebarProvider uniformPrefix>
  <Sidebar>
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu>
          {/* 主導覽:icon prefix */}
          <SidebarMenuButton id="home"  startIcon={Home}>Home</SidebarMenuButton>
          <SidebarMenuButton id="inbox" startIcon={Inbox}>Inbox</SidebarMenuButton>

          {/* Integrations:brand logo prefix(同 menu,語意等價)*/}
          <SidebarMenuButton id="github" asChild>
            <button>
              <ItemAvatar shape="square" alt="GitHub" src="/logos/github.svg" />
              <ItemLabel>GitHub</ItemLabel>
            </button>
          </SidebarMenuButton>
          <SidebarMenuButton id="slack" asChild>
            <button>
              <ItemAvatar shape="square" alt="Slack" src="/logos/slack.svg" />
              <ItemLabel>Slack</ItemLabel>
            </button>
          </SidebarMenuButton>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</SidebarProvider>
```

`uniformPrefix` 開啟後:`Home` / `Inbox` 的 16px icon 在 24px 槽內 `justify-center`,`GitHub` / `Slack` 的 24px logo 填滿槽——四個 label x 完全對齊。

### 機制細節

- 啟用後,`SidebarProvider` wrapper 的 CSS `:has()` selector 偵測整個子樹同時存在 `data-prefix-type="icon"` 和 `"avatar"` 的後代(由 `<ItemIcon>` / `<ItemAvatar>` 自動標記)
- **混用偵測命中** → 套用固定 24px 槽
- **沒混用** → 偵測失敗,完全 no-op,行為跟預設一樣(零 runtime 成本)

所以即使你預設開啟 `uniformPrefix`,只有真正混用時才會動到排版。但**我們仍然預設關閉**,因為:explicit > implicit——consumer 沒主動要求,系統不該在背後做事,源碼讀起來才透明。

### 為什麼預設關閉(不是 always-on auto)

CSS `:has()` 不混用時零成本,理論上 always-on 也沒事。我們刻意預設關閉的理由是 **API 立場**:

1. **Explicit > implicit**:CSS auto-detect 是「藏在背後的魔法」。預設關閉表示「sidebar 的排版行為從你寫的 prop 一眼看出」,沒有隱含規則
2. **強迫 consumer 想清楚 use case**:打 `uniformPrefix` 一個字代表「我有意要做混用對齊」,reviewer / 未來維護者讀到這個 prop 就知道為什麼

### 沒有 per-menu override

`SidebarMenu` 不接 `uniformPrefix`。曾經設計過(三層級組合),但零真實 caller。如果未來需要「全域對齊但這個 menu 不對齊」這種精細控制,那時候會有具體 use case 推導出正確 API,而不是現在猜想。

詳細實作機制(`<ItemIcon>` / `<ItemAvatar>` 自動標記 `data-prefix-type`、`getUniformPrefixSlotStyle()` 算槽寬、CSS variable cascade)見 `item-anatomy.spec.md` 的「Uniform prefix slot」節。

---

## SidebarMenuButton variant

| Variant | 視覺 | 語意 | Single selection | 典型用法 |
|---|---|---|---|---|
| **`default`**(預設) | `text-fg-secondary`, `font-medium`, active → `bg-neutral-selected` | 導覽目的地(nav item) | ✅ 參與,接 `id` prop | Dashboard / Inbox / Settings / user data item |
| **`meta`** | `text-fg-muted`, `font-normal`, **永不 active** | 命令 row(非導覽) | ❌ 不參與,不傳 `id`(傳了也會被忽略) | 「查看更多」/「載入更多」/「+ 新增專案」/「Show all」 |

**為什麼需要 meta variant**:section 底部的「查看更多」如果用 default variant,會有三個問題:

1. 視覺重量跟真正的 nav item 相同 → 使用者誤以為是另一個資料項
2. 會被選中變 active → 搶走真正 nav item 的 selection 焦點
3. consumer 得手動覆寫 `className="text-fg-muted"`、手動不傳 id → 每個 consumer 都有可能漏

variant=meta 把這三件事做成結構性保證:樣式自動退、selection 自動跳過、型別層不需要特判。

**API**:

```tsx
<SidebarMenuButton
  variant="meta"
  startIcon={ChevronDown}
  onClick={loadMore}
>
  查看更多 (12)
</SidebarMenuButton>
```

**世界級對照**:Linear「Show N more」、Notion「Show N more」、Slack「Show more」、Gmail Labels「More」——全部是「section 底部的 muted 命令 row」,行為與視覺一致。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**禁止**:

- ❌ meta variant 傳 `id`——語意矛盾,meta 不該參與 selection
- ❌ default variant 手動 `className="text-fg-muted"` 模擬 meta 效果——改用 `variant="meta"`,結構對齊
- ❌ meta variant 放在 section 中間——meta 只屬於 section **底部**,位置本身是「這是尾巴」的訊號

---

## Single selection（整個 sidebar 同時只有一個 active item）

**規則**:不論 MainNav / TreeView / Favorites / 任何 group,**同一時間只有一個 item 被選中**。選任何 item 都會自動 deselect 其他。沒有例外——sidebar 的核心語意是「當下在哪頁」,多個 active 就失去意義。

**結構性保證**:`SidebarProvider` 內建 single-selection state,`SidebarMenuButton` 接 `id` prop 自動從 context 讀 `isActive`、自動在 `onClick` 呼叫 `setActiveId`。

```tsx
// Controlled(router-driven,typical production 用法)
<SidebarProvider activeId={currentPath} onActiveChange={router.push}>
  <SidebarMenuButton id="/dashboard" startIcon={LayoutDashboard}>Dashboard</SidebarMenuButton>
  <SidebarMenuButton id="/inbox"     startIcon={Inbox}>Inbox</SidebarMenuButton>
</SidebarProvider>

// Uncontrolled(demo / simple app)
<SidebarProvider defaultActiveId="dashboard">
  <SidebarMenuButton id="dashboard" ...>Dashboard</SidebarMenuButton>
</SidebarProvider>
```

**為什麼結構性強制**:過去曾寫出「忘記接 isActive / onClick 的啞 item」(stories 展示 inline action 時發生)— 外觀提供可點擊 affordance 但事件未連 state,產生誤導性互動(click 後永遠不進 active)。把 selection state 內建到 Provider、讓 button 接 `id` 就自動 wire,consumer **無法**寫出啞 item——沒傳 id 就失去 selection 能力,一眼看得出來。

**禁止**:

- ❌ SidebarMenuButton 不傳 `id`(除非確定這個 item 不參與 selection——極罕見,例如純按鈕 action)
- ❌ 手動維護每個 group 獨立的 activeId(違反 single-selection,會出現兩個 active)
- ❌ 同時用 `id`(自動)和 `isActive`(手動覆寫),除非 consumer 有明確的 override 理由(例如 router 尚未更新的 optimistic highlight)

**Router integration**:production 用法通常是 controlled mode——從 URL 算 `activeId`,`onActiveChange` 呼叫 router.push。uncontrolled mode 主要是 demo / Storybook 用。

---

## SidebarGroup 收合（`collapsible` prop）

`<SidebarGroup collapsible>` 把整個 group 升級成可點擊收合。內部用 Radix Collapsible 實作,**三件事自動發生**:

1. `SidebarGroupLabel` 本身仍是純裝飾 header(`div` `role="presentation"`),**只有尾端的 chevron** 是 trigger（`Collapsible.Trigger asChild` 包住 `ItemInlineActionButton`，帶 hover bg / `cursor-pointer`）——刻意不把整個 label 升格為 button，理由見下方 rationale
2. Label 尾端自動渲染 `ChevronDown` icon(accordion 慣例),open 時旋轉 180°
3. `SidebarGroupContent` 被 `Collapsible.Content` 包起來,data-state 可驅動動畫

Consumer 不需要任何額外 code——只要加一個 prop:

```tsx
<SidebarGroup collapsible defaultOpen={false}>
  <SidebarGroupLabel>Projects</SidebarGroupLabel>
  <SidebarGroupContent><TreeView>...</TreeView></SidebarGroupContent>
</SidebarGroup>
```

**何時用**:
- ✅ 長清單需要讓使用者暫時收起(Projects / Favorites 等次要 section)
- ✅ Group 內容可選(使用者可能根本沒加任何 project)
- ❌ 主導覽 group(永遠要看見)
- ❌ 只有 1-2 個 item 的 group(收合徒增互動成本)

**為什麼 prop 放在 `SidebarGroup` 而非 `SidebarGroupLabel`**:「是否可收合」是結構層決定,影響 label(是否 trigger)+ content(是否 animated container)兩個 primitive。放在 label 上會讓 content 不知道該不該被 `Collapsible.Content` 包,形成 prop drilling。group 層用 React context 傳遞是標準做法。

---

## Inline actions（SidebarMenuButton suffix slot）

`<SidebarMenuButton inlineActions={[...]}>` 支援 suffix 放置 inline action button,搭配 `actionsReveal="hover"` 做 TreeView 風格的 hover-reveal。

**宣告式 API**,完全對齊 `patterns/element-anatomy/inline-action.spec.md`(Inline Action SSOT):

```tsx
<SidebarMenuButton
  startIcon={Folder}
  actionsReveal="hover"
  inlineActions={[
    { icon: MoreVertical, label: '更多', onClick: handleMore },
    { icon: Plus,           label: '新增', onClick: handleAdd },
  ]}
>
  專案 Alpha
</SidebarMenuButton>
```

**Consumer 不需要**:

- 指定 icon 尺寸(host 從 row size 查 `ICON_SIZE`)
- 寫 hover background span 的絕對定位 JSX(`ItemInlineAction` 內部封裝)
- 處理 Tooltip / `aria-label` / `cursor-pointer`(宣告式 config 自動帶)
- 計算 button 的 `paddingRight`(host 用 `N×icon + (N-1)×gap + loose + gap` 公式自動算)

**規格**(完全繼承 `inline-action.spec.md`):

| 項目 | 值 |
|---|---|
| Icon 尺寸 | `ICON_SIZE[size]`(16/16/20) |
| Hover bg 尺寸 | icon + 2(18/18/22) |
| Hover bg 圓角 | `rounded-md`(全尺寸一致) |
| Icon 顏色 | `fg-muted` → `foreground` on hover/active |
| 多個 action 間距 | `gap-2`(8px) |
| 出現時機 | 預設永遠顯示;`actionsReveal="hover"` → row hover/focus 才淡入 |
| Icon 模式 | 整個 suffix 隱藏 |
| Host disabled 時 | 不渲染(遵守宿主 disabled 規則) |

**Canonical 實作**:`ItemInlineAction` + `ItemSuffix`(`item-anatomy.tsx`)。未來 DropdownMenuItem / TreeItem / Field / Tag 都應逐步遷移到這個共用元件,消除「每個 host 各自複製 18 行 JSX」的技術債——見 `inline-action.spec.md`(Inline Action SSOT)。

**何時用**:
- ✅ Favorites / Bookmarks 類 user data item 的 hover-reveal 「⋯」/「×」
- ✅ Project item 的 quick action(rename / delete)
- ❌ 主導覽 item(應該聚焦導覽意圖,不放行為按鈕)
- ❌ 收合選單的觸發器(用 `<SidebarGroup collapsible>` label trigger,不要塞在 suffix)

---

## Mobile 行為

`md` breakpoint（768px）以下自動切 **Sheet 抽屜**——從側邊滑入、覆蓋主內容、點外部或 Esc 關閉。Sheet 寬度用 `--sidebar-width-mobile`，**mobile 沒有 icon 模式**（細列在手機上既占空間又難點）。

Sheet 開啟狀態**不持久化**。

**Sheet 蓋住 global top bar → primary-header consumer 須在 Sheet 內補品牌/帳號**:Sheet（z-50）打開時覆蓋整個左側含 global top bar。若你是 `AppShell` `primary-header` 派(品牌 logo + 帳號入口放在 globalHeader、sidebar 平常無 header/footer),小螢幕 Sheet 打開後 globalHeader 被蓋住 → 使用者看不到品牌也按不到帳號。解法:consumer 讀 `useSidebar().isMobile` + `useAppShell().layout`,**mobile 時才**在 `<SidebarHeader>` 內放 `<WorkspaceBrand/>`(左)+ `flex-1` + `<AccountMenu/>`(右)= 把整條 globalHeader 鏡像進 Sheet 頂排(SidebarHeader 即 ChromeHeader 基底,結構 SSOT);**不放 `<SidebarFooter>`**(primary-header 帳號家在 header 區,footer 是 primary-sidebar 慣例)。**rule owner = `../AppShell/app-shell.spec.md`「帳號入口(Account entry)放置 SSOT」的 Responsive 精修子句**(本處不重述,Rule-of-3)。reference:`AppShell/_demo-helpers.tsx` `AcmeSidebar`。

---

## 持久化與快捷鍵

- **Cookie**：`sidebar_state`, 7 天。SSR 環境下 `SidebarProvider` 必須接 `defaultOpen` 從 server cookie 傳入以避免 hydration flash
- **快捷鍵**：`Cmd+B` / `Ctrl+B` 切換收合（VS Code、Linear、shadcn 一致，不要發明新鍵）

---

## 尺寸規範

元件 scope 的 design token，consumer 可覆寫：

| Token | 預設值 | 用途 |
|-------|--------|------|
| `--sidebar-width` | `15rem` (240px) | 展開寬度(2026-05-21 v11 user 拍板 240px;對齊 Linear/Notion/Figma/Polaris/Material Drawer 主流 240–256,5/8 家 = 240。也是 `--sidebar-width-min` AppShell Aside floor 共識值)|
| `--sidebar-width-icon` | `calc(2 * var(--layout-space-loose) + var(--sidebar-menu-icon-size))` | icon 模式寬度(2026-05-21 v3 撤回 `3rem` hardcode,改 geometry formula 保證 icon center x = loose + icon/2 在展開/收合一致;md=48 / lg=64,跟 chrome-header-height 解耦)|
| `--sidebar-menu-icon-size` | `1rem` (16px) | sidebar menu icon 大小(per ICON_SIZE.sm/md=16);size=lg 罕見 case override `1.25rem` |
| `--sidebar-width-mobile` | `18rem` | Mobile sheet 寬度 |

**用 rem**：跟隨 root font-size，支援 accessibility 等比例縮放。**不用 layoutSpace / uiSize 推導**：sidebar width 是容器維度，不是間距或元件內高度，語意不同；耦合會讓寬度跟間距連動。**15rem / 18rem** 對齊 Linear/Notion/Figma/Polaris/Material Drawer 240–288 主流寬度,`--sidebar-width-icon` 用 geometry formula(2026-05-21 v3)`calc(2*loose + icon-size)` 保證 collapse/expand icon center x 一致。

---

## 常見誤解

- 「SidebarMenuSub 可做第 2 層選單」——本 DS 不 export;深度 > 1 一律 TreeView(見「內容形態選擇」)
- 「Settings 子頁要佔 sidebar 位置」——走 in-page secondary nav / user menu modal(見「Settings 這類有子頁的頁面」)
- 「點 icon 可順便展開 sidebar」——行為不可預測;重新看階層資料的唯一路徑 = 展開 sidebar(見「Icon 模式的行為規則」)

---

## 禁止事項

- ❌ **使用 SidebarMenuSub / 讓 SidebarMenu 超過 1 層**——用 TreeView 或 in-page secondary nav
- ❌ **Hover flyout / popover 顯示 tree 或 sub-items**——2000 年代 cascading menu 反模式，NN/g 多年反對
- ❌ **純分組 header 用 SidebarMenuItem**——icon 模式變死 icon，用 SidebarGroup
- ❌ **點 icon 順便展開 sidebar**（expandOnClick 副作用）——行為不可預測
- ❌ **把 user data 塞 SidebarMenu**——即使只有 3 項，只要使用者可新增就是 tree
- ❌ **在 Sidebar 內放路由邏輯**——路由是 consumer 的事，用 `asChild` 包自家 Link / router
- ❌ **硬寫寬度到子元件**——子元件應完全自適應 Sidebar 寬度
- ❌ **Mobile 保留 icon 模式**——只有全寬 sheet / 關閉兩種狀態

---

## 與其他元件的關係

- **TreeView**：放在 SidebarContent 內；icon 模式由 Sidebar 透過 CSS 自動隱藏；`context="sidebar"` 讓 TreeView 用 sidebar 的 padding token
- **Command（Cmd+K）**：icon 模式下深層頁面跳轉的逃生艙
- **Tabs**：Settings 等頁面的 in-page secondary nav
- **DropdownMenu**：SidebarHeader 的 workspace switcher、SidebarFooter 的 user menu
- **Avatar**：SidebarFooter 顯示當前使用者

---

## 判斷決策樹

```
Variant：目前僅 sidebar（floating 刻意不做 / inset 規劃中未實作，見「Variant」段）

Collapsible：內容優先低頻導覽 → offcanvas；扁平高頻切換 → icon；超簡單 → none

內容：
├─ designer 1 層固定導覽       → SidebarMenu
├─ user data / 階層 / 可新增   → TreeView
├─ 兩者都有                     → SidebarMenu + TreeView 分區
└─ Settings 等有子頁的頁面      → in-page secondary nav（不塞 sidebar）
```

---

## 為何無 Inspector

Sidebar 的決策維度是「結構配置」(variant / collapsible / uniformPrefix / density)不是單一 prop——已由 `Overview`(結構樹)+ `SizeMatrix` + `ColorMatrix` + `StateBehavior` + `ChromeTokens` 五 story 完整覆蓋。互動 Inspector 切單一 prop 不如結構對照,且 Sidebar 外觀需要足夠的 nav 量才能展示——真實展示是 `Overview` 的 SidebarPreview 完整結構。

## StateBehavior(Sidebar 層級特有)

Item-level default / hover / selected / disabled **色彩**完全共用 item-anatomy row primitive(`patterns/element-anatomy/item-anatomy.spec.md`),由 `ColorMatrix` 用 4 個 state 的完整 token 對照表承載(state-driven 色彩表)。SidebarMenuButton(獨立 cva)無 `:active` press state——對齊 MenuItem / TreeItem 同族 row-button,`--neutral-active` 僅由 inline-action 子按鈕消費(item-anatomy.tsx group-active/action),menu button 本體不套用。Sidebar 的 `StateBehavior` story 則展示 **container 層級的結構狀態切換**:三種 `collapsible` 模式(offcanvas / icon / none)、Cmd+B / SidebarTrigger toggle、icon mode 下 label 隱藏 + Tooltip 代償、跨 session cookie 還原——這些是 shell 層級特有的行為,不存在於 row item primitive。

---

## A11y 預設

- **Landmark**:`<Sidebar>` 目前渲染 `<div>`(三種 collapsible 分支皆然),**不自帶** `<nav>` 元素或 `role="navigation"`、`aria-label`。consumer 若要 page-level navigation landmark,需自行用 `<nav aria-label="Main">` 包住 `<Sidebar>`(或對導覽區塊 `<SidebarGroup>` 加 `role="navigation"`)。
- **Active item**:`SidebarMenuButton` 帶 `id` + 命中 `activeId` 時自動加 `data-active="true"`,呈現選取底色（`bg-neutral-selected`)。**目前僅視覺 + `data-active` attribute,不設 `aria-current="page"`**——SR 讀不到「current page」語意。`variant="meta"` 永不參與 selection（`data-active` 永遠 false）。
- **快捷鍵不衝突**:`Cmd+B` / `Ctrl+B` 是 industry-standard(VS Code / Linear / shadcn),DS 內建在 `SidebarProvider` 的 `window` keydown handler,只判斷 `key==="b" && (metaKey||ctrlKey)` 即 `preventDefault` + toggle，避免穿透到 browser bookmark bar(`Cmd+B` 在 Safari 是 favorites)。**目前無 opt-out prop**(無 `disableShortcut`)、**也未排除文字輸入框內**——在 `<input>` / `<textarea>` 內按 `Cmd/Ctrl+B` 仍會 toggle 並攔掉預設行為。
- **Mobile sheet focus trap**:`md` breakpoint 以下切 Sheet 模式時,Radix Dialog 自帶 focus trap + Esc dismiss + restore focus to trigger(詳 sheet.spec.md)。
- **Collapsible group**:`<SidebarGroup collapsible>` 的 label trigger 帶 `aria-expanded` + `aria-controls` 指向 GroupContent id,SR 可朗讀展開狀態。
- **Sticky header / footer focus order**:Tab 順序按 DOM 順序 — Header → Content → Footer,SidebarTrigger 在 Pattern A/B 都位於 page top-left,Tab 第一站即可達。
- **不使用 `SidebarMenuSub`**:避免 nested menu aria-tree 複雜度,階層交給 TreeView(`role="tree"` + `aria-level`)。

---

## 邊界案例

- **Disabled item**:SidebarMenuButton `disabled` prop 走 native button disabled(`text-fg-disabled` + 不觸發 onClick + 不可聚焦,鍵盤導覽自動 skip);**不自動設 `aria-disabled`**——cva 另備 `aria-disabled:` 樣式,consumer 自傳 `aria-disabled`(如 asChild 非 button host)時同樣式生效。
- **Loading(nav data-fetch)**:async nav tree fetch 時 consumer 應在對應 group 內渲 `<Skeleton>` line-stack(常見 3-5 條 sidebar nav skeleton 行)而非 Empty + spinner — Sidebar 是 chrome 不是 panel,loading 用 skeleton 更符合 chrome 持續存在的 affordance。對齊 Atlassian Sidebar / VS Code activity-bar idiom。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **Empty(no nav items)**:罕見場景(用戶無權限 / 全空 workspace)。若整個 group 無 item,consumer 應 conditional 不渲該 group(不渲空 group label);若整個 sidebar 無 item,可能該 hide sidebar(走 layout context 不渲)。不渲空白 sidebar。
- **Dark mode / density**:Sidebar 為 chrome surface,走 chrome-header token 自動 adapt;density 預設 lock 跟隨 app density chrome token,不獨立 own。
- **Collapsed mode(icon-only)**:label / inline actions suffix 隱藏,只留 icon + tooltip;TreeView 整區隱藏,重新看階層資料的唯一路徑 = 展開 sidebar(完整規則見「Icon 模式的行為規則」段)。

---

## 相關

- `../TreeView/tree-view.spec.md` — 階層樹元件（user data、任意深度）
- `../DropdownMenu/dropdown-menu.spec.md` — Header / Footer 常用的下拉選單
- `../Tabs/tabs.spec.md` — in-page secondary nav（不塞 sidebar 的子頁切換）
- `../Menu/menu-item.spec.md` — SidebarMenuButton 的 item-layout 共用規則
- `../Command/command.spec.md` — Command palette，icon 模式下的跳轉逃生艙
- `../Sheet/sheet.spec.md` — Sheet，暫時性側邊面板的替代（mobile 模式實作基礎，詳「A11y 預設」）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `app-shell.spec.md`
- `density.spec.md`
- `header-canonical.spec.md`
- `scroll-area.spec.md`
- `sheet.spec.md`
- `tree-view.spec.md`
