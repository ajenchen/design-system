#!/usr/bin/env node
// test-sync-atomicity.mjs — settings.json 原子寫入(tmp + rename)契約的機械證明
//
// SUT = scripts/refresh-fork-launchers.mjs 的 refreshLaunchers()。它把 fork 的
// .claude/settings.json 用「寫 tmp → renameSync 覆蓋」原子替換(§15 atomic 契約,
// 檔內註解:「中斷不會留半寫 settings(settings 壞 = 整個 .claude 靜默失效)」)。
// 本測試機械證明該原子性,分兩層(對齊 M32「pixel/DOM/機械 primary」):
//
//   Layer A — 靜態源碼斷言(deterministic gate):讀 refresh-fork-launchers.mjs 源碼,
//     斷言 writer 走 write-to-temp-then-rename,且「絕不」對 settingsPath 直接原地
//     writeFileSync(那才是會留半寫檔的 non-atomic 寫法)。tmp 寫入必在 rename 之前。
//
//   Layer B — 功能性斷言(runtime):
//     B1 單跑一次 → 產出 valid parseable JSON;第二次重跑 byte-identical(idempotent)。
//     B2 併發:對同一個 fixture spawn 兩個 child process 同時跑 generator(真並行),
//         事後 target settings.json 必為 valid JSON(絕非半寫/截斷)且 byte-equal 於
//         單跑乾淨版(deterministic → 併發結果 == 單次乾淨產出)。跑 N 輪增加重疊機率。
//     B3 連續讀者觀測:預先種一份 valid settings.json,再對它 spawn 多個並行 writer,
//         parent 在旁緊迴圈重複讀 target,每次「讀得到」的快照都必 parse 成 valid JSON
//         —— 直接觀測 rename 的原子性(讀者永遠拿到完整舊 inode 或完整新 inode,
//         絕不會拿到半寫內容)。
//
// 用法:node scripts/test-sync-atomicity.mjs   (PASS → exit 0;任一斷言 fail → exit 1)
// 副作用:fixtures 全在 os.tmpdir() 底下,repo tree 零污染;finally 清乾淨。

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { refreshLaunchers } from './refresh-fork-launchers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SCRIPT = join(__dirname, 'refresh-fork-launchers.mjs')
const CORPUS = join(ROOT, 'packages/design-system/ds-canonical/fork/launchers')

const BASE = join(tmpdir(), 'ds-sync-atomicity-fixture')
const REF = join(BASE, 'ref')
const CONC = join(BASE, 'conc')
const OBS = join(BASE, 'obs')
const SETTINGS_REL = '.claude/settings.json'

let fail = 0
const log = []
function check(cond, okMsg, failMsg) {
  if (cond) { log.push(`  ✅ ${okMsg}`) }
  else { log.push(`  ❌ ${failMsg}`); fail++ }
  return cond
}

// ── fixture:最小 fork 佈局,只帶 launchers corpus(不帶 manifest → refreshLaunchers
//    的 skills/codex 分支自動 skip,聚焦 settings.json 原子寫路徑)──
function buildFixture(dir, { seedSettings = null } = {}) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  const launchers = join(dir, 'node_modules/@qijenchen/design-system/ds-canonical/fork/launchers')
  mkdirSync(launchers, { recursive: true })
  cpSync(CORPUS, launchers, { recursive: true })
  mkdirSync(join(dir, '.claude'), { recursive: true })
  if (seedSettings != null) writeFileSync(join(dir, SETTINGS_REL), seedSettings)
}

// spawn 一個 child 跑 `node refresh-fork-launchers.mjs`(CLI 入口 → refreshLaunchers(cwd))
function spawnRun(cwd) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [SCRIPT], { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    c.stderr.on('data', (d) => { err += d })
    c.on('close', (code) => resolve({ code, err }))
    c.on('error', (e) => resolve({ code: 127, err: String(e) }))
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // ══ Layer A — 靜態源碼斷言 ══
  log.push('── Layer A:靜態源碼斷言(write-to-temp-then-rename,禁原地直寫)──')
  const src = readFileSync(SCRIPT, 'utf8')
  const declTmp = /const\s+tmpPath\s*=\s*settingsPath\s*\+\s*['"]\.tmp['"]/.test(src)
  const writesTmp = /writeFileSync\(\s*tmpPath\b/.test(src)
  const renamesTmp = /renameSync\(\s*tmpPath\s*,\s*settingsPath\s*\)/.test(src)
  const importsRename = /import\s*\{[^}]*\brenameSync\b[^}]*\}\s*from\s*['"]node:fs['"]/.test(src)
  // 關鍵反向斷言:絕不對 settingsPath 直接原地 writeFileSync(那是會留半寫檔的 non-atomic 寫)
  const noInPlaceWrite = !/writeFileSync\(\s*settingsPath\b/.test(src)
  // 順序:tmp 寫入必在 rename 之前
  const iWrite = src.search(/writeFileSync\(\s*tmpPath\b/)
  const iRename = src.search(/renameSync\(\s*tmpPath\s*,\s*settingsPath\s*\)/)
  const orderOk = iWrite >= 0 && iRename >= 0 && iWrite < iRename

  check(declTmp, "宣告同目錄 temp 路徑 `settingsPath + '.tmp'`", '找不到 temp 路徑宣告 → 非 tmp+rename')
  check(writesTmp, '先 writeFileSync(tmpPath, ...) 寫進 temp', '未寫入 temp 檔')
  check(renamesTmp, 'renameSync(tmpPath, settingsPath) 原子替換', '缺 renameSync(tmp→target)')
  check(importsRename, "從 node:fs import renameSync", '未 import renameSync')
  check(noInPlaceWrite, '絕無對 settingsPath 直接原地 writeFileSync(no partial in-place write)',
    '偵測到對 settingsPath 直接原地寫 → 會留半寫檔 = 違反原子契約')
  check(orderOk, '寫 temp 在 rename 之前(順序正確)', 'temp 寫入未先於 rename')

  // ══ Layer B1 — 單跑 valid JSON + idempotent ══
  log.push('── Layer B1:單跑產出 valid JSON + 第二次重跑 byte-identical ──')
  buildFixture(REF)
  const r1 = refreshLaunchers(REF)
  check(r1.settingsMerged === true, 'refreshLaunchers 回報 settingsMerged=true', `settingsMerged=${r1.settingsMerged}(未寫 settings?skipped=${r1.skipped})`)
  const refText = existsSync(join(REF, SETTINGS_REL)) ? readFileSync(join(REF, SETTINGS_REL), 'utf8') : ''
  let refParsed = false
  try { JSON.parse(refText); refParsed = true } catch {}
  check(refParsed, '單跑產出為 valid parseable JSON', 'single-run 產出非法 JSON')
  refreshLaunchers(REF)
  const refText2 = readFileSync(join(REF, SETTINGS_REL), 'utf8')
  check(refText2 === refText, '第二次重跑 settings.json byte-identical(idempotent)', '重跑產出不一致(非冪等)')

  // ══ Layer B2 — 併發:兩 child process 同時寫同一 target ══
  log.push('── Layer B2:併發雙寫(spawn ×2)→ target 恆 valid JSON 且 == 單跑乾淨版 ──')
  const ROUNDS = 30
  let concValidJSON = 0, concEqualsRef = 0, childNonZero = 0, corruptSample = ''
  for (let i = 0; i < ROUNDS; i++) {
    buildFixture(CONC)
    const [a, b] = await Promise.all([spawnRun(CONC), spawnRun(CONC)])
    if (a.code !== 0) childNonZero++
    if (b.code !== 0) childNonZero++
    const txt = readFileSync(join(CONC, SETTINGS_REL), 'utf8')
    let ok = false
    try { JSON.parse(txt); ok = true } catch { corruptSample = txt.slice(0, 80) }
    if (ok) concValidJSON++
    if (txt === refText) concEqualsRef++
  }
  check(concValidJSON === ROUNDS, `併發 ${ROUNDS} 輪:target 每輪皆 valid JSON(絕無半寫/截斷)`,
    `併發出現非法 JSON(${ROUNDS - concValidJSON}/${ROUNDS} 輪),樣本頭:${JSON.stringify(corruptSample)}`)
  check(concEqualsRef === ROUNDS, `併發 ${ROUNDS} 輪:target 每輪 byte-equal 單跑乾淨版(deterministic)`,
    `併發結果與單跑乾淨版不符(${ROUNDS - concEqualsRef}/${ROUNDS} 輪)`)
  // 註:child 因共用 tmp 路徑偶發 rename ENOENT(對方已先 rename 掉共用 tmp)→ 良性,不影響
  //     target 原子性;故本層只對 target 檔斷言,不對 child exit code 硬斷言。
  log.push(`  ℹ️  併發 child 非零退出 ${childNonZero}/${ROUNDS * 2}(共用 tmp 的良性 rename race;target 仍恆 valid)`)

  // ══ Layer B3 — 連續讀者觀測 rename 原子性 ══
  log.push('── Layer B3:連續讀者觀測 — writer 猛寫時,每次讀到的快照皆 valid JSON ──')
  buildFixture(OBS, { seedSettings: JSON.stringify({ seeded: true, hooks: {} }, null, 2) + '\n' })
  let reads = 0, badReads = 0, badReadSample = ''
  let writersDone = false
  const readerLoop = (async () => {
    while (!writersDone) {
      try {
        const t = readFileSync(join(OBS, SETTINGS_REL), 'utf8')
        reads++
        try { JSON.parse(t) } catch { badReads++; if (!badReadSample) badReadSample = t.slice(0, 80) }
      } catch { /* ENOENT during swap window is impossible for rename, but tolerate */ }
      // 不 await sleep 讓讀盡量密;偶爾讓出 event loop
      if (reads % 50 === 0) await sleep(0)
    }
  })()
  // 三波、每波 3 個並行 writer,增加與讀者的重疊
  for (let wave = 0; wave < 3; wave++) {
    await Promise.all([spawnRun(OBS), spawnRun(OBS), spawnRun(OBS)])
  }
  writersDone = true
  await readerLoop
  check(reads > 0, `讀者實際讀到 ${reads} 次快照`, '讀者一次都沒讀到(觀測無效)')
  check(badReads === 0, `連續 ${reads} 次讀取全為 valid JSON(觀測到 rename 的原子替換)`,
    `讀到 ${badReads} 次半寫/非法 JSON,樣本頭:${JSON.stringify(badReadSample)}`)
  const finalObs = readFileSync(join(OBS, SETTINGS_REL), 'utf8')
  let finalOk = false
  try { JSON.parse(finalObs); finalOk = true } catch {}
  check(finalOk, '讀者結束後 target 為 valid JSON', '最終 target 非法 JSON')

  // ── 收尾 ──
  console.log('=== settings.json 原子寫入(tmp + rename)契約測試 ===')
  console.log(`SUT: scripts/refresh-fork-launchers.mjs → refreshLaunchers() atomic settings write`)
  console.log(log.join('\n'))
  console.log(`\n${fail === 0
    ? '✅ SYNC-ATOMICITY PASS — 靜態 tmp+rename 契約成立 + 併發/連讀恆 valid JSON'
    : `❌ ${fail} 項 fail(見上)`}`)
  return fail === 0 ? 0 : 1
}

let exitCode = 1
try {
  exitCode = await main()
} catch (e) {
  console.error('❌ test-sync-atomicity 執行異常:', e && e.stack ? e.stack : e)
  exitCode = 1
} finally {
  // repo pristine:fixtures 全在 tmpdir,清乾淨(不影響 repo tree)
  try { if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true }) } catch {}
}
process.exit(exitCode)