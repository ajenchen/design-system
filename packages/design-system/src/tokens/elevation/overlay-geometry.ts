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
 * 錨點失去版面時不畫浮層(2026-09-16 user:「關閉那顆按鈕的 tooltip 會跑去視窗左上角閃動一下」)。
 *
 * 錨點被藏起來(`display:none` 祖先 / keep-mounted 收起 / 隱藏的 docs 分頁 / 虛擬捲動回收)時量出來是 0×0,
 * Radix 的定位仍會拿那個值算,結果是 `(0, OVERLAY_SIDE_OFFSET)` —— 視窗左上角往下 8px;浮層若正在播關閉動畫,
 * 使用者就看到它在左上角閃一下。**沒有版面時量到的數字不代表任何事,不能拿來做決定**
 * (`components/AgentPanel/agent-panel.spec.md`「捲動數學」段已有同一句,本常數把它推廣到所有 portal 浮層)。
 *
 * `hideWhenDetached` 是 floating-ui `hide({ strategy: 'referenceHidden' })`:位置與 `visibility:hidden` 由
 * **同一次定位計算**寫進 popper 外殼的**同一個 style 物件**(`@radix-ui/react-popper` 的 `transform` 與
 * `middlewareData.hide?.referenceHidden`),所以錯位的那一幀不可能被畫出來 —— 不是「先畫錯再補救」。
 * 錨點正常時 `referenceHidden` 為 false,不影響任何既有行為。
 *
 * 機械閘:`scripts/overlay-detached-anchor-invariant.mjs`(藏錨點後浮層不得出現在視窗左上角;對照組關掉必紅)。
 */
export const OVERLAY_HIDE_WHEN_DETACHED = true
