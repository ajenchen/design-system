#!/usr/bin/env node
// 2026-08-12 governed branch cleanup(anti-self-lock SSOT 配套)。
// Squash merge 後 git 的 ancestor 判定必為 UNMERGED(失敗記憶索引明載),裸 -D 又是盲刪。
// 本 script 的 fail-closed 判準:該分支尖端 commit == 某個「已合併 PR」的 head sha
//(向 GitHub 核對事實)→ 內容已在 main by construction → 以 update-ref 刪除本地 ref。
// 任何分支對不上已合併 PR 且非 main 祖先 → 跳過並列明,絕不刪。
// 使用:node scripts/branch-cleanup.mjs <owner/repo> <local-repo-path> <branch> [branch...]
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const [repository, repoPath, ...branches] = process.argv.slice(2)
if (!repository || !repoPath || !branches.length) {
  console.error('usage: branch-cleanup.mjs <owner/repo> <local-repo-path> <branch> [branch...]')
  process.exit(2)
}
const token = readFileSync(join(homedir(), '.config', 'qijenchen-governance', 'github-token'), 'utf8').trim()
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repoPath, encoding: 'utf8' })
  return { ok: result.status === 0, out: (result.stdout || '').trim(), err: (result.stderr || '').trim() }
}
const mergedPullFor = (branch, tipSha) => {
  const owner = repository.split('/')[0]
  const args = ['-sS', '-H', `Authorization: Bearer ${token}`, '-H', 'Accept: application/vnd.github+json',
    '-H', 'User-Agent: branch-cleanup',
    `https://api.github.com/repos/${repository}/pulls?state=closed&head=${owner}:${encodeURIComponent(branch)}&per_page=10`]
  const result = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  let pulls = []
  try { pulls = JSON.parse(result.stdout) } catch { /* fail-closed */ }
  return Array.isArray(pulls) ? pulls.find(pull => pull.merged_at && pull.head?.sha === tipSha) || null : null
}
let failures = 0
for (const branch of branches) {
  const tip = git('rev-parse', `refs/heads/${branch}`)
  if (!tip.ok) { console.log(`skip(不存在): ${branch}`); continue }
  const current = git('branch', '--show-current')
  if (current.out === branch) { console.log(`skip(目前所在分支): ${branch}`); failures += 1; continue }
  const bound = mergedPullFor(branch, tip.out)
  if (!bound) {
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', tip.out, 'origin/main'], { cwd: repoPath })
    if (ancestor.status !== 0) { console.log(`skip(無已合併 PR 綁定且非 main 祖先,不刪): ${branch} @ ${tip.out.slice(0, 8)}`); failures += 1; continue }
  }
  const del = git('update-ref', '-d', `refs/heads/${branch}`)
  if (del.ok) console.log(`deleted: ${branch} @ ${tip.out.slice(0, 8)}${bound ? `(PR #${bound.number} merged)` : '(main 祖先)'}`)
  else { console.log(`delete 失敗: ${branch}: ${del.err}`); failures += 1 }
}
process.exit(failures ? 1 : 0)
