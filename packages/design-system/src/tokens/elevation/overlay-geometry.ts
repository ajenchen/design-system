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
 * 表格三個工具面板 `DataTable/lib/panel-width.ts`;2026-11-28 起 SelectMenu 面板也夾,它跟內容寬)一律夾在這個值以內 —— 視窗再窄,浮層也不超出視窗(左右各留 1rem,
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
//     scripts/overlay-height-cap-invariant.mjs(執行期:夾具裡各種錨定浮層的 computed max-height = capHeight 的結果,不是全 DS 每個浮層)。

/**
 * 錨定浮層(Popover / HoverCard / DropdownMenu 與其子選單 / 放在它們裡面的 ProfileCard)的可用高:觸發點那一側到碰撞邊界的剩餘高度(已扣間距與 collisionPadding)。
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
 * 半列原則(2026-11-24,總帳 C9):清單的高度上限讓**最後一列切在半列** —— 使用者一眼看出下面還有、要捲;
 * 上限 = 上方固定的部分(`before`)+ N 列(每列含列距)+ 半列。各項都是 CSS 長度(可寫 `var(…)`),回傳 `calc()` 字串。
 * Carbon 下拉清單同一個做法:展開時 `max-block-size: calc(layout.size('height') * 5.5)`,原始碼註解「item height * 5.5 items shown」
 * (https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/styles/scss/components/list-box/_list-box.scss)。
 * 例:清單型浮層的預設上限(下方 `OVERLAY_LIST_MAX_HEIGHT`);之後 Calendar「+N」清單用同一條(標題列 + N ×(列高 + 列距)+ 半列)。
 */
export function halfRowCap({ rows, rowHeight, gap, before }: {
  /** N:完整看得到幾列(第 N + 1 列切在一半) */
  rows: number
  /** 一列的高(CSS 長度) */
  rowHeight: string
  /** 列與列之間的距離(CSS 長度;沒有 = 列貼列) */
  gap?: string
  /** 第一列上方、也在上限裡的固定高(CSS 長度:清單上內距、標題列) */
  before?: string
}): string {
  const step = gap ? `(${rowHeight} + ${gap})` : rowHeight
  return `calc(${before ? `${before} + ` : ''}${rows} * ${step} + ${rowHeight} / 2)`
}

/**
 * 清單型浮層預設完整看得到幾列(半列原則的 N;上限 = N.5 列),依列的長相分兩種:
 * - `single`:單行列(選單列 = 欄位高,`patterns/element-anatomy/item-anatomy.tsx` `ROW_PADDING_BY_SIZE`)
 * - `described`:帶說明的兩行列(標籤 + 說明,例:PeoplePicker 的人名 + 信箱;列高 = 欄位高 + 標籤與說明的間距 + 說明一行)
 * N 的由來(2026-11-24 實測,`command.spec.md`「清單捲動上限(半列原則)」):讓一般密度、md 尺寸的預設上限最接近改前寫死的 300px ——
 * 單行列高 32:N = 8 → 280、N = 9 → 312,取 9(差 12);兩行列高 49.6:N = 5 → 280.8、N = 6 → 330.4,取 5(差 19.2)。群組上內距 8 都算在內。
 */
export const OVERLAY_LIST_ROWS = { single: 9, described: 5 } as const

/** 清單列的高(CSS 長度),依列的長相與尺寸;與 `item-anatomy.tsx` 前綴區塊高同一組 token(兩行列 = 欄位高 + `--item-gap-label-desc-scanning[-lg]` + 說明一行) */
const LIST_ROW_HEIGHT = {
  single: { sm: 'var(--field-height-sm)', md: 'var(--field-height-md)', lg: 'var(--field-height-lg)' },
  described: {
    sm: 'calc(var(--field-height-sm) + var(--item-gap-label-desc-scanning) + var(--font-caption-size) * 1.3)',
    md: 'calc(var(--field-height-md) + var(--item-gap-label-desc-scanning) + var(--font-caption-size) * 1.3)',
    lg: 'calc(var(--field-height-lg) + var(--item-gap-label-desc-scanning-lg) + var(--font-body-size) * 1.3)',
  },
} as const

/** 清單上方也在捲動區裡的固定高 = `CommandGroup` 的 `py-2` 上內距(`components/Command/command.tsx`;改那裡要改這裡,執行期閘 `scripts/overlay-height-cap-invariant.mjs` 量「最後一列切在半列」) */
const LIST_TOP_PADDING = '0.5rem'

const listCaps = (kind: keyof typeof LIST_ROW_HEIGHT) => ({
  sm: halfRowCap({ rows: OVERLAY_LIST_ROWS[kind], rowHeight: LIST_ROW_HEIGHT[kind].sm, before: LIST_TOP_PADDING }),
  md: halfRowCap({ rows: OVERLAY_LIST_ROWS[kind], rowHeight: LIST_ROW_HEIGHT[kind].md, before: LIST_TOP_PADDING }),
  lg: halfRowCap({ rows: OVERLAY_LIST_ROWS[kind], rowHeight: LIST_ROW_HEIGHT[kind].lg, before: LIST_TOP_PADDING }),
})

/**
 * 清單型浮層的預設捲動上限(CommandList;SelectMenu / Select / Combobox / PeoplePicker / CommandDialog 都經它):半列原則 ——
 * 群組上內距 + N 列 + 半列,依列的長相(`single` / `described`)與尺寸(Command 的 `size`)。列高讀 token,所以「一次看幾列」固定、像素跟密度與尺寸走。
 * CommandList 預設取 `single`;SelectMenu 的選項有說明時取 `described`。使用端的 `maxHeight` 參數取代這個預設(仍經 capHeight,不超出可用高)。
 * 是 TS 常數不是 CSS token —— `command.spec.md`「清單捲動上限(半列原則)」記載 2026-11-11 user 拍板 token 第 3 題「3全收」收回成元件自己的值。
 * 2026-11-24 前是寫死的 `18.75rem`(300px,不隨列高變;最後一列切在哪裡看運氣 —— Combobox 9 項只捲 4px、PeoplePicker 6 人只捲 14px)。
 */
export const OVERLAY_LIST_MAX_HEIGHT: Readonly<Record<keyof typeof LIST_ROW_HEIGHT, Readonly<Record<'sm' | 'md' | 'lg', string>>>> = {
  single: listCaps('single'),
  described: listCaps('described'),
}

// ── 蓋在錨點上的浮層(PopoverContent `coverAnchor`;2026-11-24,總帳 Q2b(定))──────────────────────────────
// 「展開型」:浮層蓋在錨點上、中心 = 錨點中心(水平 + 垂直),碰到視窗邊推回、留 OVERLAY_COLLISION_PADDING。
// Radix 只支援貼在錨點某一側(side + align),所以位置由這裡算,經 PopoverAnchor 的虛擬錨點交給 Radix(popover.tsx 檔頭「蓋在錨點上」)。

/** 蓋在錨點上的浮層的可用高 = 視窗高 − 上下各 collisionPadding(它不在錨點的哪一側,Radix 的「觸發點那一側剩多少」不適用)。 */
export const OVERLAY_COVER_AVAILABLE_HEIGHT = `calc(100svh - ${OVERLAY_COLLISION_PADDING * 2}px)`

/** 量得到的矩形 / 尺寸(DOMRect 符合) */
export interface OverlayRect { left: number; top: number; width: number; height: number }
export interface OverlaySize { width: number; height: number }

/**
 * 蓋在錨點上的浮層左上角(純函式):中心 = 錨點中心;碰到視窗邊推回、離邊 `padding`;比視窗(扣兩邊 padding)還大時貼左 / 上緣。
 * 推回的量 = 回傳位置 − (錨點中心 − 浮層一半)。
 */
export function coverAnchorPosition(anchor: OverlayRect, size: OverlaySize, viewport: OverlaySize, padding: number = OVERLAY_COLLISION_PADDING): { x: number; y: number } {
  const place = (start: number, length: number, own: number, limit: number) => Math.max(padding, Math.min(start + length / 2 - own / 2, limit - padding - own))
  return { x: place(anchor.left, anchor.width, size.width, viewport.width), y: place(anchor.top, anchor.height, size.height, viewport.height) }
}

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
