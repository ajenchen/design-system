#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 「閘要有對照組」的共用跑法,能正確分辨各種局面 ——
 *         缺前置(快照裡沒有 storybook-static)/ 起不了瀏覽器 / 儀器失效 / 閘真的紅 / 閘是假綠。
 *         前兩種不得被報成「產品壞掉」;**儀器失效(INSTRUMENT-FAIL)與沒有標記的 exit 2 不得被讀成略過或通過**;
 *         宣告 GOVERNANCE_BROWSER_REQUIRED=1 的 lane 起不了瀏覽器也不得略過。
 *   紅: (1) 把「認訊息」那一段拆掉退回只認退出碼 2 的第一版 → 缺前置兩格立刻紅(2026-09-21 實測);
 *       (2) 拿 2026-09-25 修正前的 lib 跑(`--lib=<舊版路徑>`)→ 「INSTRUMENT-FAIL + exit 2」那幾格印出
 *           「略過 … 起不了環境」而紅(2026-09-25 實測:舊版 20 格裡 10 格不符,「story 開不起來 exit 2」那格正是印了「略過 … 起不了環境」)。
 *   綠: 每一格都對時綠。不是抽籤 —— 用**合成假閘**(退出碼與輸出由測試指定;儀器失效 / 缺建置那幾格
 *        直接呼叫 lib/launch-browser.mjs 的真實 StoryRenderInstrumentError / requireStorybookBuild 產生標記),
 *        不開瀏覽器、不依賴任何建置產物、子行程環境變數由測試指定,同一份 worktree 重複跑結果恆等。
 *
 * meta-test for lib/gate-selftest-meta.mjs —— 共用的「閘要有對照組」跑法本身也要有對照組。
 *
 * **為什麼需要(2026-09-21)**:gate-meta lane 是在 repo 的**拋棄式快照**裡跑的,
 * 而 `storybook-static` 是 gitignore 的建置產物、快照裡不存在。缺它的時候各閘的退出碼
 * **並不一致**(實測 focus-indicator 是 2、pagination 與 agent-fab-hit-area 是 1)。
 * 第一版只認退出碼 2,於是退出碼 1 的那些會被誤報成「baseline 應該綠卻紅」。
 *
 * **2026-09-25 反方向的同一個病(M37)**:lib 仍把「exit 2」一律讀成「起不了環境 → 略過」,而十支瀏覽器閘
 * 在 story 開不起來(openStory 丟 StoryRenderInstrumentError)時也是 exit 2 —— 儀器失效被印成略過、exit 0。
 * 現在略過只認閘明確印出的標記(MISSING-BUILD / STALE-BUILD / SKIPPED-ENV …),INSTRUMENT-FAIL 一律紅。
 *
 *   node scripts/test-gate-selftest-meta.mjs                # 驗目前的 lib
 *   node scripts/test-gate-selftest-meta.mjs --lib=<path>   # 拿另一份 lib 跑同一張判定表(對照組:舊版必紅)
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const LAUNCH_BROWSER = join(REPO_ROOT, 'scripts/lib/launch-browser.mjs')
const SNAPSHOT_LIB = join(REPO_ROOT, 'scripts/lib/storybook-static-snapshot.mjs')
const libArg = process.argv.find((a) => a.startsWith('--lib='))?.slice('--lib='.length)
const LIB = libArg ? resolve(libArg) : join(REPO_ROOT, 'scripts/lib/gate-selftest-meta.mjs')
const work = mkdtempSync(join(tmpdir(), 'gate-selftest-meta-'))
let fail = 0

/**
 * 造一支假閘:baseline 與 --selftest 各自的退出碼與輸出都可指定。
 * `baseCode` / `selfCode` 可以是 'instrument'(用真實 StoryRenderInstrumentError 印訊息、exit 2 —— 十支閘的形狀)
 * 或 'missing-build'(呼叫真實 requireStorybookBuild)或 'snapshot-incomplete'(真實 snapshotStorybookStatic 拒絕)。
 */
function fakeGate(name, { baseCode, baseOut = '', selfCode = 0, selfOut = '', requireArg = null }) {
  mkdirSync(join(work, 'scripts', 'lib'), { recursive: true })
  const branch = (code, out) => {
    if (code === 'instrument') {
      return `const { StoryRenderInstrumentError } = await import(${JSON.stringify(LAUNCH_BROWSER)})
const e = new StoryRenderInstrumentError({ storyId: 'design-system-components-combobox-展示--modes', kind: 'storybook-error', reason: 'Storybook 顯示錯誤頁', failedRequests: ['404 /assets/combobox.stories-x.js'] })
console.log(${JSON.stringify(out)}); console.error('✗ ' + e.message); console.error('✗ 儀器失效 —— 這次什麼都沒量到(exit 2,不是產品裁決,也不算通過)'); process.exit(2)`
    }
    if (code === 'missing-build') {
      return `const { requireStorybookBuild } = await import(${JSON.stringify(LAUNCH_BROWSER)})
console.log(${JSON.stringify(out)}); requireStorybookBuild(${JSON.stringify(join(work, 'no-such-build', 'index.json'))}); process.exit(0)`
    }
    if (code === 'snapshot-incomplete') {
      return `const { snapshotStorybookStatic } = await import(${JSON.stringify(SNAPSHOT_LIB)})
const { mkdirSync } = await import('node:fs'); const dir = ${JSON.stringify(join(work, `half-built-${name}`))}; mkdirSync(dir, { recursive: true })
try { snapshotStorybookStatic(dir) } catch (e) { console.error('✗ ' + e.message); process.exit(1) }
process.exit(0)`
    }
    return `console.log(${JSON.stringify(out)}); process.exit(${code})`
  }
  writeFileSync(join(work, 'scripts', `${name}.mjs`), `
${requireArg ? `if (!process.argv.includes(${JSON.stringify(requireArg)})) { console.log('✗ 沒收到 ${requireArg}'); process.exit(1) }` : ''}
if (process.argv.includes('--selftest')) {
${branch(selfCode, selfOut)}
} else {
${branch(baseCode, baseOut)}
}
`)
  return `scripts/${name}.mjs`
}

function runMeta(gatePath, { env = {}, options = null } = {}) {
  const runner = join(work, 'scripts', 'run-meta.mjs')
  writeFileSync(runner, `
import { runGateSelftestMeta } from ${JSON.stringify(LIB)}
runGateSelftestMeta(${JSON.stringify(gatePath)}${options ? `, ${JSON.stringify(options)}` : ''})
`)
  // 子行程環境由測試決定:就算這支測試本身跑在宣告 GOVERNANCE_BROWSER_REQUIRED=1 的 job 裡,判定表也不變
  const childEnv = { ...process.env, ...env }
  if (!('GOVERNANCE_BROWSER_REQUIRED' in env)) delete childEnv.GOVERNANCE_BROWSER_REQUIRED
  const r = spawnSync(process.execPath, ['--', 'scripts/run-meta.mjs'], { cwd: work, encoding: 'utf8', env: childEnv })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// 「略過」是 lib 印在行首的判定(`· 略過:…`);紅燈訊息裡的「不是略過 / 不准略過」不算
const skipped = (r) => /^· 略過/mu.test(r.out)
const CASES = [
  // ── 缺前置:不得報成產品壞掉 ──
  ['缺 storybook-static 且退出碼 1 → 略過(不得報成產品壞掉)',
   { baseCode: 1, baseOut: '✗ storybook-static missing. Run `npm run build-storybook` first.' },
   (r) => r.status === 0 && /缺 storybook-static/.test(r.out),
   '快照裡沒有建置產物,退出碼 1 的閘不得被誤判成紅'],
  ['缺 storybook-static 且退出碼 2 → 略過',
   { baseCode: 2, baseOut: '✗ storybook-static missing. Run `npm run build-storybook` first.' },
   (r) => r.status === 0 && /缺 storybook-static/.test(r.out), '同上,只是退出碼不同'],
  ['建置過時(STALE-BUILD)→ 略過',
   { baseCode: 2, baseOut: '✗ STALE-BUILD:原始碼比 storybook-static 新' },
   (r) => r.status === 0, '過時也是缺前置'],
  ['閘呼叫 requireStorybookBuild(真實 MISSING-BUILD 標記,exit 2)→ 略過',
   { baseCode: 'missing-build', baseOut: '' },
   (r) => r.status === 0 && /缺 storybook-static/.test(r.out),
   '2026-09-25 起缺建置的標準形狀;十幾支閘改用它之後,這一格若紅,夜間 gate-meta lane 會整批誤紅'],
  ['閘沒有守衛、直接 ENOENT 崩在 storybook-static 上 → 略過(2026-09-21 夜間 lane 實測的第三種形狀)',
   { baseCode: 1, baseOut: "Error: ENOENT: no such file or directory, lstat '/tmp/snapshot/repo/storybook-static'" },
   (r) => r.status === 0 && /缺 storybook-static/.test(r.out),
   '全庫 50+ 支用到 storybook-static 的腳本沒有存在性守衛,崩潰形狀也必須認得'],
  ['ENOENT 但不是 storybook-static → 不得當成略過(這是真失敗)',
   { baseCode: 1, baseOut: "Error: ENOENT: no such file or directory, open '/repo/packages/design-system/src/missing.tsx'" },
   (r) => r.status === 1 && /baseline 應該綠卻紅/.test(r.out),
   '判準必須兩個條件同時成立,否則會把真失敗吃掉'],
  ['提到 storybook-static 但不是檔案不存在 → 不得當成略過',
   { baseCode: 1, baseOut: '✗ storybook-static 裡有 3 個 story 的焦點框顏色不對' },
   (r) => r.status === 1 && /baseline 應該綠卻紅/.test(r.out),
   '同上,反方向的對照'],
  // ── 起不了瀏覽器 ──
  ['起不了瀏覽器(一般環境)→ 略過',
   { baseCode: 0, baseOut: '⚠️ SKIPPED-ENV: Chromium 起不來' },
   (r) => r.status === 0 && /起不了環境/.test(r.out), '環境問題不得指控產品'],
  ['起不了瀏覽器,但 lane 宣告 GOVERNANCE_BROWSER_REQUIRED=1 → 紅(不准略過)',
   { baseCode: 0, baseOut: '⚠️ SKIPPED-ENV: Chromium 起不來(browserType.launch: Executable doesn\'t exist)' },
   (r) => r.status === 1 && /GOVERNANCE_BROWSER_REQUIRED=1/.test(r.out) && !skipped(r),
   'CI 的瀏覽器 job 裝了 Chromium 就是要跑閘;起不來 = 這個 job 壞了,exit 0 等於整批靜默通過',
   { env: { GOVERNANCE_BROWSER_REQUIRED: '1' } }],
  ['閘印 BROWSER-REQUIRED(訊息裡帶 Playwright 的 browserType.launch 字樣)→ 紅',
   { baseCode: 1, baseOut: '✗ BROWSER-REQUIRED:無法啟動 Chromium(browserType.launch: Executable doesn\'t exist at /x)' },
   (r) => r.status === 1 && !skipped(r),
   'BROWSER-REQUIRED 必須先於「Playwright 啟動失敗字樣 → 略過」判定,否則必需瀏覽器的 lane 仍會被讀成略過'],
  // ── 儀器失效:沒量到 ≠ 沒發生(2026-09-25)──
  ['story 開不起來(真實 StoryRenderInstrumentError 訊息,exit 2)→ 紅,不得印「略過」',
   { baseCode: 'instrument', baseOut: '✓ 靜態段 3 條通過' },
   (r) => r.status === 1 && /儀器失效/.test(r.out) && !skipped(r),
   '十支瀏覽器閘的真實形狀:舊版把 exit 2 一律讀成「起不了環境 → 略過」、exit 0'],
  ['INSTRUMENT-FAIL 但閘 exit 0(假綠)→ 紅',
   { baseCode: 0, baseOut: '✗ INSTRUMENT-FAIL story「x」沒有量到 —— 404\n✅ PASS' },
   (r) => r.status === 1 && /儀器失效/.test(r.out),
   '儀器失效絕不能讀成通過,不論退出碼'],
  ['INSTRUMENT-FAIL 與缺前置字樣同時出現 → 紅(儀器失效優先)',
   { baseCode: 2, baseOut: '✗ INSTRUMENT-FAIL story「x」沒有量到 —— Run `npm run build-storybook` 之後再試' },
   (r) => r.status === 1 && !skipped(r),
   '判定有優先序:儀器失效先於任何略過判斷'],
  ['建置快照不完整(真實 snapshotStorybookStatic 拒絕,exit 1)→ 紅,不是缺前置',
   { baseCode: 'snapshot-incomplete', baseOut: '' },
   (r) => r.status === 1 && /儀器失效/.test(r.out) && !skipped(r),
   '交付給 consumer 的快照 lib 印的標記必須與 launch-browser 的 INSTRUMENT-FAIL 同一個字,否則會掉進別的分支'],
  ['沒有任何標記的 exit 2(例:閘的內建自測失敗)→ 紅',
   { baseCode: 2, baseOut: '❌ selftest「dot 尺寸」期望 true 得 false' },
   (r) => r.status === 1 && /exit 2 不是略過/.test(r.out) && !skipped(r),
   'agent-logo-brand-scale / agent-panel-fixed-anatomy 的內建自測失敗就是這個形狀,舊版把它略過'],
  // ── 真紅 / 假綠 / 正常 ──
  ['一切正常 → 綠',
   { baseCode: 0, baseOut: '✅ PASS', selfCode: 0, selfOut: '✓ selftest:合成違規被抓到' },
   (r) => r.status === 0 && /baseline PASS/.test(r.out) && /對照組被抓到/.test(r.out), '兩半都成立才算綠'],
  ['baseline 真的紅 → 紅(不得被略過吃掉)',
   { baseCode: 1, baseOut: '✗ 有 3 條不變式失敗' },
   (r) => r.status === 1 && /baseline 應該綠卻紅/.test(r.out), '真失敗必須照樣紅'],
  ['對照組抓不到 → 紅(閘是假綠)',
   { baseCode: 0, baseOut: '✅ PASS', selfCode: 1, selfOut: '✗ selftest:合成違規沒被抓到' },
   (r) => r.status === 1 && /零證據/.test(r.out), '對照組失效必須紅'],
  ['對照組儀器失效但 exit 0 → 紅(不得讀成「對照組被抓到」)',
   { baseCode: 0, baseOut: '✅ PASS', selfCode: 0, selfOut: '✗ INSTRUMENT-FAIL story「x」沒有量到' },
   (r) => r.status === 1 && /對照組儀器失效/.test(r.out),
   '沒量到的對照組不是「如預期紅」'],
  ['現況 / 對照組參數照呼叫端指定轉交(avatar-anchor-box 的 --limit)',
   { baseCode: 0, baseOut: '✅ PASS', selfCode: 0, selfOut: '✓ selftest', requireArg: '--limit=1' },
   (r) => r.status === 0 && /baseline PASS/.test(r.out) && /對照組被抓到/.test(r.out),
   '手寫 meta-test 收斂進共用實作後,參數必須原樣到達閘',
   { options: { baseArgs: ['--limit=1'], selftestArgs: ['--selftest', '--limit=1'] } }],
]

CASES.forEach(([name, spec, want, why, run = {}], index) => {
  const gate = fakeGate(`fake-${index}`, spec)
  const r = runMeta(gate, run)
  if (want(r)) console.log(`✓ ${name}`)
  else { console.log(`✗ ${name} —— ${why}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).slice(0, 12).map((l) => '   ' + l).join('\n')}`); fail += 1 }
})

rmSync(work, { recursive: true, force: true })
console.log(fail
  ? `\n✗ ${fail} / ${CASES.length} 項不符${libArg ? `(lib = ${LIB})` : ''}`
  : `\n✅ gate-selftest-meta PASS(${CASES.length} 格:缺前置 / 環境 / 必需瀏覽器 / 儀器失效 / 真紅 / 假綠 全對)`)
process.exit(fail ? 1 : 0)
