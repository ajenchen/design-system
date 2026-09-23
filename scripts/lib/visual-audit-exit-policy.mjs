// visual-audit 的結束碼政策(2026-09-23 從 visual-audit.mjs 抽出,配判定表 scripts/test-visual-baseline-review.mjs)。
//
// 一般模式:五個計數任一 > 0 就紅(2026-07-14 dim-66 fail-closed:render / diff error 進 gate;a11y 是 advisory)。
// --update-baseline 模式:pixel diff 是對「正要被取代的 baseline」算的 —— 換了渲染器、或內容真的改了,破預算是
// **必然**而不是訊號;contrast / geometry 是內容稽核,週跑(enforce 模式)本來就會再量一次。重拍唯一不能吞的是
// render error(story 404 / Storybook error display):壞掉的畫面不能被寫成 baseline。run #293(2026-09-23)就是
// 舊版把「對 7/28 baseline 破預算」也算失敗,參考 commit 的重拍寫完 baseline 卻 exit 1。
export function visualAuditExitCode({
  updateBaseline = false,
  contrastViolations = 0,
  geometryViolations = 0,
  diffBudgetBreached = 0,
  renderErrors = 0,
  diffErrors = 0,
} = {}) {
  for (const [name, value] of Object.entries({ contrastViolations, geometryViolations, diffBudgetBreached, renderErrors, diffErrors })) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`visual-audit exit policy:${name} must be a non-negative integer,got ${String(value)}`)
  }
  if (updateBaseline === true) return renderErrors > 0 ? 1 : 0
  return contrastViolations > 0 || geometryViolations > 0 || diffBudgetBreached > 0 || renderErrors > 0 || diffErrors > 0 ? 1 : 0
}
