#!/usr/bin/env node
/**
 * @gate-contract
 *   保證:closed git(packages/governance/src/closed-tool-execution.mjs)在「執行者 ≠ repo 擁有者」的環境仍讀得到
 *        呼叫端指名的 repo,而且**只**信任那個 repo —— 不是 safe.directory=*。
 *   紅:A 裸 git 在同樣遮掉 HOME/global config 的環境下對他人擁有的 repo 沒有拒絕(對照組失效:條件根本沒重現);
 *       B closed git 對同一個 repo 仍 exit 128(修法失效 —— 就是 Visual Regression run #289 的死法);
 *       C cwd 是自己的子目錄、上層 .git 屬於別人,closed git 卻通了(信任放太寬,CVE-2022-24765 的門開了);
 *       D --workspace 指定的簽出目錄(CI 的 $GITHUB_WORKSPACE)跑 fingerprint 用的 `ls-files --stage -z` 不是 0。
 *   前提:要有 root 才造得出「他人擁有的 repo」(chown)。非 root:印 SKIPPED-ENV 並 exit 0;
 *        帶 --require 時 SKIPPED-ENV 就是 exit 1(CI 的容器 job 一律帶 --require,略過不准算綠)。
 *   誰呼叫:.github/workflows/ci.yml `container-closed-git`(與 Visual Regression 同一個 Playwright 映像)。
 *   meta-test:scripts/test-closed-git-foreign-owner-invariant.mjs(判定表 + --require 咬得住略過)。
 *
 * 2026-09-23 錨:closed git 把 HOME / GIT_CONFIG_GLOBAL 全遮掉(hermetic),連 actions/checkout 為 runner 寫進 global 的
 * safe.directory 也遮掉;容器裡執行者是 root、簽出目錄屬 uid 1001 → `git ls-files` exit 128「dubious ownership」。
 * 那條 workflow 只有排程 / 手動觸發,PR 階段沒有任何 job 用同一個容器跑同一段命令,錯的容器設定要等 user 親手按下去才紅。
 * 用法:node scripts/closed-git-foreign-owner-invariant.mjs [--require] [--workspace=<簽出目錄>]
 */
import { spawnSync } from 'node:child_process'
import { lchownSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closedGitSafeDirectories, runClosedGit } from '../packages/governance/src/closed-tool-execution.mjs'

const RAW_GIT = '/usr/bin/git'
// 跟 closed git 一樣遮掉 HOME / global / system —— 這是「修前」的環境,對照組 A 用它證明條件真的存在
const HERMETIC_ENV = Object.freeze({ HOME: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', PATH: '/usr/bin:/bin', LC_ALL: 'C' })
const FOREIGN_UID = 65534 // nobody:任何 ≠ 執行者(root)的 uid 都行,選一個每個 Linux 都有的

export function classifyOwnershipOutcome({ status, stderr }) {
  const text = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '')
  if (status === 0) return 'accepted'
  if (status === 128 && /dubious ownership/u.test(text)) return 'refused-dubious'
  return 'other'
}

// 判定表:四面各自「期望的結果」寫成資料,主流程與 meta-test 共用同一份(M17)
export const FACES = Object.freeze({
  A: Object.freeze({ expect: 'refused-dubious', title: '裸 git(同樣遮掉 HOME/global)對他人擁有的 repo 必拒 —— 條件真的存在' }),
  B: Object.freeze({ expect: 'accepted', title: 'closed git 對同一個 repo 必通(rev-parse + fingerprint 的 ls-files)—— 修法生效' }),
  C: Object.freeze({ expect: 'refused-dubious', title: 'cwd 是自己的子目錄、上層 .git 是別人的 → closed git 仍拒 —— 不是 safe.directory=*' }),
  D: Object.freeze({ expect: 'accepted', title: '--workspace 簽出目錄跑 fingerprint 的 ls-files --stage -z 必通' }),
})

function chownTree(path, uid, { except }) {
  if (path === except) return
  lchownSync(path, uid, uid)
  if (!lstatSync(path).isDirectory()) return
  for (const entry of readdirSync(path)) chownTree(join(path, entry), uid, { except })
}

function rawGit(args, cwd) {
  return spawnSync(RAW_GIT, args, { cwd, env: HERMETIC_ENV, encoding: 'utf8' })
}

function main() {
  const require = process.argv.includes('--require')
  const workspaceArgument = process.argv.find(argument => argument.startsWith('--workspace='))?.slice('--workspace='.length)
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  if (process.platform === 'win32' || uid !== 0) {
    const message = `SKIPPED-ENV:需要 root 才能建立他人擁有的 repo(目前 uid=${uid ?? 'n/a'})`
    if (require) { console.error(`✗ ${message} —— --require 下略過不算綠`); return 1 }
    console.log(`· ${message}`)
    return 0
  }
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'closed-git-foreign-owner-')))
  const verdicts = []
  const judge = (face, observed, detail = '') => {
    const ok = observed === FACES[face].expect
    verdicts.push(ok)
    console.log(`${ok ? '✓' : '✗'} ${face} ${FACES[face].title}\n    觀察=${observed}(期望 ${FACES[face].expect})${detail ? `\n    ${detail}` : ''}`)
  }
  try {
    const foreign = join(base, 'foreign-repo')
    mkdirSync(foreign)
    for (const args of [['init', '-q'], ['add', 'README.md']]) {
      if (args[0] === 'add') writeFileSync(join(foreign, 'README.md'), 'foreign-owned fixture\n')
      const setup = spawnSync(RAW_GIT, args, { cwd: foreign, encoding: 'utf8' })
      if (setup.status !== 0) throw new Error(`fixture git ${args[0]} failed:${setup.stderr}`)
    }
    const victim = join(foreign, 'victim') // root 自己的子目錄,留給 C
    mkdirSync(victim)
    chownTree(foreign, FOREIGN_UID, { except: victim })

    const a = rawGit(['rev-parse', '--show-toplevel'], foreign)
    judge('A', classifyOwnershipOutcome(a), (a.stderr || '').trim().split('\n')[0])

    const b1 = runClosedGit(['rev-parse', '--show-toplevel'], { cwd: foreign })
    const b2 = runClosedGit(['ls-files', '--stage', '-z'], { cwd: foreign, output: 'buffer' })
    const bOutcome = classifyOwnershipOutcome(b1) === 'accepted' && classifyOwnershipOutcome(b2) === 'accepted' && b1.stdout.trim() === foreign
      ? 'accepted'
      : classifyOwnershipOutcome(b1) === 'accepted' ? classifyOwnershipOutcome(b2) : classifyOwnershipOutcome(b1)
    judge('B', bOutcome, `safe.directory=${JSON.stringify(closedGitSafeDirectories(foreign))};ls-files 列出 ${b2.stdout?.length ?? 0} bytes`)

    const c = runClosedGit(['rev-parse', '--show-toplevel'], { cwd: victim })
    judge('C', classifyOwnershipOutcome(c), `safe.directory=${JSON.stringify(closedGitSafeDirectories(victim))}(上層 ${foreign} 屬 uid ${FOREIGN_UID},不進清單)`)

    if (workspaceArgument) {
      const workspace = realpathSync(workspaceArgument)
      const owner = lstatSync(workspace).uid
      const d = runClosedGit(['ls-files', '--stage', '-z'], { cwd: workspace, output: 'buffer', maxOutputBytes: 64 * 1024 * 1024 })
      judge('D', classifyOwnershipOutcome(d), `${workspace} 擁有者 uid=${owner},執行者 uid=${uid} → ${owner === uid ? '同人(這一面此刻不咬)' : '他人擁有(= run #289 的情境)'}`)
    } else {
      console.log('· D 略過:未指定 --workspace(CI 傳 $GITHUB_WORKSPACE)')
    }
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
  const failed = verdicts.filter(ok => !ok).length
  console.log(failed ? `✗ ${failed} 面失敗` : `✓ ${verdicts.length} 面全過`)
  return failed ? 1 : 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main())
