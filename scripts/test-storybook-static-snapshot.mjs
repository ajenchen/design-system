#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 瀏覽器閘量的永遠是開跑那一刻的同一份完整建置;別人同時重建 Storybook、清空輸出目錄,不會讓閘讀到缺檔而把「沒拿到檔」說成「元件沒渲染」;
 *         建完之後被截斷 / 刪檔的建置(雲端同步衝突)以「儀器失效」拒絕並點名檔案,清單外多出的衝突副本不影響量測,沒有清單的舊建置照常放行但會警告
 *   紅: 拿掉快照(伺服器改回讀活目錄)、拿掉建置標記檢查、拿掉複製後比對,任一項都會讓對應題指名紅(三個故意弄壞的版本實測都 exit 1);
 *       2026-09-25 另把本測試的 import 指向五個弄壞的快照 lib 副本實測,各自指名紅:不比大小 / 不查缺檔 / 不呼叫核對 / 把清單外的檔當缺檔 / 沒清單就拒絕;
 *       修前的 HEAD 版(只驗標記)對「清單裡的 chunk 被截成 0 位元組」照樣放行
 *   綠: 全部用本機造的小型建置夾具、以注入的複製函式確定性地走到「複製途中被重建」那一枝;截斷 / 刪檔 / 衝突副本都是對夾具直接下手,
 *        清單由真正的 gen-build-info.mjs(--dir 指向夾具)產生,不依賴時序或真實建置,重複跑結果相同
 */
// meta-test for lib/storybook-static-snapshot.mjs —— 兩面對照:該拒絕時拒絕(以「儀器失效」的名義),
// 該放行時放行,而且放行後的快照真的與原目錄脫鉤(原目錄被清空/重建,快照不動)。
// 背景:data-table-invariants.mjs 2026-09-24 本機誤紅一次,因為另一個 agent 同時 build-storybook 清空了
// 輸出目錄,而閘每次導覽都讀活目錄(M37:把「路徑」當成「建置身分」)。
// 2026-09-25:同一個病的第二面 —— 本機 storybook-static 被雲端同步截成 0 位元組的 chunk、多出 `x 2.js`
// 衝突副本,build-info.json 卻完好;「標記存在且沒變」被當成「建置完整」。檔案清單那幾題就是這一面。
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, utimesSync, truncateSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { snapshotStorybookStatic, StorybookBuildNotStableError, sweepStaleSnapshots } from './lib/storybook-static-snapshot.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GEN_BUILD_INFO = join(REPO, 'scripts/gen-build-info.mjs')
// 交付給 consumer 的快照 lib 不 import launch-browser,標記字寫在它自己那邊 —— 兩邊必須是同一個字,
// 否則 lib/gate-selftest-meta.mjs 認不出快照的拒絕是「儀器失效」
const INSTRUMENT = new RegExp(`^${INSTRUMENT_FAIL_MARKER}\\b`)

const work = mkdtempSync(join(tmpdir(), 'snapshot-meta-'))
const src = join(work, 'storybook-static')
const fixture = (marker = '{"builtAt":"2026-09-24T00:00:00.000Z"}') => {
  rmSync(src, { recursive: true, force: true })
  mkdirSync(join(src, 'assets'), { recursive: true })
  writeFileSync(join(src, 'iframe.html'), '<div id="storybook-root"></div>')
  writeFileSync(join(src, 'assets', 'data-table.js'), 'export const table = "rows"; // 夠長,截斷後大小一定不同')
  writeFileSync(join(src, 'assets', 'combobox.stories.js'), 'export default { title: "Combobox" }')
  if (marker !== null) writeFileSync(join(src, 'build-info.json'), marker)
}
// 有檔案清單的夾具:清單由**真正的** gen-build-info.mjs 產生(寫入端與核對端必須是同一份格式)
const signedFixture = () => {
  fixture(null)
  const r = spawnSync(process.execPath, ['--', GEN_BUILD_INFO, `--dir=${src}`], { encoding: 'utf8' })
  assert.equal(r.status, 0, `gen-build-info.mjs --dir 失敗:${r.stderr}`)
}
const snapshotQuiet = (dir, options = {}) => {
  const lines = []
  const snap = snapshotStorybookStatic(dir, { ...options, log: (line) => lines.push(line) })
  return { snap, lines }
}
const refused = (fn, ...mustName) => assert.throws(fn, (e) => {
  assert.ok(e instanceof StorybookBuildNotStableError, `應丟 StorybookBuildNotStableError,實得 ${e?.constructor?.name}:${e?.message}`)
  assert.match(e.message, INSTRUMENT, `訊息必須以 ${INSTRUMENT_FAIL_MARKER} 開頭:${e.message}`)
  for (const name of mustName) assert.ok(e.message.includes(name), `訊息必須點名 ${name}:${e.message}`)
  return true
})
let passed = 0
const check = (label, fn) => { fn(); passed++; console.log(`✓ ${label}`) }

try {
  check('沒有 build-info.json(建置進行中 / 沒建完)→ 以儀器失效拒絕', () => {
    fixture(null)
    refused(() => snapshotStorybookStatic(src))
  })
  check('穩定建置 → 放行,快照內容與原目錄逐檔相同', () => {
    fixture()
    const { snap } = snapshotQuiet(src)
    for (const f of ['iframe.html', 'assets/data-table.js', 'build-info.json']) {
      assert.equal(readFileSync(join(snap.dir, f), 'utf8'), readFileSync(join(src, f), 'utf8'))
    }
    assert.equal(snap.buildInfo.builtAt, '2026-09-24T00:00:00.000Z')
    snap.dispose()
    assert.equal(existsSync(snap.dir), false, 'dispose 後快照目錄必須被移除')
  })
  check('快照建好後原目錄被清空(模擬 build-storybook 第一步)→ 快照不受影響', () => {
    fixture()
    const { snap } = snapshotQuiet(src)
    rmSync(src, { recursive: true, force: true })
    assert.equal(existsSync(join(snap.dir, 'iframe.html')), true)
    assert.equal(existsSync(join(snap.dir, 'assets', 'data-table.js')), true)
    snap.dispose()
  })
  check('複製途中重建開始(標記被刪)→ 以儀器失效拒絕,且不留下快照目錄', () => {
    fixture()
    let leaked = null
    refused(() => snapshotStorybookStatic(src, { log: () => {}, copy: (from, to) => { leaked = to; cpSync(from, to, { recursive: true }); rmSync(join(from, 'build-info.json')) } }))
    assert.equal(existsSync(leaked), false)
  })
  check('複製途中重建完成(標記被改寫)→ 以儀器失效拒絕', () => {
    fixture()
    refused(() => snapshotStorybookStatic(src, { log: () => {}, copy: (from, to) => { cpSync(from, to, { recursive: true }); writeFileSync(join(from, 'build-info.json'), '{"builtAt":"later"}') } }))
  })
  check('複製本身失敗 → 以儀器失效拒絕(不是被測元件的失敗)', () => {
    fixture()
    refused(() => snapshotStorybookStatic(src, { log: () => {}, copy: () => { throw new Error('ENOENT') } }))
  })

  // ── 建置完整性(2026-09-25):build-info.json 的檔案清單 ──
  check('gen-build-info.mjs 寫出檔案清單:逐檔大小、總數、整份清單的 sha256,不含 build-info.json 本身', () => {
    signedFixture()
    const info = JSON.parse(readFileSync(join(src, 'build-info.json'), 'utf8'))
    assert.deepEqual(Object.keys(info.manifest.files), ['assets/combobox.stories.js', 'assets/data-table.js', 'iframe.html'])
    assert.equal(info.manifest.files['iframe.html'], Buffer.byteLength('<div id="storybook-root"></div>'))
    assert.equal(info.manifest.fileCount, 3)
    assert.match(info.manifest.sha256, /^[0-9a-f]{64}$/)
    assert.ok('commit' in info && 'version' in info && 'builtAt' in info, 'verify-preview-head.mjs 讀的既有欄位必須都還在')
  })
  check('有清單、檔案完整 → 放行,每個檔都核對過,沒有多餘的說明', () => {
    signedFixture()
    const { snap, lines } = snapshotQuiet(src)
    assert.equal(snap.integrity.status, 'verified')
    assert.equal(snap.integrity.fileCount, 3)
    assert.deepEqual(snap.integrity.extras, [])
    assert.deepEqual(lines, [])
    snap.dispose()
  })
  check('清單裡的 chunk 被截成 0 位元組(今天本機的雲端同步毀損)→ 以儀器失效拒絕並點名該檔', () => {
    signedFixture()
    truncateSync(join(src, 'assets', 'data-table.js'), 0)
    refused(() => snapshotQuiet(src), 'assets/data-table.js', '建置不完整', '不是被測元件的失敗')
  })
  check('清單裡的 chunk 被刪掉 → 以儀器失效拒絕並點名該檔', () => {
    signedFixture()
    rmSync(join(src, 'assets', 'combobox.stories.js'))
    refused(() => snapshotQuiet(src), 'assets/combobox.stories.js', '不見了')
  })
  check('清單外多出雲端同步的衝突副本(`data-table 2.js`)→ 放行,只記一筆說明', () => {
    signedFixture()
    writeFileSync(join(src, 'assets', 'data-table 2.js'), 'export {}')
    const { snap, lines } = snapshotQuiet(src)
    assert.equal(snap.integrity.status, 'verified')
    assert.deepEqual(snap.integrity.extras, ['assets/data-table 2.js'])
    assert.equal(lines.length, 1)
    assert.match(lines[0], /不在清單裡.*data-table 2\.js/)
    assert.doesNotMatch(lines[0], INSTRUMENT)
    snap.dispose()
  })
  check('舊建置沒有清單 → 放行,但印一行警告(不是靜默)', () => {
    fixture()
    const { snap, lines } = snapshotQuiet(src)
    assert.equal(snap.integrity.status, 'no-manifest')
    assert.equal(lines.length, 1)
    assert.match(lines[0], /沒有檔案清單/)
    snap.dispose()
  })
  check('清單本身被改過(sha256 對不上)→ 以儀器失效拒絕', () => {
    signedFixture()
    const info = JSON.parse(readFileSync(join(src, 'build-info.json'), 'utf8'))
    info.manifest.files['iframe.html'] += 1
    writeFileSync(join(src, 'build-info.json'), JSON.stringify(info))
    refused(() => snapshotQuiet(src), '清單本身不一致')
  })

  // 共用伺服器(21 支瀏覽器閘經由它)必須真的走快照:原目錄被清空後,同一個 origin 仍拿得到檔。
  fixture()
  const server = await startA11yStaticServer({ rootDirectory: src, defaultFile: 'iframe.html' })
  check('共用伺服器:有 build-info.json 的根目錄 → 從快照供檔', () => assert.ok(server.snapshot && server.snapshot.dir !== src))
  rmSync(src, { recursive: true, force: true })
  const kept = await fetch(`${server.origin}/iframe.html`)
  check('共用伺服器:原目錄被清空後 iframe.html 仍是 200(沒有被活目錄的清空拖垮)', () => assert.equal(kept.status, 200))
  const missing = await fetch(`${server.origin}/assets/nope.js?v=1`)
  check('共用伺服器:404 進帳本(去掉 query),呼叫端失敗時可以印出「沒拿到哪個檔」', () => {
    assert.equal(missing.status, 404)
    assert.deepEqual(server.notFound, ['/assets/nope.js'])
  })
  const snapDir = server.snapshot.dir
  await server.stop()
  check('共用伺服器:stop 之後快照目錄被移除', () => assert.equal(existsSync(snapDir), false))
  // 共用伺服器同樣要擋截斷的建置(瀏覽器閘全部經由它)
  signedFixture()
  truncateSync(join(src, 'assets', 'data-table.js'), 0)
  let truncatedThrew = null
  try { await startA11yStaticServer({ rootDirectory: src, defaultFile: 'iframe.html' }) } catch (e) { truncatedThrew = e }
  check('共用伺服器:清單裡的檔被截斷 → 以儀器失效丟出,不開始供檔', () => {
    assert.ok(truncatedThrew && INSTRUMENT.test(truncatedThrew.message) && truncatedThrew.message.includes('assets/data-table.js'), String(truncatedThrew?.message))
  })
  // 不是 Storybook 建置的根目錄(名字不是 storybook-static、也沒有完成標記)→ 照舊直接服務。
  const consumerDist = join(work, 'consumer-dist')
  mkdirSync(consumerDist, { recursive: true })
  writeFileSync(join(consumerDist, 'iframe.html'), '<div id="app"></div>')
  const plain = await startA11yStaticServer({ rootDirectory: consumerDist, defaultFile: 'iframe.html' })
  check('共用伺服器:沒有 build-info.json 的根目錄(consumer dist 等)照舊直接服務', () => assert.equal(plain.snapshot, null))
  const live = await fetch(`${plain.origin}/iframe.html`)
  check('共用伺服器:直接服務的根目錄照常 200', () => assert.equal(live.status, 200))
  await plain.stop()
  // 缺口一:目錄叫 storybook-static 但沒有完成標記(別人重建到一半)→ 不得退回讀活目錄,要以儀器失效丟出。
  const namedBuild = join(work, 'storybook-static')
  fixture(null)
  let threw = null
  try { await startA11yStaticServer({ rootDirectory: namedBuild, defaultFile: 'iframe.html' }) } catch (e) { threw = e }
  check('共用伺服器:storybook-static 缺完成標記(重建中)→ 以儀器失效丟出,不退回讀活目錄', () =>
    assert.ok(threw instanceof Error && INSTRUMENT.test(threw.message)))
  // 缺口二:被強制中止留下的舊快照,下一次建快照時清掉;新的(可能別人正在用)不動。
  const sweepRoot = mkdtempSync(join(tmpdir(), 'snapshot-sweep-'))
  const stale = join(sweepRoot, 'storybook-static-snapshot-old'); mkdirSync(stale)
  const fresh = join(sweepRoot, 'storybook-static-snapshot-new'); mkdirSync(fresh)
  const unrelated = join(sweepRoot, 'something-else'); mkdirSync(unrelated)
  const now = Date.now()
  utimesSync(stale, new Date(now - 7 * 3600e3), new Date(now - 7 * 3600e3))
  utimesSync(unrelated, new Date(now - 7 * 3600e3), new Date(now - 7 * 3600e3))
  const removed = sweepStaleSnapshots({ root: sweepRoot, now })
  check('殘留清理:超過 6 小時的舊快照被清掉,剛建的與不相干的目錄不動', () => {
    assert.deepEqual(removed, [stale])
    assert.equal(existsSync(stale), false)
    assert.equal(existsSync(fresh), true)
    assert.equal(existsSync(unrelated), true)
  })
  rmSync(sweepRoot, { recursive: true, force: true })
  // 任何一題失敗都會丟出而中止,走到這裡 = 全部題目都過(題數不寫死,免得加題忘了改數字)
  console.log(`✓ storybook-static-snapshot meta-test: ${passed} 題全過`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
