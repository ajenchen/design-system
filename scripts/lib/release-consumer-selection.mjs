/**
 * 第五步「這一輪要升級哪些 consumer」的唯一實作。
 *
 * user 2026-11-05 原話:「以後WM的升級都不要自動做除非我有特別要求」。
 *
 * 開關只有一個:`infra/governance/release-workflow.json` 的 `automation.consumers[].upgrade`
 * (省略 = automatic)。`on-request` 的 consumer 只有在 user 明確要求、由 `RELEASE_REQUESTED_CONSUMERS`
 * (repository 全名,逗號分隔)帶進來時才被選中;沒要求就整個不碰,也不算第五步的完成條件。
 * 程式裡不另寫 WM 名單 —— 設定是唯一的來源。
 *
 * 2026-11-06 先寫在 `scripts/release-orchestrator.mjs`;2026-11-16 抽到這裡,因為深度稽核的
 * dim 64/66 證據(`scripts/lib/standard-ci-evidence-live-observer.mjs` 與
 * `scripts/lib/standard-ci-evidence.mjs`)仍對設定裡每一個 consumer(含 WM)要求升級證據:
 * 沒要求升 WM 的那次發版,dim 64/66 必紅,下一個 AI 就會為了讓它綠而去升 WM —— 正好違反上面那句話。
 * 現在 orchestrator、observer、validator 三處都 import 這一支,不得各寫一份。
 */

/** user 要求升級 on-request consumer 時使用的環境變數(`RELEASE_REQUESTED_CONSUMERS=ajenchen/work-management`)。 */
export const RELEASE_REQUESTED_CONSUMERS_ENV = 'RELEASE_REQUESTED_CONSUMERS'

/** 沒被選中的 consumer 在證據裡的狀態 = 本次未要求升級。 */
export const CONSUMER_NOT_REQUESTED_STATUS = 'not-requested-this-release'

/** consumer 的升級模式;`upgrade` 省略 = automatic。 */
export function consumerUpgradeMode(target) {
  return target?.upgrade ?? 'automatic'
}

/**
 * 這一輪要升級的 consumer:automatic 恆選;on-request 只在 repository 全名出現在 `requested` 時才選。
 * `requested` 裡有任何名字對不上設定裡的 repository(簡稱、打錯字、不存在)→ 直接丟錯,不得靜默忽略:
 * user 要求升級卻因名字寫法沒升、還被記成「本次未要求」,是把「沒認出來」當成「沒要求」(M37 第八種形狀)。
 */
export function selectReleaseConsumers(consumers = [], requested = []) {
  const known = new Set(consumers.map(target => target.repository))
  const unknown = requested.filter(name => !known.has(name))
  if (unknown.length) {
    throw new Error(`${RELEASE_REQUESTED_CONSUMERS_ENV} names unknown consumer repositories: ${unknown.join(', ')} (use the full repository name, e.g. ajenchen/work-management; known: ${[...known].join(', ')})`)
  }
  const asked = new Set(requested)
  return consumers.filter(target => consumerUpgradeMode(target) === 'automatic' || asked.has(target.repository))
}

/** user 明確要求要升級的 on-request consumer(逗號分隔、去空白、去空項)。 */
export function requestedConsumersFromEnv(env = process.env) {
  return `${env[RELEASE_REQUESTED_CONSUMERS_ENV] ?? ''}`.split(',').map(item => item.trim()).filter(Boolean)
}
