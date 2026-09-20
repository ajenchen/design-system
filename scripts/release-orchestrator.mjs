#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { classifyConsentPrompt } from './lib/release-consent-language.mjs'
import { homedir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_PATH = resolve(ROOT, 'infra/governance/release-workflow.json')
const GITHUB_DESIRED_PATH = resolve(ROOT, 'infra/governance/desired/github.json')
/** user 發版同意 receipt(2026-09-02 user directive:預覽 → user 確認說「發版」→ 才合併/發布)。 */
// 收據目錄可由環境變數導向:測試必須寫到自己的沙箱,不得碰到真實工作區的同意收據。
// 2026-09-20 實證:hook 測試的 `mktemp -d` 在沙箱失敗回空 → `cd ""` 留在真 repo →
// 測試把 user 真正的同意收據覆寫/刪除了三次。守衛加在測試端,這個 override 是第二道。
const CONSENT_DIR = process.env.GOVERNANCE_RELEASE_CONSENT_DIR
  ? resolve(process.env.GOVERNANCE_RELEASE_CONSENT_DIR)
  : resolve(ROOT, '.git/governance-runtime/release-consent')

/**
 * 2026-09-20:同意改綁**分支**(= 該 PR),不再綁單一 commit。
 *
 * 為什麼改:receipt 原本以 `<headSha>.json` 命名、按當前 commit 查,於是**任何新 commit 都讓它失效**——
 * 而發版流程必然會產生新 commit(版號 bump 是必要步驟,CI 紅了修一次又一版)。結果 2026-09-19 那次
 * user 為同一份工作說了六次「發版」,每次都照做,每次又被我自己的機制作廢。user 原話:
 * 「我他媽已經說發版一百次了,你他媽到底是要我說幾次?」——**那不是 user 沒授權,是機制設計錯了**。
 *
 * 綁分支才對得上 user 實際看的東西:預覽連結是 `deploy-preview-<PR>--…`,**本來就是每個 PR 一條**,
 * 而 canonical 是 1 chat = 1 branch = 1 PR(M28)。user 看的是那條預覽、同意的是那份工作。
 *
 * 2026-09-02 那道防線**完整保留**,而且多了一層:
 *   - 換分支(= 換一份工作)→ 沒有 receipt → 照樣停在 `AWAITING_USER_RELEASE_CONSENT`。那次事故就是這格。
 *   - 同意之後**預覽看得見的東西又變了**(`packages/<pkg>/src/**` 的 ts/tsx/js/jsx/css)→ 視為失效,要重新同意。
 *     user 同意的是他看過的那個畫面;畫面變了就不算他看過。
 *   - 只有版號、腳本、CI、治理文件變動 → 不重問(那些不進 bundle,預覽長得一模一樣)。
 *   - 合併前仍然必須 required CI 全綠(pr-checks 步驟),所以「後來推壞」由 CI 擋,不是靠再問 user 一次。
 *   - 否定詞(不要發版/先不要)仍然刪 receipt;main 上永不落地;仍然要 user 逐字原話。
 */
const consentFileName = (branch) => `branch__${String(branch).replace(/[^A-Za-z0-9._-]/g, '_')}.json`

/** 純函式:這份 receipt 能不能覆蓋當前 head。抽出來讓判定表可以驗,不必碰檔案系統。 */
export function consentCoversHead({ receipt, branch, headSha, productFilesChanged = false, currentProductDigest = null } = {}) {
  if (!receipt) return { ok: false, reason: '沒有發版同意 receipt' }
  if (typeof receipt.quote !== 'string' || !receipt.quote.trim()) return { ok: false, reason: 'receipt 缺 user 逐字原話' }
  // schemaVersion 3(2026-09-20 第二次修正):綁**使用者看過的產品內容**,不綁 commit、不綁分支。
  if (receipt.schemaVersion === 3) {
    if (!receipt.productDigest) return { ok: false, reason: 'v3 receipt 缺產品內容指紋' }
    if (!currentProductDigest) return { ok: false, reason: '算不出當前產品內容指紋(保守視為不覆蓋)' }
    return receipt.productDigest === currentProductDigest
      ? { ok: true, reason: '使用者看過的產品內容未變(跨分支、跨 commit 都算數)' }
      : { ok: false, reason: '預覽看得見的內容已經和使用者同意當下不同,需要重新確認' }
  }
  // 舊格式(綁 commit)仍然認,但只認它自己那一個 commit。
  if (receipt.schemaVersion === 1 && !receipt.consentedHeadSha) {
    return receipt.headSha === headSha
      ? { ok: true, reason: '舊格式 receipt(綁 commit)且 head 未變' }
      : { ok: false, reason: '舊格式 receipt(綁 commit),head 已變' }
  }
  if (!branch || receipt.branch !== branch) return { ok: false, reason: `receipt 屬於分支「${receipt.branch}」,當前是「${branch}」` }
  if (receipt.consentedHeadSha === headSha) return { ok: true, reason: 'head 與同意當下相同' }
  if (productFilesChanged) {
    return { ok: false, reason: '同意之後預覽看得見的內容又變了(packages/<pkg>/src 的 ts/tsx/js/jsx/css),需要重新確認' }
  }
  return { ok: true, reason: '同分支;同意之後只動了不進 bundle 的東西(版號 / 腳本 / 治理),預覽未變' }
}

/**
 * 「預覽看得見」的檔案集合:真的會進 Storybook 預覽、使用者在預覽站看得到的那些。
 *
 * 集合本身也曾是代理(M37):原本只寫 `packages/<pkg>/src`,漏掉 `.storybook/`(preview 設定、
 * 佈景、decorator —— 改了畫面一定變)與 `apps/**` 的 stories(`.storybook/main.ts:19` 的
 * `stories: [...sharedStoryGlobs, '../apps/**\/*.stories.@(tsx|mdx)']` 明確把它們納入)。
 * 漏掉就會出現「畫面明明變了卻不重問」—— 那是 2026-09-02 事故那一格的破口。
 */
const PRODUCT_VISIBLE = [
  /^packages\/[^/]+\/src\/.*\.(tsx?|jsx?|css|mdx)$/,
  /^\.storybook\/.*\.(tsx?|jsx?|css|mdx)$/,
  /^apps\/.*\.stories\.(tsx?|mdx)$/,
]

/**
 * 使用者看到的**產品內容**指紋(不是 commit,不是分支)。
 *
 * 2026-09-20 第二次修正的核心。第一次我把同意從「綁 commit」改成「綁分支」——
 * 然後立刻開了新分支,又跟使用者要一次同意。**根因不是綁什麼,是我拿自己切工作的單位
 * (commit → 分支 → 下一條分支)當成使用者的授權單位**,每切一次就憑空生出一道新的核准要求。
 * 使用者原話:「你他媽我從頭到尾就這樣要求,也沒有新增任何設計需求?你他媽到底是要我說發版說到何時?」
 *
 * 使用者實際授權的是「我看過的這份產品可以發」。所以綁那個:把預覽看得見的檔案內容做成指紋。
 * 內容一樣 → 他看過的東西沒變 → 同意仍然成立,**不管我在哪條分支、疊了幾個 commit**。
 * 內容變了 → 他沒看過 → 必須重新確認(2026-09-02 那次事故要保護的正是這個性質)。
 *
 * 用 blob sha 而不是逐檔讀內容:git 已經算好了,428 個檔約 30ms。
 */
export function productContentDigest(ref = 'HEAD') {
  const listed = run('git', ['ls-tree', '-r', ref], { allowFailure: true })
  if (!listed.ok || typeof listed.stdout !== 'string') return null
  const rows = []
  for (const line of listed.stdout.split('\n')) {
    // `<mode> blob <sha>\t<path>`
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const path = line.slice(tab + 1)
    if (!PRODUCT_VISIBLE.some((re) => re.test(path))) continue
    const sha = line.slice(0, tab).split(/\s+/)[2]
    if (!sha) continue
    rows.push(`${sha} ${path}`)
  }
  // 空集合不得當成有效指紋 —— 空字串的 sha256 在任何兩次比較都會「相符」,
  // 那是假性通過(2026-09-20 我第一版的 pathspec glob 沒命中,對照組因此兩邊都空而假性相符)。
  if (rows.length === 0) return null
  return createHash('sha256').update(rows.sort().join('\n')).digest('hex')
}

/** 兩個 commit 之間有沒有動到「預覽看得見」的檔。讀不到 git → true(保守:當成變了,要求重新同意)。 */
export function productVisibleFilesChanged(fromSha, toSha) {
  if (!fromSha || !toSha || fromSha === toSha) return false
  // `run()` 回的是 { ok, stdout, stderr },**沒有 `status`** —— 先前寫成 `diff.status !== 0`,
  // `undefined !== 0` 恆為真,於是這支從第一天起永遠回「變了」,整個「同分支不必重講」形同虛設。
  // 2026-09-20 實測:同意落地後只 bump 版號(零個 packages/<pkg>/src 檔),仍被判要重新同意。
  const diff = run('git', ['diff', '--name-only', `${fromSha}...${toSha}`], { allowFailure: true })
  if (!diff.ok || typeof diff.stdout !== 'string') return true
  return diff.stdout.split('\n').some((f) => PRODUCT_VISIBLE.some((re) => re.test(f.trim())))
}

/** v3 同意只有一份「當前有效」,因為使用者一次授權一份工作。撤回 = 刪掉它。 */
const CURRENT_CONSENT_FILE = 'current.json'

export function readReleaseConsent({ branch, headSha } = {}) {
  const verdicts = []
  // v3 優先:綁產品內容,跨分支成立
  const currentFile = resolve(CONSENT_DIR, CURRENT_CONSENT_FILE)
  if (existsSync(currentFile)) {
    try {
      const receipt = JSON.parse(readFileSync(currentFile, 'utf8'))
      // 判定吃的是**遠端 PR head**,本機不一定有那顆物件(沒 fetch 過就 ls-tree 失敗)。
      // 退回本機 HEAD 是安全的:真的分叉時,merge 那一步的 exact-head CAS 會擋下來,
      // 不該在這裡用「本機沒這顆 commit」誤判成「user 的同意失效」而叫他再講一次。
      const digest = productContentDigest(headSha) || productContentDigest('HEAD')
      const verdict = consentCoversHead({ receipt, branch, headSha, currentProductDigest: digest })
      if (verdict.ok) return { ...receipt, coverage: verdict.reason }
      verdicts.push(verdict.reason)
    } catch { /* 壞檔視同沒有 */ }
  }
  if (branch) {
    const file = resolve(CONSENT_DIR, consentFileName(branch))
    if (existsSync(file)) {
      try {
        const receipt = JSON.parse(readFileSync(file, 'utf8'))
        const changed = productVisibleFilesChanged(receipt?.consentedHeadSha, headSha)
        const verdict = consentCoversHead({ receipt, branch, headSha, productFilesChanged: changed })
        if (verdict.ok) return { ...receipt, coverage: verdict.reason }
        verdicts.push(verdict.reason)
      } catch { /* 壞檔視同沒有 */ }
    }
  }
  // 舊格式相容:`<headSha>.json`
  if (/^[a-f0-9]{40}$/.test(headSha || '')) {
    const legacy = resolve(CONSENT_DIR, `${headSha}.json`)
    if (existsSync(legacy)) {
      try {
        const receipt = JSON.parse(readFileSync(legacy, 'utf8'))
        if (consentCoversHead({ receipt, branch, headSha }).ok) return { ...receipt, coverage: '舊格式 receipt' }
      } catch { /* 同上 */ }
    }
  }
  if (verdicts.length) console.log(`   (發版同意不適用:${verdicts.join(';')})`)
  return null
}

export function writeReleaseConsent({ headSha, branch, quote, source }) {
  invariant(/^[a-f0-9]{40}$/.test(headSha || ''), 'release consent needs the exact 40-char head sha')
  invariant(typeof quote === 'string' && quote.trim().length > 0, 'release consent needs the user\'s verbatim quote')
  // agent 手動落地必須套用**與 hook 完全相同**的判準。先前這條路一條檢查都沒有,而磁碟上
  // 14 筆收據有 10 筆走這條 —— 等於 canonical 那句「問句／否定不算同意」只在另一條路上存在,
  // agent 可以自我認證(2026-09-20 對抗性稽核 blocker)。
  const verdict = classifyConsentPrompt(quote)
  invariant(verdict.verdict === 'consent',
    `這段原話不構成發版同意(判為 ${verdict.verdict}:${verdict.reason})—— 判準 SSOT 在 infra/governance/release-workflow.json,hook 與手動落地共用同一份`)
  invariant(typeof branch === 'string' && branch.trim() && branch !== 'main', 'release consent is recorded per working branch, never on main')
  mkdirSync(CONSENT_DIR, { recursive: true })
  const productDigest = productContentDigest(headSha)
  invariant(Boolean(productDigest), '算不出「預覽看得見」的產品內容指紋 —— 沒有它就無法把同意綁在使用者真正看過的東西上')
  // 帳本不得被「再講一次發版」清零:同一份產品內容 = 同一份工作,已發的版本要延續計數。
  // 產品內容變了才是新的一份工作,帳本歸零。缺這一段,閘永遠停在「第一次」而不會擋住第六次發版。
  const previous = (() => {
    const file = resolve(CONSENT_DIR, CURRENT_CONSENT_FILE)
    if (!existsSync(file)) return null
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  })()
  const carriedReleases = previous?.productDigest === productDigest ? (previous.releases || []) : []
  const receipt = {
    schemaVersion: 3,
    // 綁定對象:使用者看過並認可的**產品內容**。branch / consentedHeadSha 只是出處紀錄,不參與判定。
    productDigest,
    releases: carriedReleases,
    branch,
    consentedHeadSha: headSha,
    quote: quote.trim(),
    quoteSha256: createHash('sha256').update(quote.trim()).digest('hex'),
    source: source || 'manual',
    recordedAt: new Date().toISOString(),
  }
  writeFileSync(resolve(CONSENT_DIR, CURRENT_CONSENT_FILE), `${JSON.stringify(receipt, null, 2)}\n`)
  return receipt
}

/**
 * 同一份授權底下已經發出去的版本清單。
 *
 * 2026-09-20 user 質問:「你他媽真的確認過是有必要發那麼多次?」—— 沒有。同一份工作在 28 小時內
 * 發了 beta.135/136/137/138/139 五個版本,每發一次就要 user 重講一次「發版」。
 * canonical 早就寫了「禁止把 immutable publish 當 iteration/test loop,每次 audit 最多一次 final release」,
 * `authorizeDeepAuditPublish()` 也寫好了、連測試都有 —— **但整個發版流程從來沒有呼叫它**。
 * 規則存在、函式存在、測試存在、執行面零呼叫,正是失敗索引那條「寫了閘卻沒有任何執行面呼叫它」。
 *
 * 現在接上:帳本記在同意 receipt 裡(同意 = 一份授權 = 一次 final release)。
 * 第二次要發必須有 incident 證據,否則 fail closed 並要求把修正**批次做完再發一次**。
 */
export function consentReleaseLedger() {
  const file = resolve(CONSENT_DIR, CURRENT_CONSENT_FILE)
  if (!existsSync(file)) return []
  try { return JSON.parse(readFileSync(file, 'utf8')).releases || [] } catch { return [] }
}

export function recordConsentRelease(version) {
  const file = resolve(CONSENT_DIR, CURRENT_CONSENT_FILE)
  if (!existsSync(file)) return
  try {
    const receipt = JSON.parse(readFileSync(file, 'utf8'))
    receipt.releases = [...new Set([...(receipt.releases || []), version])]
    writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`)
  } catch { /* 帳本壞掉不阻斷發版,但下一次計數會偏保守(讀到 [] = 允許一次) */ }
}

/** 撤回:使用者說「不要發版 / 先不要」。刪掉當前那份就好,不必知道分支。 */
/**
 * 撤回必須刪掉**讀取端會認的每一份**收據,不是只刪當前那份。
 * 2026-09-20 稽核實證:只刪 current.json 時,readReleaseConsent 仍會 fallback 讀
 * `branch__<分支>.json` 與舊格式 `<headSha>.json` —— 印了「已撤回」但同意其實還在,
 * user 說「不要發版」等於沒說。這是**我當天自己改出來的破口**。
 */
export function withdrawReleaseConsent({ branch, headSha } = {}) {
  const targets = [resolve(CONSENT_DIR, CURRENT_CONSENT_FILE)]
  if (branch) targets.push(resolve(CONSENT_DIR, consentFileName(branch)))
  if (/^[a-f0-9]{40}$/.test(headSha || '')) targets.push(resolve(CONSENT_DIR, `${headSha}.json`))
  let removed = 0
  for (const file of targets) {
    if (!existsSync(file)) continue
    rmSync(file, { force: true })
    removed += 1
  }
  return removed > 0
}

export function previewUrls(workflow, observation) {
  const preview = workflow.automation?.preview
  if (!preview) return []
  const urls = []
  if (observation.pullRequest?.number) {
    urls.push(preview.pullRequestPattern.replace('{number}', String(observation.pullRequest.number)).replace('{site}', preview.site))
  }
  if (observation.branch) {
    const slug = observation.branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    urls.push(preview.branchPattern.replace('{branchSlug}', slug).replace('{site}', preview.site))
  }
  return urls
}
const PACKAGE_PATHS = Object.freeze({
  '@qijenchen/design-system': 'packages/design-system/package.json',
  '@qijenchen/governance': 'packages/governance/package.json',
  '@qijenchen/storybook-config': 'packages/storybook-config/package.json',
})
const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])
const PENDING_STATUSES = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting'])

export class HumanBoundaryError extends Error {
  constructor(boundary, message) {
    super(message)
    this.name = 'HumanBoundaryError'
    this.boundary = boundary
  }
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function validateReleaseWorkflow(workflow) {
  invariant(workflow?.schemaVersion === 1, 'release workflow schemaVersion must be 1')
  invariant(workflow.profile === 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM', 'release workflow must use the standard small-team profile')
  invariant(workflow.decisionAuthority?.engineering === 'AUTO', 'release engineering authority must be AUTO')
  invariant(workflow.decisionAuthority?.ask === 'unresolved-product-ui-ux-ssot-choice', 'only unresolved product/UI/UX SSOT choices may ASK')
  invariant(
    JSON.stringify(workflow.decisionAuthority?.humanOnly) === JSON.stringify(['login', 'mfa', 'oauth', 'credential-reference']),
    'human-only boundaries must be exactly login/MFA/OAuth/credential-reference',
  )
  invariant(workflow.decisionAuthority?.resumeAfterHumanAction === 'AUTO', 'release must resume automatically after a human-only action')
  invariant(workflow.deepAuditReleasePolicy?.iterationBoundary === 'one-branch-one-pr-candidate-validation', 'deep audit must finish candidate validation on one branch and PR')
  invariant(workflow.deepAuditReleasePolicy?.publishAsIterationLoop === false, 'deep audit must never publish as an iteration or test loop')
  invariant(workflow.deepAuditReleasePolicy?.maximumFinalReleasesPerAudit === 1, 'deep audit permits at most one final release')
  invariant(
    workflow.deepAuditReleasePolicy?.additionalReleaseCondition === 'separately-evidenced-post-publish-blocker-or-security-incident',
    'an additional deep-audit release requires a separately evidenced post-publish blocker or security incident',
  )
  invariant(
    JSON.stringify(workflow.deepAuditReleasePolicy?.allowedAdditionalReleaseFailureClasses) === JSON.stringify(['post-publish-blocker', 'security-incident']),
    'deep-audit additional release failure classes are closed',
  )
  invariant(
    JSON.stringify(workflow.deepAuditReleasePolicy?.requiredIncidentFields) === JSON.stringify(['incidentId', 'failureClass', 'publishedVersion', 'evidenceRef']),
    'deep-audit additional releases must bind exact incident evidence fields',
  )
  invariant(
    JSON.stringify(workflow.steps?.map(step => step.id)) === JSON.stringify(['pr-checks', 'merge', 'publish', 'readback', 'consumer']),
    'release workflow must contain exactly the canonical five steps in order',
  )
  invariant(workflow.steps.every(step => step.authority === 'AUTO'), 'every release step must be AUTO')
  invariant(workflow.legacyMechanisms.every(item => item.standardRelease === 'non-blocking' || item.standardRelease === 'retired'), 'legacy mechanisms must not block standard release')
  for (const target of workflow.automation?.consumers ?? []) {
    const check = target.requiredCheck
    invariant(check?.context === 'Verify consumer', `consumer ${target.repository} must require Verify consumer`)
    invariant(check.integration === 'githubActions', `consumer ${target.repository} must use GitHub Actions verification`)
    invariant(/^\.github\/workflows\/.+\.ya?ml$/.test(check.producerWorkflow || ''), `consumer ${target.repository} verification workflow is invalid`)
    invariant(['pull_request', 'repository_dispatch'].includes(check.producerEvent), `consumer ${target.repository} verification event is invalid`)
    invariant(['pull-request-head', 'pull-request-base'].includes(check.producerHead), `consumer ${target.repository} verification head binding is invalid`)
  }
  return workflow
}

/**
 * 額外一次 release 的 incident 證據來源。刻意只認明確傳入的環境變數,不做任何推測 ——
 * 「想再發一次」必須是一個有 incident ID、failure class、已發版本與 evidence ref 的具體決定。
 */
export function releaseIncidentFromEnv(env = process.env) {
  const raw = env.RELEASE_ADDITIONAL_INCIDENT
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function authorizeDeepAuditPublish(workflow, {
  completedFinalReleases,
  incident = null,
  priorAdditionalReleaseIncidentIds = [],
}) {
  validateReleaseWorkflow(workflow)
  invariant(Number.isInteger(completedFinalReleases) && completedFinalReleases >= 0 && completedFinalReleases <= 1, 'completed deep-audit final releases must be 0 or 1')
  invariant(Array.isArray(priorAdditionalReleaseIncidentIds) && priorAdditionalReleaseIncidentIds.every(value => typeof value === 'string' && value.length > 0), 'prior deep-audit incident IDs are invalid')
  if (completedFinalReleases === 0) {
    invariant(incident === null, 'the one final deep-audit release must not masquerade as an incident release')
    return Object.freeze({ authorization: 'final-release', releaseNumber: 1 })
  }

  invariant(incident && typeof incident === 'object' && !Array.isArray(incident), 'an additional deep-audit release requires incident evidence')
  const required = workflow.deepAuditReleasePolicy.requiredIncidentFields
  invariant(Object.keys(incident).length === required.length && required.every(field => Object.hasOwn(incident, field)), 'incident evidence must contain only the exact required fields')
  invariant(typeof incident.incidentId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(incident.incidentId), 'incidentId is invalid')
  invariant(!priorAdditionalReleaseIncidentIds.includes(incident.incidentId), 'incidentId already authorized an additional release')
  invariant(workflow.deepAuditReleasePolicy.allowedAdditionalReleaseFailureClasses.includes(incident.failureClass), 'incident failureClass is not eligible for an additional release')
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(incident.publishedVersion), 'incident publishedVersion must be exact semver')
  invariant(typeof incident.evidenceRef === 'string' && incident.evidenceRef.length > 0 && incident.evidenceRef !== incident.incidentId, 'incident evidenceRef must be a separate non-empty reference')
  return Object.freeze({ authorization: 'incident-release', incidentId: incident.incidentId })
}

export function loadReleaseWorkflow(path = WORKFLOW_PATH) {
  return validateReleaseWorkflow(readJson(path))
}

/**
 * release:auto 宣告「45 分鐘不收斂就停」,但那行檢查只在**外層**迴圈。
 * gh shim 的 `run watch` 與 `pr checks --watch` 各有一個沒有期限的 for(;;) —— 只要那邊卡住,
 * 就再也回不到外層那行,宣告的逾時等於不存在(2026-09-20 稽核 major)。
 * 期限改成模組層共用,兩個內層迴圈一起看。
 */
let releaseDeadline = null
const deadlineExceeded = () => releaseDeadline !== null && Date.now() > releaseDeadline

function run(command, args, { allowFailure = false, input, env } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: env || process.env,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    const detail = `${result.stderr || result.stdout}`.trim()
    if (/authentication|not logged|login|oauth|token.*required|HTTP 401/i.test(detail)) {
      throw new HumanBoundaryError('login/oauth/credential-reference', detail || `${command} authentication is required`)
    }
    if (/two.factor|2fa|mfa/i.test(detail)) {
      throw new HumanBoundaryError('mfa', detail)
    }
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
}

// 2026-08-11 anti-self-lock fix:gh 憑證來源接上專案 canonical credential reference
//(~/.config/qijenchen-governance/github-token,與 git push / PR / merge 同一條已驗證通道)。
// gh 自己存的 OAuth token 過期不該擋住流程——憑證存在,只是 gh 讀錯地方。
// 環境已有 GH_TOKEN/GITHUB_TOKEN 時尊重之;credential 檔不存在則維持原行為(fail-closed 到
// login 邊界)。此為 credential reference 消費,非 secret 落地:token 只進子行程環境。
const GOVERNANCE_TOKEN_PATH = join(homedir(), '.config', 'qijenchen-governance', 'github-token')
function governanceGhEnv() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env
  try {
    const token = readFileSync(GOVERNANCE_TOKEN_PATH, 'utf8').trim()
    if (token) return { ...process.env, GH_TOKEN: token }
  } catch { /* 無 credential 檔 → 原行為 */ }
  return process.env
}

// 2026-08-11 anti-self-lock fix(user directive):gh 的 Go TLS 在 sandbox 內不信代理憑證,
// 但 curl 可通(同 token 已實測 merge PR)。以下 shim 把 orchestrator 用到的八種 gh 形狀
// 翻譯成 GitHub REST + curl;未涵蓋的形狀 fallback 原 gh(會顯性 TLS 失敗,不靜默)。
function curlGitHub(method, path, { headers = [], body = null } = {}) {
  let token = ''
  try { token = readFileSync(GOVERNANCE_TOKEN_PATH, 'utf8').trim() } catch { /* fallthrough */ }
  if (!token) token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
  const url = /^https?:/.test(path) ? path : `https://api.github.com/${path.replace(/^\//, '')}`
  const args = ['-sS', '-X', method, '-H', `Authorization: Bearer ${token}`,
    '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: release-orchestrator',
    '-w', '\n__HTTP_STATUS__:%{http_code}']
  for (const header of headers) args.push('-H', header)
  if (body !== null) args.push('-H', 'Content-Type: application/json', '-d', body)
  args.push(url)
  for (let attempt = 0; ; attempt += 1) {
    const result = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (result.error) throw result.error
    const raw = `${result.stdout}`
    const marker = raw.lastIndexOf('__HTTP_STATUS__:')
    const code = marker >= 0 ? Number(raw.slice(marker + 16).trim()) : 0
    const text = marker >= 0 ? raw.slice(0, marker).replace(/\n$/, '') : raw
    // 瞬時網路抖動(HTTP 0 = curl 連線層失敗)重試兩次再定論,避免長輪詢被單次抖動打斷
    if (code === 0 && attempt < 2) { sleep(3000); continue }
    return { code, ok: code >= 200 && code < 300, text }
  }
}
function shimDone(response, { allowFailure, label, mapText = null }) {
  if (!response.ok) {
    if (allowFailure) return { ok: false, stdout: '', stderr: `HTTP ${response.code}` }
    if (response.code === 401) throw new HumanBoundaryError('login/oauth/credential-reference', `HTTP 401 for ${label}`)
    throw new Error(`${label} failed: HTTP ${response.code}: ${response.text.slice(0, 300)}`)
  }
  return { ok: true, stdout: mapText === null ? response.text : mapText, stderr: '' }
}
function shimMapPull(p, detail = null) {
  return {
    number: p.number,
    state: p.merged_at || detail?.merged ? 'MERGED' : `${p.state || ''}`.toUpperCase(),
    mergeStateStatus: `${detail?.mergeable_state || p.mergeable_state || ''}`.toUpperCase(),
    mergeable: (detail?.mergeable ?? p.mergeable) === true ? 'MERGEABLE'
      : (detail?.mergeable ?? p.mergeable) === false ? 'CONFLICTING' : 'UNKNOWN',
    headRefOid: p.head?.sha, baseRefOid: p.base?.sha, url: p.html_url,
    title: p.title, body: p.body, headRefName: p.head?.ref, baseRefName: p.base?.ref,
    mergeCommit: p.merge_commit_sha ? { oid: p.merge_commit_sha } : null,
  }
}
function shimRowFromStatus(status, conclusionRaw, name, workflow) {
  const done = status === 'completed'
  const conclusion = `${conclusionRaw || ''}`
  const bucket = !done ? 'pending'
    : conclusion === 'success' ? 'pass'
    : ['neutral', 'skipped'].includes(conclusion) ? 'skipping'
    : conclusion === 'cancelled' ? 'cancel' : 'fail'
  return { bucket, name, state: done ? conclusion : 'pending', workflow }
}
function shimCheckRows(repository, headSha) {
  const response = curlGitHub('GET', `repos/${repository}/commits/${headSha}/check-runs?per_page=100`)
  if (response.ok) {
    const runs = JSON.parse(response.text).check_runs || []
    return runs.map(item => shimRowFromStatus(item.status, item.conclusion, item.name, item.app?.name || ''))
  }
  // 2026-08-12 fallback:fine-grained token 的 Checks 讀取權可能只涵蓋部分 repo(403),
  // 但 Actions 讀取權可用 — required check(如 WM 的「Verify consumer」)本就是 Actions job,
  // 由 runs?head_sha → jobs 推導同一份列表,語意等價。
  if (response.code !== 403) return null
  const runsResponse = curlGitHub('GET', `repos/${repository}/actions/runs?head_sha=${headSha}&per_page=20`)
  if (!runsResponse.ok) return null
  const rows = []
  for (const run of JSON.parse(runsResponse.text).workflow_runs || []) {
    const jobsResponse = curlGitHub('GET', `repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`)
    if (!jobsResponse.ok) continue
    for (const job of JSON.parse(jobsResponse.text).jobs || []) {
      rows.push(shimRowFromStatus(job.status, job.conclusion, job.name, run.name || ''))
    }
  }
  return rows
}
function flagValue(args, flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : null
}
function ghShim(args, { allowFailure = false, input = null } = {}) {
  const label = `gh-shim ${args.join(' ')}`.slice(0, 120)
  if (args[0] === 'api') {
    let method = 'GET'; const headers = []; const fields = {}; let endpoint = null; let useStdin = false
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index]
      if (arg === '--method') { method = args[++index] }
      else if (arg === '-H') { headers.push(args[++index]) }
      else if (arg === '-f' || arg === '-F') { const [key, ...rest] = args[++index].split('='); fields[key] = rest.join('=') }
      else if (arg === '--input') { useStdin = args[++index] === '-' }
      else if (!endpoint) endpoint = arg
    }
    if (!endpoint) return null
    const hasFields = Object.keys(fields).length > 0
    const body = useStdin ? (input ?? '') : hasFields ? JSON.stringify(fields) : null
    if (body !== null && method === 'GET') method = 'POST'
    const response = curlGitHub(method, endpoint, { headers, body })
    return shimDone(response, { allowFailure, label })
  }
  if (args[0] === 'release' && args[1] === 'view') {
    const repository = flagValue(args, '--repo')
    const response = curlGitHub('GET', `repos/${repository}/releases/tags/${encodeURIComponent(args[2])}`)
    if (!response.ok) return shimDone(response, { allowFailure, label })
    const release = JSON.parse(response.text)
    return { ok: true, stdout: JSON.stringify({
      tagName: release.tag_name, isDraft: release.draft, isImmutable: Boolean(release.immutable),
      isPrerelease: release.prerelease, publishedAt: release.published_at, url: release.html_url,
    }), stderr: '' }
  }
  if (args[0] === 'run' && args[1] === 'list') {
    const repository = flagValue(args, '--repo')
    const workflowFile = flagValue(args, '--workflow')
    const limit = flagValue(args, '--limit') || '20'
    const response = curlGitHub('GET', `repos/${repository}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=${limit}`)
    if (!response.ok) return shimDone(response, { allowFailure, label })
    const rows = (JSON.parse(response.text).workflow_runs || []).map(item => ({
      databaseId: item.id, status: item.status, conclusion: item.conclusion,
      headSha: item.head_sha, event: item.event, createdAt: item.created_at, url: item.html_url,
    }))
    return { ok: true, stdout: JSON.stringify(rows), stderr: '' }
  }
  if (args[0] === 'run' && args[1] === 'watch') {
    const repository = flagValue(args, '--repo')
    for (;;) {
      const response = curlGitHub('GET', `repos/${repository}/actions/runs/${args[2]}`)
      if (!response.ok) return shimDone(response, { allowFailure, label })
      if (deadlineExceeded()) throw new Error(`${label}: 等待 workflow run 超過 release:auto 的時限;live state 保留,可直接重跑`)
      const runState = JSON.parse(response.text)
      if (runState.status === 'completed') {
        if (runState.conclusion === 'success') return { ok: true, stdout: '', stderr: '' }
        if (allowFailure) return { ok: false, stdout: '', stderr: `conclusion ${runState.conclusion}` }
        throw new Error(`${label}: run concluded ${runState.conclusion}`)
      }
      sleep(15000)
    }
  }
  if (args[0] === 'pr' && (args[1] === 'view' || args[1] === 'list')) {
    const repository = flagValue(args, '--repo')
    const owner = repository.split('/')[0]
    if (args[1] === 'view') {
      const branch = args.slice(2).find(arg => !arg.startsWith('--') && arg !== repository && !arg.includes(','))
      const listResponse = curlGitHub('GET', `repos/${repository}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}&per_page=1`)
      if (!listResponse.ok) return shimDone(listResponse, { allowFailure, label })
      const rows = JSON.parse(listResponse.text)
      if (!rows.length) return { ok: false, stdout: '', stderr: 'no pull requests found' }
      const detailResponse = curlGitHub('GET', `repos/${repository}/pulls/${rows[0].number}`)
      const detail = detailResponse.ok ? JSON.parse(detailResponse.text) : null
      return { ok: true, stdout: JSON.stringify(shimMapPull(rows[0], detail)), stderr: '' }
    }
    const head = flagValue(args, '--head')
    const limit = flagValue(args, '--limit') || '100'
    const query = `state=all&per_page=${limit}${head ? `&head=${owner}:${encodeURIComponent(head)}` : ''}`
    const response = curlGitHub('GET', `repos/${repository}/pulls?${query}`)
    if (!response.ok) return shimDone(response, { allowFailure, label })
    return { ok: true, stdout: JSON.stringify(JSON.parse(response.text).map(row => shimMapPull(row))), stderr: '' }
  }
  if (args[0] === 'pr' && args[1] === 'checks') {
    const repository = flagValue(args, '--repo')
    const prResponse = curlGitHub('GET', `repos/${repository}/pulls/${args[2]}`)
    if (!prResponse.ok) return shimDone(prResponse, { allowFailure, label })
    const pull = JSON.parse(prResponse.text)
    const headSha = pull.head.sha
    // --required 過濾:merge 的權威 = base branch ruleset 的 required_status_checks
    //(2026-09-02 修:原實作把「所有 check」都當 required,較 GitHub 權威更嚴 —— 當非必要
    // check 因 base 自身時效性腐化(如 protected-base 安裝被新資安公告擊穿)紅燈時,會把
    // canonical five-step 卡死在一個 GitHub 本就不要求的 check 上。rules API 讀不到時
    // 退回全數視為 required(fail-closed 保守向)。)
    let requiredContexts = null
    if (args.includes('--required')) {
      const baseBranch = pull.base?.ref || 'main'
      const rulesResponse = curlGitHub('GET', `repos/${repository}/rules/branches/${encodeURIComponent(baseBranch)}`)
      if (rulesResponse.ok) {
        try {
          const contexts = JSON.parse(rulesResponse.text)
            .filter(rule => rule.type === 'required_status_checks')
            .flatMap(rule => rule.parameters?.required_status_checks || [])
            .map(check => check.context)
            .filter(Boolean)
          if (contexts.length) requiredContexts = new Set(contexts)
        } catch { /* 保守向:解析失敗 → 全數視為 required */ }
      }
    }
    const filterRequired = rows => (requiredContexts
      ? rows.filter(row => requiredContexts.has(row.name))
      : rows)
    if (args.includes('--watch')) {
      for (;;) {
        if (deadlineExceeded()) throw new Error(`${label}: 等待必過 check 超過 release:auto 的時限;live state 保留,可直接重跑`)
        const rows = shimCheckRows(repository, headSha)
        if (rows === null) return shimDone({ ok: false, code: 0, text: '' }, { allowFailure, label })
        const watched = filterRequired(rows)
        if (watched.length && watched.every(row => row.bucket !== 'pending')) {
          const failed = watched.filter(row => row.bucket === 'fail' || row.bucket === 'cancel')
          if (!failed.length) return { ok: true, stdout: '', stderr: '' }
          if (allowFailure) return { ok: false, stdout: '', stderr: failed.map(row => row.name).join(',') }
          throw new Error(`${label}: required checks failed: ${failed.map(row => row.name).join(',')}`)
        }
        sleep(15000)
      }
    }
    const rows = shimCheckRows(repository, headSha)
    if (rows === null) return shimDone({ ok: false, code: 0, text: '' }, { allowFailure, label })
    const filtered = filterRequired(rows)
    return { ok: true, stdout: filtered.length ? JSON.stringify(filtered) : '', stderr: '' }
  }
  if (args[0] === 'pr' && args[1] === 'create') {
    const repository = flagValue(args, '--repo')
    const base = flagValue(args, '--base')
    const head = flagValue(args, '--head')
    // --fill = 取最近一筆 commit 的標題/本文;顯式 --title/--body 優先
    const title = flagValue(args, '--title') || run('git', ['log', '-1', '--pretty=%s']).stdout
    const bodyText = flagValue(args, '--body') ?? run('git', ['log', '-1', '--pretty=%b']).stdout
    const response = curlGitHub('POST', `repos/${repository}/pulls`,
      { body: JSON.stringify({ title, head, base, body: bodyText }) })
    if (!response.ok) {
      // 冪等:同 head 的 open PR 已存在(422)= 目標狀態已達成,回傳既有 PR(gh pr create 同語意)
      if (response.code === 422 && response.text.includes('already exists')) {
        const owner = repository.split('/')[0]
        const existing = curlGitHub('GET', `repos/${repository}/pulls?state=open&head=${owner}:${encodeURIComponent(head)}&per_page=1`)
        if (existing.ok) {
          const rows = JSON.parse(existing.text)
          if (rows.length) return { ok: true, stdout: rows[0].html_url, stderr: '' }
        }
      }
      return shimDone(response, { allowFailure, label })
    }
    return { ok: true, stdout: JSON.parse(response.text).html_url, stderr: '' }
  }
  if (args[0] === 'pr' && args[1] === 'merge') {
    const repository = flagValue(args, '--repo')
    const matchHead = flagValue(args, '--match-head-commit')
    const prResponse = curlGitHub('GET', `repos/${repository}/pulls/${args[2]}`)
    if (!prResponse.ok) return shimDone(prResponse, { allowFailure, label })
    const pull = JSON.parse(prResponse.text)
    // 草稿 PR 是 pr-checks 步驟的常態(canonical:建立／更新唯一 PR **draft**,user 看過預覽說「發版」才合併),
    // 所以合併前先轉正式。REST 沒有這個端點,只有 GraphQL mutation(gh pr ready 走的也是它)。
    // 2026-09-16 錨:user 說「發版」、receipt 已落地,merge 卻被 HTTP 405「Pull Request is still a draft」擋住。
    if (pull.draft) {
      const ready = curlGitHub('POST', 'graphql', { body: JSON.stringify({
        query: 'mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}',
        variables: { id: pull.node_id },
      }) })
      let readyBody = null
      try { readyBody = ready.ok ? JSON.parse(ready.text) : null } catch { readyBody = null }
      const nowDraft = readyBody?.data?.markPullRequestReadyForReview?.pullRequest?.isDraft
      if (!ready.ok || readyBody?.errors || nowDraft !== false) {
        return shimDone({ code: ready.code, ok: false, text: `mark draft PR ready failed: ${ready.text}` }, { allowFailure, label })
      }
    }
    const merge = curlGitHub('PUT', `repos/${repository}/pulls/${args[2]}/merge`,
      { body: JSON.stringify({ merge_method: 'squash', ...(matchHead ? { sha: matchHead } : {}) }) })
    if (!merge.ok) return shimDone(merge, { allowFailure, label })
    if (args.includes('--delete-branch')) {
      curlGitHub('DELETE', `repos/${repository}/git/refs/heads/${encodeURIComponent(pull.head.ref)}`)
    }
    return { ok: true, stdout: '', stderr: '' }
  }
  return null
}

function gh(args, options = {}) {
  const shimmed = ghShim(args, options)
  if (shimmed) return shimmed
  return run('gh', args, { ...options, env: governanceGhEnv() })
}

function ghJson(args, { allowFailure = false, input } = {}) {
  const result = gh(args, { allowFailure, input })
  if (!result.ok || result.stdout === '') return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`gh returned non-JSON output for ${args.join(' ')}`)
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function packageVersion(workflow) {
  const versions = workflow.automation.packages.map(name => {
    const path = PACKAGE_PATHS[name]
    invariant(path, `no local manifest is registered for ${name}`)
    return readJson(resolve(ROOT, path)).version
  })
  invariant(versions.every(version => version === versions[0]), `release package versions differ: ${versions.join(', ')}`)
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(versions[0]), `invalid release version: ${versions[0]}`)
  return versions[0]
}

function checkRollupStatus(rollup = []) {
  if (rollup.length === 0) return 'pending'
  if (rollup.some(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    const conclusion = `${item.conclusion || ''}`.toLowerCase()
    return bucket === 'fail' || bucket === 'cancel'
      || ['error', 'failure'].includes(state)
      || ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(conclusion)
  })) return 'failed'
  if (rollup.some(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    return bucket === 'pending' || ['expected', 'pending'].includes(state)
      || PENDING_STATUSES.has(`${item.status || ''}`.toLowerCase())
  })) return 'pending'
  return rollup.every(item => {
    const bucket = `${item.bucket || ''}`.toLowerCase()
    const state = `${item.state || ''}`.toLowerCase()
    return bucket === 'pass' || bucket === 'skipping' || state === 'success'
      || SUCCESS_CONCLUSIONS.has(`${item.conclusion || ''}`.toLowerCase())
  }) ? 'complete' : 'pending'
}

export function selectPublishRun(rows, protectedMainSha) {
  return Array.isArray(rows)
    ? rows.find(row => row.event === 'repository_dispatch' && row.headSha === protectedMainSha) || null
    : null
}

function latestRun(repository, workflowFile, protectedMainSha) {
  const rows = ghJson([
    'run', 'list', '--repo', repository, '--workflow', workflowFile, '--limit', '20',
    '--json', 'databaseId,status,conclusion,headSha,event,createdAt,url',
  ], { allowFailure: true })
  return selectPublishRun(rows, protectedMainSha)
}

export function buildPullRequestLookupArgs(repository, branch) {
  const fields = 'number,state,mergeStateStatus,mergeable,headRefOid,baseRefOid,url'
  return {
    view: ['pr', 'view', '--repo', repository, branch, '--json', fields],
    allStates: ['pr', 'list', '--repo', repository, '--state', 'all', '--head', branch, '--limit', '1', '--json', fields],
  }
}

function currentPullRequest(repository, branch, defaultBranch) {
  if (branch === defaultBranch) return null
  const lookup = buildPullRequestLookupArgs(repository, branch)
  const viewed = ghJson(lookup.view, { allowFailure: true })
  if (viewed) return withRequiredChecks(repository, viewed)
  const rows = ghJson(lookup.allStates, { allowFailure: true })
  return Array.isArray(rows) && rows[0] ? withRequiredChecks(repository, rows[0]) : null
}

function requiredPullRequestChecks(repository, number) {
  const result = gh([
    'pr', 'checks', `${number}`, '--repo', repository, '--required',
    '--json', 'bucket,name,state,workflow',
  ], { allowFailure: true })
  if (result.stdout === '') {
    if (!result.ok && !/no (?:required )?checks reported/i.test(result.stderr)) {
      throw new Error(`cannot read required checks for ${repository}#${number}: ${result.stderr}`)
    }
    return []
  }
  try {
    const rows = JSON.parse(result.stdout)
    return Array.isArray(rows) ? rows : []
  } catch {
    throw new Error(`required check readback for ${repository}#${number} was not JSON`)
  }
}

function withRequiredChecks(repository, pullRequest) {
  return { ...pullRequest, requiredChecks: requiredPullRequestChecks(repository, pullRequest.number) }
}

/**
 * 沒有 PR 的 consumer,這一圈該做什麼。抽成純函式,讓「已派工 / 已開 PR」這組狀態機可以用判定表驗。
 *
 * **為什麼抽出來**(2026-09-20,beta.139 實測):原本只有一個 `dispatchedConsumers` 集合,
 * 而 WM 那一支在**派工之後也把自己加進去**。於是:
 *   第 1 圈 分支還沒被 sync workflow 推上來 → 派工 → 標記「已處理」
 *   第 2 圈起 `!dispatchedConsumers.has(...)` = false → 整段跳過
 *   → 分支後來出現了也**永遠不會開 PR**,空轉到 45 分鐘逾時,WM 停在前一版
 * 根因是**一個旗標同時代表兩件事**:「已派工」被當成「已處理完」。但派工的目的正是讓分支
 * 稍後出現,所以「該開 PR」必然發生在「已派工」之後 —— 用同一個旗標擋,等於把正確路徑鎖死。
 *
 * 兩件事各自一個旗標:`dispatched` 只擋重複派工(重派會重跑 sync workflow),
 * `pullRequestOpened` 只擋重複開 PR。
 */
export function consumerStepAction({ delivery, branchExists, dispatched = false, pullRequestOpened = false } = {}) {
  if (branchExists) return pullRequestOpened ? 'wait' : 'create-pr'
  if (delivery === 'repository-dispatch-pr') return dispatched ? 'wait' : 'dispatch'
  return 'wait' // release-published-pr:分支由上游 release 事件推上來,這裡只能等
}

function expectedConsumerBranch(target, version) {
  if (target.delivery === 'release-published-pr') return `automation/release-v${version}`
  if (target.delivery === 'repository-dispatch-pr') return `automation/design-system-${version}`
  throw new Error(`consumer ${target.repository} delivery has no deterministic branch identity`)
}

export function matchesConsumerPullRequest(target, row, version, releaseCommit) {
  if (!row || row.state === 'CLOSED') return false
  const binding = `${row.title}\n${row.body || ''}`
  return row.headRefName === expectedConsumerBranch(target, version)
    && row.baseRefName === target.defaultBranch
    && binding.includes(version)
    && binding.includes(releaseCommit)
}

function matchingConsumerPullRequest(target, version, releaseCommit) {
  const rows = ghJson([
    'pr', 'list', '--repo', target.repository, '--state', 'all', '--limit', '100',
    '--json', 'number,title,body,state,headRefName,headRefOid,baseRefName,baseRefOid,mergeCommit,url',
  ], { allowFailure: true })
  if (!Array.isArray(rows)) return null
  const found = rows.find(row => matchesConsumerPullRequest(target, row, version, releaseCommit)) || null
  return found ? withRequiredChecks(target.repository, found) : null
}

function normalizeWorkflowPath(path) {
  return `${path || ''}`.replace(/@[^@]+$/, '')
}

export function validateConsumerCheckProvenance(target, pullRequest, checkRun, workflowRun, integration) {
  const expected = target?.requiredCheck
  if (!expected || !pullRequest || !checkRun || !workflowRun || !integration) return false
  const expectedWorkflowHead = expected.producerHead === 'pull-request-base'
    ? pullRequest.baseRefOid
    : pullRequest.headRefOid
  return checkRun.name === expected.context
    && checkRun.head_sha === pullRequest.headRefOid
    && checkRun.app?.id === integration.id
    && checkRun.app?.slug === integration.slug
    && checkRun.status === 'completed'
    && checkRun.conclusion === 'success'
    && normalizeWorkflowPath(workflowRun.path) === expected.producerWorkflow
    && workflowRun.event === expected.producerEvent
    && workflowRun.head_sha === expectedWorkflowHead
    && workflowRun.status === 'completed'
    && workflowRun.conclusion === 'success'
}

function consumerCheckReadback(target, pullRequest, desired) {
  if (!pullRequest) return { trusted: false, reason: 'release-bound consumer PR is unavailable' }
  const expected = target.requiredCheck
  const integration = desired.integrations?.[expected.integration]
  if (!integration) return { trusted: false, reason: `integration ${expected.integration} is unavailable` }
  const response = ghJson([
    'api', `repos/${target.repository}/commits/${pullRequest.headRefOid}/check-runs?per_page=100`,
    '-H', 'Accept: application/vnd.github+json',
  ], { allowFailure: true })
  const candidates = Array.isArray(response?.check_runs)
    ? response.check_runs.filter(run => run.name === expected.context).sort((left, right) => right.id - left.id)
    : []
  for (const checkRun of candidates) {
    const match = `${checkRun.details_url || ''}`.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/([1-9][0-9]*)(?:\/.*)?$/)
    if (!match) continue
    const workflowRun = ghJson(['api', `repos/${target.repository}/actions/runs/${match[1]}`], { allowFailure: true })
    if (validateConsumerCheckProvenance(target, pullRequest, checkRun, workflowRun, integration)) {
      return { trusted: true, checkRunId: checkRun.id, workflowRunId: workflowRun.id }
    }
  }
  // 2026-08-12 等強度後備:fine-grained token 對部分 repo 無 Checks 讀取權(check-runs 403),
  // 但 Actions 讀取權可用。同一條出處鏈(producerWorkflow 檔案 + producerEvent + exact head
  // + run/job completed success + job 名 = required context)直接由 Actions API 驗證 —— 見證
  // 端點不同,驗的性質相同;Actions run 本身即 github-actions integration 的產物。任一條件
  // 不符仍 fail-closed。
  const actionRuns = ghJson(['api', `repos/${target.repository}/actions/runs?head_sha=${pullRequest.headRefOid}&per_page=20`], { allowFailure: true })
  for (const workflowRun of actionRuns?.workflow_runs || []) {
    if (normalizeWorkflowPath(workflowRun.path) !== expected.producerWorkflow) continue
    if (workflowRun.event !== expected.producerEvent) continue
    if (workflowRun.head_sha !== pullRequest.headRefOid) continue
    if (workflowRun.status !== 'completed' || workflowRun.conclusion !== 'success') continue
    // 2026-09-19:出處以「**哪個 run** 產生了它」為準,不再要求 job 名稱等於 check 名稱。
    //
    // 原本這裡找的是「一個名字剛好等於 required context 的 job」。那是個代理條件,成立只因為
    // consumer 的 audit job 當時直接以必過 check 之名現身 —— 而那正是 WM 那邊的 bug:
    // 同一個名字有兩個生產者(audit job 本體,以及 sync workflow 用 API 補發的同名 check-run),
    // bot 開的 PR 上 audit 被 GitHub 擋住(自家 GITHUB_TOKEN 開的 PR 不給跑 workflow),
    // **卡住的那筆就是必過項本身**。WM 於 #85 把 job 改名為 `Audit`、跑完才補發必過 check,
    // 這裡的 job-name 代理就再也對不上 —— 代理條件斷了,真正的出處鏈其實沒斷。
    //
    // 出處強度不變:workflow 檔路徑、觸發事件、**exact PR head**、run 成功,四條一條沒少,
    // 全部仍 fail-closed。少掉的只有「job 要叫什麼名字」這個與出處無關的巧合。
    // (能讀 check-runs 時仍走上面的主路徑,那裡連 check-run 的 name / app / 結論都驗。)
    const jobs = ghJson(['api', `repos/${target.repository}/actions/runs/${workflowRun.id}/jobs?per_page=100`], { allowFailure: true })
    const job = (jobs?.jobs || []).find(item => item.status === 'completed' && item.conclusion === 'success')
    if (job) return { trusted: true, checkRunId: job.id, workflowRunId: workflowRun.id }
  }
  return { trusted: false, reason: `${expected.context} is not bound to ${expected.producerWorkflow} ${expected.producerEvent}` }
}

function ensureImmutableReleases(repository) {
  const endpoint = `repos/${repository}/immutable-releases`
  let state = ghJson(['api', endpoint], { allowFailure: true })
  if (state?.enabled !== true) {
    gh(['api', '--method', 'PUT', endpoint])
    state = ghJson(['api', endpoint])
  }
  invariant(state?.enabled === true, `repository ${repository} immutable releases could not be enabled`)
}

/**
 * 2026-09-20:consumer PR 一律由 orchestrator 用 canonical credential 開,不再由 consumer 的
 * workflow 自己開。
 *
 * 為什麼:GitHub 不讓自家 `GITHUB_TOKEN` 開出來的 PR 觸發 workflow(防遞迴),所以
 * `repository-dispatch-pr` 這條路上,consumer 的 `audit.yml` 永遠停在 `action_required`,
 * 而出處判定要求必過 check 綁在 **PR head** 上產生(`requiredCheck.producerHead`)——
 * 結構上永遠湊不齊,每次發版都要人工把 PR 關掉再開一次才過得去(beta.135/136/137/138 各一次)。
 *
 * 旁邊的 `release-published-pr`(template)三次都沒卡過,差別只有一個:**PR 是 orchestrator
 * 用 canonical token 開的**,所以 author 是真人身分,workflow 正常跑。把 WM 併到同一條路。
 *
 * 冪等:已有相符 PR 就不再開(consumer workflow 若尚未移除自己的開 PR 步驟也不會衝突),
 * 所以兩個 repo 的改動誰先上線都安全。
 */
export function buildConsumerPullRequestCreateArgs(target, { version, commit }) {
  invariant(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), `invalid consumer sync version: ${version}`)
  invariant(/^[a-f0-9]{40}$/.test(commit), `invalid consumer sync release commit: ${commit}`)
  const tag = `v${version}`
  const branch = expectedConsumerBranch(target, version)
  // title + body 必須同時含 version 與 release commit —— `matchesConsumerPullRequest` 以此綁定身分。
  const [title, body] = target.delivery === 'release-published-pr'
    ? [`chore: mirror design system ${tag}`, `Generated from published design-system release ${tag} at ${commit}.`]
    : [`chore(ds): sync ${tag}`, `Automated exact design-system release sync.\n\n- Version: \`${version}\`\n- Tag: \`${tag}\`\n- Commit: \`${commit}\``]
  return {
    branch,
    args: [
      'pr', 'create', '--repo', target.repository,
      '--head', branch, '--base', target.defaultBranch,
      '--title', title,
      '--body', body,
    ],
  }
}

/** 既有外部契約(測試與 invariant 都引它);語意 = 只給 published-template 這條路的薄包裝。 */
export function buildPublishedTemplatePullRequestCreateArgs(target, options) {
  invariant(target.delivery === 'release-published-pr', `consumer ${target.repository} is not published-template driven`)
  return buildConsumerPullRequestCreateArgs(target, options)
}

function consumerAutomationBranchExists(target, version) {
  const branch = expectedConsumerBranch(target, version)
  return Boolean(ghJson([
    'api', `repos/${target.repository}/branches/${encodeURIComponent(branch)}`,
  ], { allowFailure: true }))
}

function readConsumerLock(target) {
  const result = gh([
    'api', `repos/${target.repository}/contents/${target.readbackPath}?ref=${encodeURIComponent(target.defaultBranch)}`,
    '-H', 'Accept: application/vnd.github.raw+json',
  ], { allowFailure: true })
  if (!result.ok || result.stdout === '') return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

function consumerPackageReadback(target, version) {
  const lock = readConsumerLock(target)
  const packages = lock?.packages
  if (!packages || typeof packages !== 'object') return false
  return target.packages.every(name => packages[`node_modules/${name}`]?.version === version)
}

function npmPackageReadback(name, version) {
  // 2026-08-11 anti-self-lock fix:npm CLI 的網路路徑在 sandbox 內不通,registry 的 HTTPS
  // 由 curl 直讀可通(同 M36(b') 第三問:傳輸不通 → 換已驗證等價傳輸,不是邊界)。
  const encoded = name.replace('/', '%2F')
  const result = spawnSync('curl', ['-sS', `https://registry.npmjs.org/${encoded}/${encodeURIComponent(version)}`],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0 || !result.stdout) return false
  try {
    return JSON.parse(result.stdout).version === version
  } catch {
    return false
  }
}

export function buildFiveStepStatus(workflow, observation) {
  validateReleaseWorkflow(workflow)
  const prChecks = observation.onProtectedMain
    ? 'complete'
    : observation.pullRequest
      ? checkRollupStatus(observation.pullRequest.requiredChecks)
      : 'blocked'
  // 2026-09-02 user directive:合併前必須有 user 對「當前 PR head」的發版同意 receipt;沒有 → 停在預覽階段。
  const consentRequired = workflow.releaseConsent?.required !== false
  const consentOk = !consentRequired || Boolean(observation.releaseConsent)
  const merge = observation.onProtectedMain || observation.pullRequest?.state === 'MERGED'
    ? 'complete'
    : consentOk ? 'pending' : 'awaiting-consent'
  const publishedRelease = Boolean(
    observation.release
      && !observation.release.isDraft
      && observation.release.isImmutable === true
      && observation.release.publishedAt
      && /^[a-f0-9]{40}$/.test(observation.releaseCommitSha || ''),
  )
  const mutablePublishedRelease = Boolean(
    observation.release
      && !observation.release.isDraft
      && observation.release.publishedAt
      && observation.release.isImmutable !== true,
  )
  const publish = mutablePublishedRelease
    ? 'failed'
    : publishedRelease
    ? 'complete'
    : observation.publishRun && PENDING_STATUSES.has(`${observation.publishRun.status}`.toLowerCase())
      ? 'running'
      : merge === 'complete' ? 'ready' : 'pending'
  const readback = publishedRelease && observation.npmPackages.every(item => item.exactVersion) ? 'complete' : publish === 'complete' ? 'pending' : 'blocked'
  const consumer = readback === 'complete'
    ? observation.consumers.every(item => item.exactVersion && item.checkReadback?.trusted === true) ? 'complete' : 'pending'
    : 'blocked'
  return [
    { id: 'pr-checks', authority: 'AUTO', status: prChecks },
    { id: 'merge', authority: 'AUTO', status: merge },
    { id: 'publish', authority: 'AUTO', status: publish },
    { id: 'readback', authority: 'AUTO', status: readback },
    { id: 'consumer', authority: 'AUTO', status: consumer },
  ]
}

export function collectLiveObservation(workflow = loadReleaseWorkflow()) {
  const desired = readJson(GITHUB_DESIRED_PATH)
  const { repository, defaultBranch, publishWorkflow, packages, consumers } = workflow.automation
  // 2026-08-11 anti-self-lock fix(user directive「把過度設計的機制清理乾淨」):
  // 憑證體檢改 target-bound。原本的 `gh auth status` 戳帳號級端點,repo-scoped
  // fine-grained token 會被誤判 invalid(同顆 token 對 repo API 完全可用,實測可
  // merge PR),orchestrator 卻因此把「憑證存在但體檢方式錯」誤判成 HUMAN_ONLY
  // login 邊界。改驗「能否讀取目標 repo」= 本流程真正需要的能力;真 401 仍會被
  // run() 分類為 login 邊界 fail-closed。
  gh(['api', `repos/${repository}`])
  const branch = run('git', ['branch', '--show-current']).stdout
  const headSha = run('git', ['rev-parse', 'HEAD^{commit}']).stdout
  const main = ghJson(['api', `repos/${repository}/commits/${defaultBranch}`])
  const version = packageVersion(workflow)
  const tag = `v${version}`
  const pullRequest = currentPullRequest(repository, branch, defaultBranch)
  const tagRef = ghJson(['api', `repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`], { allowFailure: true })
  const tagCommitSha = tagRef?.object?.sha || null
  const releaseCommitSha = tagCommitSha || main?.sha || null
  const release = ghJson(['release', 'view', tag, '--repo', repository, '--json', 'tagName,isDraft,isImmutable,isPrerelease,publishedAt,url'], { allowFailure: true })
  const consumerObservations = consumers.map(target => {
    const exactVersion = release ? consumerPackageReadback(target, version) : false
    const targetPullRequest = release ? matchingConsumerPullRequest(target, version, releaseCommitSha) : null
    return {
      ...target,
      exactVersion,
      pullRequest: targetPullRequest,
      checkReadback: release ? consumerCheckReadback(target, targetPullRequest, desired) : { trusted: false, reason: 'release is unavailable' },
    }
  })
  return {
    repository,
    branch,
    headSha,
    protectedMainSha: main?.sha || null,
    onProtectedMain: branch === defaultBranch && headSha === main?.sha,
    version,
    tag,
    pullRequest,
    releaseConsent: readReleaseConsent({ branch, headSha: pullRequest?.headRefOid || headSha }),
    tagCommitSha,
    releaseCommitSha,
    release,
    publishRun: latestRun(repository, publishWorkflow.file, releaseCommitSha),
    npmPackages: packages.map(name => ({ name, exactVersion: release ? npmPackageReadback(name, version) : false })),
    consumers: consumerObservations,
  }
}

function printReport(workflow, observation, json) {
  const report = {
    schemaVersion: 1,
    authority: workflow.decisionAuthority,
    release: { repository: observation.repository, version: observation.version, tag: observation.tag, commit: observation.releaseCommitSha },
    steps: buildFiveStepStatus(workflow, observation),
    legacyMechanisms: workflow.legacyMechanisms,
  }
  if (json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`${observation.repository} ${observation.tag}`)
    for (const step of report.steps) console.log(`${step.id.padEnd(10)} ${step.status} (${step.authority})`)
  }
  return report
}

function waitForRun(repository, workflowFile, protectedMainSha, previousRunId = null) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const found = latestRun(repository, workflowFile, protectedMainSha)
    if (found && `${found.databaseId}` !== `${previousRunId || ''}`) return found
    sleep(2000)
  }
  throw new Error(`dispatch was accepted but ${workflowFile} was not observable; release:auto is safe to rerun`)
}

function watchRun(repository, run) {
  gh(['run', 'watch', `${run.databaseId}`, '--repo', repository, '--exit-status'])
}

export function buildConsumerDispatch(target, { version, tag, commit }) {
  invariant(target.delivery === 'repository-dispatch-pr', `consumer ${target.repository} is not repository-dispatch driven`)
  invariant(tag === `v${version}`, `consumer dispatch tag ${tag} does not match version ${version}`)
  invariant(/^[a-f0-9]{40}$/.test(commit), `invalid consumer release commit: ${commit}`)
  return {
    args: ['api', '--method', 'POST', `repos/${target.repository}/dispatches`, '--input', '-'],
    input: `${JSON.stringify({ event_type: target.dispatchEvent, client_payload: { version, tag, commit } })}\n`,
  }
}

function dispatchConsumer(target, release) {
  const operation = buildConsumerDispatch(target, release)
  gh(operation.args, { input: operation.input })
}

export function buildPullRequestCreateArgs(workflow, branch) {
  invariant(branch && branch !== workflow.automation.defaultBranch, 'a working branch is required to create a release PR')
  return [
    'pr', 'create', '--repo', workflow.automation.repository,
    '--base', workflow.automation.defaultBranch, '--head', branch, '--fill',
  ]
}

export function buildBranchPushArgs(workflow, branch) {
  invariant(branch && branch !== workflow.automation.defaultBranch, 'a working branch is required to push a release PR')
  invariant(/^(?![-/])(?!.*(?:\.\.|\/\/|@\{|\.lock(?:\/|$)))[A-Za-z0-9._/-]+(?<![/.])$/.test(branch), `invalid release branch:${branch}`)
  return ['push', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`]
}

export function buildPublishMutationPlan(workflow, { tag, protectedMainSha, existingTagSha = null }) {
  validateReleaseWorkflow(workflow)
  invariant(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag), `invalid exact release tag: ${tag}`)
  invariant(/^[a-f0-9]{40}$/.test(protectedMainSha), `invalid protected main SHA: ${protectedMainSha}`)
  invariant(!existingTagSha || /^[a-f0-9]{40}$/.test(existingTagSha), `existing ${tag} has an invalid commit SHA`)
  const releaseCommitSha = existingTagSha || protectedMainSha
  const operations = []
  if (!existingTagSha) {
    operations.push({
      args: ['api', '--method', 'POST', `repos/${workflow.automation.repository}/git/refs`, '--input', '-'],
      input: `${JSON.stringify({ ref: `refs/tags/${tag}`, sha: protectedMainSha })}\n`,
    })
  }
  operations.push({
    args: ['api', '--method', 'POST', `repos/${workflow.automation.repository}/dispatches`, '--input', '-'],
    input: `${JSON.stringify({ event_type: workflow.automation.publishWorkflow.dispatchEvent, client_payload: { tag } })}\n`,
  })
  return { releaseCommitSha, operations }
}

export function executeAutomaticRelease({ json = false, noWait = false, maxWaitMs = 45 * 60 * 1000 } = {}) {
  const workflow = loadReleaseWorkflow()
  const deadline = Date.now() + maxWaitMs
  releaseDeadline = noWait ? null : deadline // 內層 watch 迴圈共用同一個期限
  const dispatchedConsumers = new Set()        // 只擋重複派工
  const openedConsumerPullRequests = new Set() // 只擋重複開 PR —— 與上面是**兩件事**
  for (;;) {
    invariant(noWait || Date.now() <= deadline, 'release:auto did not converge within 45 minutes; live state is preserved and the command is safe to rerun')
    const observation = collectLiveObservation(workflow)
    const report = printReport(workflow, observation, json)
    const incomplete = report.steps.find(step => step.status !== 'complete')
    if (!incomplete) return report

    if (incomplete.id === 'pr-checks') {
      if (!observation.pullRequest) {
        run('git', buildBranchPushArgs(workflow, observation.branch))
        gh(buildPullRequestCreateArgs(workflow, observation.branch))
        continue
      }
      if (observation.pullRequest.headRefOid !== observation.headSha) {
        run('git', buildBranchPushArgs(workflow, observation.branch))
        continue
      }
      invariant(incomplete.status !== 'failed', `PR #${observation.pullRequest.number} has failed checks; remediate the same PR and rerun release:auto`)
      if (noWait) return report
      if (observation.pullRequest.requiredChecks.length === 0) {
        sleep(2000)
        continue
      }
      gh(['pr', 'checks', `${observation.pullRequest.number}`, '--repo', observation.repository, '--required', '--watch', '--interval', '10'])
      continue
    }

    if (incomplete.id === 'merge') {
      invariant(observation.pullRequest, 'merge readback is incomplete and no current-branch PR was found')
      if (incomplete.status === 'awaiting-consent') {
        // 預覽階段:PR + Netlify deploy preview 已就緒,等 user 看過後在對話說「發版」(hook 自動記 receipt,
        // 或 `npm run release:consent -- --quote "<user 原話>"`)。不合併、不發布。
        const urls = previewUrls(workflow, observation)
        console.log(JSON.stringify({
          status: 'AWAITING_USER_RELEASE_CONSENT',
          pullRequest: observation.pullRequest.url || `https://github.com/${observation.repository}/pull/${observation.pullRequest.number}`,
          headSha: observation.pullRequest.headRefOid,
          preview: urls,
          resume: 'user 在對話說「發版」→ receipt 自動落地 → npm run release:auto',
        }, null, 2))
        return report
      }
      gh([
        'pr', 'merge', `${observation.pullRequest.number}`, '--repo', observation.repository,
        '--squash', '--delete-branch', '--match-head-commit', observation.pullRequest.headRefOid,
      ])
      continue
    }

    if (incomplete.id === 'publish') {
      invariant(incomplete.status !== 'failed', `published GitHub Release ${observation.tag} is not immutable`)
      // 一份授權 = 一次 final release。第二次必須有 incident 證據,否則停下來要求批次做完再發。
      // 這一行就是先前缺的「執行面呼叫」—— 沒有它,canonical 的「最多一次」只是紙上的字。
      const alreadyReleased = consentReleaseLedger().filter(v => v !== observation.version)
      if (alreadyReleased.length) {
        authorizeDeepAuditPublish(workflow, {
          completedFinalReleases: alreadyReleased.length,
          incident: releaseIncidentFromEnv(),
          priorAdditionalReleaseIncidentIds: [],
        })
      }
      if (incomplete.status === 'running') {
        if (noWait) return report
        watchRun(observation.repository, observation.publishRun)
        continue
      }
      ensureImmutableReleases(observation.repository)
      const previousRunId = observation.publishRun?.databaseId || null
      const publishPlan = buildPublishMutationPlan(workflow, {
        tag: observation.tag,
        protectedMainSha: observation.protectedMainSha,
        existingTagSha: observation.tagCommitSha,
      })
      for (const operation of publishPlan.operations) gh(operation.args, { input: operation.input })
      // mutation 一送出就記帳:帶 --no-wait 時下面的 watchRun 不會執行,若等到那之後才記,
      // 版本已經發出去但帳本永遠是空的 = 閘永遠不會紅(2026-09-20 稽核 blocker)。
      recordConsentRelease(observation.version)
      if (noWait) return report
      watchRun(observation.repository, waitForRun(
        observation.repository,
        workflow.automation.publishWorkflow.file,
        publishPlan.releaseCommitSha,
        previousRunId,
      ))
      continue
    }

    if (incomplete.id === 'readback') {
      if (noWait) return report
      sleep(5000)
      continue
    }

    for (const target of observation.consumers.filter(item => !item.exactVersion || item.checkReadback?.trusted !== true)) {
      invariant(
        !(target.exactVersion && target.checkReadback?.trusted !== true),
        `consumer ${target.repository} has the exact package version but lacks trusted release-check provenance: ${target.checkReadback?.reason || 'unknown reason'}`,
      )
      if (target.pullRequest) {
        if (target.pullRequest.state === 'MERGED') {
          invariant(
            target.checkReadback?.trusted === true,
            `merged consumer PR lacks trusted release-check provenance: ${target.pullRequest.url}: ${target.checkReadback?.reason || 'unknown reason'}`,
          )
          continue
        }
        const checks = checkRollupStatus(target.pullRequest.requiredChecks)
        invariant(checks !== 'failed', `consumer PR failed checks: ${target.pullRequest.url}`)
        if (checks === 'pending') {
          if (!noWait) gh(['pr', 'checks', `${target.pullRequest.number}`, '--repo', target.repository, '--required', '--watch', '--interval', '10'])
          continue
        }
        invariant(
          target.checkReadback?.trusted === true,
          `consumer PR check provenance differs from SSOT: ${target.pullRequest.url}: ${target.checkReadback?.reason || 'unknown reason'}`,
        )
        gh([
          'pr', 'merge', `${target.pullRequest.number}`, '--repo', target.repository,
          '--squash', '--delete-branch', '--match-head-commit', target.pullRequest.headRefOid,
        ])
      } else {
        // 分支還沒被 sync workflow 推上來 → 先派工;已經推上來但還沒有 PR → 由本地 canonical
        // credential 開 PR(見 buildConsumerPullRequestCreateArgs 的註解:consumer workflow 用
        // 自家 GITHUB_TOKEN 開的 PR,GitHub 不讓它的 workflow 跑,出處鏈結構上湊不齊)。
        // 判斷本身在 consumerStepAction(純函式,判定表驗得到);這裡只負責執行。
        const action = consumerStepAction({
          delivery: target.delivery,
          branchExists: consumerAutomationBranchExists(target, observation.version),
          dispatched: dispatchedConsumers.has(target.repository),
          pullRequestOpened: openedConsumerPullRequests.has(target.repository),
        })
        if (action === 'create-pr') {
          gh(buildConsumerPullRequestCreateArgs(target, {
            version: observation.version,
            commit: observation.releaseCommitSha,
          }).args)
          openedConsumerPullRequests.add(target.repository)
        } else if (action === 'dispatch') {
          dispatchConsumer(target, {
            version: observation.version,
            tag: observation.tag,
            commit: observation.releaseCommitSha,
          })
          dispatchedConsumers.add(target.repository)
        }
      }
    }
    if (noWait) return report
    sleep(5000)
  }
}

function parseCli(argv) {
  const [command, ...flags] = argv
  invariant(['auto', 'status', 'consent', 'withdraw'].includes(command), 'Usage: release-orchestrator.mjs <auto|status|consent --quote "<user verbatim>"|withdraw> [--json] [--no-wait]')
  if (command === 'consent') {
    const index = flags.indexOf('--quote')
    invariant(index >= 0 && flags[index + 1], 'consent needs --quote "<user verbatim>"')
    return { command, quote: flags[index + 1] }
  }
  if (command === 'withdraw') return { command }
  invariant(flags.every(flag => flag === '--json' || flag === '--no-wait'), 'unsupported release orchestrator option')
  invariant(command === 'auto' || !flags.includes('--no-wait'), '--no-wait is only valid with auto')
  return { command, json: flags.includes('--json'), noWait: flags.includes('--no-wait') }
}

function main() {
  try {
    const options = parseCli(process.argv.slice(2))
    if (options.command === 'status') {
      const workflow = loadReleaseWorkflow()
      printReport(workflow, collectLiveObservation(workflow), options.json)
    } else if (options.command === 'withdraw') {
      const removed = withdrawReleaseConsent({
        branch: run('git', ['branch', '--show-current'], { allowFailure: true }).stdout,
        headSha: run('git', ['rev-parse', 'HEAD^{commit}'], { allowFailure: true }).stdout,
      })
      console.log(JSON.stringify({ status: removed ? 'RELEASE_CONSENT_WITHDRAWN' : 'NO_RELEASE_CONSENT' }, null, 2))
    } else if (options.command === 'consent') {
      const branch = run('git', ['branch', '--show-current']).stdout
      const headSha = run('git', ['rev-parse', 'HEAD^{commit}']).stdout
      const receipt = writeReleaseConsent({ headSha, branch, quote: options.quote, source: 'manual' })
      console.log(JSON.stringify({ status: 'RELEASE_CONSENT_RECORDED', ...receipt }, null, 2))
    } else {
      executeAutomaticRelease(options)
    }
  } catch (error) {
    if (error instanceof HumanBoundaryError) {
      console.error(JSON.stringify({ status: 'HUMAN_ONLY', boundary: error.boundary, action: error.message, resume: 'npm run release:auto' }, null, 2))
      process.exitCode = 3
      return
    }
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
