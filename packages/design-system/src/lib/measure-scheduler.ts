// ═══════════════════════════════════════════════════════════════════════════
// 量測排程器 —— 「捲動中不量,量的時候一次量完」
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼需要它**(2026-09-10 實測,全功能整合範例 `datatable-展示--roadmap-all-in-one`):
// 4500px/s 手勢捲動 1.4 秒的 CPU 取樣裡,自時間前四名全部是**新進視窗的列格子在 commit 內做強制版面讀取**:
//   1. `components/Tag/tag.tsx` 截斷量測(Canvas measureText + getComputedStyle)  81–87ms
//   2. `components/PeoplePicker/person-display.tsx` 頭像堆疊算可見數(2× getBoundingClientRect)  39–47ms
//   3. `hooks/use-truncated.ts` 預設量法(scrollWidth > clientWidth)  37–43ms
//   4. `components/Combobox/combobox.tsx` 標籤區可用寬(getComputedStyle + setProperty)  19–21ms
// 合計約 190ms,佔取樣 13%;同一段手勢裡 DataTable 自己的捲動同步只花約 10ms。
// 結果是中央捲動容器的**每一個** scroll 事件都要 9–22ms(判準 ≤ 4ms,43/43、48/48、58/58 全數超標)。
//
// **世界級怎麼做**(2026-09-10 第一手原始碼):
//   - AG Grid v33.3.2 `misc/animationFrameService.ts` —— scroll 事件只排隊(`animationFrameSvc.schedule()`),
//     真正的工作在 rAF 的預算迴圈裡做;`rendering/cell/cellCtrl.ts` 與 `cellComp.ts` 兩檔的
//     `getBoundingClientRect` / `offsetWidth` / `clientWidth` 出現次數是 **0** —— 它在捲動路徑上根本不量。
//   - 截斷偵測:AG Grid 只在提示要顯示的那一刻量那一格;MUI X 的內容儲存格完全不量。
//     **沒有任何一家在儲存格掛載時量。**
//   - TanStack Virtual 3.13.23 自己的 `measureElement` 也有「捲動中跳過同步尺寸讀取」的守衛。
//
// **這支做兩件事**:
//   (a) **捲動中不量** —— 任何容器在捲,就把工作留在佇列裡,等捲動停下(100ms 無新事件)再做。
//       使用者在捲動中本來就不會 hover 或用鍵盤走進某一格,延後不影響任何可感知行為。
//   (b) **同一幀一次量完** —— 所有排隊的讀取集中在一個 rAF 裡跑完,瀏覽器只需要算一次版面;
//       原本是 N 個元件各自在自己的 effect 裡讀,每一次都可能強迫重算。
//
// **不做的事**:不快取量測結果(值會隨欄寬 / 字型 / 內容變,快取要失效很難證明正確)、
// 不改任何量法本身(Tag 的 Canvas、Combobox 的 CSS 變數注入原樣保留)—— 只改**時機**。
//
// SSOT:本檔。消費者:`hooks/use-truncated.ts`、`components/PeoplePicker/person-display.tsx`、
// `components/Combobox/combobox.tsx`。機械閘:`scripts/measure-scheduler-invariant.mjs`。

/** 排隊中的量測工作;key 讓同一個消費者重複排程時只留最後一次(避免同一元素量兩遍)。 */
const queue = new Map<object, () => void>()
let frame = 0
let scrolling = false
let scrollEndTimer: ReturnType<typeof setTimeout> | undefined
let attached = false

/** 多久沒有新的 scroll 事件才算「捲完了」。TanStack Virtual 的 `isScrollingResetDelay` 預設是 150ms;
 *  這裡取 100ms —— 比它早一點恢復量測,又足以跨過慣性捲動裡的事件空隙。 */
const SCROLL_SETTLE_MS = 100

/** 一幀最多花多少時間排空佇列;超過就把剩下的留到下一幀。
 *
 *  **為什麼需要**(2026-09-10 4× 節流 A/B 抓到):只延後不切片,等於把整段捲動累積的量測
 *  全部擠進「放手那一刻」的單一任務 —— 實測超過 50ms 的主執行緒任務反而從 24 個變成 32 個。
 *  切片之後,追平的成本攤在停下來後的數幀裡,使用者感覺不到,也不會擋住第一次互動。
 *
 *  **為什麼是 8 不是 AG Grid 的 60**:AG Grid 的 `animationFrameService.ts` 用
 *  `executeFrame.bind(this, 60)`,它敢用 60 是因為它的迴圈每做完一個小任務就重新檢查捲動位置、
 *  隨時能轉向(`scrollGridIfNeeded()` 在 while 迴圈第一行);我們這裡跑的是別人的量測函式,
 *  一旦開始就不能中斷,所以取「半幀」當上限,寧可多跨幾幀。 */
const FRAME_BUDGET_MS = 8

function onAnyScroll(): void {
  scrolling = true
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  scrollEndTimer = setTimeout(() => {
    scrolling = false
    scrollEndTimer = undefined
    if (queue.size) schedule()
  }, SCROLL_SETTLE_MS)
}

/** 第一次用到才掛監聽(SSR 安全);capture 讓內層可捲容器的事件也收得到(它們不冒泡到 document)。 */
function attach(): void {
  if (attached || typeof document === 'undefined') return
  attached = true
  document.addEventListener('scroll', onAnyScroll, { capture: true, passive: true })
}

function schedule(): void {
  if (frame) return
  if (typeof requestAnimationFrame === 'undefined') {
    // 沒有 rAF 的環境(SSR / 某些測試 runner):同步跑完,行為與未排程前一致,不靜默丟掉工作。
    flush()
    return
  }
  frame = requestAnimationFrame(flush)
}

function flush(): void {
  frame = 0
  // 捲動中就整批留著;`onAnyScroll` 的收尾計時器會在停下來時重排。
  if (scrolling) return
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  // 用迭代器逐一取出:做一個刪一個,超出預算時剩下的還在佇列裡,下一幀接著做。
  for (const [key, task] of [...queue.entries()]) {
    queue.delete(key)
    task()
    if (typeof performance !== 'undefined' && performance.now() - started >= FRAME_BUDGET_MS) break
  }
  if (queue.size) schedule()
}

/** 排一次量測。同一個 key 重複排程只保留最後一次。 */
export function scheduleMeasure(key: object, task: () => void): void {
  attach()
  queue.set(key, task)
  schedule()
}

/** 元件卸載時取消(虛擬捲動每幀都有列被換掉,不取消就會對著已卸載的節點量)。 */
export function cancelMeasure(key: object): void {
  queue.delete(key)
}

/** 測試用:是否正在捲動(供 `--selftest` 對照組驗證「捲動中不量」)。 */
export function isDeferringForScroll(): boolean {
  return scrolling
}
