<!-- Authority/status: governance/planning/registry.json -->
# Row Primitive Consolidation — SidebarMenuButton / TreeItem 消費 MenuItem 評估

**Status**:✅ **Phase 0 done / Phase 1 declined**(2026-04-24 二次評估)
**結論**:ROW_PADDING_BY_SIZE token SSOT 已是 practical best;full cva consume 經二次評估**不適合**執行(差異超過共通)
**Goal(原)**:評估 SidebarMenuButton / TreeItem 是否適合消費 `menuItemVariants` cva base,減少 drift risk + spec 體積。

## 為什麼 Phase 1 declined(2026-04-24 第二輪評估)

實際比對兩 cva 後發現 Sidebar 有**大量 sidebar-specific 樣式**無法歸入 menuItemVariants base:
- `peer/menu-button group/menu-button`(nested peer/group state)
- `group-data-[collapsible=icon]:*`(icon-only mode:歸零 spacing + justify-center + hide label)
- `data-[active=true]:*`(single-selection state)
- `transition-[width,height,padding,gap,background-color,color]`(collapse animation — MenuItem 只 transition-colors)
- `pr-8 group-has-[[data-sidebar=menu-action]]/menu-item`(menu-action 預留空間)
- `text-fg-secondary font-medium`(MenuItem 無這預設)

共通的只有 `cursor-pointer select-none outline-none focus-visible:bg-neutral-hover` — 不到 5 個 class,抽 shared base 反而 noise。

**ROW_PADDING_BY_SIZE token(已實施)是 real value 共享**:改一處全同步,消除 py 公式 drift。full cva consume 屬 over-engineering。

若未來真要共享更多,該走「token / primitive」層(add new token for hover bg semantic)不是「cva composition」層。

## 起因

governance-health dogfood 發現 Sidebar spec(636 行)/ TreeView spec(535 行)過 transition cap 500。調查發現兩者都有**獨立 cva**(`sidebarMenuButtonVariants` / `treeItemVariants`),沒消費 MenuItem。已知 risk 在 `item-anatomy.spec`「SidebarMenuButton 獨立實作風險」節。

User 合理提問:「真的適合用 MenuItem 嗎?不該無腦用。」本 doc 是 Phase 0 評估 + 如果 GO 才進 Phase 1+。

## Phase 0 — 評估(GO/NO-GO)

### 維度 1:visual base(padding / typography / row height / hover bg)

**MenuItem 有**:row padding formula `py = (field-height - 1lh) / 2`、`text-body leading-compact`、`hover:bg-neutral-hover`、`active:bg-neutral-active`

**Sidebar**:
- ✅ 可共用 — 本來就「刻意對齊」
- Sidebar 特殊:`data-active=true` 時 bg-neutral-selected(MenuItem 也有)

**TreeView**:
- ✅ 可共用 visual base
- TreeView 特殊:selected state 可能跟 MenuItem 不同(Tree 用 node indicator)

**結論**:visual base **GO**。兩者都可消費 `menuItemVariants` 的 padding/typography/hover/active。

### 維度 2:結構(slot / layout)

**MenuItem**:prefix slot(icon/avatar)+ label + (optional description) + suffix slot(chevron / inline actions)

**Sidebar**:
- ✅ 同結構
- Sidebar collapsed mode 特殊:icon-only 時 hide label
- Badge overlay:SidebarMenuButton 可有 badge(MenuItem 也有)

**TreeView**:
- ⚠️ **不同結構** — 有額外 prefix:**expand chevron**(位於 icon 之前)+ indent spacer(per level)
- Tree guide lines(connector)在 background layer

**結論**:Sidebar **GO**(結構同);TreeView **PARTIAL**(多了 expand + indent + guides,不能直接複用 MenuItem 結構)

### 維度 3:行為(selection / keyboard / interaction)

**MenuItem**:single click select;Tab nav;Space/Enter activate

**Sidebar**:
- ✅ 同 single-selection(一個 active)
- Keyboard:同 MenuItem(Tab)
- Persistence:open/close state 寫 cookie(MenuItem 無)— 是 SidebarProvider 層,非 item 層

**TreeView**:
- ⚠️ **不同** — arrow keys 做展開/收合(Left 收 / Right 展)+ Up/Down 走兄弟節點 + drag-drop + multi-select via checkbox
- Keyboard pattern 根本不同(hierarchy 本質)

**結論**:Sidebar **GO**(行為同);TreeView **NO-GO**(keyboard model 本質不同)

### 維度 4:spec 可縮幅度

**Sidebar spec 24 sections 分析**:
- 可 pointer 到 item-anatomy(5 sections): 結構 / Single selection / Size / Inline actions suffix / 相關 — 約 100 行
- Sidebar-specific(19 sections,非 refactor 可動): Chrome / Collapsible / Trigger 位置 / Mobile / Persistence / Group 收合 / etc. — 約 530 行
- **refactor 後估 spec ≈ 530 行**,仍過 500 transition cap 但是 foundational SSOT 可 800

**TreeView spec 24 sections 分析**:
- 可 pointer 到 item-anatomy(3 sections 部分):Node 解剖部分 / 結構部分 — 約 60 行
- Tree-specific(21 sections 核心):Indent / Guides / Expand/collapse / Arrow keyboard / Multi-select / Drag-drop / etc. — 約 475 行
- **refactor 後估 spec ≈ 475 行**,剛過 500

**結論**:spec 縮幅度有但非決定性。Refactor 主要動機 = **消除同步 drift risk**,不是壓行數。

### Phase 0 GO/NO-GO 最終

| 元件 | Visual | Structure | Behavior | 結論 |
|------|--------|-----------|----------|------|
| **SidebarMenuButton** | ✅ | ✅ | ✅ | **GO** — 消費 menuItemVariants base,保留 Sidebar-specific variant 層 |
| **TreeItem** | ✅ visual base 可 | ⚠️ 結構多 expand/indent/guides | ⚠️ keyboard model 不同 | **PARTIAL** — 只共用 visual base(padding/typography/height),structure + behavior 獨立 |

## Phase 1 — SidebarMenuButton refactor(若 GO)

1. 重寫 `sidebarMenuButtonVariants` = `cva(menuItemVariants base, { variants: { /* sidebar-specific additions */ } })` 或直接 extend
2. 驗證 visual regression:`visual-audit --scope=component:Sidebar`
3. 更新 sidebar.spec.md:結構 / Single selection / Size 等 section 改 pointer
4. 更新 item-anatomy.spec 的「SidebarMenuButton 獨立實作風險」節 → 移除(已消除)
5. 預估 2-4 小時 focused

## Phase 2 — TreeItem partial refactor(只共用 visual base)

1. 抽出 `menuItemVariants` 的 base class(`rowPrimitiveBase` 或類似)到 `item-anatomy.tsx` export
2. TreeItem 消費 base + 自己的 indent/chevron/guides 結構 variants
3. 驗證:`visual-audit --scope=component:TreeView`
4. 更新 tree-view.spec.md:Node 解剖的 padding/typography 部分改 pointer
5. 預估 3-5 小時(tree-specific 結構複雜)

## Phase 3 — 驗證 + commit

- 全 regression test(visual + tsc + storybook)
- Metric snapshot:spec 行數 diff / 同步風險消除
- Commit 每 refactor 獨立(不混 Sidebar + TreeView,方便 review)

## 不做 MenuItem-full-inherit 的理由(避免無腦用)

- **Sidebar**:本可 full-inherit,但 `data-active` 選擇模型 + badge + collapsed icon-only 需 Sidebar 層 wrap,直接繼承會耦合 sidebar state 到 MenuItem
- **TreeItem**:hierarchy 本質(expand/indent/guides/arrow keyboard)跟 flat menu 是不同 domain,強迫繼承會污染 MenuItem API

**結論**:消費 `menuItemVariants` cva(視覺層)OK,消費 `<MenuItem>` component(結構+行為)**NO**。

## 開工 trigger

User 說「開工 row primitive consolidation / 做 Sidebar refactor / 消除 SidebarMenuButton 獨立實作 risk」時跑本 plan。

## 若完全 GO(兩元件都 refactor 成功)後的 DS 狀態

- `menuItemVariants` 成為真正的共享 visual base(item-anatomy.tsx export)
- SidebarMenuButton / TreeItem 消費 base,spec 縮 ≥ 100 行
- Meta-Pattern M17「SSOT 必可傳播」更徹底(token + primitive + **shared cva base** 三層)
- 同步 drift risk 從 canonical 消失
