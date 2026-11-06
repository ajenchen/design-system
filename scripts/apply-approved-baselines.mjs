#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 只有 user 逐張說了「可以改」、而且 sha256 與 user 看到的那張完全相同的新圖,才會被寫進 curated/;
 *        沒被核准的、核准的不是這張的、審核後已提交基準或「拍的那棵樹的預覽內容」又變了的、歸因原因沒查出來的 —— 一張都不動
 *   紅: scripts/test-apply-approved-baselines.mjs 在隔離的 git 夾具裡逐面驗:不認得的檔名 / after sha256 對不上 / 審核包裡的圖被換過 /
 *       審核後已提交基準又變了 / 核准沒有變動的圖 / 原話是問句、否定或沒有「可以改」/ 時間沒有時區或在未來 / suspicious 沒寫原因 /
 *       拍完之後預覽看得見的檔又改了(已提交或工作區)/ 重複條目 / 一批裡混一筆壞的 → 全部拒絕(exit 1)且 curated/ 一個位元組都不動
 *   綠: 合格核准只換被核准的那幾張、寫完逐張讀回 sha256 相等、未核准的圖位元組不變;--dry-run 什麼都不寫;
 *       判定只比 sha256 與 git 樹,不碰網路、不依機器速度,重跑結果相同(meta-test 的「合格 → 只換兩張」面)
 *
 * 把 user 逐張核准過的重拍圖套進 curated 基準(2026-10-14,待辦總帳 R3)。
 *
 * AGENTS.md「Visual baseline」:user 對 exact image set 說「可以改」即拍板,agent 自動套用,禁再要求核准或簽章。
 * 所以這支不是另一道人關,而是保證「套進去的就是 user 看到並說可以改的那張」—— 核准綁**圖的內容**(sha256),
 * 不綁 run、不綁 commit:同一張圖換一次 run 重拍、位元組相同,核准仍然成立;位元組變了就不是 user 看過的那張。
 * (packages/design-system/tools/visual-baseline/ 是另一條路:要求已啟用的 ed25519 簽章審查政策,只在 user 明確要求
 *  獨立加密審查時才用 —— infra/governance/visual-baseline-review-policy.json 目前 not-activated,標準流程不走它。)
 *
 * 輸入:
 *   --package <dir>    Visual Regression 上傳的 artifact `visual-baselines-recaptured` 解壓後的目錄
 *                      (版面見 scripts/visual-baseline-review-package.mjs 檔頭;manifest.json 在根目錄)
 *   --approvals <file> 核准清單(JSON):
 *     { "schemaVersion": 1, "kind": "visual-baseline-approvals", "approvals": [
 *       { "file": "rating-in-field.png",
 *         "reviewedAfterSha256": "<user 看到的新圖 sha256,取自 manifest / 確認頁>",
 *         "reviewedBeforeSha256": "<同頁顯示的舊圖 sha256;新增場景為 null>",
 *         "userVerbatim": "<user 原話,逐字,不刪語氣詞(M36)>",
 *         "approvedAt": "2026-10-14T21:40:00+08:00",
 *         "attributionCause": "<只有歸因判 suspicious / unmapped 時必填:查出來的原因與 commit>" } ] }
 *   --dry-run          只驗證、印出會換哪幾張,不寫任何檔
 *
 * 拒絕的條件(任一筆不合格 → 整批不寫,印出全部問題):
 *   · 檔名不在審核包、或狀態不是 changed / added(沒有變動就沒有東西可核准)、或同一張出現兩次
 *   · reviewedAfterSha256 ≠ manifest 的 afterSha256,或審核包裡的 new/ 與 changes/ 那張位元組對不上 manifest(包被換過)
 *   · reviewedBeforeSha256 ≠ manifest 的 beforeSha256,或 repo 裡現在的基準 ≠ 那張(審核之後基準被改過,user 看的前後對照已失效)
 *   · userVerbatim 沒有一處肯定的「可以改」(問句「可以改嗎?」、否定「不可以改」不算 —— M36:問句 ≠ 同意);
 *     一句話核准多張、否定其他張時,只要有一處肯定即可,哪張對哪句是呼叫端的責任,原話整句留在收據裡備查
 *   · approvedAt 不是帶時區的 ISO,或在未來
 *   · 歸因判 suspicious / unmapped 卻沒有 attributionCause;判 dimension-mismatch / missing-new(量不到)一律拒絕
 *   · 拍照那個 commit 到現在的 HEAD(與工作區)之間,決定畫面的檔有變 —— 這批圖已經不代表現在的產品,要重拍:
 *     預覽看得見的檔(release-orchestrator.mjs 的 PRODUCT_VISIBLE)、scripts/visual-assertions.json、package-lock.json
 *     (playwright / pngjs / pixelmatch / axe 與整個建置的依賴版本),以及截圖程式本身 —— scripts/visual-audit.mjs 與它
 *     遞移 import 的每一支 scripts/lib/*.mjs(從拍照那個 commit 的原始碼機械算出,不手抄;見 captureProgramClosure)
 *
 * 套用後:逐張讀回 sha256;收據寫到 .git/governance-runtime/evidence/visual/baseline-apply/(含原話、時間、前後 sha256、來源 run)。
 * 收據與 CLI 把這次沒套用的可核准圖分兩類:repo 裡現在的基準已經就是那張新圖 → 「已套用」(先前那次套用的);其餘 → 「未核准」。
 * 不 commit、不 push —— 那是呼叫端的事。
 *
 * 用法:node scripts/apply-approved-baselines.mjs --package <dir> --approvals <file> [--dry-run]
 */
import { readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { runClosedGit } from '../packages/governance/src/closed-tool-execution.mjs'
import { prepareVisualBaselineFile, resolveVisualBaselinePath } from './lib/governance-visual-baselines.mjs'
import { prepareRuntimeEvidenceFile } from './lib/governance-runtime-evidence.mjs'
import { PRODUCT_VISIBLE } from './release-orchestrator.mjs'
import {
  APPROVABLE_STATUSES,
  BLOCKING_VERDICTS,
  NEEDS_CAUSE_VERDICTS,
  REVIEW_PACKAGE_KIND,
  REVIEW_PACKAGE_SCHEMA_VERSION,
  reviewStem,
  sha256,
} from './visual-baseline-review-package.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const APPROVALS_KIND = 'visual-baseline-approvals'
export const APPROVAL_PHRASE = '可以改' // AGENTS.md「Visual baseline」與待辦總帳 R3 的拍板用語,不另訂
const ENTRY_REQUIRED = Object.freeze(['approvedAt', 'file', 'reviewedAfterSha256', 'reviewedBeforeSha256', 'userVerbatim'])
const ENTRY_OPTIONAL = Object.freeze(['attributionCause'])
const SHA256 = /^[0-9a-f]{64}$/
const FULL_SHA = /^[0-9a-f]{40}$/
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000
/**
 * 拍出來的圖由哪些檔決定(固定的那一半):預覽看得見的產品內容(SSOT = PRODUCT_VISIBLE)+ 場景清單 + 依賴版本
 *(package-lock.json:playwright / pngjs / pixelmatch / axe 與建置鏈)。渲染器本身由容器映像釘死(tag 等於 lock 的 playwright
 * 版本,ci-workflow-scope 斷言)。另一半 —— 截圖程式 —— 不是固定清單,見 captureProgramClosure。
 */
export const CAPTURE_INPUTS = Object.freeze([
  ...PRODUCT_VISIBLE,
  /^scripts\/visual-assertions\.json$/,
  /^package-lock\.json$/,
])
/** 截圖程式的進入點;它遞移 import 的 scripts/lib/*.mjs 全部算截圖程式。 */
export const CAPTURE_PROGRAM_ENTRY = 'scripts/visual-audit.mjs'
const CAPTURE_PROGRAM_LIB = /^scripts\/lib\/.+\.mjs$/
const RELATIVE_IMPORT = [
  /\bfrom\s*(['"])(\.\.?\/[^'"]+)\1/g, //          import … from './x' / export … from './x'(多行 import 的結尾也是這個形狀)
  /\bimport\s*\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/g, // import('./x')
  /\bimport\s*(['"])(\.\.?\/[^'"]+)\1/g, //          import './x'(只為副作用)
]

/**
 * 截圖程式 = visual-audit.mjs + 它遞移 import 的每一支 scripts/lib/*.mjs,**從原始碼機械算出**,不手抄清單。
 * 2026-10-14 的教訓:手抄的清單只有 visual-audit.mjs 與 lib/visual-audit-*.mjs,漏了 lib/launch-browser.mjs(openStory:
 * 靜止格數、字型等待、滑鼠移開 —— 直接決定拍到什麼)、storybook-render-health / a11y-static-server 等,拍完改它們照樣放行。
 * 邊界:只沿著 scripts/lib/ 裡的檔往下走;scripts/lib/closed-tool-execution.mjs 轉出的 packages/governance(封閉 git 執行)
 * 不決定像素,不算。npm 依賴由 package-lock.json 涵蓋(CAPTURE_INPUTS)。
 * 註解裡的 from './x' 也會被算進去 —— 寧可多擋(要重拍),不可少擋。
 * readFile(path) → 檔案內容字串,或 null(該 commit 沒有這個檔)。回傳 { files, missing }(都已排序)。
 */
export function captureProgramClosure(readFile) {
  const files = new Set()
  const missing = new Set()
  const queue = [CAPTURE_PROGRAM_ENTRY]
  while (queue.length) {
    const path = queue.shift()
    if (files.has(path) || missing.has(path)) continue
    const text = readFile(path)
    if (typeof text !== 'string') { missing.add(path); continue }
    files.add(path)
    for (const pattern of RELATIVE_IMPORT) {
      for (const match of text.matchAll(pattern)) {
        const target = posix.normalize(posix.join(posix.dirname(path), match[2]))
        if (CAPTURE_PROGRAM_LIB.test(target)) queue.push(target)
      }
    }
  }
  return { files: [...files].sort(), missing: [...missing].sort() }
}
const NEGATIONS = ['不', '沒', '别', '別', '勿', '莫']
const QUESTION_MARKS = ['?', '？', '嗎', '吗', '麼', '么', '呢']
const CLAUSE_END = /[,，。.;；!！\n、]/u

export class ApprovalRefused extends Error {
  constructor(errors) {
    super(`✗ 不套用:${errors.length} 個問題(整批不寫,curated/ 沒有任何變動)\n${errors.map((e) => `  · ${e}`).join('\n')}`)
    this.errors = errors
  }
}

/**
 * 原話裡有沒有一處**肯定**的「可以改」:同一子句、前三個字內沒有否定詞(不可以改 / 可不可以改 / 我不覺得可以改;
 * 「不錯,可以改」的「不」在前一個子句,不算),
 * 而且同一子句裡、它後面沒有問句標記(可以改嗎?/ 可以改了吧?)。
 * 只做這一件事:哪一句對哪一張圖是呼叫端的責任,原話整句寫進收據備查。
 */
export function affirmativeApproval(verbatim) {
  if (typeof verbatim !== 'string' || !verbatim.trim()) return { ok: false, reason: '原話是空的' }
  if (!verbatim.includes(APPROVAL_PHRASE)) return { ok: false, reason: `原話裡沒有「${APPROVAL_PHRASE}」` }
  const reasons = []
  for (let index = verbatim.indexOf(APPROVAL_PHRASE); index >= 0; index = verbatim.indexOf(APPROVAL_PHRASE, index + 1)) {
    // 否定只看同一子句:「不錯,可以改」的「不」在前一個子句,不是在否定這一句
    const before = verbatim.slice(Math.max(0, index - 3), index).split(CLAUSE_END).pop()
    const after = verbatim.slice(index + APPROVAL_PHRASE.length)
    const clause = after.split(CLAUSE_END)[0]
    if (NEGATIONS.some((mark) => before.includes(mark))) { reasons.push(`「${before}${APPROVAL_PHRASE}」是否定或 A-不-A 問句`); continue }
    if (QUESTION_MARKS.some((mark) => clause.includes(mark))) { reasons.push(`「${APPROVAL_PHRASE}${clause}」是問句`); continue }
    return { ok: true, reason: '有一處肯定的「可以改」' }
  }
  return { ok: false, reason: `沒有一處肯定的「${APPROVAL_PHRASE}」(${reasons.join(';')})—— 問句與否定不算核准(M36)` }
}

function git(repoRoot, args, { allowFailure = false, output = 'capture' } = {}) {
  const result = runClosedGit(args, { cwd: repoRoot, output, maxOutputBytes: 64 * 1024 * 1024, timeoutMs: 30_000 })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) throw new Error(`git ${args.join(' ')} 失敗(exit ${String(result.status)}):${String(result.stderr || '').trim().split('\n')[0]}`)
  return result
}

/**
 * 拍照那個 commit → 現在的 HEAD 與工作區,決定畫面的檔有沒有變。回傳變了的路徑(空 = 沒變);commit 不在本地 = 儀器問題。
 * 截圖程式的範圍從**拍照那個 commit** 的原始碼算(那一版才是拍照時真的載入的);之後若 visual-audit.mjs 多 import 一支新檔,
 * visual-audit.mjs 本身就變了,一樣會被擋。
 */
export function captureInputsChangedSince(repoRoot, commit) {
  const exists = git(repoRoot, ['cat-file', '-e', `${commit}^{commit}`], { allowFailure: true })
  if (exists.status !== 0) return { error: `拍照的 commit ${commit} 不在本地 repo(先 git fetch;讀不到不等於沒變)` }
  const program = captureProgramClosure((path) => {
    const shown = git(repoRoot, ['show', `${commit}:${path}`], { allowFailure: true })
    return shown.status === 0 ? String(shown.stdout) : null
  })
  if (program.missing.length) return { error: `拍照的 commit ${commit.slice(0, 12)} 裡,截圖程式 import 的檔讀不到:${program.missing.join(', ')}(判不了截圖程式有沒有變)` }
  const programFiles = new Set(program.files)
  const isCaptureInput = (path) => programFiles.has(path) || CAPTURE_INPUTS.some((re) => re.test(path))
  const committed = String(git(repoRoot, ['diff', '--name-only', '--no-renames', commit, 'HEAD', '--']).stdout).split('\n').map((line) => line.trim()).filter(Boolean)
  const status = String(git(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']).stdout)
  const dirty = status.split('\0').filter(Boolean).map((record) => record.slice(3))
  return { committed: committed.filter(isCaptureInput), dirty: [...new Set(dirty.filter(isCaptureInput))], programFiles: program.files }
}

function exactKeys(value, required, optional, label, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${label} 必須是物件`); return false }
  const keys = Object.keys(value)
  const unknown = keys.filter((key) => !required.includes(key) && !optional.includes(key))
  const missing = required.filter((key) => !keys.includes(key))
  if (unknown.length) errors.push(`${label} 有不認得的欄位:${unknown.join(', ')}`)
  if (missing.length) errors.push(`${label} 缺欄位:${missing.join(', ')}`)
  return !unknown.length && !missing.length
}

function readJson(path, label) {
  if (!existsSync(path)) throw new ApprovalRefused([`${label} 不在:${path}`])
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch (error) { throw new ApprovalRefused([`${label} 不是合法 JSON:${error.message}`]) }
}

function currentBaselineSha(repoRoot, file) {
  const path = resolveVisualBaselinePath({ repoRoot, collection: 'curated', childPath: file })
  return existsSync(path) ? sha256(readFileSync(path)) : null
}

/** 全部驗完才決定;回傳要寫的計畫。任一問題 → ApprovalRefused(列出全部問題)。 */
export function planApprovedBaselines({ repoRoot, packageDir, approvals, now = new Date() }) {
  const errors = []
  const manifest = readJson(join(packageDir, 'manifest.json'), '審核包 manifest.json')
  if (manifest.kind !== REVIEW_PACKAGE_KIND || manifest.schemaVersion !== REVIEW_PACKAGE_SCHEMA_VERSION || !Array.isArray(manifest.images)) {
    throw new ApprovalRefused([`不是審核包的 manifest(kind=${manifest.kind} schemaVersion=${manifest.schemaVersion})`])
  }
  const commit = manifest.source?.commit
  if (!FULL_SHA.test(commit || '')) throw new ApprovalRefused([`manifest 沒有拍照 commit 的完整 40 碼 SHA(source.commit=${commit})`])
  const imagesByFile = new Map(manifest.images.map((image) => [image.file, image]))

  if (!exactKeys(approvals, ['approvals', 'kind', 'schemaVersion'], [], '核准清單', errors)) throw new ApprovalRefused(errors)
  if (approvals.kind !== APPROVALS_KIND || approvals.schemaVersion !== 1) errors.push(`核准清單 kind 必須是 ${APPROVALS_KIND}、schemaVersion 1`)
  if (!Array.isArray(approvals.approvals) || approvals.approvals.length === 0) {
    errors.push('核准清單是空的 —— 沒有任何一張被核准就沒有東西可套用(0 筆不是「全部通過」)')
    throw new ApprovalRefused(errors)
  }

  const plan = []
  const seen = new Set()
  approvals.approvals.forEach((entry, index) => {
    const label = `第 ${index + 1} 筆(${entry?.file ?? '?'})`
    if (!exactKeys(entry, ENTRY_REQUIRED, ENTRY_OPTIONAL, label, errors)) return
    const { file } = entry
    if (seen.has(file)) { errors.push(`${label}:同一張圖出現兩次`); return }
    seen.add(file)
    const image = imagesByFile.get(file)
    if (!image) { errors.push(`${label}:審核包裡沒有這張圖(不認得的檔名一律拒絕)`); return }
    if (!APPROVABLE_STATUSES.includes(image.status)) { errors.push(`${label}:這張相對已提交基準是 ${image.status},沒有東西可核准`); return }
    if (!SHA256.test(entry.reviewedAfterSha256 || '')) { errors.push(`${label}:reviewedAfterSha256 必須是 64 碼 sha256`); return }
    if (entry.reviewedAfterSha256 !== image.afterSha256) {
      errors.push(`${label}:user 看到的新圖 ${entry.reviewedAfterSha256.slice(0, 12)}… ≠ 審核包這張 ${image.afterSha256.slice(0, 12)}…(核准綁的是 user 看到的那張)`)
      return
    }
    const expectedBefore = image.beforeSha256 ?? null
    if (entry.reviewedBeforeSha256 !== expectedBefore) {
      errors.push(`${label}:user 看到的舊圖 ${String(entry.reviewedBeforeSha256).slice(0, 12)} ≠ 審核包的舊圖 ${String(expectedBefore).slice(0, 12)}`)
      return
    }
    const approval = affirmativeApproval(entry.userVerbatim)
    if (!approval.ok) errors.push(`${label}:${approval.reason}`)
    if (typeof entry.approvedAt !== 'string' || !ISO_WITH_ZONE.test(entry.approvedAt) || !Number.isFinite(Date.parse(entry.approvedAt))) {
      errors.push(`${label}:approvedAt 必須是帶時區的 ISO 時間`)
    } else if (Date.parse(entry.approvedAt) > now.getTime() + FUTURE_TOLERANCE_MS) {
      errors.push(`${label}:approvedAt ${entry.approvedAt} 在未來`)
    }
    const verdict = image.attribution?.verdict
    if (!verdict) errors.push(`${label}:審核包沒有這張的歸因結論`)
    else if (BLOCKING_VERDICTS.includes(verdict) && !NEEDS_CAUSE_VERDICTS.includes(verdict)) {
      errors.push(`${label}:歸因判 ${verdict}(量不到),不能接受 —— 先修儀器重拍`)
    } else if (NEEDS_CAUSE_VERDICTS.includes(verdict)) {
      const cause = entry.attributionCause
      if (typeof cause !== 'string' || cause.trim().length < 8) errors.push(`${label}:歸因判 ${verdict}(元件原始碼沒改卻變了 / 對不到元件),attributionCause 必須寫出查到的原因與 commit`)
    }
    // 審核包本身:new/ 與 changes/ 那張必須就是 manifest 寫的那張(包在下載後被換過 → 拒絕)
    const newPath = join(packageDir, 'new', file)
    const afterPath = join(packageDir, 'changes', reviewStem(file), 'after.png')
    if (!existsSync(newPath) || !existsSync(afterPath)) { errors.push(`${label}:審核包缺 new/${file} 或 changes/${reviewStem(file)}/after.png`); return }
    const bytes = readFileSync(newPath)
    if (sha256(bytes) !== image.afterSha256 || sha256(readFileSync(afterPath)) !== image.afterSha256) {
      errors.push(`${label}:審核包裡的圖與 manifest 的 sha256 對不上(下載後被換過或損毀)`)
      return
    }
    try { PNG.sync.read(bytes) } catch (error) { errors.push(`${label}:新圖解不開(${error.message})`); return }
    // repo 裡現在的基準必須還是 user 看到的那張舊圖
    let current
    try { current = currentBaselineSha(repoRoot, file) } catch (error) { errors.push(`${label}:${error.message}`); return }
    if (current !== expectedBefore) {
      errors.push(current === image.afterSha256
        ? `${label}:這張已經套用過了(repo 裡現在的基準就是這張新圖),不用再核准`
        : `${label}:repo 裡現在的基準 ${String(current).slice(0, 12)} ≠ user 看到的舊圖 ${String(expectedBefore).slice(0, 12)}(審核之後被改過,前後對照已失效)`)
      return
    }
    plan.push({ file, bytes, image, entry })
  })

  const changed = captureInputsChangedSince(repoRoot, commit)
  if (changed.error) errors.push(changed.error)
  else {
    if (changed.committed.length) errors.push(`拍照的 commit ${commit.slice(0, 12)} 之後,決定畫面的檔已提交了變動(這批圖不代表現在的產品,要重拍):${changed.committed.join(', ')}`)
    if (changed.dirty.length) errors.push(`工作區有未提交、會改變畫面的檔(先提交或還原再套用):${changed.dirty.join(', ')}`)
  }
  if (errors.length) throw new ApprovalRefused(errors)
  return { manifest, plan }
}

/**
 * 這次沒套用的可核准圖(changed / added)分兩類 —— 不能用「不在這次計畫裡」一概當成沒核准:
 *   alreadyApplied:repo 裡現在的基準已經就是審核包那張新圖(先前那次套用的)
 *   notApproved:   其餘(還是舊圖,或檔不在)—— 保持原樣,等 user
 */
export function classifyUnplanned({ repoRoot, manifest, plan }) {
  const planned = new Set(plan.map((item) => item.file))
  const alreadyApplied = []
  const notApproved = []
  for (const image of manifest.images) {
    if (!APPROVABLE_STATUSES.includes(image.status) || planned.has(image.file)) continue
    let current = null
    try { current = currentBaselineSha(repoRoot, image.file) } catch { current = null }
    ;(current === image.afterSha256 ? alreadyApplied : notApproved).push(image.file)
  }
  return { alreadyApplied, notApproved }
}

/** 驗完才寫;寫完逐張讀回。dryRun 只回傳計畫。 */
export function applyApprovedBaselines({ repoRoot = ROOT, packageDir, approvals, dryRun = false, now = new Date() }) {
  const { manifest, plan } = planApprovedBaselines({ repoRoot, packageDir, approvals, now })
  if (dryRun) return { dryRun: true, manifest, plan, receiptPath: null }
  const written = []
  for (const item of plan) {
    const target = prepareVisualBaselineFile({ repoRoot, collection: 'curated', childPath: item.file })
    writeFileSync(target, item.bytes)
    written.push({ item, target })
  }
  const mismatched = written.filter(({ item, target }) => sha256(readFileSync(target)) !== item.image.afterSha256).map(({ item }) => item.file)
  if (mismatched.length) throw new Error(`✗ 寫入後讀回的 sha256 不對:${mismatched.join(', ')}(用 git checkout -- 還原 curated/ 再查)`)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const receiptPath = prepareRuntimeEvidenceFile({ repoRoot, relativePath: `visual/baseline-apply/receipt-${stamp}.json` })
  const receipt = {
    schemaVersion: 1,
    kind: 'visual-baseline-apply-receipt',
    appliedAt: now.toISOString(),
    package: { manifestSha256: sha256(readFileSync(join(packageDir, 'manifest.json'))), source: manifest.source },
    applied: plan.map(({ file, image, entry }) => ({
      file,
      beforeSha256: image.beforeSha256 ?? null,
      afterSha256: image.afterSha256,
      status: image.status,
      attributionVerdict: image.attribution?.verdict ?? null,
      attributionCause: entry.attributionCause ?? null,
      userVerbatim: entry.userVerbatim,
      approvedAt: entry.approvedAt,
    })),
    ...classifyUnplanned({ repoRoot, manifest, plan }),
  }
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  return { dryRun: false, manifest, plan, receiptPath, receipt }
}

function main(argv) {
  const valueOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null }
  const packageArg = valueOf('--package')
  const approvalsArg = valueOf('--approvals')
  if (!packageArg || !approvalsArg) { console.error('用法:--package <審核包目錄> --approvals <核准清單.json> [--dry-run]'); return 2 }
  const packageDir = resolve(packageArg)
  const approvals = readJson(resolve(approvalsArg), '核准清單')
  const result = applyApprovedBaselines({ repoRoot: ROOT, packageDir, approvals, dryRun: argv.includes('--dry-run') })
  const verb = result.dryRun ? '會換' : '已換'
  console.log(`✓ ${verb} ${result.plan.length} 張(拍照 commit ${result.manifest.source.commit.slice(0, 12)},run ${result.manifest.source.runId ?? '?'}):`)
  for (const { file, image, entry } of result.plan) {
    console.log(`  ${file}  ${String(image.beforeSha256 ?? '(新增)').slice(0, 12)} → ${image.afterSha256.slice(0, 12)}  「${entry.userVerbatim}」${entry.approvedAt}`)
  }
  const { alreadyApplied, notApproved } = classifyUnplanned({ repoRoot: ROOT, manifest: result.manifest, plan: result.plan })
  if (alreadyApplied.length) console.log(`  先前已套用(repo 裡已是這張新圖):${alreadyApplied.join(', ')}`)
  if (notApproved.length) console.log(`  沒被核准、保持原樣:${notApproved.join(', ')}`)
  if (result.receiptPath) console.log(`  收據:${result.receiptPath}`)
  return 0
}

// 比 realpath 不比字面路徑:經 symlink 呼叫時字面不等,CLI 會靜默不跑、結束碼 0(假綠)
const invokedDirectly = (() => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (invokedDirectly) {
  try { process.exitCode = main(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
