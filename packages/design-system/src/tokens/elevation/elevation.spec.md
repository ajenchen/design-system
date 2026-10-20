<!-- @benchmark-cited: D5 retrofit backfill 2026-06-10 — body world-class claims marked per-claim inline;對齊 token spec 家族 7/9 既有 marker 慣例(deep-audit A.0 抓漏)。 -->

# Elevation 設計原則

Elevation 定義陰影層級，區分內容層（Card）和浮層（Modal/Popover）的視覺深度。

兩個層級對應兩種「浮起高度」，用 CSS 變數實現，light / dark mode 自動切換。

**不要用 Tailwind 的 `shadow-*`**，改用 CSS 變數：

```tsx
<div style={{ boxShadow: 'var(--elevation-100)' }} />
<div style={{ boxShadow: 'var(--elevation-200)' }} />
```

## 層級

| Token | 用途 | 對應元件 |
|-------|------|----------|
| `--elevation-100` | 頁面內容層，靜止 | Card 類內容容器(DS 尚無 Card 元件;現行唯一 DS consumer = Slider thumb hover 陰影,per `slider.spec.md` 互動 canonical) |
| `--elevation-100-hover` | 頁面內容層，hover / 拖拽 lift | —(目前無 DS 內建 consumer;預留給 consumer 的可拖拽 / hover-lift card,如 board card drag) |
| `--elevation-200` | 浮層，靜止 | Modal、popover、dropdown、overlay drawer |
| `--elevation-200-hover` | 浮層，hover | —(同上,預留) |

elevation-100 < elevation-200，數字越大浮起越高。`*-hover` 兩枚為靜止 token 的「抬升一階」變體:元素被 hover / 拖起時切換,幾何(offset / blur)不變、只加深陰影 alpha(`tokens/color/primitives.css` 定義,light / dark 各一組)。

## 與 Surface 的配對規則

| Elevation | 必須搭配 | 原因 |
|-----------|----------|------|
| `--elevation-100` | `bg-surface` | 頁面內容層，半透明可接受 |
| `--elevation-200` | `bg-surface-raised` | 浮層必須不透明，否則底層內容透出 |

```tsx
// ✅ 正確
<div className="bg-surface rounded-md" style={{ boxShadow: 'var(--elevation-100)' }} />
<div className="bg-surface-raised rounded-lg" style={{ boxShadow: 'var(--elevation-200)' }} />

// ❌ 錯誤——浮層用了半透明 bg-surface
<div className="bg-surface rounded-lg" style={{ boxShadow: 'var(--elevation-200)' }} />
```

## 浮層間距（sideOffset）

所有從觸發元件彈出的浮層（Tooltip、Popover、SelectMenu、DropdownMenu、HoverCard、Coachmark）與觸發元件的間距統一 **8px**（`sideOffset={8}`）。

不因浮層類型或位置而異——一致的間距讓使用者建立穩定的空間預期。

**SSOT** → `tokens/elevation/overlay-geometry.ts` exports `OVERLAY_SIDE_OFFSET = 8` / `OVERLAY_COLLISION_PADDING = 8`。所有 primitive `default` 必 import 該 const(M17 SSOT 必可傳播);Radix `sideOffset` 接 number 不接 CSS var,因此用 JS const 共用,改值只動一處全部聯動。

**視窗邊緣碰撞(邊界案例)**:浮層貼近 viewport 邊不足以容納時,Radix `avoidCollisions`(預設開)自動翻轉 / 平移,並與邊緣保持 `collisionPadding` = `OVERLAY_COLLISION_PADDING`(8px;Tooltip / Popover / DropdownMenu 皆接此 const)。例外:HoverCard 用 12(Radix / browser rounding 讓 visual padding 少 1-2px 的補償,見 `hover-card.tsx` 註解)。

| 浮層類型 | sideOffset | 說明 |
|---------|-----------|------|
| Tooltip | 8px | TooltipContent 預設值 |
| SelectMenu | 8px | PopoverContent sideOffset |
| DropdownMenu | 8px | DropdownMenuContent sideOffset |
| Popover | 8px | 通用浮層 |

## 浮層共用樣式

所有 elevation-200 浮層共用：

| 屬性 | Token | 值 |
|------|-------|-----|
| 背景 | `bg-surface-raised` | 不透明，避免底層透出 |
| 陰影 | `--elevation-200` | 浮層陰影 |
| 圓角 | `rounded-lg` | 8px |
| 邊框 | `border border-border` | 1px |
| sideOffset | 8px | 與觸發元件的間距 |

## 疊放順序(z-index 層級表)

全 DS **唯一一張**層級表:`packages/design-system/src/` 裡每一處 `z-*` utility、`zIndex`、`z-index` 都登記在這裡;元件 spec 只寫自己在哪一層並指回本節(`../../components/Dialog/dialog.spec.md`「並存」段的層級句 = 本表第 3–6 列那一段)。

由來:Toast 與 Tooltip 原本不在任何層級規則裡(唯一的層級句只排到一般 modal `z-50`),sonner 內建的 `z-index: 999999999` 讓 Toast 蓋過一切,提示也不例外 —— 回報的是代理入口鈕的提示「問我或推走我」被 Toast 蓋住 69%(當時 Toast 疊在入口鈕上方,那個落點已撤回,見 `../../components/Toast/toast.spec.md`「落點」);Toast 回到視窗預設角落之後,三則 Toast 疊起來時同一個提示仍被蓋住 23%,Dialog 右上角「關閉」的提示與 Toast 重疊時整塊被蓋。AI 2026-10-13 建議「所有提示都蓋在 Toast 上面,並把 Toast 和提示補進 DS 的層級表」,user 同日採納,原話:「確保符合世界級的設計且符合我們一致的設計語言與規範就照你建議做並自行驗證到完美無瑕」(待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` Q4 第 2 題)。

**怎麼讀**:由下而上。「全域」列在整頁同一個疊放脈絡裡比大小,值逐列遞增 —— 前提是那個成員真的畫在整頁那一層:Radix 的浮層(Dialog、Sheet、FileViewer、Popover、DropdownMenu、HoverCard、Tooltip)經 portal 掛到 `body`;Toast(sonner 不經 portal,清單就地渲染在 `<Toaster>` 掛的地方)靠 `../../components/Toast/toast.spec.md`「app root 掛一次」的合約。**沒有掛到 `body`** 的成員 —— 就地渲染的 AI agent 浮層(第 5 列;`agent-panel.tsx` 浮層註解:產品裡它的祖先(AppShell 根節點)不形成疊放脈絡)、AppShell「跳到主要內容」(第 6 列)、拖曳影像(第 9 列)、開發量具(第 10 列),以及 portal 到表格父元素的 DataTable 列拖曳把手(第 6 列;`data-table.tsx` `RowDragHandle`,仍在表格的祖先底下)—— 只有祖先都不形成疊放脈絡時才跟整頁比;放進自成疊放脈絡的容器(Dialog、Sheet、FileViewer、Popover、AI agent 浮層、帶 `transform` / `isolation` 的祖先)就被那一層封頂,值再大也只在那一層裡比。「局部」= 元件內的兄弟(第 1 列),或低於最低全域列的常駐框架(第 2 列;它們跟整頁比,刻意壓在所有浮層之下)。局部列的**數字**值一律 ≤ 20 —— 低於最低的全域列(30),就算漏到整頁脈絡也蓋不過任何浮層;第 1 列的**變數**值(頭像與 Tag 堆疊的 `--avatar-stack-z` / `--tag-stack-z`:= 項目數 − 索引,聚焦時 = 項目數 + 1)**沒有上限**,不受這條保護 —— 它們靠所在那一列自成疊放脈絡圈住(頭像堆疊列 `AVATAR_STACK_CLASS`、四個 Tag 列容器 `TAG_ROW_CONTAINER_CLASS`,都是 `isolate`),閘 D 在真建置逐項量。同值時後掛上的在上(DOM 順序)。成員欄寫到 `/` 結尾 = 整個資料夾;寫到檔名 = 只有那個檔(同一個檔用到兩層時各列都登記)。

| 序 | 範圍 | 層 | 值 | 成員(`packages/design-system/src/` 之下) | 說明 |
|---|---|---|---|---|---|
| 1 | 局部 | 元件內局部疊放 | `z-0` `z-[1]` `z-[2]` `z-[3]` `z-[5]` `z-10` `z-20` `z-[var(--avatar-stack-z)]` `z-[var(--avatar-stack-z-focus)]` `z-[var(--tag-stack-z)]` `z-[var(--tag-stack-z-focus)]` `ring.zIndex` | `components/AgentPanel/agent-panel.tsx` `components/Avatar/avatar.tsx` `components/Carousel/` `components/Combobox/` `components/DataTable/data-table.tsx` `components/DataTable/data-table-interaction-layer.tsx` `components/DataTable/data-table.css` `components/DateGrid/` `components/FieldControlGroup/` `components/FileViewer/file-viewer.tsx` `components/OverflowIndicator/overflow-tag-list.tsx` `components/PeoplePicker/person-display.tsx` `components/SegmentedControl/` `components/Select/` `components/Tabs/` `lib/drag-visual.ts` `patterns/horizontal-overflow/` `patterns/resize-handle/` | 相鄰框線接合(FieldControlGroup、SegmentedControl 滑過 / 選中 / 聚焦各升一階);頭像與標籤堆疊(變數值、沒有上限,一律由那一列圈住:頭像堆疊列 `avatar.tsx` `AVATAR_STACK_CLASS`;Tag 堆疊由 `OverflowTagList` 畫,它的四個容器 —— Combobox 檢視態的 Tag 列、唯讀 / 停用欄位外框、編輯態的 Tag 區、AgentPanel 附件列 —— 都掛 `overflow-tag-list.tsx` `TAG_ROW_CONTAINER_CLASS`;兩者都是 `isolate`);欄位裡的箭頭、清除鈕、標籤;輪播與檔案檢視器的翻頁鈕;表格格線、游標環、就地編輯格;拖曳插入線;捲動提示;調整寬度把手;代理面板內的把手與底部抽屜 |
| 2 | 局部 | 舞台常駐框架 | `z-10` `z-20` | `components/AgentPanel/agent-panel-fab.tsx` | 代理入口鈕(`z-20`)與拖曳時的磁吸區(`z-10`)。浮在頁面內容上,在所有浮層之下(2026-10-14 前還有 `fixed` 的側欄 `z-10`;Menu 改回正常排版、殼可以水平捲,不再需要疊放值 —— `../../components/AppShell/app-shell.spec.md`「版面規則」§8) |
| 3 | 全域 | 並存遮罩 | `z-30` | `lib/overlay-coexistence.ts` | `CoexistenceMask`:並存 Dialog、並存 FileViewer、AI agent 浮層共用 |
| 4 | 全域 | 並存 modal | `z-40` | `components/Dialog/dialog.tsx` `components/FileViewer/file-viewer.tsx` | Dialog 與 FileViewer 傳 `persistentElements` 時的本體(FileViewer 2026-10-14 前並存時仍是 `z-50`,窄容器時蓋住 AI agent 浮層;已對齊) |
| 5 | 全域 | AI agent 浮層 | `z-[45]` | `components/AgentPanel/agent-panel.tsx` | AI agent 為浮層時的代理面板(何時變浮層:`../../components/AppShell/app-shell.spec.md`「版面規則」§3;2026-10-14 前層名「代理蓋板」) |
| 6 | 全域 | 一般 modal 與錨定浮層 | `z-50` | `components/Dialog/dialog.tsx` `components/Sheet/` `components/FileViewer/file-viewer.tsx` `components/Popover/` `components/DropdownMenu/` `components/HoverCard/` `components/AppShell/app-shell.tsx` `components/DataTable/data-table.tsx` | Dialog(一般)、Sheet(含 AppShell 的 Menu 浮層 —— Sidebar 經 Sheet 承載,「版面規則」§9)、FileViewer(一般)的遮罩與本體;Popover(SelectMenu、Coachmark、日期與時間選擇都經它)、DropdownMenu、HoverCard;AppShell「跳到主要內容」聚焦時;DataTable 列拖曳把手(`position: fixed`)。同值依掛上順序:從 Dialog 裡開的選單蓋在 Dialog 上 |
| 7 | 全域 | Toast | `z-[60]` | `components/Toast/toast.tsx` | `<Toaster>` 以 `!z-[60]` 蓋掉 sonner 內建的 `999999999`(sonner 的樣式不在 cascade layer 裡,Tailwind utility 要 important 才蓋得過) |
| 8 | 全域 | Tooltip | `z-[70]` | `components/Tooltip/tooltip.tsx` `components/Tooltip/tooltip.anatomy.stories.tsx` | 所有頁面浮層之上(anatomy story 的層級欄寫給人看,也登記 —— 值必須跟元件同一個) |
| 9 | 全域 | 拖曳影像 | `999` | `components/TreeView/tree-view.tsx` `components/DataTable/data-table.tsx` | dnd-kit `DragOverlay`(`position: fixed`,跟著指標走的那份複製品):TreeView 與 DataTable 都寫明 `zIndex={999}`(= dnd-kit 預設值;沒寫的 `<DragOverlay>` 閘照已安裝的 `@dnd-kit/core` 預設值登記檢查)。**就地渲染、不是 portal**(`@dnd-kit/core` `core.esm.js` 的 `const DragOverlay` 沒有 `createPortal`;`tree-view.tsx`、`data-table.tsx` 都把它放在 `DndContext` 底下):只有拖曳元件的祖先都沒有疊放脈絡時才在整頁比、在 Tooltip 與 Toast 之上;放在 Dialog / Sheet / FileViewer / Popover / AI agent 浮層裡時被那一層封頂,Toast 與 Tooltip 畫在它上面(2026-10-14 探針實測,複驗與實作各量一次、數字相同:祖先加 `isolation: isolate`,TreeView 影像 476/476 → 0/476、DataTable 拖欄位 240/240 → 0/240 點在影像上 —— 被 `z-[60]` 的 Toast 清單蓋住) |
| 10 | 全域 | 開發量具(非產品層) | `99999` | `components/DataTable/perf-debug-overlay.tsx` | 只在 story 裡開的效能除錯面板 |

**逐對裁示**(要保證的關係;閘逐條量):

| 上 | 下 | 依據 | 怎麼驗 |
|---|---|---|---|
| Tooltip | Toast | 上段 user 採納;WCAG 2.2 SC 1.4.13 Persistent | 閘 A 入口鈕提示、閘 B Dialog 裡的提示:提示內多點 `elementFromPoint` 全命中提示 |
| Toast | 第 1–6 列(局部、常駐框架、並存遮罩、並存 modal、AI agent 浮層、一般 modal 與錨定浮層) | 沿用改動前(sonner 的值本來就在全部之上):Toast 是非阻斷通知,modal 開著時操作結果仍要看得到 | 閘 C:Toast 蓋在一般 Dialog 的遮罩與本體(`z-50`)、AI agent 浮層(`z-[45]`)之上;閘 E:並存 modal 本體(Dialog、FileViewer)是 `z-40`;閘 D:第 1 列的變數值都被那一列圈住;其餘由靜態序保證 |
| Tooltip | 第 1–6 列 | 改動前與第 6 列同值 `z-50`、依掛上順序;現在嚴格在上 | 靜態序;第 1 列的變數值由閘 D(同上) |
| 拖曳影像 | Tooltip | 沿用改動前(Tooltip `z-50` < dnd-kit 預設 `999`)。**只在頁面層成立**:拖曳影像就地渲染(第 9 列),拖曳元件放在 Dialog / Sheet / FileViewer / Popover / AI agent 浮層裡時被那一層封頂,經 portal 掛到 `body` 的 Tooltip 畫在它上面 —— 改動前也是如此(同為 `z-50` 時後掛上的提示在上) | 靜態序(表上的值) |
| 拖曳影像 | Toast | **改動前相反**(拖曳影像 `999` < sonner `999999999`)。改動前三者是 Tooltip(50)< 拖曳影像(999)< Toast(999999999);「Tooltip > Toast」之後兩對不可能都沿用,必須翻一對 —— 翻的是「拖曳影像 vs Toast」:拖曳影像是使用者手上正在拖的東西,與瀏覽器原生拖曳影像同一個位置 —— 原生的不畫在頁面的疊放裡,頁面上任何一層都蓋不到它(Atlassian Pragmatic drag and drop [Drag previews](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/adapters/element/drag-previews):「We recommend using native drag previews where possible as they have great performance characteristics (they are not rendered on the main thread) and they can be dragged between applications」;反之自己畫的「you cannot drag the non-native drag preview outside of a browser window」)。被 Toast 蓋住 = 看不到自己正要放到哪;Toast 被它蓋住只有拖曳那幾秒,放開即恢復。**只在頁面層成立**:拖曳影像就地渲染、不是 portal(第 9 列),拖曳元件放在 Dialog / Sheet / FileViewer / Popover / AI agent 浮層裡時被那一層封頂(例如 `z-50`),Toast(`z-[60]`)畫在它上面 —— 與改動前相同(改動前 Toast `999999999` 在任何情況都在上)。要讓容器裡的拖曳影像也在 Toast 之上,得把 `<DragOverlay>` 用 `createPortal` 掛到 `body`,並依 M3 帶上 `data-theme` / `data-density`(DataTable 的影像是來源列 / 欄的 outerHTML 複製品,還要確認表格範圍的樣式在 `body` 底下照樣成立)—— 未做,待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` Q4a | 靜態序(表上的值);頁面層另以探針量(不是閘):TreeView 476/476、DataTable 拖欄位 240/240 點在影像上,祖先加 `isolation: isolate` 時兩者 0 |
| 開發量具 | Tooltip、拖曳影像、Toast | 改動前是 Tooltip(50)< 拖曳影像(999)< 量具(99999)< Toast(999999999);「Tooltip > Toast」之後必須翻一對,翻的是「量具 vs Toast」:除錯面板只在 story 開,不能被它要量的畫面蓋住。量具 vs Tooltip、量具 vs 拖曳影像沿用 | 靜態序 |

**什麼算 Tooltip**:只有 `Tooltip` 元件(`components/Tooltip/`;Button icon-only 自動包的也是它)。HoverCard **不是** Tooltip(`../../components/HoverCard/hover-card.spec.md`「與 Tooltip 的分界」—— HoverCard vs Tooltip 的 SSOT:內容可互動、滑鼠可移進去操作;深色外觀也一樣是 HoverCard)→ 留在第 6 列、Toast 之下。Chart 的提示是 Recharts 畫在圖表盒子裡的讀數(`../../components/Chart/chart.spec.md` frontmatter `isStructural`、「canvas + tooltip + legend 多區塊組合」),不是浮層,屬頁面內容。

**世界級對照**(一手原始碼,2026-10-13 取):

| 家 | Toast 類 | Tooltip | 順序 | 來源 |
|---|---|---|---|---|
| MUI | `snackbar: 1400` | `tooltip: 1500` | Tooltip 在上 | [`zIndex.js`](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/styles/zIndex.js) 檔頭:「We need to centralize the zIndex definitions as they work like global values in the browser.」;[文件](https://mui.com/material-ui/customization/z-index/):「a default z-index scale that has been designed to properly layer drawers, modals, snackbars, tooltips, and more」 |
| Atlassian | `flag: () => 600` | `tooltip: () => 9999`(`@atlaskit/theme@12.0.0` 是 800) | Tooltip 在上 | [`@atlaskit/theme@28.2.4` `dist/es2019/constants.js`](https://unpkg.com/@atlaskit/theme@28.2.4/dist/es2019/constants.js) `layers`;消費端 `@atlaskit/tooltip@24.4.0` `const tooltipZIndex = layers.tooltip()`、`@atlaskit/flag@19.0.1` flag-group `zIndex: layers.flag()` |
| Ant Design | message `zIndexPopupBase + CONTAINER_MAX_OFFSET + 10`(2010)、notification `+ 50`(2050) | `zIndexPopupBase + 70`(1070) | **Toast 在上**(反例) | [`antd@6.6.6` `es/message/style/index.js`](https://unpkg.com/antd@6.6.6/es/message/style/index.js)、[`es/notification/style/index.js`](https://unpkg.com/antd@6.6.6/es/notification/style/index.js)、[`es/tooltip/style/index.js`](https://unpkg.com/antd@6.6.6/es/tooltip/style/index.js)、[`es/_util/hooks/useZIndex.js`](https://unpkg.com/antd@6.6.6/es/_util/hooks/useZIndex.js)(`CONTAINER_MAX_OFFSET` = 100 × 10);`zIndexPopupBase: 1000`([`es/theme/themes/seed.js`](https://unpkg.com/antd@6.6.6/es/theme/themes/seed.js)) |
| Polaris | `.Polaris-Frame-ToastManager` `--p-z-index-12`(520) | `.Polaris-PositionedOverlay` `--p-z-index-2`(400) | **Toast 在上**(反例) | [`@shopify/polaris@13.9.5` `build/esm/styles.css`](https://unpkg.com/@shopify/polaris@13.9.5/build/esm/styles.css) |
| Carbon | toast 不設 z-index(consumer 自放) | `floating: 6000`(< `modal: 9000`) | 未定義 | [`@carbon/styles@1.117.0` `scss/utilities/_z-index.scss`](https://unpkg.com/@carbon/styles@1.117.0/scss/utilities/_z-index.scss) |

**為什麼選 Tooltip 在上**(兩家對兩家,不是投票):Tooltip 只在使用者**此刻指著 / 聚焦**某個東西時出現、移開就收;Toast 是系統主動丟出、自己會消失。[WCAG 2.2 SC 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) 要求滑過 / 聚焦出現的內容「remains visible until the hover or focus trigger is removed, the user dismisses it, or its information is no longer valid」—— 被 Toast 蓋住就不是 visible;反過來,Toast 被提示蓋住只有使用者自己指著的那一下,移開即恢復。對齊 MUI([`zIndex.js`](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/styles/zIndex.js))、Atlassian([`@atlaskit/theme` `layers`](https://unpkg.com/@atlaskit/theme@28.2.4/dist/es2019/constants.js));Ant([`tooltip/style`](https://unpkg.com/antd@6.6.6/es/tooltip/style/index.js))、Polaris([`styles.css`](https://unpkg.com/@shopify/polaris@13.9.5/build/esm/styles.css))的反例記在上表。

**規則**:

- 新增任何 z-index 先查本表:有同用途的列 → 用那列的值、把檔案登記成那列的成員;沒有 → 先在本表加列(全域列要說得出它夾在哪兩列之間、為什麼),再寫程式。不在元件裡發明新值。
- 局部列的**數字**值 ≤ 20(變數值見下兩條);全域列逐列遞增、每列一個值。
- 第三方元件內建的全域值一律登記在對應列:要嘛由 DS 以本表的值蓋掉(sonner `999999999` → Toast 列 `!z-[60]`),要嘛本表直接採用、在呼叫處寫明(dnd-kit `DragOverlay` 預設 `999` → 拖曳影像列)。沒寫 `zIndex` 的 `<DragOverlay>` 閘照 dnd-kit 預設值登記檢查。
- 局部列用**變數**(值由項目數決定、沒有上限)時,那一列必須自成疊放脈絡(`isolate`)把它圈住,並把容器的 class 收成一個常數讓每個容器都消費(`AVATAR_STACK_CLASS`、`TAG_ROW_CONTAINER_CLASS`);新的變數值先加進閘 D 的清單(`scripts/layer-order-invariant.mjs` `CONTAINED_LOCAL`),否則 S4 紅。
- 全域列的成員若**就地渲染**(不經 portal),它的值只在祖先都不形成疊放脈絡時才跟整頁比 —— 在說明欄寫出這個條件與放進容器時的結果(第 5、9 列)。
- 2026-10-14 前的已知不一致「FileViewer 並存時本體仍是 `z-50`」已對齊(`file-viewer.tsx` 並存時 `z-40`,第 4 列;`../../components/Dialog/dialog.spec.md`「並存」層級句與 `agent-panel.tsx` 註解本來就寫「Dialog / FileViewer 並存時 z-40」)。

閘:`scripts/layer-order-invariant.mjs` —— S 靜態:全 DS 每一處 z 值(utility、`zIndex` 物件鍵 / 簡寫 / JSX 屬性、`style.zIndex =`、`setProperty('z-index', …)`、字串與樣板裡的 CSS `z-index:`、沒寫 `zIndex` 的 `<DragOverlay>`)都登記在本表、成員與值都還在用(不過期)、全域列遞增、局部數字 ≤ 20、局部的非數字值只能是閘 D 量過的變數或已知有界的運算式(`CONTAINED_LOCAL`)、拖曳影像 > Tooltip > Toast > 第 3–6 列(表上的值);R 真建置:A 入口鈕提示、B Dialog 裡的提示蓋在 Toast 上,C Toast 蓋在一般 Dialog 與 AI agent 浮層上,D 每一顆用變數疊放的頭像 / Tag(Combobox 檢視 / 唯讀 / 停用 / 編輯、AgentPanel 附件列、PeoplePicker 頭像堆疊、DataTable 標籤格),所在那一列都自成疊放脈絡,E 並存 modal 的本體(Dialog 與 FileViewer 傳 `persistentElements`)是 `z-40`、一般 FileViewer 是 `z-50`;`--selftest` 注入未登記的值、未登記的檔、打亂的表(含拖曳影像壓到 Tooltip 之下)、局部列塞沒量過的變數、同一個未登記值換六種非 utility 寫法、未登記的檔放沒寫 `zIndex` 的 `<DragOverlay>`、把 Toast 釘回 sonner 的 `999999999`、把 Toast 壓到 `44`、在頁面上拿掉 Tag / 頭像列的 `isolate`、把並存 FileViewer 的本體改回 `z-50`,各自必紅。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-panel.spec.md`
- `app-shell.spec.md`
- `hover-card.spec.md`
- `motion.spec.md`
- `slider.spec.md`
- `toast.spec.md`
- `token-system.spec.md`
- `tooltip.spec.md`
