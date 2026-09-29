# DataTable 捲動效能設計原則(虛擬捲動 / 預掛緩衝 / 列殼 / 捲動中的 hover;獨立 SSOT)

> **本 spec 是 DataTable 捲動效能的獨立 SSOT**(2026-09-27 從 `data-table.spec.md` 抽出「預掛緩衝(overscan)— 隨機器能力自適應」與「六之三、Runtime perf budget canonical」兩段,避免單一 spec 超過 800 行硬上限(1016 行,待辦總帳 N19 / OE9);內容零改動,只加本檔頭與檔尾指標)。三區域架構 / 六之二 Column 寬度 API + 不變條件 / 捲軸 canonical 仍住 `./data-table.spec.md`,缺陷登記住 `./data-table-known-defects.spec.md`;程式碼對應 `data-table.tsx`(虛擬化、`decideShell`、`syncHoverUnderPointer`、`setHoveredRow`、`rowDragScrollLatch`);機械閘 `scripts/data-table-fast-scroll.mjs` / `data-table-scroll-cost.mjs` / `data-table-scroll-perception.mjs` / `data-table-overscan-adaptive-invariant.mjs` / `data-table-row-cache-deps-invariant.mjs` / `data-table-hover-exclusivity-invariant.mjs` / `data-table-row-under-pointer-invariant.mjs` / `runtime-perf-datatable.mjs`。
>
> **Layout Family**:同 `data-table.spec.md`(composite / multi-section);本檔不另立 family(sub-spec,Dim 16 豁免)。

### 預掛緩衝(overscan)— 隨機器能力自適應(2026-09-12)

TanStack Virtual 的 `defaultRangeExtractor` 只渲染 `[startIndex − overscan, endIndex + overscan]`
(`@tanstack/virtual-core/dist/esm/index.js:7-14`),範圍外的列一 commit 就卸載,
**沒有任何「保留舊列直到新列就緒」的機制**。緩衝原本固定 5 列 × 40px = 200px,
而**一次普通滾輪就是 1000px** —— 結構上差 5 倍,所以快速捲動必然露出背景。

**世界級對照**:AG Grid 的 `rowBuffer` 預設**每側 10 列**,文件逐字寫明理由 ——
「By default the grid will render 10 rows before the first visible row and 10 rows after the last visible
row… This is to act as a buffer as **on some slower machines and browsers, a blank space can be seen as
the user scrolls**」(https://www.ag-grid.com/javascript-data-grid/dom-virtualisation/)。
AG Grid 是用兩倍於我們原值的緩衝把空白壓到看不見 —— 但**壓小不等於消除**,緩衝再大都追不上任意快的手勢。

> **2026-09-12 撤回**:這裡原本寫「**連 AG Grid 都不宣稱能消除空白**」,語氣上把「業界最好的也只能壓小」
> 當成本 DS 的天花板。那是錯的定位 —— user 2026-09-12 原話:「你知道 main 只是低標嗎?理想上 data table
> 整體互動和體驗越順暢越好」、「我認為任何情境『理想』上都不應該看到空白,但也不應該為了達成此目的而讓
> 體驗和互動卡頓」。**目的地是零空白**,見下方「零空白不變條件」。緩衝與列殼都只是逼近手段,不是終點。

**我們的做法**:**預測**「把緩衝加上去之後,一次全量 commit 會不會變成長工」,而不是只看每列成本。

一次全量 commit 要畫 `視窗列數 + 2 × overscan` 列(緩衝在上下各一側),成本 = 列數 × `costPerRow` + 固定成本。
要求它留在 **Long Tasks API 的 50ms 界線**內 —— 跨過去瀏覽器就把那一段算成長工,而長工正是 user 感受到的卡頓:

```
overscan = clamp(⌊(50 − fixedCost − 視窗列數 × costPerRow) ÷ (2 × costPerRow)⌋, consumer overscan, 10)
```

我們比 AG Grid 多的就是 `costPerRow` / `fixedCost` 這兩個實測值,所以緩衝可以按機器付得起的量給。

**兩個被推翻的版本(都留著,免得再走一次)**:

1. **固定 10**(直接照抄 AG Grid):4× 節流下最長連續空白從 451ms 惡化到 **566ms**、面積 516 → 972 ——
   慢機器每次 commit 要掛的列變多。
2. **事後守衛**(`commitCost > 50ms 就不擴`):**不行,因為它是反應式的** —— `commitCost` 要先被量到變長
   才會觸發,而那幾次變長的 commit 正是它該避免的。同機 3× 節流下 `--ref=main` 判定長工 374ms >
   main 289×1.25;把自適應整個關掉則是 345 ≤ 379 全過。預測式才不會震盪。

**實測**(6000px/s 手勢,1400×800):

| CPU 節流 | 預測餘裕 | 緩衝 | 空白幀 | 最長連續空白 |
|---|---|---|---|---|
| 1×(一般機器) | +21.8ms | **10** | 30 → **5–9** | 67ms → **17–33ms** |
| 2× 以上 | 負值 | **5**(下限) | 與改前相同 | 與改前相同 |

也就是說:**只有真的有餘裕的機器才擴緩衝**;慢機器行為與改前一致,由列殼機制接手。

**量測紀律**:3× 節流的長工在同一份程式碼上跑出 **220ms 與 404ms**(雜訊主導),
所以這條不可用本機單跑判定,要看 CI 的同窗交錯 `--ref=main` 比值。

**機械閘** `scripts/data-table-overscan-adaptive-invariant.mjs`(刻意做成**機器無關** —— 絕對門檻只是在量跑閘的那台機器):
A1 緩衝不低於 consumer 的 overscan / A2 不超過 AG Grid 的 10 / A3 能力越強緩衝不得更小(抓公式方向反了)/
A4 有餘裕時機制必須真的動(沒餘裕的機器明白標為不適用,不假裝驗過)。
對照組把回報值改成 0 與 99 → A1/A2 必紅。

### 六之三、Runtime perf budget canonical(2026-05-14 codex+Layer A)

`scripts/runtime-perf-datatable.mjs`(Playwright,cooldown 60-90s)+ 60fps 16.67ms canonical(web.dev / MDN long-task >50ms)。**4 test cases**:

| Case | Story | Avg / p95 / long-task | Gate |
|---|---|---|---|
| A Plain virt | `VirtualScroll` | ≤16.67/≤33/0 | hard |
| B Rich budget | `RoadmapPerfBudget`(500×13 rich+inline-edit,fixed 600px;2026-05-17 整併誤 retire → 2026-06-12 R2 重建,gate 恢復可跑) | ≤50/≤80/≤1 | hard |
| C Row drag | `RowDragWithVirtualization` | ≤33/≤50/longest<100 | soft(DnD thermal) |
| D Edit isolation | `<Profiler>` TBD | skip ≥ visible−active | hard |

**2026-06-12 重建後實測**(static build,3 runs/case):1x CPU — A 16.56/16.8/0、B 24.0/33.4/0、C 16.67/16.8/0 全過 gate;script 預設 4x throttle 在有背景負載機器上全 case 一致 ~2.3x 超標(含未動過的對照組 A)→ 本表門檻實證對應 1x/閒置條件,4x 門檻是否重校 = user 決策(本表數字不動)。

**Anti-pattern**:`RoadmapAllInOne`(全 features stack)≈117ms 不達 B,因 SortableRowProvider/column reorder/resize/selection/overlay 同時開。Consumer:13+ cols rich-cell → 拆 detail drawer / column visibility 預設 hide,不該期 60fps + 全 feature stack。Cite + Phase 1/2 history → `cell-registry.tsx` perf-fix JSDoc(`buildCellWithSurface` 上方)+ commits log。

**捲動的結構不變條件(2026-09-08,fiber 歸因實測後 codify)**:虛擬捲動每一步**只准新掛載的列與它自己的副作用執行**,步前就存在的列與表頭不得有任何元件 render。修前 `RoadmapAllInOne` 每步舊列 2754 + 表頭 593 個元件重繪;修後舊列 ≈2(Avatar 圖片載入失敗的 fallback state,沙箱擋外網)、表頭 0。同一支 canonical 儀器(上表,1x CPU)前後:RoadmapAllInOne 平均每幀 57.3 → 17.7ms、p95 66.7 → 33.3、最長任務 87 → 0;VirtualScroll 39.5 → 16.5;RoadmapPerfBudget 21.3 → 16.7;RowDrag 19.9 → 16.6。三個根因與對應的守法(Codex R7 對抗審查校正後):
- **dnd-kit sensor options 必須身分穩定**:`useSensor(Sensor, options)` 是 `useMemo(…, [sensor, options])`,options 寫成 render 內的字面值就每次換新 → `useSensors` → DndContext activators → 每列 `useDraggable().listeners` → 每列 ctxValue → render-prop `children(ctxValue)` 重產整列。守法 = `dndSensorOptions` useMemo + Provider 內 `useMemo(() => children(ctxValue), [children, ctxValue])`。(useDraggable / useDroppable 整個消費 InternalContext、無 selector;列掛卸造成的 droppable 集合換身分是 PublicContext 那條鏈,列層不得訂閱它。)
- **列與表頭都是「元素快取」**:`rowElCacheRef`(per row)與 `headerElCacheRef`(per region)在 deps 全等時回同一個元素,React 在該 fiber 直接 bailout。快取的正確性完全取決於 `epochDeps` / `headerEpochDeps` 有沒有列全:漏一個 = 舊列拿到過期資料(I2 抓到漏 `resolvedWidths` → 顯示↔編輯寬差 0.59px)。守法 = `scripts/data-table-row-cache-deps-invariant.mjs` 用 TypeScript 語法樹(scope 堆疊 + 最近宣告解析 + 排除型別位置)列出 `renderRowFresh` / `renderHeaderRowFresh` 的全部外層自由變數,每個必須在 deps 或白名單(附理由),`--selftest` = 拿掉 `resolvedWidths` 必紅 + 四個假陰性合成 fixture。**它只證明 lexical free variables**:經 `ref.current` / `table.getState()` / `table.options` 讀到的可變值要靠 deps 明列對應 state 與 props(`tableStateForEpoch.*`、`tableOptions`、各 `enable*`),自訂 header / cell renderer 讀 table 其他狀態不在保證內;useCallback 本體的 stale capture 是 exhaustive-deps lint 的職責。
- **controlled 值不得每 render 正規化成新物件**:`normalizeSelection(selectionProp)` 改 useMemo,否則 `selection` 身分每步變、一切依賴它的 memo 每步失效。

**機械閘** = `scripts/data-table-scroll-cost.mjs`:R0 每步真的重算的列 ≤ 換列數 + 2、R1 屬性變動、R2 節點增減、R3 commits ≤ 8(固定版本回歸預算:1 次虛擬捲動 + 5 次新列掛載副作用鏈,全在新列;Radix Tooltip / Checkbox 的 ref-state 可 batching,ref → 量測有先後依賴不能併)、**R4 單步內舊列裡被碰到的元件 fiber(含 bailout)最大值 ≤ 12(實測 0;舊列 = 步前就存在且不是最近 2 步內掛載的列,新列的掛載副作用鏈會跨到下一步的量測窗)、R5 表頭 ≤ 4(實測 0)**(fiber 歸因,React DevTools 同法;PerformedWork 會漏算「執行了但 bailout」所以另計 touched;逐步最大值不是平均;計數器丟例外即紅)、1px 步進 gBCR;`--selftest` = 預算歸零必紅 + 正向對照組(點全選 → 表頭與舊列都必須量到 render)。已知邊界:主要量連續捲動,開始/停止捲動時 `TableScrollProvider` 的 context 切換(Avatar / PersonDisplay 的 scroll-defer)不在 R4 內。

**零空白不變條件(2026-09-12;user 拍板「確認,改 data-table.tsx」)**:**送出的任何一幀,中央捲動區都不得有任何一帶是空的** —— 而且**不得為了達成它而讓幀距或長工變差**。兩條必須同時成立,單獨任一條都可以被作弊繞過(只要零空白 → 整片蓋死;只要不卡 → 維持空白)。

為什麼緩衝與列殼都不夠:捲動跑在**合成執行緒**上,跟主執行緒刻意隔離(Chromium RenderingNG:「Separating the main and compositor threads is critically important for performance isolation of animation and scrolling from main thread work.」<https://developer.chrome.com/docs/chromium/renderingng-architecture>)。主執行緒被長工佔住時,合成器照樣每 16ms 送一幀,React 不可能在那段期間把列放到新位置 —— **任何需要主執行緒的機制都輸掉這場競速**。實測 CPU×1、6000px 手勢:手勢 663ms 中長工 4 個合計 324ms,送出 38 幀有 **27 幀整片空白、17/17 帶全空、最長連續 410ms**,而列殼只出現 1 幀(舊判準 `cannotDrawViewport` 問的是「這台機器畫得完一個視窗嗎」= **能力**,快機器恆為 false)。

**已知殘留(2026-09-12 實測定位,非未解)**:上述覆蓋在 **DOM／幾何層恆真**,但**合成器層有例外** —— 捲動前緣新露出的圖磚偶爾在該幀送出時尚未完成光柵化,合成器就畫成圖層底色(白)。證據:把骨架底改塗單一實色後,絕大多數「空白帶」量到 **100% 該色**(幾何與繪製都對),少數幀同一區域是 **100% 白**,還有 **75% / 81% 部分覆蓋**的中間態 —— 那正是圖磚逐塊補上的簽名。發生率本機約每 6 趟 1 次、1–2 帶、16–18ms,CI 三趟皆 0。**繪製成本不是槓桿**(連純色實填也會發生),所以不是把漸層改便宜就能消除;剩下的槓桿是圖層／圖磚提示,但 6 對 6 的 A/B 沒有檢定力(對照組同樣 0/6),要宣稱修好需遠更大的樣本。

**做法**:已掛載的列必然是連續一段 `[first.start, last.end]`;這一段以外的整個虛擬高度,在同一次 render 裡鋪成兩塊**骨架底**(`[data-row-shell-band]`,CSS `repeating` 漸層,bar = `--muted`、列底線 = `--divider`,幾何抄列殼的 `h-3 w-3/5` / 系統欄 `h-4 w-4`)。覆蓋 = 上帶 ∪ 已掛載段 ∪ 下帶 = 整個捲動區,在 **DOM／幾何層恆真且與時序無關**(合成器層的例外見上);成本是每次 render 兩個 div,之後純由合成器搬運,因此不可能造成卡頓。用漸層而非真 DOM,是因為未掛載區可達數十萬 px,鋪真列是無上限的主執行緒工作。已知落差:漸層畫不出 `Skeleton` 的 `rounded-md` 圓角(12px bar 在 9000px/s 下看不出來)。

**機械閘**:`scripts/data-table-fast-scroll.mjs --assert-max-blank-frames=0`(**絕對**判準,判每趟最大值不判中位數 —— 空白幀是缺陷不是雜訊);對偶的「不得變卡」仍由同檔 `--ref=main` 的相對閘擋。

**快速捲動的列殼(2026-09-09 codify;Codex R8 解法 (b))**:上面的不變條件管的是「主執行緒做了多少事」,但使用者看到的是合成器送出的幀 ——
真實呈現幀量測(`scripts/data-table-fast-scroll.mjs --mode=gesture`,CDP screencast + 合成手勢)抓到 **main 與分支都有**的白:滾輪一甩
(每秒 6,000–12,000px)時,每側只預掛 5 列 = 200px 緩衝,而把整窗 27 列有錢的儲存格重畫一次要 100ms 以上,合成器一幀就把視窗推到
還沒掛任何列的區域,連續 17 幀(約 280ms)中央整片白、左右釘選面板停在舊位置。修法對齊 AG Grid `cellRendererParams.deferRender`
(捲動中先顯示 skeleton cell,停捲後補 renderer)與 MUI X server-side lazy loading 的 skeleton rows:
- **判準(自適應機器畫列能力,2026-09-10)**:只看**捲動造成的 commit**(初次載入、換頁、靜止時資料變動照舊全畫)。
  跟得上的機器完全走原路:一般速度直接畫真列、零骨架。「跟不上」看真正的症狀 —— 兩次畫圖之間視窗移動的距離超過預掛緩衝
  (overscan 列 × 列高;只拿 scrollTop 真的變了的畫圖當樣本;這一次的位移 > 2 倍緩衝(≈ 一個視窗)就立刻進入、平滑值 < 0.5 才退出),不看畫圖成本(CI 機器每次畫圖都超過 20ms 卻在 4,500px/s 跟得上,用成本判會
  在一般速度出殼)。量到跟不上才啟用兩件事:
  (1) **幀預算**:每次 render 先算「這一幀畫得完幾列真列」=(12ms − 每次 commit 固定成本)÷ 量到的每列成本(都指數平滑、夾範圍);
  要新畫的列(新進視窗的、上次是殼的)依**可見優先、再依索引**排隊,排進預算的畫真內容,排不進的先畫**列殼**(`[data-row-shell]`,
  `aria-busy`;同高、同分隔線、同欄寬),下一幀再補;沒有新列進窗的 commit(scrollTop 沒變、還在 isScrolling 尾巴)與停捲後預算放寬到
  4 幀,停捲後可見殼一律當次全升級(固定成本很貴,一次多補幾列才補得快;但尾巴不能放到 8 幀 —— 讀到舊 scrollTop 時一次畫太多會讓視窗跑出前掛殼)。
  (2) **前掛殼**:一次 commit 的時間內視窗會移動「速度 × commit 時間」這麼遠,這段距離的列先掛殼在**捲動方向**前面等著(最多 48 列;
  只掛前方,不用對稱 overscan 浪費一半在視窗後面),
  否則畫好的列落地時視窗早已捲過去、整片白。「跟不上」的判定有遲滯(見上),退出後殼還沒補完時用 4 幀預算
  分幾次補、前掛不歸零(否則便宜的預算 commit 與一次全畫的長 commit 會來回震盪);停捲後(scrollTop 不再變、且虛擬化器 250ms 內沒有
  scroll 事件)可見的殼一律當次全升級,
  預算只節制視窗外 —— 只比 scrollTop 不夠,長 commit 之後下一次 render 讀到的 scrollTop 常常還沒更新。**緊急跳轉**看「上一次 render 開始到
  這一次 render 開始」的位移(含上一次 commit 自己花掉的時間)跨過整個可視窗 → 新列一律先殼、殼 overscan 擴到半個視窗;不看
  commit 結束後的位移(慢機器每次 commit 一結束下一次 render 就開始,中間位移很小,連續慢 commit 永遠觸發不了)。不用兩次 render 的瞬時速度決定
  可見列要不要殼(快機器的正常短捲會被誤判)、也不用固定跳距(慢機器 commit 頻繁、位移不到一個 viewport 而永不觸發,CI 曾整片白 1 秒)。
  保留中的真列、拖曳中、編輯中與選取格所在列不退回骨架;升級後仍同步三區列高。
- **兩個閘同時守**:`scripts/data-table-fast-scroll.mjs`(極速 6,000px/s 白區 ≤ 400ms、補齊 ≤ 1,000ms,CI 的 ubuntu runner 不節流就是慢機器 —— R17 判準在它上面整片白 1.3s、v8 降到 64 / 103ms;
  CPU 節流 2× / 4× / 6× 只當本機重現與壓力工具,不當 CI 閘:CDP 節流在 2 vCPU 的共享 runner 上不是線性的,同一 job 不節流 64ms、4× 卻 1,769ms,
  本機 4× 是 167ms,數字不能跨機器搬;2× 是「跟不上」旗標最容易震盪的中速帶,本機必跑)與下方一般速度的呈現閘(零骨架;內容延遲 p95 ≤ 兩幀(門檻 = max(34ms, 2 × 該機器截圖幀距的中位數))且單列最長 ≤ 3 倍門檻,CI 只在 dpr1 斷言延遲 —— dpr2 在共享 runner 是 raster 成本決定(幀距正常卻 p95 72),回歸對照改用本機 CPU 節流跑 main vs 分支(2× 節流 main p95 83 vs 分支 0);不用「最長 ≤ 34」,~100 列出現一次 3 幀停頓是機器雜訊;單一 scroll 事件跳過整個視窗 = 機器停頓造成的整窗跳轉,那一跑作廢重跑最多 3 次)。列快取閘 `data-table-scroll-cost.mjs` R0
  (「重算的列 ≤ 換進的列 + 2」)只在不節流下斷言:慢機器模式下殼 → 真列的升級本來就是同一列畫兩次(先殼後真),4× 節流實測 11.8 vs 10.8,
  這是設計上的兩段式畫法,不是舊列被重算。
- **一般捲動的呈現閘** = `scripts/data-table-scroll-perception.mjs`:PNG 同幀解碼列身分與骨架狀態,量首次進窗至真內容的取樣延遲、骨架幀比例與面積時間。
  1,500/3,000/4,500px/s 的減速與連續短捲均納入對照;`--sabotage=on --assert=on` 故意延後內容,必須拒絕。
- **機械閘** = `scripts/data-table-fast-scroll.mjs --mode=gesture`:量合成器實際送出的每一幀(不是 DOM、不是預估),中央區每 40px 帶完全
  沒有墨跡 = 空白帶;閘 = 最長連續空白 ms 與停捲後殼補齊 ms。儀器自帶對照組(`--selftest`):500 列不虛擬化的靜態頁同手勢必須 0 空白
  (高速位移本身不會被誤判成白)、每個 scroll 事件忙等 120ms 必須量到 ≥ 3 幀空白(該紅會紅)。
- **修後實測(2026-09-09,headless 軟體光柵,各 3 跑中位數;儀器 PNG 幀 + 骨架色可見 + 分隔線不算內容)**:12,000px/s 最長連續空白 556 → 31ms、空白幀 30 → 4;
  6,000px/s 502 → 18ms、56 → 3 幀;3,000px/s 兩邊都 0、殼 0 幀(正常速度完全不出殼;初次載入 / 換頁也不出殼 —— 只有「上次 commit 是殼」的列吃補齊配額)。殼的 Skeleton 不做脈動動畫(幾百格透明度動畫讓光柵每幀重畫,消融實測空白幀 42 → 20);
  合成器超前時 overscan 擴到半個視窗(每側上限 24 列)。CI 閘:6,000px/s 最長連續空白 ≤ 400ms、停手後殼 ≤ 1000ms 補齊(同句跑 main 紅 550–700ms)。

**捲動中不量沒人看的東西(2026-09-10 codify)**:這一輪處理「在捲動中量了、但畫面上沒人看得到」的幾何讀取。
新儀器:攔截 `scrollTop` / `clientHeight` / `offsetWidth` / `getBoundingClientRect` 等的 getter,按呼叫點統計一次手勢的讀取次數
(全功能整合範例、40 步滾輪)。**11,095 → 10,163**。
- **列拖曳把手在閂上期間延後量測**:捲動時把手一定是隱藏的(`rowDragScrollLatch`),但 hover 代理會不停把 `data-hovered`
  換到指標底下的新列,每換一次就量一次位置(243 次 `getBoundingClientRect` + 81 次 `clientHeight`),全算在隱藏的東西上。
  改成延後到閂鎖放開再補量 —— **延後不是跳過**:跳過會留下「指標停在同一列不動、放開後沒有任何事件重新量 → 把手回不來」的洞。
- **標籤溢出只量一次**(`Combobox`,1,080 → 540):細節見 `combobox.spec.md`「單行溢出」。
- **`clientHeight` 只在權威更新點讀**(掛載 + ResizeObserver),render 與 layout effect 讀快取。
  **`scrollTop` 反過來必須讀 DOM 現值**:下面「機器跟不跟得上」的判準用它算位移,而長 commit 期間捲動事件送不進來,
  讀快取等於永遠看到舊位置、永遠判成跟得上,慢機器的殼列安全網就不會啟動。

**同一輪量到、但**沒有**採用的三條(留檔免得重走;每條都附擋下它的數字)**:
1. **`useFlushSync: false`**(捲動事件裡不同步重畫)。`@tanstack/react-virtual` 3.13.23 的預設是在每個 scroll 事件的處理器裡
   `flushSync(rerender)`;關掉它讓捲動事件耗時 p95 從 15.5ms 掉到 1.0ms。世界級對照也支持關掉 —— AG Grid 33.3.2
   [`onVScroll`(ag-grid-community.js:25744-25777)](https://www.npmjs.com/package/ag-grid-community/v/33.3.2) 在捲動事件裡只記
   `nextScrollTop` + `animationFrameSvc.schedule()`,重畫在 rAF 的 `executeFrame(60)`(同檔 :34057)。
   **但量畫面就翻盤**:6,000px/s 空白幀 2 → 7.5、最長連續空白 17 → 27ms;dpr2 + 節流下合成器送出的幀 p95 19.2 → 32.4ms。
   AG Grid 能走 rAF 是因為它的儲存格是輕量 DOM 且自帶 60ms 預算的分幀佇列,**不是同一個成本結構**;
   照抄 API 形狀而不看成本結構會壞。仲裁一律看畫面,「捲動事件耗時」是歸因指標。
2. **共用量測排程器**(截斷偵測 / 頭像堆疊量測捲動中延後、停下後分批補)。快機器上很漂亮(幾何讀取再降 8,300 次、
   6,000px/s 空白幀降到 2),但**慢機器上會把殼列安全網關掉**:5× 節流實測殼幀 17 → 9.5、最長連續空白 199 → 359ms,
   CI 的 2 vCPU runner 上更是 528ms(閘上限 400ms)。
3. **捲動中一律方向預掛**。同樣在快機器上很好、慢機器上更糟(5× 節流最長連續空白 359 → 1,080ms)。

**根因(下一輪的前提條件,沒解決之前 2、3 不能上)**:殼列安全網的觸發條件是「視窗移動距離 ÷ 預掛緩衝」與「每列成本」,
兩者都是 **commit 成本的代理值**。它們之所以在 main 上準,是因為 main 的 commit 恰好把量測也算進去、與慢光柵正相關;
一旦把量測移出手勢窗、commit 變便宜、render 變密,同樣的速度下每次位移變小 → 判準說「跟得上」→ 安全網不啟動 →
慢機器整片白。**代理值被自己的改善打敗了。** 兩種替代判準都試過並量過,都沒有還原殼列:
(a)「進來的列數 × 每列成本 > 幀預算」(仍是 JS commit 時間,量不到光柵);(b)「量到的幀間隔 > 1.5 幀」(整條管線的產出,
理論上對,但實測殼幀仍只有 10)。下一輪要先**直接觀測殼列狀態**(把 `budgeted` / `budgetRows` / `costPerRow` 暴露成可讀的
測試訊號)再改判準,不要再靠推理猜。

**每列成本(2026-09-11;user 在自己的機器上回報「非常卡頓」後,在真實瀏覽器量出來的)**

**量測方式的更正**:先前所有效能結論都來自無頭瀏覽器,而它量到的每列成本是 1–2ms;**user 的真實 Chrome 上是 10–20ms**,
兩者差一個數量級,所有以無頭數字推導的判準因此全部失準。現在的做法是:沙箱起本機靜態站(`127.0.0.1`),
用**真實瀏覽器 + 真實滾輪事件**做 A/B;殼列的決策狀態掛成 `data-shell-state`(`window.__DT_DEBUG_SHELL = true` 才出現),
可直接讀出 `slow / budgeted / ahead / behind / commitCost / costPerRow / budgetRows`,不必再從程式碼推測。

**已落地:把每列內容量測的重複工作拿掉**(細節見各元件 spec)——
`Tag` 的截斷量測加字型 / 文字寬度兩層快取;`PeoplePicker` 頭像串的元素查詢改快取。
CPU 剖析(5× 節流)顯示這兩處原本是每列成本的第二、三大項(169–232ms 與 139.7ms,後者修後 48.7ms)。
**實測**:user 的真實 Chrome 上每列成本 **13.7 → 6.4–7.8ms**;本機 5× 節流、6,000px/s、4 次交錯對照,
最長連續空白 576 → **350ms**、空白幀 50.5 → **45.5**、停捲補齊 537 → **470ms**、主執行緒最長任務 154 → **133ms**,
每一項都更好。

**同一輪試過、被實測擋下而撤回的五項**(留檔免得重走;每項都附擋下它的數字):
1. **用「一次 commit ≥ 兩幀」當出殼的必要前提**。動機對 —— 原判準把「使用者甩得快」和「機器畫不動」混為一談
   (真實滾輪一次十格位移約 1,000px = 5 倍緩衝,於是每次正常甩動都被判成跟不上;user 的機器實測 100% 的幀有骨架)。
   但擋下它的是慢機器:CI 的 2 vCPU runner 殼幀 16 → 8.5、最長連續空白 438–476ms(閘上限 400ms)。
2. **殼列記帳休眠**(機制沒作用時不做 Map/Set 記帳)。它會把「哪些列已畫成真列」清掉,一旦轉回需要殼時所有列都被當成新列 →
   本機 5× 節流最長連續空白衝到 2,102ms。
3. **layout effect 不讀 DOM**(改用 render 開始時的值)。`lastOffset` 記的是 commit 結束那一刻的位置,commit 期間合成器還在捲,
   改用 render 開始的值會少算這一段。
4. **前掛時間基底加下限(兩幀 / 四幀)**、5. **預掛緩衝下限 10 列**。兩者都沒有改善,後者還讓 script 時間上升。

**方法論(這一輪最貴的教訓)**:5× 節流的空白量測**跑間變異極大**(同一個建置量到 234 / 242 / 576 / 601 / 818ms),
單次或兩次跑不足以判定;而且**基準一定要抓對**——我一度把 `b29fd702` 的建置當成上一版,據此連下五個「本輪更差」的結論,
換回真正的上一版(`eb5b42fc`)並跑 4 次交錯之後,結論完全相反。判定一律用**同一跑之內的交錯對照 + 至少 4 次**。

**剩下的成本是什麼(量過才寫,兩條路都實測走不通)**:5× 節流、6,000px/s 的 CPU 剖析上,最大一項是
commit 後那個 layout effect(自身時間 292.6ms / 18.7%)—— 它只讀一個 `scrollTop`,但那是在 React 剛改完 DOM 之後,
會**逼出整張表的版面計算**,所以整筆版面成本都記在它頭上。

1. **把那個讀取拿掉(改用 render 開始時的位置)**:成本不會消失,只是換一個函式背 —— 直接改建置產物做對照,
   292.6ms 只是搬到另一處變成 255.0ms,手勢反而從 1,556ms 變長到 1,657ms、scroll 事件處理中位數 0.47 → 53.02ms。
   **結論:那是整張表固有的版面成本,不是多餘的讀取**;這也是前面第 3 項撤回的獨立佐證。
2. **不要在 scroll 事件裡同步重繪**(`useFlushSync: false`,對齊 AG Grid 把捲動處理丟進 animation frame 的作法):
   4 次交錯對照下長工最長 157 → 130ms、script 1,109 → 1,049ms 是好的,但**使用者看得到的那幾項全部變差** ——
   空白幀 49.5 → 50.5、最長連續空白中位 516 → 608ms、殼幀 9 → 13.5、停捲後補齊 490 → 600ms。
   user 抱怨的是空白與骨架,所以不採用。

`Tag` 的截斷量測仍需讀一次 `clientWidth`、`use-truncated` 的 `scrollWidth/clientWidth` 同理,
但兩者都只是上面那筆版面成本的一部分,不是額外的。post-paint 重新量測(`useTruncated` 的 rAF + 100ms 各一次)
實測整趟手勢共 442 + 337 次、合計 39.3ms,加了快取之後已經很便宜,不值得再動。

**出殼的判準:機器畫不動,不是使用者捲很遠(2026-09-11 根因;user:「還是非常卡頓…比 main 還明顯超多」)**

**怎麼量到的**:在 user 的**真實 Chrome** 裡用 `MutationObserver`(不受背景分頁的 rAF / timer 節流影響)+ 真實滾輪輸入。
先前每一輪都在沙箱 headless 裡量,那裡每列成本 1–2ms,這套機制幾乎不會啟動 —— 所以 bug 一直藏著。

**量到的事實**:同一台機器、同一個操作(一次 10 格滾輪 = 1000px):

| | main(沒有殼機制) | 修前的本分支 |
|---|---|---|
| 視窗內骨架列 | **0** | **14 / 14(全部)** |
| DOM 穩定時間 | 148ms | 124ms |

**骨架沒有換到任何速度,只換來使用者看得見的灰塊。** 讀出決策狀態(`data-shell-state`)才看到原因:

```
costPerRow=2.1–4.6ms   fixed=10.0ms   budgetRows=4   slow=1   ahead=1
```

兩條路都只看**位移**,跟機器快慢無關:
1. `ahead`(緊急跳轉)門檻 = 位移 ≥ 一個視窗高(540px)—— **一次普通滾輪就是 1000px**,恆為真 → `budgetRows` 寫死 0 → 整窗全殼。
2. `budgeted` 門檻 = 位移 > 2 倍預掛緩衝(overscan 5 列 × 40px = 200px)—— 同樣恆為真。
   而且 `fixedCost` 卡在它的上限 10ms,幀預算 12ms 扣掉只剩 2ms,一列 4ms → 算出 0 列 → 永遠掉進
   「可見列 ÷ 4」的下限,也就是 **3/4 視窗固定變骨架**。

**修法**:加一條前提 —— **這一個視窗畫得完嗎**。
`視窗列數 × 每列成本 + commit 固定成本 ≤ SHELL_ENGAGE_VIEWPORT_MS(120ms)` → 畫得完就不出殼,直接畫完。
60 = 我們對標的 AG Grid 每幀建列預算。**cite 換成可驗證的來源**(2026-09-12):原本引
`ag-grid-community.js:34143`(打包後行號),但 AG Grid **不在本 repo 的依賴裡**,那個 cite 誰都驗不了;
改引原始碼 https://github.com/ag-grid/ag-grid/blob/latest/packages/ag-grid-community/src/misc/animationFrameService.ts
逐字 `const callback = this.executeFrame.bind(this, 60)`。原本取兩倍(120),該取捨已被實測推翻;
取兩倍的理由是「一個視窗的內容晚 120ms 出現,比先看到一片灰色骨架再換成真資料好」—— main 在同一台機器上就是花 148ms
一次畫完、全程沒有佔位。

**兩個常數必須分開**(我一度合併,被實測擋下):
- `SHELL_ENGAGE_VIEWPORT_MS = 120` —— 要不要出殼的量尺。
- `SHELL_FRAME_BUDGET_MS = 12` —— 既然要出殼,一次 commit 補幾列。把它拉到 60 會讓慢機器的 commit 變長:
  4× 節流實測長工 132 → 261ms、最長連續空白 418 → **1156ms**。撤回。

**驗證**:user 的真實 Chrome,連續三次 1000px 捲動 → **骨架 0、空列 0**,DOM 89ms 穩定(main 148ms)。
慢機器保證沒破:4× 節流最長連續空白中位 452ms(修前 417ms)、骨架 10 幀(修前 11)、長工 131ms(修前 131)。
不節流全閘綠(空白中位 52ms)。新增斷言 `--assert-max-shell-frames=0`:**畫得動的機器不准出殼**,
對照組(修前建置)在同一條斷言下 11 幀、必紅。

**同一時間最多一列 hover(2026-09-16;user:「捲動之後很容易會出現一個畫面同時有兩筆 row 呈現 hover 的狀態」)**

不變式有兩半:**(a) 亮著的那一列是指標底下那一列**(下一段)、**(b) 同一時間最多一列亮**。(b) 以前沒有任何一行程式負責 ——
它只是「`mouseover` 加 / `mouseout` 減成對出現」的副作用,而捲動會把這一對拆散:捲動中瀏覽器不會每幀重算指標在哪一列
(命中點落後畫面 1–4 列),`syncHoverUnderPointer` 先把標記移到新列;瀏覽器遲來的 `mouseout` 帶著**舊**索引去刪一個早就被清掉的索引
(空轉),剛才那一列就成了孤兒;接著遲來的 `mouseover` 只加不清 → 兩列同時亮。而且不會自己好:補正的快速略過條件只看
「指標底下那列有沒有被標」,孤兒出現後永遠成立(實測等 10 秒、滑到別列、把指標移出表格都不會好,只有那列被虛擬捲動回收才消失)。

**修法(根因層)**:標記只有**一個寫入者** `setHoveredRow(idx)` —— 標新列的同一個動作把其餘所有列清掉;`mouseout` 依
**接下來該亮哪一列**(`relatedTarget` 所在列,沒有就是 null)來清,**不依瀏覽器記得的舊索引**;補正的略過條件加上
「被標記的**全部**都是這一列」;拖曳啟動的清除收尾時也把 ref 對回 DOM(ref 說 A、DOM 標著 B 正是病根)。
連帶修掉「指標從列上移進浮層(下拉選單 / tooltip)時什麼都不清」。
機械閘:`scripts/data-table-hover-exclusivity-invariant.mjs` —— **手勢必須是合成器驅動的平滑捲動**
(CDP `Input.synthesizeScrollGesture`);滾輪的離散事件製造不出那段落差,修前的 build 在它底下是綠的 = 假綠。

**指標底下那一列永遠有 hover 反應(2026-09-11;user:「游標明明到了,table row 的反應卻要等好一陣子」)**

這條跟「捲動快不快」是兩件事,先前每一輪都只在量捲動,所以一直沒抓到。根因有兩層,都用
`scripts/data-table-row-under-pointer-invariant.mjs`(含會紅的對照組)實測過:

1. **殼列沒有 hover 可供性**。殼列帶 `data-row-index`,所以 hover 代理**會**把 `data-hovered` 標上去 ——
   但它的 class 裡沒有 `data-[hovered]:bg-neutral-hover`,標了也什麼都不顯示。指標停著不動、底下那列
   在捲動中被套殼,看到的就是整列毫無反應。4× 節流實測:殼存活 505ms,期間 6 幀完全沒有 hover 反應。
   **修法**:殼列補上跟真列同一條 hover 底色。殼是「內容還在路上」,不是「這裡沒有列」;
   把手與動作鈕仍不畫(那兩個要有真資料才有意義)。對齊 Linear / Jira 的 skeleton 列仍是可 hover 表面。
2. **捲動中瀏覽器不重新派送 hover**。整段合成手勢期間,指標底下那一列**一次 `mouseover` 都沒有收到**,
   `data-hovered` 還留在早就捲出視窗的舊列上。CSS `:hover` 沒有這個問題(瀏覽器每幀自己算),
   AG Grid(`.ag-row:hover`)與 MUI X 都走 CSS;本表為了跨三個捲動區同步同一「邏輯列」才用 `data-hovered` 代理,
   代價就是得自己補上瀏覽器免費提供的那一半。**修法**:`syncHoverUnderPointer` 在每次捲動 commit 之後,
   用最後已知的指標座標做一次 `elementFromPoint`,把 `data-hovered` 對到真正在指標底下的那一列。
   這個 effect 本來就已經讀過 `scrollTop`(版面算過了),所以不多逼出一次版面計算。
   **一定要連 DOM 節點一起比,不能只比 row id** —— 殼列升級成真列時換了節點,新節點身上沒有 `data-hovered`,
   只比 id 會直接 return,留下「真列在指標底下卻沒底色」的一幀空窗(實測就是 1 幀)。

同時,`decideShell` 與預排隊都把**指標底下那一列**加進「不套殼」的例外(原本只有拖曳中 / 編輯中 / 選取格所在列)。
不變式是同一條:**有使用者互動在上面的列不套殼**。成本:每幀最多多畫一列。

**驗證**:`data-table-row-under-pointer-invariant.mjs` —— 指標放到中央後完全不動,跑 6,000px/s 手勢,
逐幀用 `elementFromPoint` 取指標底下那一列。修前 6 幀沒有 hover 反應(最後一次在 935ms),修後 **0/140 幀**。
對照組把殼列那條 hover class 拿掉 → 必須量到沒反應(證明閘在該紅時會紅)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `data-table-known-defects.spec.md`
- `data-table.spec.md`
