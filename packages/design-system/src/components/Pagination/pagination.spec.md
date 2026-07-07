---
component: Pagination
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isStructural
benchmark:
  - Ant Design Pagination: github.com/ant-design/ant-design/tree/master/components/pagination
  - MUI Pagination: github.com/mui/material-ui/tree/master/packages/mui-material/src/Pagination
  - Atlassian Pagination: atlassian.design/components/pagination
  - shadcn Pagination: ui.shadcn.com/docs/components/pagination
  - TanStack Table Pagination: tanstack.com/table/latest/docs/guide/pagination
  - Carbon Pagination: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Pagination
  - Polaris Pagination: polaris-react.shopify.com/components/navigation/pagination
---

# Pagination 設計原則

## 定位

Pagination 是「大量資料切成多頁後的位置導覽」——顯示當前頁、允許直接跳到任一頁。

基於 shadcn/ui Pagination 的 DOM 骨架(`nav >(操作群 div)> ul > li` + 當前頁 `aria-current="page"`),但**按鈕消費 DS `Button`、事件驅動、資料模型 = `total`(總筆數)+ `pageSize`(Ant Pagination 同款,總頁數內部推導),非 shadcn 原生的 `<a href>` 連結型**——本 DS 服務 app 產品場景;需要 URL 同步時由 consumer 在 `onPageChange` 接 router,不是把按鈕換成連結。`page` / `pageSize` 皆 dual-mode(傳值 = controlled,不傳 = uncontrolled)。

**本元件是分頁的完整功能 SSOT**(2026-07-06 user 拍板):頁碼、總筆數資訊(`showTotal`)、每頁筆數選單(`pageSizeOptions`)全部 own 在此——Ant(showTotal / showSizeChanger 內建於 Pagination)/ Carbon(page-size select 內建)/ MUI TablePagination(rows-per-page + range 內建)同派。DataTable 等 consumer **轉發 config 消費本元件**,不自拼分頁列。

**Layout Family**:非 4-family — self-contained composite(nav 橫排 control row);個別按鈕消費 Family 3(Button Pill)。

**樣式派系**(2026-07-05 user 拍板):數字頁碼派(上下頁箭頭 + 數字 + ellipsis 摺疊)——shadcn / MUI / Ant / Atlassian 同派;非 Polaris(純上下頁)/ Carbon(page Select 可跳頁 + 上下頁,無數字鈕列)派。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 何時用

- 資料表翻頁(**優先用 `<DataTable pagination>` 內建**,見下方分界)
- server 分批載入的列表頁 / 搜尋結果頁(消費端自行 slice 或 server 端分頁)
- 任何「使用者需要知道總頁數、且可能想直接跳到某頁」的順序瀏覽

## 何時不用

| 情境 | 改用 |
|------|------|
| 無盡瀏覽 feed(activity stream / 通知列表) | 虛擬滾動或 load-more,不是頁碼 |
| 資料表且已用 `<DataTable>` | `<DataTable pagination>` 內建(不要自己在表格下手排 standalone Pagination) |
| 精靈流程「上一步 / 下一步」 | `Steps`(流程進度)+ Button——頁碼是**位置導覽**,不是流程推進 |
| 檢視切換(清單 / 看板 / 時間軸) | `SegmentedControl`(互斥選值) |
| 資料不足 2 頁且未來也不會成長 | 不放 Pagination(元件本身單頁仍照常渲染;`total <= 0` 才不渲染——見邊界案例) |

## 近親分界

- **vs `SegmentedControl`**:兩者都是「多顆中亮一顆」,但語意不同——SegmentedControl 是**互斥選值**(選項固定 2-5 個、每個選項有語意),Pagination 是**位置導覽**(頁數動態、可摺疊、數字本身無語意)。SegmentedControl 恆有一值且不可空;Pagination 的當前頁是「你在哪」不是「你選了什麼」。
- **vs `<DataTable pagination>`**:DataTable 把 TanStack 分頁模型(`getPaginationRowModel`)封裝在內部並消費本元件 render 分頁列(Ant Table 消費 Pagination / Atlassian DynamicTable `rowsPerPage` 同模式)。表格場景一律走內建;standalone Pagination 留給非 DataTable 的列表 / 搜尋結果頁。
- **vs 虛擬滾動**:兩者是互斥的大資料策略(TanStack 官方定位為 alternative strategies)——分頁 = 使用者主動換頁、每頁固定筆數;虛擬滾動 = 連續滾動、只渲染可視列。同一份資料不可同時用兩者。
- **vs `Button secondary`(語意分界)**:當前頁「視覺上」= secondary 一比一(直接消費),但**語意兩條線**——secondary 是「次要動作」(action emphasis),當前頁是「持續選中」(selection state,由 `aria-current="page"` 承載)。在一般 UI 不得反過來拿 secondary 冒充「選中」表達(選中語意元件走 Chip / SegmentedControl / Pagination);此處是 selection 元件消費 action variant 當視覺 host,方向合法。

---

## 內部結構與摺疊規則

```
◀ 上一頁   1   …   4  [5]  6   …   12   下一頁 ▶
```

- **格位配置**:boundary 1 + sibling 1(= MUI `boundaryCount` / `siblingCount` 預設 1/1;內部常數,v1 不開 props——未來若開放,命名必沿用 MUI)。最大格位 = 首尾各 1 + 當前頁左右各 1 + 當前頁 + 2 顆 ellipsis = **7 格**,超過即摺疊。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- **Ellipsis 非互動**:純指示符號(`MoreHorizontal` icon + `aria-hidden`),不可點——對齊 Ant / MUI / shadcn;Breadcrumb 的可點 ellipsis 是 collapse dropdown 場景,語意不同。
- **上下頁按鈕**:iconOnly(`ChevronLeft` / `ChevronRight`),在第一頁 / 最後一頁時 `disabled`。
- 頁碼格位由內部演算法產生;兩顆省略號各自身分穩定,翻頁時不互相 remount(演算法簽名與 React key 等實作細節由 `pagination.tsx` 檔內註解單一持有,spec 不重述——職責分離)。

## 視覺

- **全部按鈕 = Button variant 純組裝,零視覺客製**(2026-07-06 user 抓出後精煉):上下頁 = `text` iconOnly、未選數字 = `text`、**當前頁 = `secondary`**——secondary 的 rest(primary 描邊+染字+不染底)/ hover(升 hover 階)/ active(深一階)與 `semantic.css`「選中狀態」canonical 完全同拼寫,直接消費不手寫平行副本(M17/M23)。唯一的 className = 等寬幾何(min-width 方形節奏對齊 Ant,屬 bundled family 合法)。
- **語意與視覺分工**:「選中」語意由 `aria-current="page"` 承載;Button secondary 僅為視覺 host(action 元件本身無選中語意,見近親分界)。與 Chip / SegmentedControl 選中同一套 token 語言(它們非 Button、自建 element 鏡射同拼寫);同時正是 Ant 當前頁做法(`colorPrimary` 描邊+字+不染底、hover `colorPrimaryHover`)。
- **間距兩層**:頁碼列內部(數字鈕之間)屬 bundled family(`tokens/layoutSpace/layoutSpace.spec.md` 已明文「Pagination 內部」元件自管),元件固定;完整形態的「資訊 ↔ 操作群」與「頁碼 ↔ 每頁選單」群組間距消費 `--layout-space-tight`(density-aware,與 DataTable 表格→分頁列同 token)。

## 完整形態(showTotal / pageSizeOptions)

**Layout =「資訊左、操作右」**(對齊 Ant 源碼結構:total 文字是最左元素、size changer 是最右元素——資訊「你在哪」與操作「換頁/換每頁筆數」分離):

```
第 1–20 筆,共 85 筆                    ◀ [1] 2 3 4 5 ▶  [20 筆/頁 ▾]
```

- `showTotal`(opt-in):左側 range 格式「第 x–y 筆,共 N 筆」——Ant「1-20 of 85 items」/ MUI「1–5 of 13」/ Carbon「1–10 of 128 items」三家共識,非單純總數。
- `pageSizeOptions`(opt-in):頁碼右側「N 筆/頁」選單(文案內嵌 = Ant「20 / page」同款;消費既有 `Select size="sm"`);變更每頁筆數自動回第 1 頁——MUI TablePagination / TanStack `autoResetPageIndex` 派;Ant 為 preserve-position(clamp)派,本 DS 採 reset-to-1 避免換大 pageSize 後停在超界頁的 clamp 歧義。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- 兩者皆未開 = 純頁碼 inline 形態(consumer layout 決定對齊;表格情境靠右由 DataTable 處理)。

---

## 邊界案例

| 情境 | 行為 |
|------|------|
| `total <= 0` | 不渲染(回傳 null)——沒有資料可導覽 |
| 單頁(`total <= pageSize`) | **照常渲染**(單顆當前頁 + disabled 上下頁)——對齊 Ant `hideOnSinglePage` 預設 false + MUI;保留版面穩定,避免資料量在 1 頁邊界抖動時整條列出現消失 |
| `page` 越界(< 1 或 > 總頁數) | 防禦性 clamp 後渲染(顯示層不炸);糾正責任在 consumer / DataTable(接資料變動時同步 clamp) |
| `pageSize <= 0`(consumer contract violation) | 防禦 clamp 至 1(不渲染垃圾格位、totalPages 不會變 Infinity/NaN) |
| 極大總頁數(500+) | 摺疊規則不變(恆 ≤ 7 格);數字鈕寬度容納 3-4 位數自然撐開 |
| 邊界頁 disabled 時 focus 落點 | 接受 focus 掉落(對齊 Ant / MUI 行為);不做 focus 轉移 |

## Loading / 空值

本元件無 loading 態——換頁中的資料 loading 由列表 / DataTable 層表達(skeleton / CircularProgress),頁碼列維持可互動或由 consumer disable。無資料(`total <= 0`)即不渲染,空狀態由 `Empty` 表達。

---

## 與 DataTable 的關係

分頁列本體(頁碼、showTotal、每頁筆數選單、資訊左操作右 layout)**SSOT 在本元件**;DataTable 只做:轉發 config(`pagination` prop → 本元件 props)、own TanStack state(controlled 消費)、表格→分頁列 tight 間距、純頁碼形態靠右、與虛擬滾動互斥——這些表格側規則 → `../DataTable/data-table.spec.md`「L5:分頁」段。

## 禁止事項

- ❌ **手刻當前頁選中樣式**——必消費選中 canonical(semantic.css SSOT);選中態不得用 primary-hover(那是瞬時 hover 專用階)
- ❌ **把按鈕換成 `<a href>`**——URL 同步由 consumer 在 `onPageChange` 接 router;連結型會破壞 controlled 契約與 Button 消費
- ❌ **與虛擬滾動並用**(同一份資料同時分頁 + 虛擬化)
- ❌ **把 ellipsis 做成可點按鈕**(快速跳頁需求走未來 `showQuickJumper` 類擴充,不是 ellipsis)
- ❌ **用 Pagination 做檢視切換 / 流程推進**(見何時不用)
- ❌ **在 DataTable 下方自行手排 standalone Pagination**(走 `<DataTable pagination>` 內建)

## A11y 預設

**ARIA / Pattern**:WAI-ARIA 無專門 pagination pattern,公認做法(shadcn / MUI / Atlassian 一致)= landmark + current 標記:

- root `<nav aria-label="Pagination">`(landmark;label 用英文 pattern 名,follow Breadcrumb `aria-label="Breadcrumb"` 慣例;consumer 可覆寫)
- 當前頁按鈕 `aria-current="page"`(**不用** `aria-pressed`——pressed 是可取消的 toggle 語意,當前頁不可「取消」)
- ellipsis `aria-hidden`(純視覺指示)
- 上下頁 iconOnly 按鈕帶 `aria-label`(預設「上一頁」/「下一頁」,`prevAriaLabel` / `nextAriaLabel` props 可覆寫)

**鍵盤**:Tab 逐鈕聚焦(原生 button 序)、Enter / Space 觸發——全部繼承 Button 原生語意,無自訂 key handler;不做 roving tabindex(頁碼是 nav landmark 內的獨立按鈕群,非 composite widget,對齊 shadcn / Ant / MUI)。

**驗證**:Storybook a11y 面板 0 critical violation;純鍵盤可完成翻頁與跳頁。

**SizeMatrix N/A rationale**:本元件無 size 軸(單一尺寸,按鈕固定 `size="sm"`)——頁碼列是 chrome 級導覽,不隨 Field 密度縮放(Ant / MUI / Carbon 的 size 變體服務其自家 density 系統;本 DS 表格密度由 DataTable size 控制、分頁列不連動)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

## 相關

- `../Button/button.spec.md` — 按鈕消費(text variant / iconOnly / disabled)
- `../Chip/chip.spec.md` — 「持續選中」視覺 canonical 同族(描邊+染字、不染底)
- `../SegmentedControl/segmented-control.spec.md` — 近親分界(互斥選值 vs 位置導覽)
- `../DataTable/data-table.spec.md` — 表格內建分頁(L5 段,SSOT)
- `../Steps/steps.spec.md` — 流程進度 vs 位置導覽分界
- `../../tokens/color/semantic.css` — 選中狀態 token SSOT

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `data-table.spec.md`
- `segmented-control.spec.md`
