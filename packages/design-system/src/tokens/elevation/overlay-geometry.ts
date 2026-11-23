/**
 * Overlay geometry SSOT — Radix prop number constants(non-CSS-var,JS-side single source).
 *
 * Why JS const not CSS var:Radix `sideOffset` / `collisionPadding` 接 number prop,
 * 不接 `var(--...)`。改值要動 5+ primitive default = 假 SSOT。本檔抽 const,
 * primitive default 統一 import → 改值只動一處全部聯動。
 *
 * Canonical source:`elevation.spec.md` § 浮層間距 sideOffset。
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
