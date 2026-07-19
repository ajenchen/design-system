#!/usr/bin/env node
/**
 * run-gate-meta-tests.mjs — 實跑全部 gate meta-test(PNG §8 per-rule mutation 的執行層)。
 *
 * 為何存在:`audit-gate-meta-test-coverage.mjs` 只驗「meta-test 檔存在」(coverage),
 *   但檔存在 ≠ 有跑。若沒有 runner 實跑,meta-test 就是 coverage theater(裝飾),
 *   無法真的抓「某 gate 的偵測邏輯被改壞(還能 exit 0 卻不再抓違規)」的 regression。
 *   本 runner 逐支跑 `scripts/test-<gate>.mjs`(每支 inject 真違規 → 斷言 gate exit≠0 → restore),
 *   任一支失敗 = 該 gate 的偵測活性 regression → 整體 exit 1(preflight 阻擋)。
 *
 * 排除(EXCLUDE):render/build/network/env-性 gate 的 meta-test(baseline 非確定或需重建,
 *   由 CI 端到端兜底,見 audit-gate-meta-test-coverage.baseline.json debtReasons):
 *   audit-a11y / audit-consumer-a11y / audit-coverage-matrix / check-bundle-size / check-codex-freshness /
 *   check-branch-protection(查 GitHub API)/ codex-run-guarded(呼叫外部 codex)/ agents-bootstrap(重)。
 *
 * 安全:每支 meta-test 自身 finally-restore;本 runner 另在全跑後斷言 git 工作樹無殘留 source 變更,
 *   若有(某支 restore 失敗)→ 立即 exit 1 大聲報,不讓壞 restore 靜默 ship。
 *
 * 用法:node scripts/run-gate-meta-tests.mjs [--check]
 */
import { readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const ROOT = join(SCRIPTS, '..')

// 併發鎖:meta-test 對 source 檔做 inject→restore,同時跑兩份會互相踩 restore(race)→ 假失敗 + 殘留。
// 用 PID lockfile 拒併發;PID 已死 = stale,清掉續跑。退出時移除自己的鎖。
import { writeFileSync as _wf, readFileSync as _rf, existsSync as _ex, unlinkSync as _ul } from 'node:fs'
import { tmpdir } from 'node:os'
const LOCK = join(tmpdir(), 'run-gate-meta-tests.lock')
if (_ex(LOCK)) {
  const held = parseInt(_rf(LOCK, 'utf8').trim(), 10)
  let alive = false
  try { process.kill(held, 0); alive = true } catch { alive = false }
  if (alive) { console.error(`❌ 另一個 run-gate-meta-tests 正在跑(PID ${held})— 併發會踩 restore。等它跑完再跑。`); process.exit(1) }
  _ul(LOCK) // stale
}
_wf(LOCK, String(process.pid))
process.on('exit', () => { try { if (_ex(LOCK) && _rf(LOCK, 'utf8').trim() === String(process.pid)) _ul(LOCK) } catch {} })

// meta-test baseline 非確定 / 需 render|build|network → 由 CI 端到端兜底,不在本 runner。
const EXCLUDE = new Set([
  'audit-a11y', 'audit-consumer-a11y', 'audit-coverage-matrix', 'check-bundle-size', 'check-codex-freshness',
  'check-branch-protection', 'codex-run-guarded', 'agents-bootstrap',
  // check-src-republish 的 meta-test 依賴「version 未 bump」前提(注入 src 改動 → 期待『改 src 卻沒 bump』違規)。
  // 但本 runner 在 preflight 是 **bump 之後** 才跑 → 版本已 bump → gate 正確判『src 改 + 已 bump = OK』無違規
  // → meta-test 的「注入必被抓」斷言失敗。故排除本 runner;check-src-republish gate 本身仍在 preflight line 94 直跑,
  // meta-test 檔存在(coverage 滿足)且在未 bump 狀態(CI 一般 commit)可獨立跑綠。
  'check-src-republish',
])

// 收集所有 test-<stem>.mjs 且對應 gate scripts/<stem>.mjs 存在、且 stem 不在 EXCLUDE。
const metaTests = readdirSync(SCRIPTS)
  .filter((f) => /^test-.+\.mjs$/.test(f))
  .map((f) => ({ file: f, stem: f.replace(/^test-/, '').replace(/\.mjs$/, '') }))
  .filter(({ stem }) => existsSync(join(SCRIPTS, `${stem}.mjs`)) && !EXCLUDE.has(stem))
  .sort((a, b) => a.file.localeCompare(b.file))

const cleanTree = () => execSync('git status --porcelain packages .claude/references .claude/skills .claude/rules', { cwd: ROOT, encoding: 'utf8' }).trim()
const before = cleanTree()

let pass = 0
const failed = []
for (const { file, stem } of metaTests) {
  try {
    execSync(`node ${JSON.stringify(join(SCRIPTS, file))}`, { cwd: ROOT, stdio: 'pipe' })
    pass++
  } catch (e) {
    failed.push({ stem, code: e.status ?? 1 })
  }
}

// 安全 backstop:比對 source dirs 的 modified-path 集合(非 raw string,避免 Google Drive FS 寫入延遲
// 造成的假陽性 + 正確處理 preflight 前已有的未 commit 變更)。再讀一次讓 git/FS settle。
const pathSet = (s) => new Set(s.split('\n').filter(Boolean).map((l) => l.slice(3)))
const beforeSet = pathSet(before)
let newlyDirty = [...pathSet(cleanTree())].filter((p) => !beforeSet.has(p))
if (newlyDirty.length) newlyDirty = [...pathSet(cleanTree())].filter((p) => !beforeSet.has(p)) // re-read(FS lag)
console.log(`gate meta-tests: ${pass}/${metaTests.length} PASS(EXCLUDE ${EXCLUDE.size} render/env-性,CI 端到端兜底)`)

if (newlyDirty.length) {
  console.error('❌ meta-test 跑完後工作樹有新增未還原 source 變更(某支 restore 失敗)— 立即檢查:')
  console.error(newlyDirty.map((p) => `   - ${p}`).join('\n'))
  process.exit(1)
}
if (failed.length) {
  console.error(`❌ ${failed.length} 支 gate meta-test 失敗(該 gate 偵測活性 regression):`)
  failed.forEach((f) => console.error(`   - test-${f.stem}.mjs(exit ${f.code})`))
  process.exit(1)
}
console.log('✅ 全部 gate meta-test PASS — 每支 gate 的 inject-真違規偵測活性已自證')
