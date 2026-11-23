/**
 * Motion — hover 開 / 關延遲三檔的**唯一住處**(2026-11-15 起)。
 *
 * Radix primitive props(`delayDuration` / `openDelay` / `closeDelay`)期望 number ms,
 * 不認 CSS var —— Tooltip / HoverCard / Avatar / OverflowIndicator 一直讀這三個常數。
 * 2026-11-15 前 motion.css 另有一份 `--motion-delay-*` CSS 鏡像,執行期沒有任何 CSS 讀者、產品也不讀,
 * 已退場(稽核 P09;tokens/orphan-tokens.spec.md 原 §8「JS literal mirror」保留理由同日撤掉),
 * scripts/audit-motion-delay-invariants.mjs 的「CSS 對 JS」那一半跟著拿掉。改值只改這裡。
 * (進出場動畫 token 為純 CSS 驅動,由 tw-animate-css 消費,不需 JS 鏡像。)
 *
 * SSOT:本檔(值)+ `motion.spec.md`「三層 tier 系統」(規格名 `--motion-delay-*` 與為什麼)。
 */

/** 純文字提示(Tooltip)— passive hint。2026-05-20 200→500ms 對齊 Material 3 / Apple HIG / shadcn-Radix 主流 */
export const MOTION_DELAY_PLAIN_MS = 500

/** 內容預覽(HoverCard / ProfileCard)— rich preview。2026-05-20 300→700ms 避免列表掃視誤觸發 fetch */
export const MOTION_DELAY_RICH_MS = 700

/** 通用關閉延遲(所有 hover overlay)— accidental-hover 容錯 */
export const MOTION_DELAY_CLOSE_MS = 200
