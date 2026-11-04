#!/usr/bin/env node
// meta-test for sync-template-canonical-app --check(2026-11-04,template 家族交整合 3):
// 範本本體 apps/template/src/App.tsx ↔ 隨 npm 出貨的副本 ds-canonical/templates/dashboard-app.tsx 必須逐字相同 ——
// 範本 receiver 每次發版都 `cp 副本 → App.tsx`,副本落後就把範本改動靜默蓋回舊版。這支 --check 從 2026-06-07 寫好到今天
// 沒有任何執行面呼叫它(git grep 只有它自己),副本從 08-02 漂移兩個多月沒人看見。
// 本 meta-test:(1) CI 真的叫到 npm run test:template-canonical-app;(2) 在拋棄式小樹裡跑同一支 script ——
// 兩檔相同必綠、副本弄壞一行必紅、副本不見 = 儀器失效(exit 2)、寫入模式同步之後回綠;(3) 現況必綠。
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = 'scripts/sync-template-canonical-app.mjs'
const SSOT = 'apps/template/src/App.tsx'
const COPY = 'packages/design-system/ds-canonical/templates/dashboard-app.tsx'

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts
assert.equal(pkg['test:template-canonical-app'], `node ${SCRIPT} --check && node scripts/test-sync-template-canonical-app.mjs`, 'package.json 的 test:template-canonical-app 必須跑 --check 與本 meta-test')
const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
assert.match(ci, /\n\s+npm run test:template-canonical-app\n/, 'ci.yml 必須呼叫 npm run test:template-canonical-app(註解不算)')
console.log('✓ 入口與 CI 呼叫都在')

// 被啟動的 script 路徑寫成字面常數、cwd = repo 根(harness 來源清單要能靜態審查 node 的 script operand,
// 2026-10-07 CI 治理套件抓過「unreviewable Node pre-script argv」);對照組的小樹經 --root 傳進去。
const GATE_CLI = 'scripts/sync-template-canonical-app.mjs'
assert.equal(GATE_CLI, SCRIPT)
const tree = mkdtempSync(join(tmpdir(), 'template-canonical-'))
const check = () => spawnSync(process.execPath, [GATE_CLI, '--check', `--root=${tree}`], { cwd: ROOT, encoding: 'utf8' })
const write = () => spawnSync(process.execPath, [GATE_CLI, `--root=${tree}`], { cwd: ROOT, encoding: 'utf8' })
try {
  for (const p of [SSOT, COPY]) { mkdirSync(dirname(join(tree, p)), { recursive: true }); copyFileSync(join(ROOT, SSOT), join(tree, p)) }
  assert.equal(check().status, 0, '兩檔相同 → --check 必綠')
  const copy = readFileSync(join(tree, COPY), 'utf8').split('\n')
  copy[1] = `${copy[1]} // 對照組:副本弄壞一行`
  writeFileSync(join(tree, COPY), copy.join('\n'))
  const red = check()
  assert.equal(red.status, 1, `副本弄壞一行 → --check 必紅(exit 1),實得 ${red.status}`)
  assert.match(red.stderr, /DRIFT/, '紅的時候要指名漂移')
  renameSync(join(tree, COPY), join(tree, `${COPY}.gone`))
  assert.equal(check().status, 2, '副本不見 → 儀器失效(exit 2),不讀成通過')
  renameSync(join(tree, `${COPY}.gone`), join(tree, COPY))
  assert.equal(write().status, 0, '寫入模式:本體 → 副本')
  assert.equal(check().status, 0, '同步之後 --check 回綠')
  console.log('✓ 對照組:相同綠 / 副本弄壞一行紅 / 副本不見 exit 2 / 同步後回綠')
} finally { rmSync(tree, { recursive: true, force: true }) }

const now = spawnSync(process.execPath, [GATE_CLI, '--check'], { cwd: ROOT, encoding: 'utf8' })
assert.equal(now.status, 0, `現況必綠:${(now.stderr || now.stdout).trim()}`)
console.log('✓ 現況:範本本體與副本逐字相同')
