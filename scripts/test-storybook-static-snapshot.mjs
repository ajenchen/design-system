#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 瀏覽器閘量的永遠是開跑那一刻的同一份完整建置;別人同時重建 Storybook、清空輸出目錄,不會讓閘讀到缺檔而把「沒拿到檔」說成「元件沒渲染」
 *   紅: 拿掉快照(伺服器改回讀活目錄)、拿掉建置標記檢查、拿掉複製後比對,任一項都會讓對應題指名紅(三個故意弄壞的版本實測都 exit 1)
 *   綠: 全部用本機造的小型建置夾具、以注入的複製函式確定性地走到「複製途中被重建」那一枝,不依賴時序或真實建置,重複跑結果相同
 */
// meta-test for lib/storybook-static-snapshot.mjs —— 兩面對照:該拒絕時拒絕(以「儀器失效」的名義),
// 該放行時放行,而且放行後的快照真的與原目錄脫鉤(原目錄被清空/重建,快照不動)。
// 背景:data-table-invariants.mjs 2026-09-24 本機誤紅一次,因為另一個 agent 同時 build-storybook 清空了
// 輸出目錄,而閘每次導覽都讀活目錄(M37:把「路徑」當成「建置身分」)。
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { snapshotStorybookStatic, StorybookBuildNotStableError, sweepStaleSnapshots } from './lib/storybook-static-snapshot.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const work = mkdtempSync(join(tmpdir(), 'snapshot-meta-'))
const src = join(work, 'storybook-static')
const fixture = (marker = '{"builtAt":"2026-09-24T00:00:00.000Z"}') => {
  rmSync(src, { recursive: true, force: true })
  mkdirSync(join(src, 'assets'), { recursive: true })
  writeFileSync(join(src, 'iframe.html'), '<div id="storybook-root"></div>')
  writeFileSync(join(src, 'assets', 'data-table.js'), 'export {}')
  if (marker !== null) writeFileSync(join(src, 'build-info.json'), marker)
}
let passed = 0
const check = (label, fn) => { fn(); passed++; console.log(`✓ ${label}`) }

try {
  check('沒有 build-info.json(建置進行中 / 沒建完)→ 以儀器失效拒絕', () => {
    fixture(null)
    assert.throws(() => snapshotStorybookStatic(src), (e) => e instanceof StorybookBuildNotStableError && /INSTRUMENT/.test(e.message))
  })
  check('穩定建置 → 放行,快照內容與原目錄逐檔相同', () => {
    fixture()
    const snap = snapshotStorybookStatic(src)
    for (const f of ['iframe.html', 'assets/data-table.js', 'build-info.json']) {
      assert.equal(readFileSync(join(snap.dir, f), 'utf8'), readFileSync(join(src, f), 'utf8'))
    }
    assert.equal(snap.buildInfo.builtAt, '2026-09-24T00:00:00.000Z')
    snap.dispose()
    assert.equal(existsSync(snap.dir), false, 'dispose 後快照目錄必須被移除')
  })
  check('快照建好後原目錄被清空(模擬 build-storybook 第一步)→ 快照不受影響', () => {
    fixture()
    const snap = snapshotStorybookStatic(src)
    rmSync(src, { recursive: true, force: true })
    assert.equal(existsSync(join(snap.dir, 'iframe.html')), true)
    assert.equal(existsSync(join(snap.dir, 'assets', 'data-table.js')), true)
    snap.dispose()
  })
  check('複製途中重建開始(標記被刪)→ 以儀器失效拒絕,且不留下快照目錄', () => {
    fixture()
    let leaked = null
    assert.throws(() => snapshotStorybookStatic(src, { copy: (from, to) => { leaked = to; cpSync(from, to, { recursive: true }); rmSync(join(from, 'build-info.json')) } }),
      (e) => e instanceof StorybookBuildNotStableError && /INSTRUMENT/.test(e.message))
    assert.equal(existsSync(leaked), false)
  })
  check('複製途中重建完成(標記被改寫)→ 以儀器失效拒絕', () => {
    fixture()
    assert.throws(() => snapshotStorybookStatic(src, { copy: (from, to) => { cpSync(from, to, { recursive: true }); writeFileSync(join(from, 'build-info.json'), '{"builtAt":"later"}') } }),
      (e) => e instanceof StorybookBuildNotStableError)
  })
  check('複製本身失敗 → 以儀器失效拒絕(不是被測元件的失敗)', () => {
    fixture()
    assert.throws(() => snapshotStorybookStatic(src, { copy: () => { throw new Error('ENOENT') } }), (e) => e instanceof StorybookBuildNotStableError)
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
    assert.ok(threw instanceof StorybookBuildNotStableError && /INSTRUMENT/.test(threw.message)))
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
  console.log(`✓ storybook-static-snapshot meta-test: ${passed}/14`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
