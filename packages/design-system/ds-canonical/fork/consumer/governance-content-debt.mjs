#!/usr/bin/env node
// 產品內容欠債基準(governance/content-debt-baseline.json)的唯一寫入口。
//
// 2026-11-26(產品 canary 回報缺陷 2):全新副本跑 setup:all 停在 52 條既有的內容欠債(GOV-CONTENT-001),
// 產品要先在沒有環境的情況下清完欠債才能有環境 = 自鎖。改成:產品把既有欠債登記進基準,檢查只擋
// 基準外的違規(新檔案、新規則 / hook、hook 新報出的發現行),基準只准縮小(棘輪)。
//
// 判定全部在 governance-check.mjs(同一支 checker、同一份基準;setup:all、governance:check、CI 都跑它):
// 本檔只用 `--content-debt-proposal` 向 checker 要「下一版基準」或逐筆清單,checker 維持唯讀,本檔負責寫檔。
//
//   --list                          逐筆列出已登記 / 未登記 / 已修好待移除的內容發現(不寫檔);checker 完整
//                                   重播,未登記那份 = --record 會登記的同一個集合(沒有基準時也一樣)
//   --prune                         把已經不存在的條目從基準移除(只會變小,不需登記人)
//   --record --by <誰> --reason <為什麼>
//                                   把目前所有內容發現登記進基準;新增的條目記在這次登記名下,
//                                   已修好的同時移除。輸出寫明誰登記、為什麼。基準檔無效
//                                   (GOV-CONTENT-DEBT-001)時從頭重建,舊檔的登記紀錄無法沿用。
//
// 用法:npm run governance:debt -- --record --by "Ada" --reason "beta.151 升級時既有的版面欠債,排進 Q1 清理"

import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONTENT_DEBT_BASELINE_PATH = 'governance/content-debt-baseline.json'
const USAGE = 'usage: governance-content-debt.mjs [--repo <dir>] (--list | --prune | --record --by <who> --reason <why>)'

export function parseContentDebtArgs(argv) {
  const options = { repo: '.', mode: null, by: undefined, reason: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--repo' || flag === '--by' || flag === '--reason') {
      const value = argv[index + 1]
      if (typeof value !== 'string' || value.startsWith('--')) throw new Error(`${flag} needs a value`)
      options[flag.slice(2)] = value
      index += 1
    } else if (['--list', '--prune', '--record'].includes(flag)) {
      if (options.mode) throw new Error('choose exactly one of --list, --prune, --record')
      options.mode = flag.slice(2)
    } else {
      throw new Error(`unknown argument:${flag}`)
    }
  }
  if (!options.mode) throw new Error('choose exactly one of --list, --prune, --record')
  if (options.mode === 'record' && (!options.by?.trim() || !options.reason?.trim())) {
    throw new Error('--record needs --by <who> and --reason <why>: every registration names its owner and reason')
  }
  if (options.mode !== 'record' && (options.by !== undefined || options.reason !== undefined)) {
    throw new Error('--by/--reason only apply to --record')
  }
  return options
}

function runChecker({ checker, repo, mode, by, reason, spawn }) {
  // 三種模式都走提案旗標:checker 才會每檔每支 hook 重播完,--list 列的才等於 --record 登記的。
  const args = [checker, '--repo', repo, '--hooks-off', '--json', '--content-debt-proposal', mode]
  if (mode === 'record') args.push('--by', by, '--reason', reason)
  const result = spawn(process.execPath, args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  })
  if (result.error) throw result.error
  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    throw new Error(`governance check did not return a JSON report (exit ${result.status}):${String(result.stderr || result.stdout).trim().slice(0, 2000)}`)
  }
  if (!report || typeof report !== 'object' || !report.evidence?.contentDebt) {
    throw new Error('governance check report has no content-debt evidence; the installed checker predates the content-debt baseline')
  }
  return { report, status: result.status }
}

function writeBaselineAtomically(repo, document) {
  const target = join(repo, CONTENT_DEBT_BASELINE_PATH)
  if (existsSync(target)) {
    const info = lstatSync(target)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${CONTENT_DEBT_BASELINE_PATH} must be a regular file`)
  }
  const temporary = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx', mode: 0o644 })
    renameSync(temporary, target)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export function runContentDebt({
  argv = process.argv.slice(2),
  checker = join(dirname(fileURLToPath(import.meta.url)), 'governance-check.mjs'),
  spawn = spawnSync,
  out = console.log,
  err = console.error,
} = {}) {
  let options
  try {
    options = parseContentDebtArgs(argv)
  } catch (error) {
    err(`${USAGE}\n${error.message}`)
    return 64
  }
  const repo = realpathSync(resolve(options.repo))
  const { report, status } = runChecker({ checker, repo, ...options, spawn })
  const debt = report.evidence.contentDebt
  const proposal = debt.proposal
  if (!proposal || proposal.mode !== options.mode) throw new Error('governance check did not return the requested content-debt proposal')

  if (options.mode === 'list') {
    if (proposal.refused || !proposal.listing) {
      err(`✗ 清單不完整,不列出:${proposal.refused || 'checker 沒有回傳逐筆清單'}`)
      for (const item of report.diagnostics.filter((diagnostic) => diagnostic.severity === 'BLOCKER')) err(`  ${item.ruleId} ${item.message}`)
      return 1
    }
    const { listing } = proposal
    const cells = (entries) => entries.reduce((total, entry) => total + entry.items.length, 0)
    if (!listing.baselineValid) out(`⚠ ${CONTENT_DEBT_BASELINE_PATH} 無效(GOV-CONTENT-DEBT-001):以下把它當成沒有基準;--record 會從頭重建。`)
    out(`recordedContentDebt=${debt.recordedContentDebt}(${debt.recordedFindings} 筆已登記的內容發現;登記 ≠ 合規)`)
    for (const registration of debt.registrations) out(`  登記 #${registration.id}:${registration.by},${registration.recordedAt},理由:${registration.reason}`)
    out(`未登記(會擋;--record 會登記的就是這些):${listing.unrecorded.length} 格 / ${cells(listing.unrecorded)} 筆`)
    for (const entry of listing.unrecorded) {
      out(`  ${entry.ruleId} ${entry.file} ← ${entry.hook} (${entry.event})`)
      for (const item of entry.items) out(`    ${item.fingerprint} ${item.text}`)
    }
    out(`已修好、待從基準移除(會擋,跑 --prune):${listing.stale.length} 格 / ${cells(listing.stale)} 筆`)
    for (const entry of listing.stale) {
      out(`  ${entry.ruleId} ${entry.file} ← ${entry.hook} (${entry.event})`)
      for (const item of entry.items) out(`    ${item.fingerprint} ${item.text}`)
    }
    const other = report.diagnostics.filter((item) => item.severity === 'BLOCKER' && !/^GOV-CONTENT-(00[13]|DEBT-00[12])$/.test(item.ruleId))
    if (other.length) {
      out(`其他會擋的(不是內容欠債,登記不了):${other.length}`)
      for (const item of other) out(`  ${item.ruleId} ${item.message}`)
    }
    return status === 0 ? 0 : 1
  }

  if (proposal.refused) {
    err(`✗ 沒有寫入 ${CONTENT_DEBT_BASELINE_PATH}:${proposal.refused}`)
    for (const item of report.diagnostics.filter((diagnostic) => diagnostic.severity === 'BLOCKER')) err(`  ${item.ruleId} ${item.message}`)
    return 1
  }
  const exists = existsSync(join(repo, CONTENT_DEBT_BASELINE_PATH))
  const { summary, document } = proposal
  if (options.mode === 'prune' && !exists) {
    out(`沒有 ${CONTENT_DEBT_BASELINE_PATH},不需要縮小。`)
    return 0
  }
  if (exists && !summary.replacedInvalidBaseline && summary.added === 0 && summary.removed === 0) {
    out(`${CONTENT_DEBT_BASELINE_PATH} 已是現況,沒有改動。recordedContentDebt=${summary.entries}`)
    return 0
  }
  writeBaselineAtomically(repo, document)
  if (summary.replacedInvalidBaseline) out(`原本的 ${CONTENT_DEBT_BASELINE_PATH} 無效(GOV-CONTENT-DEBT-001),這次從頭重建;舊檔的登記紀錄沒有沿用。`)
  out(`已寫入 ${CONTENT_DEBT_BASELINE_PATH}:新增 ${summary.added} 筆、移除 ${summary.removed} 筆已修好的;現有 ${summary.entries} 格 / ${summary.findings} 筆。`)
  if (summary.registration) {
    out(`登記 #${summary.registration.id}:登記人 ${summary.registration.by};理由:${summary.registration.reason};版本 ${summary.registration.release || 'unknown'}`)
  }
  out(`recordedContentDebt=${summary.entries}(已登記的既有欠債不擋;基準外的發現照擋;修好的要再跑 --prune 移除。登記 ≠ 合規)`)
  out('請把基準檔的改動跟著這次 PR 一起送審。')
  return 0
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = runContentDebt()
  } catch (error) {
    console.error(`❌ content-debt baseline update failed:${error.message}`)
    process.exitCode = 1
  }
}
