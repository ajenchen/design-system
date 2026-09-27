/**
 * Stack gap — 「疊在一起的兩樣東西」之間的縫,全 DS 同一個值。
 *
 * CSS 雙生:`tokens/uiSize/uiSize.css` `--stack-gap`(2px)。兩邊必須相等,由
 * `scripts/token-twin-invariant.mjs` 機械鎖住(改值時兩邊一起改;只改一邊 CI 會紅)。
 *
 * 為什麼要有 JS 版:遮罩幾何(avatar.tsx 挖空的半徑、file-item.tsx 焦點框挖空的縫)與
 * `outline-offset`(steps.tsx 外圈)要拿數字去算,CSS 變數在那些地方進不去 calc 之外的運算。
 *
 * 消費者(2026-09-26,M17 抽 token 前這個 2 散在 6 處字面值):
 *   - styles/base.css `:focus-visible` outline-offset(直接用 CSS 變數)
 *   - avatar.tsx `AVATAR_STACK_GAP_PX`、狀態圓點 / 計數徽章的挖空縫
 *   - file-item.tsx 進度條與焦點框之間的縫
 *   - steps.tsx 外圈與圓之間的縫
 * 設計理由住 avatar.spec.md「頭像堆疊(疊在一起時)」段(「縫寬 2px 是 AI 推導」那段),本檔不重述。
 */
export const STACK_GAP_PX = 2
