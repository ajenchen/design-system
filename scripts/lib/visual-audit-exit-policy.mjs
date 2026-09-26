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

/**
 * 0 個 scenario 符合 scope 時,這一趟算不算通過(2026-09-25,待辦總帳 C5;M37「沒觀察到 ≠ 沒發生」)。
 * 原本一律印「跳過(exit 0)」—— `--scope=all` 在斷言檔壞掉 / 讀成空時,整支視覺稽核一張圖都沒截就綠了。
 * 只有 `--scope=changed` 可以合法地是 0(這次沒有動到有視覺 scenario 的元件);其餘都是儀器失效:
 *   all → 斷言檔沒有任何 scenario;component:X → X 打錯或沒有 scenario;未知 scope 會退回 all,同理;--urls 給了就不會是 0。
 * @param {{ scope?: string, urls?: string }} input
 * @returns {{ exitCode: 0 | 1, reason: string }}
 */
export function emptyScopeVerdict({ scope = 'changed', urls = '' } = {}) {
  if (urls) return { exitCode: 1, reason: `--urls 給了卻沒有任何 scenario(${urls})—— 解析壞了,這一趟什麼都沒截` }
  if (scope === 'changed') return { exitCode: 0, reason: 'scope=changed:這次沒有動到有視覺 scenario 的元件,不適用(exit 0)' }
  if (typeof scope === 'string' && scope.startsWith('component:')) {
    return { exitCode: 1, reason: `scope=${scope} 對不到任何 scenario —— 元件名打錯或該元件沒有視覺 scenario,這一趟什麼都沒截,不算通過` }
  }
  return { exitCode: 1, reason: `scope=${scope} 卻沒有任何 scenario —— 斷言檔是空的或讀錯了,這一趟什麼都沒截,不算通過` }
}
