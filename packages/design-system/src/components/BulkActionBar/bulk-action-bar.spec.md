---
component: BulkActionBar
family: composite
variants: {}
sizes: {}
traits:
  - hasActions
benchmark:
  - Polaris BulkActions: github.com/Shopify/polaris/tree/main/polaris-react/src/components/BulkActions
  - Polaris IndexTable (bulk selection): github.com/Shopify/polaris/tree/main/polaris-react/src/components/IndexTable
  - Carbon DataTable (batch actions): github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/DataTable
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# BulkActionBar 設計原則

## 定位

選取多項 item(table row / list item)後浮現的批次操作列。**不獨立於選取狀態存在**——`selection.length === 0` 時隱藏,`> 0` 時浮現。

**Layout Family**:非 1-4 family — composite / multi-section(自 own layout,batch action 區 + count 區 + page-action 區 + hint banner)。

**世界級對照**:Linear bulk action toolbar / Polaris IndexTable bulk actions / Material DataGrid `<GridToolbar>` selection mode / Notion database row selection bar / Gmail / GitHub Issues 多選 toolbar。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 何時用

- DataTable / list / Combobox(multi)/ TreeView 的 batch operation
- 多項 item 選取後需要對全部執行同一操作(Delete / Archive / Move / Tag / Assign / Export 等)
- 提供「批次 → 個別」的 dataset 全選 escape hatch(對 large dataset 提供「點此選取全部 M 個」)

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 對單一 item 操作 | Inline Action(item-anatomy)| 單項操作不該升 batch toolbar |
| Page-level primary CTA(Save / Submit / Publish)| 一般 button + page footer | Page-level 不依賴 selection 狀態 |
| 永遠顯示的 toolbar(filter / sort / search)| Action Bar pattern + Toolbar | 不依賴 selection,沒「批次」語意 |
| 系統 notification | Notice / Toast / Alert | 通知 ≠ batch action |

---

## 近親元件分界

| 元件 | 觸發 | 視覺權重 |
|---|---|---|
| **BulkActionBar** | `selection.length > 0` | 高(selection 期間浮現)|
| **Action Bar pattern** | 永遠 | 中(常駐 chrome) |
| **Toolbar**(action-bar 變體)| 永遠 | 中 |
| **Notice / Toast / Alert** | 系統訊息 | 低-中 |

判斷:**「沒選取就消失嗎?」** 是 → BulkActionBar;否 → Action Bar / Toolbar / Notice。

## 常見誤解

| 誤解 | 正解 |
|------|------|
| 「BulkActionBar 可替代 toolbar」 | 否——additive 派,toolbar 永遠保留(selection 期間 filter / sort / search 仍可用,見「Placement」) |
| 「批次主操作用 primary」 | 否——一律 tertiary(primary 留給 dialog 確認最終 action,見「禁止事項」) |
| 「selection 為 0 顯示空 bar 佔位」 | 否——回 null 完全不佔 layout(見「結構」) |

---

## 結構

```
┌──────────────────────────────────────────────────────────────┐
│ [✕] [{N} 已選 · M hidden by filter] │ [Action 1] [Action 2]   │
│  ↑ clear  ↑ count + filter inline     ↑ batch actions(consumer)│
└──────────────────────────────────────────────────────────────┘
```

- 全 md Buttons(`same-row consistency`,close X 同 size;rationale 見下方「Size canonical」)
- `gap-2`(8px)+ `<ButtonDivider />`(自帶 mx-1 = 12px 視覺距離)
- `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`
- 自然高度 56md / 68lg(md Button `--field-height-md` 32/36 + `py-[var(--layout-space-tight)]` 12/16 ×2;對齊 SurfaceFooter / DataTable toolbar canonical)
- `selection.length === 0` → 回 null 不佔 layout
- **寬度邊界**:actions 為單行 flex 排列(`gap-2`),無折行、無內建 overflow 收納;寬度受限場景由 consumer 控制 action 數量

### Slot

- **`actions`**:consumer 提供 **md** Buttons(size rationale 見「Size canonical」);`variant=tertiary`(主)/ `tertiary danger`(destructive)— **不用 primary**(留 dialog 確認最終 action)
- **count 區**:`{N} 已選`(內建)+ inline filter hidden status `· {M} 個被 filter 隱藏`(`hiddenByFilter` prop 傳入時)
- **clear**:`<Button iconOnly size=md variant=text dismiss />`(內建,觸發 `onClear`)

#### Size canonical(2026-05-04 升 SSOT)

| Placement variant | Buttons size | 理由 |
|--|--|--|
| **default**(footer 浮層 / page-bottom 區段)| **md** | 視覺 weight 對齊 Dialog footer commit 系 / page primary-button bar(md)/ Linear/Notion/Asana world-class 共識 | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| **top-toolbar 變體**(未來)| sm | 覆蓋 sm-density toolbar / GitHub-style;variant prop 驅動 override |

#### Count text color canonical(2026-05-04 升 SSOT)

| 元素 | Token / weight | 理由 |
|--|--|--|
| **count(`已選 N 項`)** | `text-foreground` + `font-medium` | state-bearing 主資訊(user 在 selection mode + N items),非裝飾 → primary foreground。對齊 Linear / Notion / Carbon / Polaris 共識;muted 化會弱化 state signal | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| **`hiddenByFilter` suffix(`· M 個被 filter 隱藏`)** | `text-fg-muted` + `font-normal` | 次資訊,視覺層次低於 count |
| **clear X icon** | dismiss md(自動 fg-muted)| chrome dismiss canonical |

### 不含 page-level primary / 不含 hint banner

- **page-level Submit / Save**:跟 selection 無關,consumer 自擺,不耦合 BulkActionBar 生命週期
- **Hint banner**(擴 dataset 提示):用 `<Alert variant="info" placement="fixed">` 黏在 BulkActionBar 上方,**不在 BulkActionBar 內部 hardcode**。Alert 的 `title` 接 ReactNode 可塞 inline `<button>` 連結

---

## Placement — inline composition canonical(撤 top-replace 派)

BulkActionBar 是 plain block(無 positioning 邏輯),consumer 用 flex column 容器自然排列。Selection > 0 時 Alert + BulkActionBar 接在 DataTable 下方,**toolbar 永遠保留**(filter / sort / search 在 selection 期間仍可用)。

```tsx
<div className="flex flex-col">
  <Toolbar />                                    {/* 永遠保留,selection 期間可用 */}
  <DataTable selection={...} ... />
  {showHint && <Alert variant="info" placement="fixed" title={<>...inline link CTA...</>} />}
  {selection.length > 0 && <BulkActionBar selection={...} actions={...} />}
</div>
```

**為什麼撤 top-replace**:Polaris IndexTable / Material DataGrid / GitHub / Gmail 等「替代 toolbar」做法在 selection 期間**喪失 filter / sort / search 功能**,user workflow 斷裂(「我選了 50 個再 filter 出 status=error 子集 batch action」這種常見 workflow 卡關)。本 DS 採 Linear / Notion / Apple Mail / iOS Files / Notion / Atlassian additive 派 — toolbar 永遠保留。

### Layout 行為(4 use case 全 covered by inline composition)

| Use case | DataTable 設定 | Inline composition 結果 |
|---|---|---|
| 1️⃣ Page 中一段 | `height="auto"` | BulkActionBar 自然接在 table 下方 ✓ |
| 2️⃣ Container fill(dialog body 等)| `height="100%"` | flex column,table flex-1,BulkActionBar 接尾 ✓ |
| 3️⃣ Viewport-fill app | `height="100%"` 配 flex-1 | table 自動讓位 ✓ |
| 4️⃣ 長 page scroll(BulkActionBar 不可 scroll 走)| auto | consumer **自行套** `<div className="sticky bottom-0">` 或 `fixed bottom-0` wrapper |

case 4 比較少見,consumer 知道自己 layout 時自加 wrapper 即可,DS primitive 不該替消費者決定 positioning。

---

## API

```ts
interface BulkActionBarProps {
  /** 已選 ID,length === 0 時自動隱藏(回 null) */
  selection: readonly string[]
  /** Clear 觸發,user 點 X icon(consumer 在 page-level 監聽 Esc 觸發) */
  onClear?: () => void
  /** 批次 actions(consumer 提供 md Button,variant=tertiary 或 tertiary+danger,不用 primary) */
  actions?: React.ReactNode
  /** Filter 模式:hidden 數量,顯示在 count 區 inline 「{N} 已選 · {M} 個被 filter 隱藏」 */
  hiddenByFilter?: number
  /** 擴選整個 dataset 後的真總數;number 時 count 顯示此值,否則 fallback selection.length(見「Extend dataset pattern」) */
  totalSelected?: number | null
  /** i18n labels(Partial,merge with default;對齊 Material localeText / Polaris i18n 慣例) */
  labels?: Partial<BulkActionBarLabels>
  className?: string
}

interface BulkActionBarLabels {
  count: (n: number) => string         // default 「已選 {n} 項」
  clear: string                         // default 「清除選取」(X aria-label)
  hiddenSuffix: (hidden: number) => string  // default 「· {hidden} 個被 filter 隱藏」
  toolbarAriaLabel: string              // default 「批次操作」
}
```

完整 default labels 由 component 內 export `BULK_ACTION_BAR_DEFAULT_LABELS`,consumer 可 spread 後 override(對齊 Material `defaultLocale` 模式)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Hint banner(擴 dataset 提示)不在本 API**:由 consumer 用 `<Alert variant="info" placement="fixed">` 配 ReactNode title 帶 inline link 自組,黏在 BulkActionBar 上方。Alert / Notice 的 `title` + `description` 已支援 ReactNode(2026-04-28)。

### Extend dataset pattern(totalSelected)

「本頁全選 → hint 點擊 → 擴選整個 dataset」2-step 後,consumer 把 `totalSelected` 設為 dataset 真總數,count 區改顯示該值(否則 fallback `selection.length`)——避免 Alert 顯「已選 5370」但 bar 仍顯「已選 50」的不同步(2026-05-13 ship)。對齊 Gmail / Linear / Notion 全選 dataset hint pattern。

---

## a11y 預設

- BulkActionBar 整體用 `role="toolbar"` + `aria-label`(default `"批次操作"`,可 override)
- count 文字用 `aria-live="polite"` 通知 selection 變更(SR 讀「3 selected」)
- Clear button:`aria-label="清除選取"`
- Hint banner 用 `role="status"` + `aria-live="polite"`(state 切換時通知)
- 鍵盤:Esc → `onClear()`(consumer 應監聽 page-level keydown 觸發);Tab 序按 DOM 順序 = clear(X)→ actions(count 是純文字 span,非互動元素 → 不參與 Tab)
- Disabled action(無權限等)用 Button `disabled` + tooltip 解釋,**不藏 action**(避免 user 困惑)

---

## 視覺與動畫

- **出現 / 消失**:`selection.length` 0→>0 直接 mount;>0→0 回 null 直接 unmount(無 fade 動畫)。inline composition 下自然 reflow;consumer 需固定高度時自擺 placeholder(見「禁止事項」)
- **底色**:**無底色 contrast**,跟 page 同色(`bg-canvas` / `bg-surface` 視 placement 繼承)。對齊 Notion / Linear minimalist — 用文字內容切換呈現「mode」,**不**用底色 highlight。**不像 Polaris 那種顯著底色變化** <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **邊界**:**無外框邊界**(融入 page chrome)— 恆 **`border-top` border-divider 切割 layout**(bar 是 page 結構,不是 floating overlay,不用 box-shadow 製造「浮層」誤導)。top-toolbar 變體為未來項(見「Size canonical」)
- **與 table 的關係**:inline composition — bar 接在 DataTable 下方,toolbar 永遠保留(見「Placement」)
- **Action variant**:`tertiary`(主)+ `tertiary danger`(destructive)— **不用 primary**(留給 dialog 確認最終 action)

---

## 禁止事項

- ❌ 不內建 page-level Submit / Save / page primary CTA(consumer 自擺,不耦合 selection)
- ❌ 不直接擴 dataset 全選(必須 2-step:本頁全選 → hint 點擊 → 擴 dataset)
- ❌ 不在 selection.length === 0 仍佔 layout(必須完全藏 OR consumer 自擺 placeholder)
- ❌ 不藏 disabled action(顯示 disabled 比藏起來易理解,user 知道為何不能用)
- ❌ 不替代既有 toolbar 永久(只在 selection > 0 期間,clear 後恢復)
- ❌ 批次 action **不用 variant="primary"**(留給 dialog 確認最終 action);批次用 `tertiary`,destructive 用 `tertiary` + `danger`(對齊 button.spec.md 「Inline destructive 不用 primary」 canonical)
- ❌ 不用 contrast 底色 / box-shadow 製造「浮層」感(footer 是 layout 結構切割,不是 overlay)
- ❌ Hint banner 不在「全可見已選 + dataset 還有更多」之外的場景顯示(小 dataset 顯示 hint 是 noise)
- ❌ Filter hidden status 不獨立開 hint banner(進主 bar count 區 inline 即可)

---

## 為何無 SizeMatrix

BulkActionBar 高度由消費者所在 placement 決定(top 模式 = toolbar 高度;footer 模式 = footer 高度),元件內部不提供 size prop。對齊 anatomy-standard.md 的 N/A 例外。

`@anatomy-rationale: SizeMatrix N/A — 高度繼承 placement 的 toolbar/footer 容器`

---

## 相關

- `../DataTable/data-table.spec.md`「L2 選取」段 — DataTable 端 selection state + 整合方式
- `../../patterns/action-bar/action-bar.spec.md` — toolbar 操作排列規則,本元件繼承 batch action 排序原則
- `../Button/button.spec.md` — Action button variant 規則
- `../Notice/notice.spec.md` — hint banner 視覺繼承(role / aria-live 同源)
- `../../tokens/color/color.spec.md` — toolbar bg / divider semantic token
