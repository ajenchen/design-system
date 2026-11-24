/**
 * Overlay geometry SSOT — Radix prop number constants(non-CSS-var,JS-side single source).
 *
 * Why JS const not CSS var:Radix `sideOffset` / `collisionPadding` 接 number prop,
 * 不接 `var(--...)`。改值要動 5+ primitive default = 假 SSOT。本檔抽 const,
 * primitive default 統一 import → 改值只動一處全部聯動。
 *
 * Canonical source:`elevation.spec.md` § 浮層間距 sideOffset、§ 浮層高度上限(2026-11-24 起高度上限也住本檔)。
 */

export const OVERLAY_SIDE_OFFSET = 8

export const OVERLAY_COLLISION_PADDING = 8

/**
 * 浮層寬的視窗夾限(CSS 長度;2026-11-15 抽出):產品用 `width` 指定寬的浮層(PopoverContent `width={數字}`、
 * 表格三個工具面板 `DataTable/lib/panel-width.ts`)一律夾在這個值以內 —— 視窗再窄,浮層也不超出視窗(左右各留 1rem,
 * 大於上面的 collisionPadding 8px,Radix 推得回視窗內)。值沿用篩選面板 2026-05-04 起寫在自己根元素上的
 * `min(640px, calc(100vw - 2rem))`(`components/DataTable/data-table-filter-panel.tsx`),畫面不變;收成一份免得三個面板各寫一次。
 * 字串不是數字:要放進 `min()` / `max()`,Radix 不讀它。
 */
export const OVERLAY_VIEWPORT_MAX_WIDTH = 'calc(100vw - 2rem)'

// ── 浮層高度上限(2026-11-24 收成一份;`elevation.spec.md`「浮層高度上限」)──────────────────────────────
// 之前同一件事寫在 7 處、寫法各異(class 讀各自的 Radix 變數 / ProfileCard 兩層後備值 / DropdownMenu 只收 px 的 min() /
// CommandList 寫死 18.75rem / Dialog 自己一套 heightCap),DropdownMenuSubContent 則完全沒有上限。現在:
//   上限 = capHeight(可用高, 使用端的 maxHeight) —— 可用高只有兩種(錨定浮層 / modal),公式只有一條,使用端只能往更矮調。
// 字串不是數字:要放進 inline style 與 `min()`;Tailwind class 讀不到 TS 常數,所以消費端一律寫 `style.maxHeight`。
// 閘:scripts/overlay-height-ssot-invariant.mjs(靜態:浮層元件的高度上限只准從本檔來)、
//     scripts/overlay-height-cap-invariant.mjs(執行期:每個開著的錨定浮層 computed max-height = capHeight 的結果)。

/**
 * 錨定浮層(Popover / HoverCard / DropdownMenu 與其子選單 / 放在它們裡面的 ProfileCard)的可用高:觸發點那一側到碰撞邊界的剩餘高度。
 * 讀 `@radix-ui/react-popper` 自己寫在定位外殼上的 `--radix-popper-available-height`(`dist/index.mjs` size middleware 的
 * `setProperty`),內容元素經 CSS 繼承讀到;各元件的 `--radix-{popover|hover-card|dropdown-menu}-content-available-height`
 * 只是 Radix 在內容元素上把它改個名字(`var(--radix-popper-available-height)`),值逐位相同 —— 所以不再各讀各的。
 * 2026-11-24 在同一份建置量 Popover / HoverCard / DropdownMenu / DropdownMenuSubContent 四種內容上,這個變數與各自改名的變數字串相同。
 * 不在 popper 裡(例:ProfileCard 單獨放在頁面上)時取後備值 100vh,同改動前。
 */
export const OVERLAY_AVAILABLE_HEIGHT = 'var(--radix-popper-available-height, 100vh)'

/**
 * Modal 與所在區塊四邊的最小間距(Dialog 的高度上限與最大寬度都吃它;`dialog.spec.md`「Viewport Inset」;2026-11-24 從 dialog.tsx 的
 * `DIALOG_INSET_VAR` 搬來)。2026-09-11 從 `--layout-space-bottom`(語意 = 結論留白)拆成同 family 的另一個 role token:兩者值都是 48px,
 * 但語意不同,耦合在一起會讓「調結論留白」意外改掉全站 Dialog 的高度與最大寬度。
 */
export const MODAL_VIEWPORT_INSET = 'var(--layout-space-viewport-inset)'

/**
 * Modal 所在區塊(containing block)的高:沒傳 `portalContainer` → 視窗;傳了 → 那個帶 transform 的舞台(fixed 以它為準)。
 * 另與 `100svh` 取小 = 行動裝置網址列那道安全帽(`100vh` 在網址列收合時大於實際可視高度,底部主要動作鈕會被切掉);桌機兩者等值。
 * 改回 `100svh` 時舞台裡的對話框會超出舞台(閘 scripts/dialog-width-invariant.mjs W3 的對照組就是這一刀)。
 */
const MODAL_BLOCK_HEIGHT = 'min(100svh, 100%)'

/** Modal(Dialog;CommandDialog 經它)的可用高 = 所在區塊高 − 上下 inset(`dialog.spec.md`「最大高度(上限)」)。 */
export const MODAL_AVAILABLE_HEIGHT = `calc(${MODAL_BLOCK_HEIGHT} - ${MODAL_VIEWPORT_INSET} * 2)`

/**
 * 高度上限的唯一一條公式:有 `cap` → `min(available, cap)`;沒有(`undefined` / `null` / 空字串)→ `available`。
 * 上限只能往更矮調 —— `cap` 傳得比可用高大也會被 `min()` 夾住(形狀同 `dialog.spec.md`「最大高度(上限)」)。
 * `cap` 是數字 = px;字串照原樣放進 `min()`(寫得出 `60svh` / `calc(100svh - 120px)`;`ds-canonical/references/props-naming.md`「尺寸參數」)。
 */
export function capHeight(available: string, cap?: number | string | null): string {
  if (cap == null || cap === '') return available
  return `min(${available}, ${typeof cap === 'number' ? `${cap}px` : cap})`
}

/**
 * 清單型浮層的捲動上限(CommandList;SelectMenu / Select / Combobox / PeoplePicker / CommandDialog 都經它):一次看幾筆的閱讀上限,
 * 不隨密度變。是 TS 常數不是 CSS token —— `command.spec.md`「清單捲動上限」記載 2026-11-11 user 拍板 token 第 3 題「3全收」收回成元件自己的值。
 */
export const OVERLAY_LIST_MAX_HEIGHT = '18.75rem'

/**
 * 錨點失去版面時不畫浮層(2026-09-16 user:「為何我關閉 ai agent 的panel之後 關閉那顆按鈕的tooltip會跑去視窗左上角閃動一下?」)。
 *
 * 錨點被藏起來(`display:none` 祖先 / keep-mounted 收起 / 隱藏的 docs 分頁 / 虛擬捲動回收)時量出來是 0×0,
 * Radix 的定位仍會拿那個值算,結果是 `(0, OVERLAY_SIDE_OFFSET)` —— 視窗左上角往下 8px;浮層若正在播關閉動畫,
 * 使用者就看到它在左上角閃一下。**沒有版面時量到的數字不代表任何事,不能拿來做決定**
 * (`components/AgentPanel/agent-panel.spec.md`「關閉不等於卸載」段第 3 點已有同一句,本常數把它推廣到所有 portal 浮層)。
 *
 * `hideWhenDetached` 是 floating-ui `hide({ strategy: 'referenceHidden' })`:位置與 `visibility:hidden` 由
 * **同一次定位計算**寫進 popper 外殼的**同一個 style 物件**(`@radix-ui/react-popper` 的 `transform` 與
 * `middlewareData.hide?.referenceHidden`),所以錯位的那一幀不可能被畫出來 —— 不是「先畫錯再補救」。
 * 錨點正常時 `referenceHidden` 為 false,不影響任何既有行為。
 *
 * 機械閘:`scripts/overlay-detached-anchor-invariant.mjs`(藏錨點後浮層不得出現在視窗左上角;對照組關掉必紅)。
 */
export const OVERLAY_HIDE_WHEN_DETACHED = true
