/**
 * Motion tokens — JS mirror of `motion.css` delay tokens for Radix/JS API consumers.
 *
 * Radix primitive props(`delayDuration` / `openDelay` / `closeDelay`)期望 number ms,
 * 不認 CSS var。本 file 是 motion.css `--motion-delay-*` 對應 number value 鏡像;改值必同步兩處。
 * (進出場動畫 token 為純 CSS 驅動,由 tw-animate-css 消費,不需 JS 鏡像。)
 *
 * SSOT: `motion.css` + `motion.spec.md`。命名 2026-07-11 統一 `--motion-delay-*`(原 `--hover-delay-*`)。
 */

/** 純文字提示(Tooltip)— passive hint。2026-05-20 200→500ms 對齊 Material 3 / Apple HIG / shadcn-Radix 主流 */
export const MOTION_DELAY_PLAIN_MS = 500

/** 內容預覽(HoverCard / ProfileCard)— rich preview。2026-05-20 300→700ms 避免列表掃視誤觸發 fetch */
export const MOTION_DELAY_RICH_MS = 700

/** 通用關閉延遲(所有 hover overlay)— accidental-hover 容錯 */
export const MOTION_DELAY_CLOSE_MS = 200
