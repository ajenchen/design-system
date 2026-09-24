#!/usr/bin/env node
// field-size-regression-diff.mjs — Q2 架構改動前後視覺回歸(2026-06-08)
//
// Q2(size 經 surface context 自動流給 Field controls)預期對所有現有 composition Δ=0
// (prop 永遠最高優先;surface-size 只在「cell 漏傳 size」時才觸發,現況無此情形)。
// 本 script 截 baseline(改動前 storybook-static)vs after(改動後重建)同一批 story,pixelmatch
// 比對 → 任何非-AA-noise 差異 = 改壞了,印出 diff PNG 供人 review + exit 1。
//
// 用法:node scripts/field-size-regression-diff.mjs --baseline=storybook-static-baseline --after=storybook-static
//       [--only=<story id 正規式>] [--budget=0.02] [--out=<Git 擁有的 evidence 根目錄或其子目錄>]
// 覆蓋:9 Field 控件(input/numberinput/textarea/select/combobox/datepicker/timepicker/peoplepicker/linkinput)
//       的 overview/size-matrix/state-behavior/mode-matrix + DataTable overview/inspector/column-types。
// 結束碼:0 = 每一支都量到且 Δ≈0;1 = 至少一支畫面真的變了(CHANGED / DIM-MISMATCH);
//         2 = 儀器失效(有 story 沒量到、或一支都沒選到)—— **沒量到不等於沒變**,不得當綠。
// 手動工具,不在 CI;沒有任何文件/skill 引用它(2026-09-25 盤點),用法以本檔頭為準。
//
// ── 2026-09-25 修:自 a7b2be94(2026-09-16)改用 launchBrowser 之後就沒有真的比對過任何一張圖 ──
// launchBrowser 一定帶 `--single-process`(沙箱起 Chromium 的必要參數,見 lib/launch-browser.mjs 檔頭):
// 該模式下 `browser.newPage()`(= 開一個新 context)用完 `page.close()` 會把整個瀏覽器一起關掉,
// 於是第一張截完之後,每一次 newPage 都回「Target page, context or browser has been closed」——
// 92 支全數「shot 失敗」、約 5 秒 exit 1,而結尾還印「92 story 有非預期視覺差異」,把儀器壞掉講成畫面變了。
// 現在**每一張截圖各開一個全新的瀏覽器、用完整個關掉**(不關 page、不開第二個 context):
//   - 不用「一個 page 走完全部」:cookie 在 localhost 不分埠共用(例如 Sidebar 的開合 cookie),
//     共用 page 會讓前一支 story、甚至 baseline 那一張的狀態滲進 after 那一張,兩邊不再對稱。
//   - 代價是每張多約 0.5 秒啟動;換到的是「每一張都從同樣乾淨的狀態開始」這件事本身。
// 同時把「已渲染」從代理換成直接訊號(M37):舊寫法是 networkidle + 固定睡 500/1200ms,
// 慢的機器上會拍到半成品、再把半成品的差異指控成回歸;現在等的是
//   (1) Storybook 自己的渲染狀態 `currentRender.phase === 'finished'`(含 play 與 afterEach 都跑完),
//   (2) 根節點真的有內容、沒有頁面例外、JS/CSS 沒 404(lib/storybook-render-health.mjs,
//       擋掉「兩邊都空白 → 0 像素差 → 假綠」),
//   (3) 渲染期間發出的請求全部結束(遠端頭像圖等)、字型載完,
//   (4) DOM 連續 300ms 沒有任何變動(量的是「畫面不再變」本身,還在變就繼續等),
//   並以 `animations: 'disabled'` 截圖:有限的轉場快轉到終點、無限動畫停在起點 —— 兩邊都拍穩態,
//   不會拍到 blur 之後焦點框褪色的中間值(失敗記憶索引「量 focus 顏色不等 transition」同一件事)。
// 任何一步等不到 → 該支記為 INSTRUMENT-FAIL(沒量到),不記為 CHANGED,也不記為 OK。

import { launchBrowser } from './lib/launch-browser.mjs'
import { createStorybookRenderHealthMonitor } from './lib/storybook-render-health.mjs'
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import {
  ensureRuntimeEvidenceDirectory,
  ensureRuntimeEvidenceRoot,
  prepareRuntimeEvidenceFile,
} from './lib/governance-runtime-evidence.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

// 取第一個 `=` 之後的全部(`--only=` 的正規式本身可能含 `=`)
const arg = (k, d) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d }
const BASELINE = arg('baseline', 'storybook-static-baseline')
const AFTER = arg('after', 'storybook-static')
const OUT_ARG = arg('out', null)
const ONLY = arg('only', null)
const ROOT = process.cwd()
const OUT = OUT_ARG
  ? ensureRuntimeEvidenceRoot({ repoRoot: ROOT, explicitRoot: OUT_ARG })
  : ensureRuntimeEvidenceDirectory({ repoRoot: ROOT, relativePath: 'visual/q2-field-size' })
const PCT_BUDGET = parseFloat(arg('budget', '0.02'))  // % 像素差預算(吸收 rebuild AA noise);真 font 改動遠超此
const RENDER_TIMEOUT_MS = 30_000  // 等渲染完成 / 請求結束的上限(等不到 = 儀器失效,不是畫面變了)
const DOM_QUIET_MS = 300          // 「畫面不再變」的判定窗:DOM 連續這麼久沒有任何變動
const DOM_QUIET_MAX_MS = 10_000   // 一直在變、等不到穩態 → 這張不可比,記儀器失效

for (const d of [BASELINE, AFTER]) if (!existsSync(join(d, 'index.json'))) { console.error(`✗ ${d}/index.json 不存在(先 build-storybook)`); process.exit(2) }
const evidenceFile = (relativePath) => prepareRuntimeEvidenceFile({ repoRoot: ROOT, explicitRoot: OUT, relativePath })
// 先清掉上一次留下的 diff/after 圖:資料夾裡「有圖」不等於「這次有差異」
if (process.env.GOVERNANCE_READ_ONLY !== '1') {
  for (const name of readdirSync(OUT)) {
    const file = join(OUT, name)
    if (/\.(?:diff|after)\.png$/.test(name) && lstatSync(file).isFile()) rmSync(file)
  }
}

// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
// (沒有 build-info.json 的根目錄 —— 例如凍結的 baseline —— 照舊直接供檔;兩邊都改用臨時埠,不再寫死 8821/8822。)
const srvB = await startA11yStaticServer({ rootDirectory: BASELINE, defaultFile: 'iframe.html' })
const srvA = await startA11yStaticServer({ rootDirectory: AFTER, defaultFile: 'iframe.html' })
// 失敗時一併印同源 404 帳本:不讓「儀器沒拿到檔」被讀成「畫面變了」
const report404 = () => { for (const [label, srv] of [['baseline', srvB], ['after', srvA]]) if (srv.notFound.length) console.error(`同源 404(${label}):`, [...new Set(srv.notFound)].join(', ')) }

// ── story id 動態抓(不寫死 CJK tier 名)── 從實際供檔的同一份快照讀
const idx = JSON.parse(readFileSync(join(srvA.snapshot?.dir ?? AFTER, 'index.json'), 'utf8'))
const entries = Object.values(idx.entries || idx.stories || {})
const CONTROLS = ['input','numberinput','textarea','select','combobox','datepicker','timepicker','peoplepicker','linkinput','segmentedcontrol','rating','button','checkbox','switch','radiogroup','slider','avatar']
const TYPES = ['overview','size-matrix','state-behavior','mode-matrix','inspector','column-types']
const onlyRe = ONLY ? new RegExp(ONLY) : null
const STORY_IDS = entries
  .filter(e => e.type === 'story' && (
    ((CONTROLS.some(c => e.id.startsWith(`design-system-components-${c}-`)) || e.id.startsWith('design-system-components-datatable-')) &&
      TYPES.some(t => e.id.endsWith('--' + t)))
    // Field 元件 stories(<Field size> cascade 構圖最可能受 B 組 fix 影響 → 全納入回歸)
    || e.id.startsWith('design-system-components-field-')
  ))
  .map(e => e.id)
  .filter(id => !onlyRe || onlyRe.test(id))
  .sort()
// baseline 也要有同 id(rename 防漏)
const baseIdx = JSON.parse(readFileSync(join(srvB.snapshot?.dir ?? BASELINE, 'index.json'), 'utf8'))
const baseIds = new Set(Object.values(baseIdx.entries || baseIdx.stories || {}).map(e => e.id))
const onlyAfter = STORY_IDS.filter(id => !baseIds.has(id))
if (onlyAfter.length) console.warn(`⚠️  ${onlyAfter.length} story 只在 after 有(新增,跳過 diff):`, onlyAfter.join(', '))
const DIFF_IDS = STORY_IDS.filter(id => baseIds.has(id))
// 一支都沒選到 = 什麼都沒量,不得印「全 0 支 Δ≈0」當綠
if (!DIFF_IDS.length) { console.error(`✗ 儀器失效:沒有任何 story 可比對${ONLY ? `(--only=${ONLY} 一支都沒選到)` : ''}`); await srvB.stop(); await srvA.stop(); process.exit(2) }

class InstrumentError extends Error {}

async function shot(origin, id) {
  // 每張一個全新的瀏覽器(為什麼見檔頭):不呼叫 page.close()、不開第二個 context,用完整個關掉。
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const health = createStorybookRenderHealthMonitor(page)
    const inflight = new Set()
    page.on('request', (r) => inflight.add(r))
    page.on('requestfinished', (r) => inflight.delete(r))
    page.on('requestfailed', (r) => inflight.delete(r))
    const interactive = /inspector|state-behavior/.test(id)

    await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story&globals=theme:light;density:md`, { waitUntil: 'load', timeout: 60_000 })
    // (1) 等「這一支 story 的渲染(含 play / afterEach)跑完」這件事本身
    const finished = await page.waitForFunction((storyId) => {
      const r = window.__STORYBOOK_PREVIEW__?.currentRender
      return r?.id === storyId && r.phase === 'finished'
    }, id, { timeout: RENDER_TIMEOUT_MS }).then(() => true, () => false)
    if (!finished) {
      const seen = await page.evaluate(() => { const r = window.__STORYBOOK_PREVIEW__?.currentRender; return r ? `${r.id} / ${r.phase}` : '沒有 currentRender(預覽沒起來或 story 不存在)' }).catch(() => '讀不到')
      throw new InstrumentError(`${RENDER_TIMEOUT_MS / 1000} 秒內沒等到渲染完成(最後看到:${seen})`)
    }
    // (2) 根節點有內容、無頁面例外、JS/CSS 沒失敗 —— 擋「兩邊都空白 → 0 像素差」的假綠
    await health.assertHealthy({ label: id })
    // (3) 渲染期間發出的請求全部結束
    const deadline = Date.now() + RENDER_TIMEOUT_MS
    while (inflight.size) {
      if (Date.now() > deadline) throw new InstrumentError(`請求 ${RENDER_TIMEOUT_MS / 1000} 秒未結束:${[...inflight].slice(0, 3).map(r => r.url()).join(', ')}`)
      await page.waitForTimeout(50)
    }
    if (!interactive) { try { await page.evaluate(() => (document.activeElement)?.blur?.()) } catch {} }
    await page.evaluate(() => document.fonts.ready)
    // (4) DOM 連續 DOM_QUIET_MS 沒有變動(還在變就繼續等,不是固定睡)
    const quiet = await page.evaluate(({ quietMs, maxMs }) => new Promise((resolve) => {
      const start = performance.now()
      let last = start
      const mo = new MutationObserver(() => { last = performance.now() })
      mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
      const tick = () => {
        const now = performance.now()
        if (now - last >= quietMs) { mo.disconnect(); resolve(true); return }
        if (now - start >= maxMs) { mo.disconnect(); resolve(false); return }
        setTimeout(tick, 25)
      }
      setTimeout(tick, 25)
    }), { quietMs: DOM_QUIET_MS, maxMs: DOM_QUIET_MAX_MS })
    if (!quiet) throw new InstrumentError(`DOM ${DOM_QUIET_MAX_MS / 1000} 秒內沒有連續 ${DOM_QUIET_MS}ms 靜止(畫面一直在變,這張不可比)`)
    await health.assertHealthy({ label: id })  // 等穩態期間冒出的例外也要算
    const buf = await page.screenshot({ fullPage: true, animations: 'disabled' })
    return PNG.sync.read(buf)
  } finally {
    await browser.close().catch(() => {})
  }
}

const results = []
const safeName = (id) => id.replace(/[^a-z0-9-]/gi, '_')
const line = (r) => `  ${r.verdict === 'OK' ? '✓' : '✗'} ${r.id}  ${r.verdict}${r.diffPx != null ? ` (${r.diffPx}px / ${r.pct}%)` : ''}${r.detail ? `  ${r.detail}` : ''}`
console.log(`=== Q2 field-size 視覺回歸(${DIFF_IDS.length} stories,預算 ${PCT_BUDGET}%)===`)
try {
  for (const id of DIFF_IDS) {
    let b, a, r
    try {
      b = await shot(srvB.origin, id)
      a = await shot(srvA.origin, id)
    } catch (e) {
      r = { id, verdict: 'INSTRUMENT-FAIL', detail: `${b ? 'after' : 'baseline'} 沒量到:${String(e?.message || e).split('\n')[0]}` }
    }
    if (!r && (b.width !== a.width || b.height !== a.height)) {
      r = { id, verdict: 'DIM-MISMATCH', baseline: `${b.width}x${b.height}`, after: `${a.width}x${a.height}`, detail: `尺寸不同 baseline ${b.width}x${b.height} vs after ${a.width}x${a.height}` }
      writeFileSync(evidenceFile(safeName(id) + '.after.png'), PNG.sync.write(a))
    }
    if (!r) {
      const diff = new PNG({ width: b.width, height: b.height })
      const diffPx = pixelmatch(b.data, a.data, diff.data, b.width, b.height, { threshold: 0.1, includeAA: false })
      const pct = (diffPx / (b.width * b.height)) * 100
      r = { id, diffPx, pct: +pct.toFixed(4), verdict: pct <= PCT_BUDGET ? 'OK' : 'CHANGED' }
      if (r.verdict === 'CHANGED') {
        writeFileSync(evidenceFile(safeName(id) + '.diff.png'), PNG.sync.write(diff))
        writeFileSync(evidenceFile(safeName(id) + '.after.png'), PNG.sync.write(a))
      }
    }
    results.push(r)
    console.log(line(r))
  }
} catch (e) { report404(); throw e }
finally { await srvB.stop(); await srvA.stop() }
writeFileSync(evidenceFile('report.json'), JSON.stringify({ baseline: BASELINE, after: AFTER, only: ONLY, budget: PCT_BUDGET, results }, null, 2) + '\n')

const changed = results.filter(r => r.verdict === 'CHANGED' || r.verdict === 'DIM-MISMATCH')
const broken = results.filter(r => r.verdict === 'INSTRUMENT-FAIL')
const ok = results.filter(r => r.verdict === 'OK')
console.log(`\n小計:OK ${ok.length} / 畫面有變 ${changed.length} / 沒量到 ${broken.length}(共 ${results.length})`)
if (broken.length) {
  console.error(`\n✗ 儀器失效:${broken.length} 支 story 沒量到 —— 這不是畫面變了,但本次也不能宣稱這些 story 零回歸:\n  ${broken.map(r => `${r.id}: ${r.detail}`).join('\n  ')}`)
  report404()
}
if (changed.length) {
  console.error(`\n✗ ${changed.length} story 有非預期視覺差異(diff PNG 在 ${OUT}):\n  ${changed.map(r => `${r.id}: ${r.detail ?? `diff ${r.diffPx}px (${r.pct}%) > 預算 ${PCT_BUDGET}%`}`).join('\n  ')}`)
  process.exit(1)
}
if (broken.length) process.exit(2)
console.log(`\n✓ 全 ${DIFF_IDS.length} stories 都量到且 Δ≈0(≤ ${PCT_BUDGET}% AA noise budget)— Q2 架構改動視覺零回歸。`)
process.exit(0)
