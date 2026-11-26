/**
 * 第五步「這一輪要升級哪些 consumer」與「哪些 consumer 算完成條件」的唯一實作。
 *
 * 兩個開關,都只住在 `infra/governance/release-workflow.json` 的 `automation.consumers[]`,程式裡不另寫 repo 名單:
 *
 * 1. `upgrade`(省略 = automatic)—— 這一輪要不要碰它。`on-request` 的 consumer 只有在 user 明確要求、
 *    由 `RELEASE_REQUESTED_CONSUMERS`(repository 全名,逗號分隔)帶進來時才被選中;沒要求就整個不碰。
 *    這個值是為 work-management 加的(user 2026-11-05 原話:「以後WM的升級都不要自動做除非我有特別要求」);
 *    該 repo 已於 2026-11-25 退場(user 原話:「work-management 那個 repo不要了可以刪掉了」),
 *    目前沒有 consumer 使用 on-request,機制保留。
 *
 * 2. `merge`(省略 = automatic)—— 升級 PR 由誰合併。`automatic` = orchestrator 自動建立、修復、合併並讀回
 *    protected main,算第五步的完成條件(template)。`consumer-owned` = orchestrator 只自動開出升級 PR、
 *    讀回 PR 連結與檢查狀態;合不合由 consumer 自己決定,**不算第五步的完成條件**,它的檢查紅或沒合併
 *    都不讓發版失敗(產品 canary ajenchen/workspace;user 2026-11-25 原話:「設計系統 repo 要把 canary 換成
 *    ajenchen/workspace，換過來之後，設計系統出新版時，這個 repo 也會自動收到升級 PR。」)。
 *    依據:AGENTS.md「Decision／Engineering Authority」—— preview-canary 是附加 assurance,不得進入標準五步的
 *    blocking graph。「只開 PR、不等合併」這個區分是 AI 的工程判斷(2026-11-25),不是 user 逐字指定的。
 *
 * 2026-11-06 先寫在 `scripts/release-orchestrator.mjs`;2026-11-16 抽到這裡,因為深度稽核的
 * dim 64/66 證據(`scripts/lib/standard-ci-evidence-live-observer.mjs` 與
 * `scripts/lib/standard-ci-evidence.mjs`)原本對設定裡每一個 consumer 都要求升級證據:
 * 沒被要求升級的那次發版 dim 64/66 必紅,下一個 AI 就會為了讓它綠而去升級不該升的 consumer。
 * `merge: consumer-owned` 是同一個坑的另一面:要它交「已合併」的證據,稽核就會逼人去合併別人的 PR。
 * orchestrator、observer、validator 三處都 import 這一支,不得各寫一份。
 */

/** user 要求升級 on-request consumer 時使用的環境變數(`RELEASE_REQUESTED_CONSUMERS=<owner>/<repo>`)。 */
export const RELEASE_REQUESTED_CONSUMERS_ENV = 'RELEASE_REQUESTED_CONSUMERS'

/** 沒被選中的 consumer 在證據裡的狀態 = 本次未要求升級。 */
export const CONSUMER_NOT_REQUESTED_STATUS = 'not-requested-this-release'

/** 合併由 consumer 自己決定的 consumer 在證據裡的狀態 = 只開升級 PR,不是完成條件。 */
export const CONSUMER_OWNED_MERGE = 'consumer-owned'
export const CONSUMER_OWNED_MERGE_STATUS = 'pull-request-only-not-a-completion-condition'

/** consumer 的升級模式;`upgrade` 省略 = automatic。 */
export function consumerUpgradeMode(target) {
  return target?.upgrade ?? 'automatic'
}

/** consumer 升級 PR 的合併歸屬;`merge` 省略 = automatic(orchestrator 合併並讀回)。 */
export function consumerMergeMode(target) {
  return target?.merge ?? 'automatic'
}

/**
 * 這個 consumer 算不算第五步的完成條件。只有「合併由 orchestrator 負責」的才算;
 * `merge: consumer-owned` 的只開 PR、讀回狀態,發版完成不等它、也不因它失敗。
 */
export function consumerBlocksRelease(target) {
  return consumerMergeMode(target) === 'automatic'
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
    throw new Error(`${RELEASE_REQUESTED_CONSUMERS_ENV} names unknown consumer repositories: ${unknown.join(', ')} (use the full repository name, e.g. ${[...known][0] ?? '<owner>/<repo>'}; known: ${[...known].join(', ')})`)
  }
  const asked = new Set(requested)
  return consumers.filter(target => consumerUpgradeMode(target) === 'automatic' || asked.has(target.repository))
}

/** user 明確要求要升級的 on-request consumer(逗號分隔、去空白、去空項)。 */
export function requestedConsumersFromEnv(env = process.env) {
  return `${env[RELEASE_REQUESTED_CONSUMERS_ENV] ?? ''}`.split(',').map(item => item.trim()).filter(Boolean)
}
