#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Visual Regression 的 push 觸發只在「請求檔還在、形狀合格、而且 branch 欄就是這次被推上去的分支」時重拍;
 *        重拍時只以「明確的 JSON 布林 + 留空 / 完整 40 碼 SHA / release tag」兩個值寫進 GITHUB_ENV(UPDATE_BASELINE /
 *        REFERENCE_REF)。請求檔已刪、或寫的是別條分支 → 閘輸出 rebake=false、結束碼 0(略過,不紅);其他形狀一律拒絕、一行都不寫
 *   紅: --selftest 逐面餵壞形狀(多一個鍵 / 少一個鍵 / 缺 branch / branch 是 main、refs/heads/…、帶空白或 .. / update_baseline
 *       寫成字串 "true" / reference_ref 短 SHA / 分支名 / 帶換行 / reason 空白 / requestedAt 不是帶時區的 ISO / main 分支),
 *       任一面被放行就 throw;閘的兩面(分支不符 / 已刪除 → 略過;形狀不合格 / 在 main → 紅)任一面判錯就 throw;正式跑時不合格
 *       → 指名哪一欄、exit 1、GITHUB_ENV / GITHUB_OUTPUT 不寫
 *   綠: 合格請求只寫兩行、值逐字等於請求(selftest 驗三種合格形狀:留空 / 40 碼 / release tag);閘對「分支相符」輸出
 *       rebake=true;純函式,不讀時間、不碰網路,同一個檔重跑輸出逐位元組相同
 *
 * 視覺基準「PR 分支自己重拍」的請求檔(2026-10-14,待辦總帳 R3)。
 *
 * 為什麼要有這條路:Visual Regression 原本只有三種觸發 —— 按鈕(治理 token 沒有 actions:write → 403)、
 * repository_dispatch(**永遠拿預設分支的 workflow 檔跑**)、排程。main 那份 workflow 的「Resolve reference ref」
 * 在合併前是壞的(SM7,只在 PR 分支修好),所以合併前沒有任何路徑能重拍;而 R3 的圖組偏偏要在合併前讓 user 逐張
 * 說「可以改」。push 事件用的是**被推上去那個 commit 自己的** workflow 檔 —— 於是在非 main 分支上,改動這個請求檔
 * 並推上去,就會用該分支自己的 workflow 在釘死的容器裡重拍。
 *
 * 「這次推送改到請求檔」**不是**「這是給這條分支的重拍請求」(M37):請求檔若留在 main,之後任何建在合併前的分支一合併
 * 或 rebase main 再推,那次推送的差異裡就有它;GitHub 對超過 1,000 個 commit 或差異逾時的推送一律觸發,不看 paths。
 * 所以 push 觸發只是「可能有請求」,真正的判定在輕量 job `rebake-gate`(本檔 --gate):請求檔寫明 branch,
 * 必須等於這次推送的分支(GITHUB_REF_NAME)才重拍;檔案已刪 / 分支不符 = 略過、不紅;形狀不合格 = 紅。
 * 交接流程在合併前最後一個 commit 刪掉請求檔(閘略過),main 上不殘留。
 *
 * 請求檔(`infra/governance/baseline/visual/rebake-request.json`)欄位封閉:
 *   schemaVersion   1
 *   branch          要重拍的分支名(= 推送時的 GITHUB_REF_NAME,例 fix/undici-advisory-shape-2026-09-30)。
 *                   不收 main、不收 refs/ 開頭的完整 ref。從 `git branch --show-current` 取,不要手打(M32)
 *   update_baseline JSON 布林(true = 重拍 + 歸因 + 審核包;false = 只在容器裡比對)。字串 "true" 拒絕 —— 不用 truthy 猜
 *   reference_ref   ''(= job 內解析成 origin/main 上最近一次已發布的 release)/ 完整 40 碼 SHA / release tag(v0.1.0-beta.147)。
 *                   短 SHA 與分支名拒絕:短 SHA 是手打的識別字串(M32),分支名是會移動的代理(M37)
 *   reason          一行人話,為什麼要重拍(印在 log 與審核包 manifest)
 *   requestedAt     帶時區的 ISO 時間。每次請求換一個時間,請求檔內容才會變、推送才會觸發
 *
 * 只讀這個檔;要拍哪棵樹不在請求裡 —— push 事件拍的永遠是被推上去的那個 commit。
 *
 * 用法:
 *   node scripts/visual-rebake-request.mjs --gate --file <請求檔> --github-output "$GITHUB_OUTPUT"  (rebake-gate job,push 事件)
 *   node scripts/visual-rebake-request.mjs --file <請求檔> --github-env "$GITHUB_ENV"               (重拍 job,push 事件)
 *   node scripts/visual-rebake-request.mjs --check <請求檔> [--expect-branch <分支名>]               (只驗,不寫)
 *   node scripts/visual-rebake-request.mjs --selftest
 */
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const REBAKE_REQUEST_PATH = 'infra/governance/baseline/visual/rebake-request.json'
export const REBAKE_REQUEST_KEYS = Object.freeze(['branch', 'reason', 'reference_ref', 'requestedAt', 'schemaVersion', 'update_baseline'])
const FULL_SHA = /^[0-9a-f]{40}$/
const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/
const REASON_MAX = 300
const BRANCH_MAX = 200

/**
 * 分支名(短名,= GITHUB_REF_NAME)。只收 git 分支名的保守子集:英數與 . _ / -,不以 - / . 開頭,
 * 不含 .. 或 //,不以 / 或 .lock 或 . 結尾;不收 main(main 的基準只經 PR 合併換)、不收 refs/ 開頭的完整 ref。
 */
export function validBranchName(value) {
  return typeof value === 'string'
    && value.length > 0 && value.length <= BRANCH_MAX
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.includes('..') && !value.includes('//') && !value.includes('/.')
    && !/(?:\/|\.lock|\.)$/.test(value)
    && value !== 'main' && !value.startsWith('refs/')
}

/**
 * 純函式:請求檔文字 → { ok, request, env } 或 { ok:false, errors }。
 * env 只有 UPDATE_BASELINE('true' | 'false')與 REFERENCE_REF(原樣;'' = 預設路徑),值域在這裡封閉 ——
 * 不含換行、不含控制字元,寫進 GITHUB_ENV 不可能多長出別的變數。
 */
export function parseRebakeRequest(text) {
  let value
  try { value = JSON.parse(text) } catch (error) { return { ok: false, errors: [`不是合法 JSON:${error.message}`] } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['最外層必須是物件'] }
  const errors = []
  const keys = Object.keys(value).sort()
  const extra = keys.filter((key) => !REBAKE_REQUEST_KEYS.includes(key))
  const missing = REBAKE_REQUEST_KEYS.filter((key) => !keys.includes(key))
  if (extra.length) errors.push(`不認得的欄位:${extra.join(', ')}(欄位封閉:${REBAKE_REQUEST_KEYS.join(', ')})`)
  if (missing.length) errors.push(`缺欄位:${missing.join(', ')}`)
  if (value.schemaVersion !== 1) errors.push('schemaVersion 必須是 1')
  if ('branch' in value && !validBranchName(value.branch)) {
    errors.push('branch 必須是要重拍的分支短名(= 推送時的 GITHUB_REF_NAME,例 fix/x);不收 main、refs/ 開頭、空白、.. 或其他 git 不收的形狀')
  }
  if (typeof value.update_baseline !== 'boolean') errors.push('update_baseline 必須是 JSON 布林(true / false),字串不收')
  const ref = value.reference_ref
  if (typeof ref !== 'string' || (ref !== '' && !FULL_SHA.test(ref) && !RELEASE_TAG.test(ref))) {
    errors.push('reference_ref 只收:空字串(= 最近一次已發布的 release)/ 完整 40 碼小寫 SHA / release tag(例 v0.1.0-beta.147);短 SHA 與分支名不收')
  }
  const reason = value.reason
  if (typeof reason !== 'string' || reason.trim().length < 4 || reason.length > REASON_MAX || /\p{Cc}/u.test(reason)) {
    errors.push(`reason 必須是一行人話(4–${REASON_MAX} 字、不含換行或控制字元)`)
  }
  const at = value.requestedAt
  if (typeof at !== 'string' || !ISO_WITH_ZONE.test(at) || !Number.isFinite(Date.parse(at))) {
    errors.push('requestedAt 必須是帶時區的 ISO 時間(例 2026-10-14T21:30:00+08:00)')
  }
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    request: { schemaVersion: 1, branch: value.branch, update_baseline: value.update_baseline, reference_ref: ref, reason, requestedAt: at },
    env: { UPDATE_BASELINE: value.update_baseline ? 'true' : 'false', REFERENCE_REF: ref },
  }
}

/** GITHUB_ENV 的兩行(順序固定)。值域已由 parseRebakeRequest 封閉;這裡再擋一次換行,雙保險。 */
export function githubEnvLines(env) {
  const lines = ['UPDATE_BASELINE', 'REFERENCE_REF'].map((name) => {
    const value = env[name]
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error(`${name} 的值不得含換行`)
    return `${name}=${value}`
  })
  return `${lines.join('\n')}\n`
}

/** 讀檔 + 判定;檔案不在 = { ok:false, missing:true }(要不要紅由呼叫端決定:閘略過,重拍 job 紅)。 */
export function readRebakeRequest(path) {
  if (!existsSync(path)) {
    return { ok: false, missing: true, errors: [`請求檔不在:${path}(刪除不是重拍請求)`] }
  }
  return parseRebakeRequest(readFileSync(path, 'utf8'))
}

/** push 觸發已排除 main(branches-ignore);這裡是第二道:就算觸發條件被改壞,main 也不收重拍請求。 */
export function refuseMainRef(ref) {
  return ref === 'refs/heads/main' ? 'main 不收重拍請求(push 觸發只給非 main 分支;main 的基準只經 PR 合併換)' : null
}

/**
 * 推送端的分支(GITHUB_REF / GITHUB_REF_NAME)。只收分支推送;兩個值彼此對不上 = 儀器問題(不猜)。
 * 回傳 { ok, refName } 或 { ok:false, error }。
 */
export function pushedBranch({ ref, refName }) {
  const refused = refuseMainRef(ref)
  if (refused) return { ok: false, error: refused }
  if (typeof ref !== 'string' || !ref.startsWith('refs/heads/')) return { ok: false, error: `這次推送不是分支推送(GITHUB_REF=${ref || '(空)'})` }
  if (ref !== `refs/heads/${refName}`) return { ok: false, error: `GITHUB_REF=${ref} 與 GITHUB_REF_NAME=${refName || '(空)'} 對不上` }
  return { ok: true, refName }
}

/**
 * 閘(rebake-gate job)的判定,純函式:
 *   請求檔不在(已刪)→ 略過(rebake=false、不紅):刪除不是請求,而合併前刪掉它正是交接的最後一步
 *   形狀不合格 → 紅(不猜、不略過:壞的請求要被看見)
 *   branch ≠ 這次推送的分支 → 略過:別條分支留下的請求(合併 / rebase main 帶進來的)不是給這條分支的
 *   branch = 這次推送的分支 → 重拍
 * 回傳 { ok:true, rebake, reason, request? } 或 { ok:false, errors }。
 */
export function decideRebakeGate({ result, ref, refName }) {
  const pushed = pushedBranch({ ref, refName })
  if (!pushed.ok) return { ok: false, errors: [pushed.error] }
  if (result.missing) return { ok: true, rebake: false, reason: `請求檔不在(已刪除)—— 刪除不是重拍請求,略過` }
  if (!result.ok) return { ok: false, errors: result.errors }
  if (result.request.branch !== pushed.refName) {
    return { ok: true, rebake: false, reason: `請求寫的是 ${result.request.branch},這次推送的是 ${pushed.refName} —— 不是給這條分支的請求,略過`, request: result.request }
  }
  return { ok: true, rebake: true, reason: `請求寫的分支 = 這次推送的分支(${pushed.refName})`, request: result.request }
}

function selftest() {
  const good = { schemaVersion: 1, branch: 'fix/r3', update_baseline: true, reference_ref: '', reason: 'R3 圖組重拍,給 user 逐張看', requestedAt: '2026-10-14T21:30:00+08:00' }
  const text = (patch) => JSON.stringify({ ...good, ...patch })
  const accepted = [
    ['留空參考(預設路徑)', text({}), { UPDATE_BASELINE: 'true', REFERENCE_REF: '' }],
    ['完整 40 碼 SHA', text({ reference_ref: 'a9b68596a0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5' }), { UPDATE_BASELINE: 'true', REFERENCE_REF: 'a9b68596a0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5' }],
    ['release tag + 只比對', text({ update_baseline: false, reference_ref: 'v0.1.0-beta.147', requestedAt: '2026-10-14T13:30:00Z' }), { UPDATE_BASELINE: 'false', REFERENCE_REF: 'v0.1.0-beta.147' }],
  ]
  for (const [why, input, env] of accepted) {
    const got = parseRebakeRequest(input)
    if (!got.ok) throw new Error(`selftest:${why} 應放行,得到 ${got.errors.join(' / ')}`)
    if (JSON.stringify(got.env) !== JSON.stringify(env)) throw new Error(`selftest:${why} env 應為 ${JSON.stringify(env)},得到 ${JSON.stringify(got.env)}`)
    const lines = githubEnvLines(got.env)
    if (lines !== `UPDATE_BASELINE=${env.UPDATE_BASELINE}\nREFERENCE_REF=${env.REFERENCE_REF}\n`) throw new Error(`selftest:${why} GITHUB_ENV 兩行不對:${JSON.stringify(lines)}`)
  }
  const { reason: _omitReason, ...withoutReason } = good
  const { branch: _omitBranch, ...withoutBranch } = good
  const rejected = [
    ['多一個鍵(target_ref:push 拍的永遠是被推上去的 commit)', text({ target_ref: 'main' }), /不認得的欄位/],
    ['少一個鍵', JSON.stringify(withoutReason), /缺欄位:reason/],
    ['缺 branch(舊形狀的請求)', JSON.stringify(withoutBranch), /缺欄位:branch/],
    ['branch 是 main', text({ branch: 'main' }), /branch/],
    ['branch 寫成完整 ref', text({ branch: 'refs/heads/fix/r3' }), /branch/],
    ['branch 帶空白', text({ branch: 'fix r3' }), /branch/],
    ['branch 含 ..', text({ branch: 'fix/../main' }), /branch/],
    ['branch 帶換行', text({ branch: 'fix/r3\nUPDATE_BASELINE=true' }), /branch/],
    ['update_baseline 寫成字串', text({ update_baseline: 'true' }), /JSON 布林/],
    ['reference_ref 短 SHA', text({ reference_ref: 'a9b68596' }), /短 SHA/],
    ['reference_ref 分支名', text({ reference_ref: 'main' }), /reference_ref/],
    ['reference_ref 帶換行(會在 GITHUB_ENV 多長一個變數)', text({ reference_ref: 'v0.1.0\nUPDATE_BASELINE=true' }), /reference_ref/],
    ['reason 空白', text({ reason: '   ' }), /reason/],
    ['reason 帶換行', text({ reason: '第一行\n第二行' }), /reason/],
    ['requestedAt 沒有時區', text({ requestedAt: '2026-10-14T21:30:00' }), /requestedAt/],
    ['不是 JSON', '{"schemaVersion":1,', /合法 JSON/],
    ['最外層是陣列', '[]', /物件/],
  ]
  for (const [why, input, pattern] of rejected) {
    const got = parseRebakeRequest(input)
    if (got.ok) throw new Error(`selftest:${why} 應拒絕,卻放行了`)
    if (!pattern.test(got.errors.join(' / '))) throw new Error(`selftest:${why} 錯誤訊息沒指名:${got.errors.join(' / ')}`)
  }
  let threw = false
  try { githubEnvLines({ UPDATE_BASELINE: 'true', REFERENCE_REF: 'x\ny' }) } catch { threw = true }
  if (!threw) throw new Error('selftest:githubEnvLines 對帶換行的值應丟錯')
  if (refuseMainRef('refs/heads/main') === null) throw new Error('selftest:main 分支應拒絕')
  if (refuseMainRef('refs/heads/fix/x') !== null) throw new Error('selftest:非 main 分支應放行')
  const gone = readRebakeRequest('/nonexistent/rebake-request.json')
  if (gone.ok || !gone.missing) throw new Error('selftest:檔案不在應判 missing')
  // 閘:兩面(略過不紅 / 紅)+ 放行
  const on = { ref: 'refs/heads/fix/r3', refName: 'fix/r3' }
  const gate = (result, at = on) => decideRebakeGate({ result, ...at })
  const go = gate(parseRebakeRequest(text({})))
  if (!go.ok || go.rebake !== true) throw new Error(`selftest:閘對「分支相符」應重拍,得到 ${JSON.stringify(go)}`)
  for (const [why, got] of [
    ['分支不符(別條分支留下的請求)', gate(parseRebakeRequest(text({ branch: 'feat/other' })))],
    ['請求檔已刪除', gate(gone)],
  ]) {
    if (!got.ok || got.rebake !== false) throw new Error(`selftest:閘對「${why}」應略過(ok + rebake=false),得到 ${JSON.stringify(got)}`)
  }
  for (const [why, got, pattern] of [
    ['形狀不合格', gate(parseRebakeRequest(text({ update_baseline: 'true' }))), /JSON 布林/],
    ['形狀不合格且分支不符(不得因分支不符就吞掉壞請求)', gate(parseRebakeRequest(text({ branch: 'feat/other', reference_ref: 'a9b68596' }))), /短 SHA/],
    ['在 main', gate(parseRebakeRequest(text({})), { ref: 'refs/heads/main', refName: 'main' }), /main 不收/],
    ['GITHUB_REF 與 GITHUB_REF_NAME 對不上', gate(parseRebakeRequest(text({})), { ref: 'refs/heads/fix/r3', refName: 'fix/other' }), /對不上/],
    ['不是分支推送', gate(parseRebakeRequest(text({})), { ref: 'refs/tags/v1.0.0', refName: 'v1.0.0' }), /不是分支推送/],
  ]) {
    if (got.ok) throw new Error(`selftest:閘對「${why}」應紅,得到 ${JSON.stringify(got)}`)
    if (!pattern.test(got.errors.join(' / '))) throw new Error(`selftest:閘對「${why}」錯誤沒指名:${got.errors.join(' / ')}`)
  }
  console.log(`✓ visual-rebake-request selftest:合格 ${accepted.length} 形 / 拒絕 ${rejected.length} 形 / GITHUB_ENV 換行防線 / main 分支拒絕 / 檔案不在判 missing / 閘:相符 → 重拍、分支不符與已刪除 → 略過、形狀不合格與 main 與 ref 對不上 → 紅`)
}

function main(argv) {
  if (argv.includes('--selftest')) { selftest(); return 0 }
  const valueOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null }
  const checkPath = valueOf('--check')
  const file = checkPath ?? valueOf('--file')
  const githubEnv = valueOf('--github-env')
  const githubOutput = valueOf('--github-output')
  const gateMode = argv.includes('--gate')
  const usage = '用法:--gate --file <請求檔> --github-output <GITHUB_OUTPUT 路徑> | --file <請求檔> --github-env <GITHUB_ENV 路徑> | --check <請求檔> [--expect-branch <分支名>] | --selftest'
  if (!file || (gateMode && (!githubOutput || checkPath)) || (!gateMode && !checkPath && !githubEnv)) { console.error(usage); return 2 }
  const result = readRebakeRequest(file)

  if (gateMode) {
    const decision = decideRebakeGate({ result, ref: process.env.GITHUB_REF || '', refName: process.env.GITHUB_REF_NAME || '' })
    if (!decision.ok) {
      console.error(`✗ 重拍請求閘:不合格(${file}):`)
      for (const error of decision.errors) console.error(`  · ${error}`)
      return 1
    }
    appendFileSync(githubOutput, `rebake=${decision.rebake ? 'true' : 'false'}\n`)
    console.log(`${decision.rebake ? '→ 重拍' : '→ 略過(不紅)'}:${decision.reason}`)
    return 0
  }

  if (!result.ok) {
    console.error(`✗ 重拍請求不合格(${file}):`)
    for (const error of result.errors) console.error(`  · ${error}`)
    return 1
  }
  const { request, env } = result
  console.log(`重拍請求:branch=${request.branch} update_baseline=${request.update_baseline} reference_ref=${request.reference_ref || '(留空 = 最近一次已發布的 release)'}`)
  console.log(`  reason:${request.reason}`)
  console.log(`  requestedAt:${request.requestedAt}`)
  if (checkPath) {
    const expected = valueOf('--expect-branch')
    if (expected !== null && expected !== request.branch) {
      console.error(`✗ 請求寫的分支 ${request.branch} ≠ 預期 ${expected}(推上去閘會判「不是給這條分支的請求」而略過,不會重拍)`)
      return 1
    }
    return 0
  }
  // 重拍 job 只在閘判「重拍」之後才跑;這裡再驗一次(第二道),閘被改壞時不會拿別條分支的請求來重拍
  const decision = decideRebakeGate({ result, ref: process.env.GITHUB_REF || '', refName: process.env.GITHUB_REF_NAME || '' })
  if (!decision.ok || !decision.rebake) {
    console.error(`✗ 重拍請求不屬於這次推送:${decision.ok ? decision.reason : decision.errors.join(' / ')}(rebake-gate 應已略過這次推送)`)
    return 1
  }
  appendFileSync(githubEnv, githubEnvLines(env))
  console.log(`→ GITHUB_ENV:UPDATE_BASELINE=${env.UPDATE_BASELINE} REFERENCE_REF=${env.REFERENCE_REF}(蓋過 job env 的預設值;後面的步驟只讀 env)`)
  return 0
}

// 比 realpath 不比字面路徑:經 symlink 呼叫時字面不等,CLI 會靜默不跑、結束碼 0(假綠)
const invokedDirectly = (() => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (invokedDirectly) {
  try { process.exitCode = main(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
