#!/usr/bin/env node
// qijenchen-ds-codemod —— 消費端升版指令(讀已裝 DS 套件裡的變更帳本 ds-changes.json)。
//
//   upgrade [--from <版>] [--root <dir>] [--source <路徑>]... [--dry-run] [--force] [--report <檔>]
//       選出 from(不含)到已裝版(含)的帳本節:套用帶 fix 的條目,有歧義的檔擋下不改,
//       印出 markdown 報告(已改 / 擋下 / 剩下要手改或確認的,每條附 檔:行、做法、規格段落)。
//       --from 省略 = 讀 git HEAD 的 package.json 宣告的舊版本(sync-all 改了版號、還沒 commit)。
//       掃描範圍裡有未 commit 的檔(package.json 與 lock 檔除外)就拒跑,--force 才跑 —— 同一批改名重套會連鎖(xs→sm 又 sm→md)。
//       套用成功後在 .git/qijenchen-ds-codemod-upgrade.json 記下 from → to 與改過的檔(不會被 commit);同一組 from → to 在重疊的
//       範圍再跑 → 拒跑(src 已 commit、版號還沒 commit 時,git 狀態看不出來),--force 才跑。
//       已知限制:--root 不是 git repo 的最上層(或不是 git repo,只能 --force)時不留戳記,報告會寫「不要再跑第二次」。
//       任何一條規則判斷時出錯:只擋下那個檔(codemod-internal-error)、照常出報告,不讓整次執行當掉。
//   plan  [--from <版>] [--root] [--source]... [--output <proposal.json>]   只規劃(digest 綁定)
//   check --proposal <檔> [--root]                                         驗 proposal 已套用 / 無須改
//   apply --proposal <檔> --expected-proposal-digest <sha256> [--root]     套用規劃好的 proposal
//
// 結束碼:0 = 完成;1 = 擋下(輸入錯、檔案在規劃後被動過等);2 = 儀器失效(讀不到帳本 / 版本,或讀不出升版前的版本)。
import { readFileSync, realpathSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CodemodInstrumentError,
  applyCodemodProposal,
  checkCodemodProposal,
  planCodemod,
  upgradeConsumer,
} from './index.mjs'
import { canonicalJson, writeAtomicFile } from '../shared/safe-filesystem.mjs'

function fail(message) {
  throw new Error(`design-system codemod CLI blocked:${message}`)
}

const COMMANDS = new Set(['upgrade', 'plan', 'check', 'apply'])

function parse(argv) {
  const [command, ...tokens] = argv
  if (!COMMANDS.has(command)) fail(`first argument must be one of ${[...COMMANDS].join(', ')}`)
  const options = { command, root: '.', sources: [], output: null, report: null, proposal: null, expectedDigest: null, from: null, dryRun: false, force: false }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = () => {
      const value = tokens[++index]
      if (!value || value.startsWith('--')) fail(`${token} requires a value`)
      return value
    }
    if (token === '--root') options.root = next()
    else if (token === '--source') options.sources.push(next())
    else if (token === '--output') options.output = next()
    else if (token === '--report') options.report = next()
    else if (token === '--proposal') options.proposal = next()
    else if (token === '--expected-proposal-digest') options.expectedDigest = next()
    else if (token === '--from') options.from = next()
    else if (token === '--dry-run') options.dryRun = true
    else if (token === '--force') options.force = true
    else fail(`unknown option:${token}`)
  }
  return options
}

function relativeOutput(root, value) {
  const absoluteRoot = resolve(root)
  const absolute = resolve(absoluteRoot, value)
  const path = relative(absoluteRoot, absolute)
  if (!path || path === '..' || path.startsWith(`..${sep}`)) fail('output must be a file below --root')
  return path.split(sep).join('/')
}

function readProposal(root, value) {
  if (!value) fail('--proposal is required')
  let proposal
  try { proposal = JSON.parse(readFileSync(resolve(root, value), 'utf8')) } catch (error) { fail(`proposal is unavailable or invalid JSON:${error.message}`) }
  return proposal
}

export function runCodemodCli(argv = process.argv.slice(2), { installed = null, readGit } = {}) {
  const options = parse(argv)
  const sourceRoots = options.sources.length ? options.sources : ['.']
  if (options.command === 'upgrade') {
    if (options.proposal || options.expectedDigest || options.output) fail('upgrade does not accept --proposal / --expected-proposal-digest / --output')
    const result = upgradeConsumer({ repoRoot: options.root, sourceRoots, from: options.from, installed, readGit, dryRun: options.dryRun, force: options.force })
    if (options.report) writeAtomicFile(resolve(options.root), relativeOutput(options.root, options.report), Buffer.from(result.report), 'upgrade report', fail)
    process.stdout.write(result.report)
    return 0
  }
  if (options.command === 'plan') {
    if (options.proposal || options.expectedDigest || options.dryRun || options.report || options.force) fail('plan does not accept apply/check/report/force options')
    const proposal = planCodemod({ repoRoot: options.root, sourceRoots, from: options.from, installed, readGit })
    const body = Buffer.from(canonicalJson(proposal))
    if (options.output) {
      writeAtomicFile(resolve(options.root), relativeOutput(options.root, options.output), body, 'codemod proposal', fail)
      process.stdout.write(`${canonicalJson({ proposalDigest: proposal.proposalDigest, files: proposal.files.length, blockers: proposal.blockers.length, output: options.output })}`)
    } else process.stdout.write(body)
    return 0
  }
  if (options.sources.length || options.output || options.from || options.dryRun || options.report || options.force) fail(`${options.command} does not accept --source / --output / --from / --dry-run / --force / --report`)
  const proposal = readProposal(options.root, options.proposal)
  const result = options.command === 'check'
    ? checkCodemodProposal({ repoRoot: options.root, proposal })
    : applyCodemodProposal({ repoRoot: options.root, proposal, expectedProposalDigest: options.expectedDigest })
  process.stdout.write(canonicalJson(result))
  return 0
}

function isMainModule(argvPath = process.argv[1]) {
  if (!argvPath) return false
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return resolve(argvPath) === resolve(fileURLToPath(import.meta.url))
  }
}

if (isMainModule()) {
  try { process.exitCode = runCodemodCli() } catch (error) {
    if (error instanceof CodemodInstrumentError) {
      console.error(`INSTRUMENT-FAIL design-system codemod:${error.message}`)
      process.exitCode = 2
    } else {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
