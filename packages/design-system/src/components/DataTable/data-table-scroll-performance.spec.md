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

> **2026-09-12 撤回**:這裡原本把「業界最好的實作也只能把空白壓小」
> 當成本 DS 的天花板。那是錯的定位 —— user 2026-09-12 原話:「你知道 main 只是低標嗎?理想上 data table
> 整體互動和體驗越順暢越好」、「我認為任何情境『理想』上都不應該看到空白,但也不應該為了達成此目的而讓
> 體驗和互動卡頓」。**目的地是零空白**,見下方「零空白不變條件」。緩衝與列殼都只是逼近手段,不是終點。

**我們的做法**:**預測**「把緩衝加上去之後,一次全量 commit 會不會變成長工」,而不是只看每列成本。

一次全量 commit 要畫 `視窗列數 + 2 × overscan` 列(緩衝在上下各一側),成本 = 列數 × `costPerRow` + 固定成本。
要求它留在 **Long Tasks API 的 50ms 界線**內 —— 跨過去瀏覽器就把那一段算成長工,而長工正是 user 感受到的卡頓:

```
overscan = clamp(⌊(50 − fixedCost − 視窗列數 × costPerRow) ÷ (2 × costPerRow)⌋, consumer overscan, 10)
```

我們比 AG Grid(固定緩衝 `rowBuffer`,預設 10,https://github.com/ag-grid/ag-grid/blob/v33.3.2/packages/ag-grid-community/src/entities/gridOptions.ts#L836-L841)多的就是 `costPerRow` / `fixedCost` 這兩個實測值,所以緩衝可以按機器付得起的量給。

**兩個被推翻的版本(都留著,免得再走一次)**:

1. **固定 10**(直接照抄 AG Grid `rowBuffer` 預設值,https://github.com/ag-grid/ag-grid/blob/v33.3.2/packages/ag-grid-community/src/entities/gridOptions.ts#L836-L841):4× 節流下最長連續空白從 451ms 惡化到 **566ms**、面積 516 → 972 ——
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
A1 緩衝不低於 consumer 的 overscan / A2 不超過 AG Grid 的 10(`rowBuffer` 預設,https://github.com/ag-grid/ag-grid/blob/v33.3.2/packages/ag-grid-community/src/entities/gridOptions.ts#L836-L841) / A3 能力越強緩衝不得更小(抓公式方向反了)/
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
- **controlled 值不得每 render 正規化成新物件**:當時是 `normalizeSelection(selectionProp)` 改 useMemo,否則 `selection` 身分每步變、一切依賴它的 memo 每步失效。2026-11-16 `string[]` 簡寫移除後 DataTable 直接用 consumer 傳進來的物件、不再正規化;同一條規則改成 consumer 端的:受控 `selection` 存 state 或 `useMemo`,不要每次 render 現做(`data-table.spec.md`「L2 選取」)。

**機械閘** = `scripts/data-table-scroll-cost.mjs`:R0 每步真的重算的列 ≤ 換列數 + 2、R1 屬性變動、R2 節點增減、R3 commits ≤ 8(固定版本回歸預算:1 次虛擬捲動 + 5 次新列掛載副作用鏈,全在新列;Radix Tooltip / Checkbox 的 ref-state 可 batching,ref → 量測有先後依賴不能併)、**R4 單步內舊列裡被碰到的元件 fiber(含 bailout)最大值 ≤ 12(實測 0;舊列 = 步前就存在且不是最近 2 步內掛載的列,新列的掛載副作用鏈會跨到下一步的量測窗)、R5 表頭 ≤ 4(實測 0)**(fiber 歸因,React DevTools 同法;PerformedWork 會漏算「執行了但 bailout」所以另計 touched;逐步最大值不是平均;計數器丟例外即紅)、1px 步進 gBCR;`--selftest` = 預算歸零必紅 + 正向對照組(點全選 → 表頭與舊列都必須量到 render)。已知邊界:主要量連續捲動,開始/停止捲動時 `TableScrollProvider` 的 context 切換(Avatar / PersonDisplay 的 scroll-defer)不在 R4 內。

**零空白不變條件(2026-09-12;user 拍板:確認,改 data-table.tsx(轉述))**:**送出的任何一幀,中央捲動區都不得有任何一帶是空的** —— 而且**不得為了達成它而讓幀距或長工變差**。兩條必須同時成立,單獨任一條都可以被作弊繞過(只要零空白 → 整片蓋死;只要不卡 → 維持空白)。

為什麼緩衝與列殼都不夠:捲動跑在**合成執行緒**上,跟主執行緒刻意隔離(Chromium RenderingNG:「Separating the main and compositor threads is critically important for performance isolation of animation and scrolling from main thread work.」<https://developer.chrome.com/docs/chromium/renderingng-architecture>)。主執行緒被長工佔住時,合成器照樣每 16ms 送一幀,React 不可能在那段期間把列放到新位置 —— **任何需要主執行緒的機制都輸掉這場競速**。實測 CPU×1、6000px 手勢:手勢 663ms 中長工 4 個合計 324ms,送出 38 幀有 **27 幀整片空白、17/17 帶全空、最長連續 410ms**,而列殼只出現 1 幀(舊判準 `cannotDrawViewport` 問的是「這台機器畫得完一個視窗嗎」= **能力**,快機器恆為 false)。

**已知殘留(2026-09-12 實測定位,非未解)**:上述覆蓋在 **DOM／幾何層恆真**,但**合成器層有例外** —— 捲動前緣新露出的圖磚偶爾在該幀送出時尚未完成光柵化,合成器就畫成圖層底色(白)。證據:把骨架底改塗單一實色後,絕大多數「空白帶」量到 **100% 該色**(幾何與繪製都對),少數幀同一區域是 **100% 白**,還有 **75% / 81% 部分覆蓋**的中間態 —— 那正是圖磚逐塊補上的簽名。發生率本機約每 6 趟 1 次、1–2 帶、16–18ms,CI 三趟皆 0。**繪製成本不是槓桿**(連純色實填也會發生),所以不是把漸層改便宜就能消除;剩下的槓桿是圖層／圖磚提示,但 6 對 6 的 A/B 沒有檢定力(對照組同樣 0/6),要宣稱修好需遠更大的樣本。

**做法**:已掛載的列必然是連續一段 `[first.start, last.end]`;這一段以外的整個虛擬高度,在同一次 render 裡鋪成兩塊**骨架底**(`[data-row-shell-band]`,CSS `repeating` 漸層,bar = `--muted`、列底線 = `--divider`,幾何抄列殼的 `h-3 w-3/5` / 系統欄 `h-4 w-4`)。覆蓋 = 上帶 ∪ 已掛載段 ∪ 下帶 = 整個捲動區,在 **DOM／幾何層恆真且與時序無關**(合成器層的例外見上);成本是每次 render 兩個 div,之後純由合成器搬運,因此不可能造成卡頓。用漸層而非真 DOM,是因為未掛載區可達數十萬 px,鋪真列是無上限的主執行緒工作。已知落差:漸層畫不出 `Skeleton` 的 `rounded-md` 圓角(12px bar 在 9000px/s 下看不出來)。

**機械閘**:`scripts/data-table-fast-scroll.mjs --assert-max-blank-frames=0`(**絕對**判準,判每趟最大值不判中位數 —— 空白幀是缺陷不是雜訊);對偶的「不得變卡」仍由同檔 `--ref=main` 的相對閘擋。

**快速捲動的列殼(2026-09-09 codify;Codex R8 解法 (b))**:上面的不變條件管的是「主執行緒做了多少事」,但使用者看到的是合成器送出的幀 ——
真實呈現幀量測(`scripts/data-table-fast-scroll.mjs --mode=gesture`,CDP screencast + 合成手勢)抓到 **main 與分支都有**的白:滾輪一甩
(每秒 6,000–12,000px)時,每側只預掛 5 列 = 200px 緩衝,而把整窗 27 列有錢的儲存格重畫一次要 100ms 以上,合成器一幀就把視窗推到
還沒掛任何列的區域,連續 17 幀(約 280ms)中央整片白、左右釘選面板停在舊位置。修法對齊 AG Grid `cellRendererParams.deferRender`(https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/)
(捲動中先顯示 skeleton cell,停捲後補 renderer)與 MUI X server-side lazy loading 的 skeleton rows(「adds skeleton rows to match the total row count」,https://mui.com/x/react-data-grid/server-side-data/lazy-loading/):
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
2. **不要在 scroll 事件裡同步重繪**(`useFlushSync: false`,對齊 AG Grid 把捲動處理丟進 animation frame 的作法:`suppressAnimationFrame` 預設 false,https://github.com/ag-grid/ag-grid/blob/v33.3.2/packages/ag-grid-community/src/entities/gridOptions.ts#L1617-L1622):
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
   把手與動作鈕仍不畫(那兩個要有真資料才有意義)。skeleton 列仍是可 hover 表面:列殼先到、內容後補時,滑過的回饋不該因為還沒載入就消失。
2. **捲動中瀏覽器不重新派送 hover**。整段合成手勢期間,指標底下那一列**一次 `mouseover` 都沒有收到**,
   `data-hovered` 還留在早就捲出視窗的舊列上。CSS `:hover` 沒有這個問題(瀏覽器每幀自己算),
   一般表格的列 hover 直接走 CSS `:hover`;本表為了跨三個捲動區同步同一「邏輯列」才用 `data-hovered` 代理,
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

### 比值閘的 A/A 修正子與雜訊底(2026-11-16,A28)【AI 推導 2026-11-16】

**為什麼**:快速捲動閘(`scripts/data-table-fast-scroll.mjs`)對參考建置的比值門檻 1.25,底下的跑間雜訊從來沒有在**同一個 job** 裡量過。零執行期改動也紅的實例都是事後才知道:74ac03eb mouse 長工合計 1.32×(3 對 3 完全分開,52ec0b6a commit message)、8dc9faa7 gesture 幀距 1.80×(Q2b 已退回的那一跑)、1ef86547 釘選區 1.38×。

**機制**(閘 + `scripts/lib/fast-scroll-gate-policy.mjs` 的 `aaNoise` / `combineWithAA` / `roundOrderOf`):有 `--ref` 時自動多量一份 `<ref>~aa` —— 同一個目錄、獨立的靜態伺服器與凍結快照;三份建置輪轉(第 i 輪從第 i mod 3 份開始,兩份時與舊的 ABBA 逐位元相同)。**R1d 的判定式不動**(同一個 `refRatioDecision`、同一份 `RATIO_CHECKS`、同樣的趟數、同樣的灰區加量輪數),A/A 只當修正子 —— 但**最終判定不是零代價**:A/A 不乾淨時要求兩份參考都紅,換到的是另一個工作點(同碼誤紅少、真回歸漏抓也多,見下方「代價」表;2026-11-16 覆核二 SF-R4);每一跑都算、都印(log 的「A/A 欄」)、都寫進 `--json`,不受「零執行期差異就跳過」影響 —— 零差異的 PR 正好是最乾淨的 A/A 樣本。

| branch 的 R1d 判定(對 ref) | A/A(`a = |ln(m(ref~aa) / m(ref))|`) | 最終 |
|---|---|---|
| pass / within-noise / needs-more | 任何 | 照 R1d(A/A 照印);加量只由這裡的 needs-more 觸發 |
| fail-cap 且這一項不放寬(中央區最長連續空白超過 1.5×,`capBasis = no-noise-allowance`) | 任何 | fail —— 空白超過上限不看分布,A/A 是分布的量測,也不看(空白另有白幀張數地板:分支要比兩份參考裡較多的那份多出 2 張以上連續白幀,見「中央區最長連續空白:比值 + 白幀張數地板」節) |
| fail-* | 乾淨:`a < ½·ln 1.25`(A/A 比值 0.894–1.118)且兩個方向都不判 fail | fail |
| fail-* | 不乾淨 | 分支對 `ref~aa` 也跑同一個 `refRatioDecision`:**兩份參考都判 fail → fail**;有一份沒判 fail → `aa-noisy`(不指控,照印兩個比值 / p / 每趟數字 / A/A;**是終判,不加量**) |
| fail-* | A/A 那份一趟可用的都沒有,或兩份參考的捲動機制不同(見規則 G-P) | 照 R1d,並印「A/A 量不到」(沒量到不當乾淨,也不當放行理由) |

**2026-11-16 覆核改了三處**(審查 MF1 / MF2 / MF4,反例原樣列進判定表):(1)第一版「不乾淨時 `ln(m(branch)/m(ref)) − a > ln 1.25` 才紅」取了絕對值 —— 「這一跑 ref 偏慢、ref~aa 偏快」時,分支比兩份參考都慢而且完全分開仍判 `aa-noisy`(分支 128–132、main 98–102、main~aa 78–82:對 main 1.30× 分得開、對 main~aa 1.63×),把同一組數字的 main 與 main~aa 標籤互換卻判紅;改成「兩份都紅才紅」後對標籤互換對稱(判定表另跑 3000 組隨機驗證,放寬那一類翻轉 0 組)。(2)第一版讓 A/A 把空白 1.57×、1.95× 也降成不紅,推翻了「空白不放寬」。(3)第一版讓 `aa-noisy` 能加量、加量輪三份都重跑:一趟 11 秒時一輪從 22 秒變 33 秒,共用的 60 秒預算從 2 輪變 1 輪,`aa-noisy` 還會先吃掉預算 —— 等於 A/A 改了 branch 對 ref 的終判。現在加量輪只量 branch 與 ref(`extraRoundPlan`;A/A 那份只用首輪),有沒有 A/A 加量輪數都一樣。

`½` 沿用 2026-10-07 g9 草稿的 `AA_NOISE_SHARE`。判定表與突變測試(拿掉 A/A、偏差改帶號、不取中位數、½ 改 1、只對 ref 比、不放寬那一項也放寬、`aa-noisy` 改回能加量、加量輪三份都重跑,每一個都讓判定表紅)在 `scripts/test-fast-scroll-gate-policy.mjs`。

**雜訊底怎麼量(只收 CI)**:只收 2026-11-16 新量具之後的 job(之前的逐趟數字量具不同 —— pinned 用頁內合成事件 —— 不能混)。每個 job 每一種跑法,`ref` 與 `ref~aa` 各 3 趟 = 6 趟同一份程式碼(零執行期差異的那一跑 branch 也同碼 = 9 趟);每個 job 內做置換(6 趟取 3 對 3 的 20 種有序分法)得中位數比的虛無分布,各 job 等權合併取 q95;另外直接數「A/A 這一對被 `refRatioDecision` 判 fail 的比例」= 實測誤紅率。本機不收:headless 的 rAF 釘在 16.7ms,幀距類數字在本機無效(meta-patterns M32(g))。

**「11-06 那一次 pinned 幀距 1.26× 是否在雜訊內」三值判定**(pinned 幀距,新量具,K = 已收 job 數):K < 5 → 雜訊底未量,不下結論;K ≥ 5 且 1.26 ≤ q95 → 在雜訊內;K ≥ 5 且以 job 為單位 bootstrap(2,000 次)的 q95 上界 < 1.26 → 超出雜訊;其他 → 未定,累積到 K = 10 再判。限制:1.26 的分子是原生捲動、分母是元件轉發(見下方規則 G-P),A/A 只量得到轉發那條路的散布 —— 這一題只回答「那一次紅,單看數字有沒有可能是雜訊」這個歷史問題,**證明不了也否定不了結構成本**;Q2b 的去留看 G-P + A/A 下的判定。

**實測值(2026-11-16)**:CI 樣本 **K = 0**(本次沒有推送)→ **雜訊底未量,不下結論**。本機功能檢查(**不是雜訊底證據**,只證明 A/A 的接線),兩跑結果不同、都記:**第一跑**同一份建置量三份(branch = main = main~aa;gesture / mouse / pinned 各 3 趟,灰區加量到 4 趟),9 格 A/A 全部乾淨(0.987–1.112×、A/A 用不到 2 種長工全為 0 的 gesture 格印「量不到」);**第二跑**(推 1 拆分驗證:受測 = 推 1 建置、參考 = 45d5543d 兩份,gesture 三跑 + mouse + pinned 共 15 格)8 格乾淨、**7 格不乾淨**(gesture 幀距 0.885 / 1.120、長工 1.387;mouse 三項 0.870 / 0.743 / 0.882;pinned 幀距 1.118 壓在 0.1116 線上;沒有一格被 `refRatioDecision` 判 fail),機器另有負載(load average 5–8)。不乾淨的頻率決定 `aa-noisy` 多常把紅蓋掉,所以兩跑都列;CI 的頻率推送後由 A/A 欄累積。第一跑另有 branch 對 main 1 格誤紅(mouse 長工合計 2.11×、4 對 4 單側 Mann–Whitney p = 0.029,而同一跑 A/A 1.01× 乾淨)。這說明 A/A 抓的是「這一跑參考自己量不準」,抓不到「受測那幾趟剛好偏」—— 它是修正子,不是保證;真正的雜訊底要 CI 上的置換分布。家族誤紅率:每個 job 3 種跑法 × 2–3 項比值,單項 α = 0.05(3 對 3 完全分開恰好 p = 0.05),A/A 欄的實測誤紅率就是它的直接量測,累積後補進本節。

**代價(2026-11-16 覆核二 SF-R4;照實列,不是零代價)**:對數常態雜訊模擬,三份各 3 趟,每格 4,000 次,直接用 `scripts/lib/fast-scroll-gate-policy.mjs`(`refRatioDecision` 單獨 vs 加 `combineWithAA`;覆核二報告的模擬)。「k = 1」是同碼誤紅率,其餘是分支慢 k 倍時的偵測率:

| 指標類 | 雜訊 sd(ln) | k = 1(誤紅)R1d → +A/A | k = 1.3 | k = 1.5 | k = 2 |
|---|---|---|---|---|---|
| 長工合計 / 幀距(`capNeedsNoiseSupport: true`) | 0.1 | 0.5% → 0.1% | 59.4% → 52.0% | 96.2% → 94.5% | 100% → 100% |
| | 0.2 | 2.9% → 1.1% | 33.3% → 22.4% | 62.1% → 51.2% | 95.8% → 93.5% |
| | 0.3 | 4.0% → 1.3% | 22.4% → 12.6% | 39.9% → 27.1% | 76.0% → 66.7% |
| 中央區最長連續空白(只算比值,不含白幀張數地板) | 0.1 | 0.5% → 0.2% | 60.6% → 54.2% | 96.5% → 95.3% | 100% → 100% |
| | 0.2 | 4.1% → 2.6% | 39.6% → 33.9% | 69.5% → 66.2% | 97.9% → 97.8% |
| | 0.3 | 9.8% → 8.5% | 36.8% → 34.5% | 57.6% → 55.7% | 89.8% → 89.3% |

長工 / 幀距那一類在雜訊 sd 0.2 時 1.3× / 1.5× 的偵測率各少 10.9 / 10.9 個百分點、同碼誤紅少 1.8 個百分點;空白(超過上限不看 A/A,只有灰區受影響)少 1–6 個百分點。這是【AI 推導 2026-11-16】的工程判準:接受這個工作點,理由是 R1d 的同碼誤紅在 CI 上已經擋過兩次發版(74ac03eb、1ef86547),而 A/A 不乾淨時「兩份都紅」對標籤互換對稱、不再由量化抽籤決定。推送後用 CI 的 A/A 散布(上面的雜訊底)重算這張表。

**對照組**:A/A 偵測器 = 只對 `<ref>~aa` 那一頁開 CPU 節流(`--aa-throttle=<倍率>`),必須印「A/A 不乾淨」、不准把分支判紅、也不准沒印就放行;偵測力 = 判定表「乾淨 A/A + 1.29× 完全分開 → 照紅」「不乾淨 A/A + 2× 回歸 → 照紅」「A/A 0.80× 不乾淨、分支比兩份參考都慢 → 照紅」(與它的標籤互換列)「空白 1.57× / 1.95× + 不乾淨 A/A → 照紅」;另以 3000 組隨機資料驗「A/A 不會讓不紅變紅」「放寬那一類標籤互換不翻轉」「A/A 不產生、也不吃掉 needs-more」。

### 規則 G-P:釘選欄步驟只比同一種捲動機制(2026-11-16,A25)【AI 推導 2026-11-16】

pinned 跑法(指標停在左釘選欄上捲)在兩種結構裡走的是兩種機制:兩容器結構是**元件轉發**(`makeBindPinnedPanel` 在主執行緒寫 scrollTop),單一捲動盒結構是**瀏覽器原生捲動**。2026-11-06 擋下 Q2b 的「有釘選欄的表捲動幀距 1.26×」比的就是「原生 vs 轉發」—— 閘自己對空白那項已印「機制不同不比」,卻照比幀距與長工。本機 Tracing(下節)量到這兩種機制的成本形狀完全不同(原生捲動讓合成器多畫幀、主執行緒反而沒變),直接拿幀距比沒有意義。

| 參考 | 受測 | pinned 怎麼比 |
|---|---|---|
| 轉發 | 轉發(兩容器的分支) | 照舊:兩邊指標都在左釘選欄 |
| 轉發 | 原生(Q2b 分支、main 還沒合 Q2b) | 參考那兩份(ref、ref~aa)指標改到中央欄量原生捲動,同一段滾輪序列、同一個刻度;空白 / 長工 / 幀距三項都比;log 印「參考改量原生路徑」 |
| 原生 | 原生(main 合入 Q2b 之後) | 照舊,規則自動不再改任何東西 |
| 原生 | 轉發(例:退回 Q2b 的 PR) | 長工照比;空白與幀距印 `mechanism-differs`,不當通過也不當失敗 |

這不是放寬:門檻 1.25、灰區、1.5 上限、Mann–Whitney / 對數 Welch、加量規則一個都沒動;比的仍是同一個使用者動作在兩份建置裡的結果。機制在開跑前每份建置開一次 story 判(左釘選面板在不在共用捲動盒裡),判定段再逐趟依實際機制複核。參考與 A/A 那份的指標**一起**移(`gpPointerLabels`);A/A 兩份的實際機制不同時 A/A 判「量不到」(`aaMechanismCheck`),不讓一個量錯的 A/A 蓋掉分支的退步。**該比的同機制路徑沒量到 = 儀器失效,紅**(2026-11-16 覆核 SF1):實際量到「參考轉發、受測原生」(G-P 該移指標卻沒移 —— 開跑前判定讀不到時會發生)或機制讀不到 / 各趟不一致時,空白與幀距兩項以「儀器失效」紅,不指控分支、也不默默略過;只有「參考原生、受測轉發」這一側本來沒有同機制路徑,才印 `mechanism-differs` 不判。純函式 `pinnedMechanismPlan` / `pinnedComparable`,判定表在 `scripts/test-fast-scroll-gate-policy.mjs`(含「同機制 1.26× 完全分開仍紅」「G-P 生效後 1.6× 仍紅」)。空白那一項照下一節(比值 + 白幀張數地板)判;pinned 的參考空白在 CI 上是 0 還是幾張白幀**沒有量過**:舊量具(頁內合成事件)結構上不會有空白,新量具(CDP 真滾輪)本機兩容器同碼 9 趟是 17–71ms(不是 0,推 1 拆分驗證那一跑)—— 推送後讀 `datatable-fast-scroll-pinned` artifact 的 `--json`。

### 中央區最長連續空白:比值 + 白幀張數地板(2026-11-16,A25 覆核 MF3 → 覆核二 MF-R1 / SF-R2)【AI 推導 2026-11-16】

**為什麼**(三件事,都是 2026-11-16 審查實測):
1. 比值的分母是 0 就沒有比值。修前閘在這裡印「退回絕對門檻」就略過 —— 全檔沒有任何一行真的拿 `--assert-max-blank-ms` 判過,CI pinned 步驟連這個參數都沒給;參考 0、分支 4000–6000ms 也是「✓ 全過」。CI 舊量具下空白比值 2026-09-29 → 10-14 共 110 次**全是**參考為 0(42 份 job log,出處 `scripts/lib/fast-scroll-gate-policy.mjs` `refRatioDecision` 上方的長註解)—— 這一項在 CI 上從來沒判過(覆核 MF3)。
2. 第一版補上的「參考為 0 → 分支 > 2 個呈現幀距才紅」與「參考 > 0 → 比值,超過 1.5× 不看分布直接紅」合起來不連續:分支的紅線 T(0) = 2 個幀距、T(r) = 1.5r,參考中位數 r 不到 4/3 個幀距時 T(r) < T(0) —— **參考多一張白幀,同一個分支反而紅**;同一份資料(CI 幀距 150ms)ref = 0/0/150、ref~aa = 0/150/150、分支 150/300/300 判綠,兩份標籤互換就判紅(覆核二 MF-R1,覆核二報告實測)。
3. 尺度用「平均」幀距,一張白幀停留的卻是**那一格**的幀距:2026-11-15 兩份 CI job log 30 趟裡 6 趟的單一呈現幀距 > 2 × 該趟平均(例 237 / 88.3ms)—— 一張白幀剛好停在那一格就越線(覆核二 SF-R2)。

**判準**(lib `blankDecision`,參考是不是 0 都走這一條):每一趟另取「**最長連續白幀張數**」(`longestBlankRun(blankSeries)`:連續幾張呈現幀有空白帶,不管每張停多久)。

| 條件 | 判定 |
|---|---|
| 比值規則不判紅(參考中位數 > 0 時同一個 `refRatioDecision` + A/A 修正子;參考中位數 = 0 且分支也 0 → 「兩邊都沒有空白」) | 過 |
| 比值規則判紅(參考中位數 = 0 而分支有空白 = 比值無限大,也算),**而且**分支中位張數 − 參考張數 > 2 | **紅** |
| 比值規則判紅,但分支只比參考多 ≤ 2 張 | 過(`within-floor`:截圖量化的抖動範圍,照印比值與張數) |
| 比值規則判紅,但分支或參考沒有白幀序列 | **紅,以「儀器失效」的名義**(判不了多出幾張;沒量到不當通過) |
| 參考那一項是 0(空白)或沒資料(三項都適用) | 另外照沒有 `--ref` 時同一組絕對門檻判:空白 `--assert-max-blank-ms`(CI mouse / pinned 600ms)、長工 = 單一任務最長(`--assert-max-long-task-ms`,依機器能力放大)、幀距 = 畫面推進的幀距最大;沒給絕對門檻就照實印「這一跑沒有判這一項」 |

**參考張數** = 參考那幾趟的中位張數;A/A 那份(`<ref>~aa`)有量到時取兩份中**較多**的那份 —— A/A 節「兩份都紅才紅」用在地板上:兩份是同一份程式碼,分支沒有比其中一份多出 2 張以上,就分不出是分支還是這一跑的量化抽籤。只看 ref 的地板照樣會被標籤互換翻轉(ref 0/0/0、ref~aa 0/1/1、分支 0/3/3:只看 ref 紅,互換後綠)。A/A 那份量不到、或兩份參考的捲動機制不同 → 只看 ref。參考中位數 0、A/A 那份也 0 時,地板就是「分支中位張數 > 2」= 第一版參考為 0 的判準,單位由「毫秒 ÷ 平均幀距」換成張數。

**「2」的由來與代價**:第一版參考為 0 那一支已經用的「2 張白幀以內是 CI 截圖(約 6 幀/秒)的量化抖動」,延伸到參考很小的那一段(反方向 —— 把參考為 0 收緊到 1 張 —— 與「單張白幀 ≈ 截圖抖動」衝突)。沒有 CI 分支逐趟資料校準過(那 42 份 log 只留了比值的 `no-ref` 那句),推送後由 `--json` 的逐趟數字回頭驗。代價照實:本機 60 幀/秒下多 ≤ 2 張(≤ 33ms)一律不紅;參考 1 張時分支 3 張(3×)也不紅。

**本項的已知盲點(照實保留):這一項管「白幀張數」,防不住持續空白。** 張數不看每張停多久,一張白幀停很久只算 1 張 —— 整片白而且畫面不變時截圖串流不重送相同的幀,持續的白就是「1 張停很久」,跟 CI 截圖慢的「1 張停在長格上」分不開(這是「一張白幀落在最長那一格 → 過」的直接代價)。最終(Q2b)建置本機 pinned 實測分支 127 / 205 / 267ms(前兩趟都是單一張白幀停那麼久,12/17 帶)對 main 22 / 33 / 22ms(9.29×),本項判 `within-floor`;幀距比值也沒抓到(推進幀距 51 對 46ms)。把單位改成「白幀停留時間 ÷ 同一趟正常畫面間隔的 p90」也分不開(2026-11-16 試算,【AI 推導 2026-11-16】):一張白幀落在最長那一格,單位結構上 ≥ 1(CI 2026-11-15 兩份 job log 30 趟只有幀數 / 最長 / 平均,單位上界 1.77–3.79;本機同碼 mouse / pinned 有逐幀資料,實際 1.21–2.78,最長那格多半是開跑前的靜止段),而上面那三趟的單位中位只比兩份參考多 0.997 —— 正常畫面本來就會停 125–436ms,找不到同時成立的門檻。**持續空白改由下一節的 checkerboard 次數判**(與截圖節奏無關);參考為 0 時本項另有絕對門檻(判定表「每趟 1 張白幀但停 4000–6000ms → 地板過、絕對門檻 600ms 紅」)。

**性質與證據**(`scripts/test-fast-scroll-gate-policy.mjs`):
- 參考單調:窮舉量化資料(毫秒 = 張數 × 150ms;參考與 A/A 那份每趟 0–5 張、分支 0–8 張,517,440 組),參考任一趟多 1 張不得由綠變紅 → 0 組;非量化資料(每張停 0.5–3 倍幀距)3,000 組 → 0 組。
- 標籤互換:同一個窮舉,ref / ref~aa 互換紅不紅翻轉 → 0 組。**邊界**:兩份參考中位 ≥ 6 張(CI 900ms 以上的長白)時比值可能落在 1.25–1.5 的灰區,A/A 修正子的對稱只在 A/A 不乾淨時成立,翻轉可能發生(隨機抽到的例:分支 9/2/12、ref 2/3/8、ref~aa 1/8/6);那一段不在本條保證內。
- 一張白幀落在最長那一格(CI 237 / 248 / 226ms,平均幀距 88 / 85 / 84)→ 1 張 → 過(第一版判紅)。
- 對照組:同一套判定表與窮舉在第一版式子上抓得到:標籤互換翻轉 149,538 組、參考變差由綠變紅 11,760 組,判定表 13 列不符;突變「改回舊式子」「拿掉地板」「地板只看 ref」「2 改 3」「沒有白幀序列當成過」「最長連續改成總白幀數」各讓判定表紅。實際把 lib 換回第一版重跑,判定政策測試 40 項不符(A25 覆核二修補報告)。

**同碼誤紅率**(覆核二報告的同碼置換那一套,加上白幀張數:推 1 拆分驗證那一跑,推 1 建置 + 45d5543d 兩份共 9 趟同一份程式碼,分成 分支 3 / 參考 3 / A/A 3 的 1,680 種分法;本機,不是 CI):

| 跑法 | 9 趟最長連續空白(ms)/ 白幀張數 | 第一版式子(無 A/A / 有 A/A) | 現在(無 A/A / 有 A/A) |
|---|---|---|---|
| mouse | 34 / 216 / 33 / 35 / 40 / 54 / 50 / 50 / 18;2 / 3 / 2 / 2 / 2 / 3 / 3 / 3 / 1 | 83(4.9%)/ 76(4.5%) | 0 / 0 |
| pinned | 71 / 31 / 23 / 36 / 44 / 34 / 33 / 33 / 17;1 / 2 / 1 / 2 / 2 / 1 / 2 / 1 / 1 | 1(0.1%)/ 1 | 0 / 0 |
| gesture(三跑各 9 趟) | 0–50;0–2 | 0 / 0 | 0 / 0 |

呼叫端行為以 `--inject-runs` 驗(12 格:參考 0 / 分支 3 張 → 紅、0 / 0 → 綠、0 / 2 張 → 綠、SF-R2 那三趟 → 綠、沒有白幀序列 → 儀器失效紅、1 張停 4000–6000ms → 地板過但絕對門檻紅、A/A 那份 1 張時分支 3 張 → 綠、參考 1 張 / 分支 4 張 → 紅、參考 1 張 / 分支 3 張 → 綠,與沒有 `--ref` 的兩格)。

### 持續空白:追蹤 checkerboard 次數(2026-11-16,A25 覆核二修補)【AI 推導 2026-11-16】

**為什麼**:上一節的白幀張數只數「連續幾張」,整片白而且不變時截圖串流不重送,持續的白只算 1 張(上一節「已知盲點」)。這一項改數 CDP 追蹤裡 cc 的 `TileBasedLayerImpl::AppendQuads checkerboard`:合成器畫到還沒光柵好的圖塊時,每張合成幀、每個缺圖塊的層記一次(`scripts/lib/cdp-trace-summary.mjs` 的 `counts.checkerboard`)。它記的是合成器實際畫出的每一幀,**與截圖串流的節奏無關**:白得越久、白的層越多,次數越多。

**量具**:只在 pinned 步驟、帶 `--ref` 與 `--trace` 時判(CI 的 pinned 步驟本來就帶 `--trace`;拿掉 `--trace` = 這一項整個不判,判定政策測試檢查 ci.yml 那一行)。三份建置(分支、`<ref>`、`<ref>~aa`)各量 `--runs` 趟**另跑的**追蹤趟,與量測趟同一套輪轉 —— Tracing 本身有開銷,追蹤趟不與量空白 / 長工 / 幀距的量測趟混在一起。原始 trace(gzip,一份約 5 MB)與 LayerTree 只留第一輪(診斷),每趟摘要都存;`--json` 多一欄 `traceTrips`(每趟次數、合成幀、機制),`--inject-runs` 吃得回去。

**判準**(lib `checkerboardDecision` = 上一節 `blankDecision` 原樣重用,每趟的比值值與地板單位都是那一趟的次數):

| 條件 | 判定 |
|---|---|
| 比值規則不判紅(同一個 `refRatioDecision` + A/A 修正子;不放寬:`capNeedsNoiseSupport: false`) | 過 |
| 比值規則判紅(參考中位 0 = 比值無限大,也算),**而且**分支中位次數 − max(參考中位, `<ref>~aa` 中位) > 15 | **紅** |
| 比值規則判紅,但只多 ≤ 15 次 | 過(`within-floor`:同碼的跑間散布內,照印次數與比值) |
| 參考或分支一趟可用的追蹤都沒有(追蹤摘要拿不到 / 沒捲動;注入資料沒有 `traceTrips`) | **紅,以「儀器失效」的名義**(沒量到不當 0、不放行) |
| 追蹤趟的實際捲動機制與規則 G-P 不符 / 讀不到 | **紅,儀器失效**(與空白同一套 G-P);參考原生、受測轉發 → 不比 |

A/A 那份量不到或兩份參考機制不同 → 地板只看 ref。

**數次數、不數「次數 ÷ 合成幀」**:持續 T 毫秒的白在 60 幀/秒下就是 T / 16.7 次,次數直接對應「白了多久、幾層」;除以合成幀會把「這一份少畫了幾幀」混進來(Q2b 本機 66–68 幀對參考 76–88 幀),那是幀距那一項的事。同碼資料上兩者分離度相近(Q2b 超出量 ÷ 同碼最大超出量:次數 25 / 10 = 2.5、比例 0.439 / 0.160 = 2.7),比值規則在同碼上誤判紅的分法次數合計 29 種、比例 51 種(下表 5 跑)。

**地板 15 的資料與選法**(本機 headless 軟體光柵、CI 同參數 `--runs=3 --tick-ms=64`;A25 覆核二修補報告的校準跑):每一跑的同碼追蹤趟分成 分支 3 / 參考 3 / A/A 3(1,680 種分法;只有 6 趟時 分支 3 / 參考 3 的 20 種),地板拿掉時比值規則判紅的分法裡「分支中位 − max(參考, A/A)」的最大值 = 不誤紅的最小地板。

| 跑(同碼) | 9 趟次數 | 拿掉地板時比值規則判紅 | 判紅分法裡最大超出 | 地板 15 時紅 |
|---|---|---|---|---|
| 推 1 建置對 1ac039c9 第一跑(兩容器,轉發) | 14 18 14 15 8 15 16 13 15 | 0 / 1,680 | — | 0 |
| 推 1 建置對 1ac039c9 第二跑 | 15 19 20 18 17 15 17 16 12 | 6 / 1,680 | 3 | 0 |
| 最終(Q2b)建置自比第一跑(單一捲動盒,原生) | 47 40 33 41 56 45 45 43 42 | 0 / 1,680 | — | 0 |
| 最終建置自比第二跑 | 45 31 37 52 35 29 36 35 38 | 22 / 1,680 | **10** | 0 |
| 最終那一跑的 main / main~aa(中央欄原生,6 趟) | 10 21 14 16 12 18 | 1 / 20 | 6 | 0 |

最小地板 10;邊際 +5(觀測最大值的一半:10 只出現在 5 跑裡的 1 跑,其餘 3–6,5 跑的最大值低估母體)→ **15**。另一側:最終(Q2b)建置對 1ac039c9 本機 3 對 3 超出 **25**(分支 41 / 44 / 39、main 10 / 21 / 14、main~aa 16 / 12 / 18 —— 同一跑的白幀張數地板判 `within-floor`,這一項判紅);歷來單趟追蹤 19 → 47、17 → 37、13 → 38、12 → 37(超出 20–28)。15 離兩邊各 5 / 10。

**代價與還沒核的**:同碼資料只有本機 5 跑 42 趟、CI 0 趟;CI 的軟體光柵更慢,次數與散布的量級都可能不同 —— **推 1 上 CI 後讀 `datatable-fast-scroll-pinned` artifact 的 `--json`(`traceTrips`,每跑三份各 3 趟),用同一套置換重算再核地板**;地板跟著資料改,不為了讓某一個 PR 綠而調。地板以下的差(≤ 15 次,本機約 0.25 秒的單層白)不紅。性質(判定表):參考單調、ref / ref~aa 標籤互換不翻轉,保證範圍是兩份參考中位 ≤ 30 次 —— 地板一過分支就比兩份都多 16 次以上,比值都 > 1.5、不看 A/A;參考中位 > 30 次時比值可能落進 1.25–1.5 灰區,A/A 修正子的對稱只在 A/A 不乾淨時成立(與空白「中位 ≥ 6 張」同一個邊界)。Q2b 合進 main 之後兩邊都在 30–56 次,正落在這一段,推送後一起看。這一項看的是「有沒有畫到沒光柵好的圖塊」;有 GPU 光柵的真 Chrome 光柵快很多,次數會少很多 —— GPU 下的白片還沒量,這一項的數字只代表無顯卡環境(CI、headless)。

**證據**(`scripts/test-fast-scroll-gate-policy.mjs`):判定表 14 列(Q2b 3 對 3 與單趟 → 紅、三份同碼最壞分法 → 過、邊界兩面、A/A 地板三列、沒資料);同碼置換(上表,地板 15 時 0 / 6,740);隨機 20,000 組性質(翻轉 0、由綠變紅 0;對照組「地板只看 ref」翻轉 3,074);呼叫端 6 格(同碼 → 綠、Q2b 量級 → 紅而且同一組白幀張數判過、**對照組:同一組不帶 `--trace` → 綠**、沒有追蹤資料 → 儀器失效、受測追蹤全部沒量到 → 儀器失效、追蹤趟機制與 G-P 不符 → 儀器失效);3 個 lib 突變(地板放大 10 倍、次數不進地板、A/A 那份不傳)各讓判定表紅;閘本身弄壞兩次(拿掉這一項 → Q2b 量級那格 exit 0;拿掉「追蹤缺 → 儀器失效」→ 兩格 exit 0),還原後全綠。

### CI 證據(2026-11-16,A25 / A28)

- 三個比值步驟都帶 `--json=tmp/datatable-fast-scroll/<跑法>.json`(每趟原始資料、A/A 欄、runner 指紋 —— nproc、CPU 型號、load average、Chromium 版本、單行程;`--inject-runs` 吃得下同一個檔,可原樣重算判定)。gesture / mouse 在 `verify-browser-datatable`,證據在 artifact `datatable-fast-scroll`;pinned 在 `verify-browser-datatable-pinned`(2026-11-16 拆出,見下),證據在 artifact `datatable-fast-scroll-pinned`(都保留 14 天)。
- `--trace=tmp/datatable-fast-scroll/trace-pinned` **只留在 pinned**,而且在那一步**計分**(2026-11-16 A25 覆核二修補起:三份建置含 A/A 各 3 趟,checkerboard 次數判「持續空白」,見上一節;每條執行緒忙碌 / 合成幀 / render pass / quad / EventLatency + 第一輪的 gzip 原始 trace 與 LayerTree 照舊是診斷,並排表同時印進 log)。gesture / mouse 的追蹤只是診斷,每一步多 2 趟,時間讓給 A/A(覆核二 SF-R3)。pinned job 因此重估:期望 ≈ 11.8 分、最壞 ≈ 17.2 分 + 60 秒加量(本機一趟追蹤比一趟量測多 ≈ 4.6 秒,CI 按 10 秒估),仍在 22 分的拆 job 線以下(ci.yml 該 job 檔頭)。
- **pinned 拆成自己的 job**(覆核二 SF-R3):2026-11-15 兩份像素 job log 的時間戳,30 個比值趟仍是雙峰(14 趟 5.4–7.8 秒、16 趟 35.2–37.3 秒;96b63b68 那一跑 17.5 分)。不拆時期望 ≈ 19.7 分、A/A 9 趟 + 追蹤 2 趟 + G-P 開跑前判定 3 次全落慢峰 ≈ 24.2 分、計畫的「p90 + 新增趟數 × 中位趟時 × 1.3」≈ 26.3 分,超過 22 分的拆 job 線;拆完像素 job 期望 ≈ 14.3 分 / 最壞 ≈ 19.4 分,pinned job 期望 ≈ 7.9 分 / 最壞 ≈ 12.5 分。加量帳本的 key 含 job 名,兩個 job 各自一份 60 秒預算。都是估算,推送後讀實際時長回頭驗。
- 感知閘(`scripts/data-table-scroll-perception.mjs`)每次嘗試各存 `<out>/attempt-N/`,父行程寫 `<out>/attempts.json`(每次的擷取幀數、截圖時間戳、缺口分布、最長缺口的位置);最後一次的 `summary.json` 照舊複製回 `<out>/`。兩個 job 原本同名的 artifact 改名為 `datatable-scroll-perception-controls` / `datatable-scroll-perception-dpr1`。
- 兩支 `--selftest`(gesture / pinned)搬到 `verify-browser-datatable-dpr2`(CI 實測兩支合計 188 秒,該 job 8.4 → 約 11.5 分)。
- 追蹤摘要的判定式是 `scripts/lib/cdp-trace-summary.mjs`,判定表 + 三個突變對照組在 `scripts/test-cdp-trace-summary.mjs --selftest`(CI 與快速捲動判定表同一步)。

### dpr1 擷取缺口判定表(2026-11-16,A25)【AI 推導 2026-11-16】

感知閘 5 次都碰到送幀缺口而紅時,父行程多跑一趟**不計分**的追蹤診斷(`<out>/diagnostic/`),看最長缺口那段時間合成器(DrawFrame)與主執行緒在做什麼(`captureGapDiagnosis`):

| 缺口期間合成器 DrawFrame | 缺口期間主執行緒長工 | 判定 | 下一步 |
|---|---|---|---|
| 連續(相鄰間隔 ≤ 2 個 vsync;邊界取 2.5 個 vsync 容幀時間戳 ±1ms 抖動) | 無 | 產品照常出幀,截圖搶不到 CPU = 量具問題 | 先降非主執行緒成本;做完仍缺口 → 單獨一個量具 commit(附追蹤與 B0 同 runner 擷取幀數,其餘覆蓋率守衛不動) |
| 也斷 | 有 | 主執行緒停頓 | 找長工(LoAF 歸因),工程修 |
| 也斷 | 無 | 合成 / 光柵停頓 = 結構成本 | 降成本;降不下來而且真機有感 → 交 user 取捨 |
| 連續 | 有 | 主執行緒忙但合成器照畫(`main-busy-but-drawing`)—— 截圖沒拿到幀不是合成器沒出幀;主執行緒的長工可能搶了截圖的 CPU | 先看長工歸因,再看量具;不單獨當產品結論 |
| 缺口前後 200ms 一張 DrawFrame 都沒有 | — | 儀器沒看到(`no-data`) | 不下結論;這一趟的追蹤無效 |

「連續」的邊界取 2.5 個 vsync(容幀時間戳 ±1ms 抖動)是**看過一次注入資料之後才定的**:第一版寫 ≤ 2 個 vsync(33.4ms),注入對照組那一趟的 DrawFrame 間隔是 33.7ms,剛好被判成 `compositor-stall`;改 2.5 之後判定表加「漏 1 張(33.7ms)→ 連續」「漏 2 張(50ms)→ 停頓」兩列守邊界(`scripts/test-cdp-trace-summary.mjs`)。邊界只在本機注入資料上看過,CI 的抖動分布未量。【AI 推導 2026-11-16】

不為了讓任何改動過閘而放寬缺口門檻(100ms;dpr2 130ms 的理由寫在 ci.yml 該步)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `data-table-known-defects.spec.md`
- `data-table.spec.md`
