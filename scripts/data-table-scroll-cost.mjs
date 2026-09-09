#!/usr/bin/env node
/**
 * DataTable 捲動成本閘 v3 —— 2026-09-08(Codex R6 校正後)
 *
 * 背景:user「專案排程全功能整合的捲動還是很卡頓」。CPU 剖析(agent 四路稽核第 4 路)+ Codex R6 對辯的結論:
 *   每個滾輪刻度在 scroll 事件內 flushSync 重繪整個 DataTableInner(三區 69 列、所有格子沒有 memo 邊界),
 *   mirror 列訂閱整個 dnd PublicContext(列一掛卸就整批重繪),格內量測 hook 在捲動中讀寫交錯。
 *   前兩版閘(gBCR 次數 / 1px 步進)量不到這條路徑,綠燈是假的 —— Codex R6 明講「總計數天然機器相關,
 *   最能守住回歸的是明確工作負載下的結構斷言」。
 *
 * 量法(換列步進:每步 60px,虛擬視窗必換列):
 *   - React commits/步:用 __REACT_DEVTOOLS_GLOBAL_HOOK__ 的 onCommitFiberRoot(production build 也會呼叫)
 *   - DOM 變動/步:MutationObserver 監看中間捲動區(childList + attributes),分「新增/移除節點」與「屬性變動」
 *   - 換列數/步:每步前後比對 [data-row-index] 集合(新增 + 移除的列數)
 *   - 資訊:CDP Performance.getMetrics 的 ScriptDuration / LayoutCount / RecalcStyleCount 差分(機器相關,只印)
 * 斷言(機器無關的**比例**,不是絕對毫秒):
 *   R1 屬性變動/步 ≤ ATTR_PER_ROW × 可見列數 —— 舊列不該被重繪:重繪會重寫 transform / class 等屬性
 *      (修前每步 ~全部列都被重繪;修後只有新列 + translateY 更新)
 *   R2 節點增減/步 ≤ NODES_PER_ROW × 換列數 + 8 —— 只允許新進 / 移出視窗的列建與拆
 *   R3 commits/步 ≤ COMMITS —— 換列本身一次(virtualizer)+ 最多一次收斂
 *   1px 步進(不換列)沿用:getBoundingClientRect ≤ 12/步(把手 / dnd / 列高的每次 render 成本)
 * 對照組:`--selftest` 把預算全設 0 必紅(證明三個計數器都在數)。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATIC = process.env.DT_STATIC || join(REPO, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const BUDGET = SELFTEST
  ? { attrPerRow: 0, nodesPerRow: 0, nodesBase: 0, commits: 0, gbcrFine: 0, touchedOld: 0, renderedHeader: 0 }
  // 修後實測值 × 餘裕,見檔尾記錄。commits 是「固定版本的回歸預算」(Codex R6):實測 6.0–6.15/步 = 1 次虛擬捲動
  // + 5 次新列掛載副作用鏈(Radix Tooltip 觸發器 ref-state / Radix Checkbox button ref + useSize / RowDragHandle
  // portal / dnd droppable 註冊 + Popper anchor + Tag 摺疊量測 / Avatar 圖片載入),全部只碰新列,不是整表。
  : { attrPerRow: 2, nodesPerRow: 400, nodesBase: 8, commits: 8, gbcrFine: 12, touchedOld: 12, renderedHeader: 4 }
const STORIES = ['design-system-components-datatable-展示--roadmap-all-in-one', 'design-system-components-datatable-展示--virtual-scroll']

const server = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
  const f = join(STATIC, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, r))
const BASE = `http://localhost:${server.address().port}`
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.addInitScript((traceOn) => {
  window.__gbcrTraceOn = traceOn
  window.__gbcr = 0
  const orig = Element.prototype.getBoundingClientRect
  window.__gbcrBy = {}
  Element.prototype.getBoundingClientRect = function () { window.__gbcr++; if (window.__gbcrTrace) { const l = (new Error().stack || '').split('\n').slice(2, 4).map((x) => x.trim().replace(/\(.*\//, '(')).join(' < '); window.__gbcrBy[l] = (window.__gbcrBy[l] || 0) + 1 }; return orig.call(this) }
  // React DevTools hook 的最小樁:production build 也會在每次 commit 呼叫 onCommitFiberRoot
  window.__commits = 0
  window.__rendered = {}
  window.__touched = {}
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false, supportsFiber: true, renderers: new Map(),
    inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id },
    // 每次 commit 走一遍 fiber 樹(React DevTools 同法):沒被碰到的子樹沿用同一個 fiber 物件;被碰到且 flags&1
    // (PerformedWork)的元件 = 真的執行了 render。依最近的列 host(data-row-index;alternate 為 null = 本次掛載)
    // 或表頭(role=columnheader)歸類,得到「舊列裡重繪的元件數」與「表頭重繪的元件數」。
    onCommitFiberRoot(_id, root) {
      window.__commits++
      try {
        const prev = window.__prevFibers; const cur = new Set(); const st = [root.current]
        while (st.length) {
          const f = st.pop(); if (!f) continue
          cur.add(f)
          // 兩個計數(Codex R7 Q6):flags&1(PerformedWork)會漏掉「函式執行了但 props 同、無更新而 bailout」的情況,
          // 所以另計 touched = 這次 commit 被 clone 的元件 fiber(含 bailout);舊列裡 touched 也該是 0。
          if ((!prev || !prev.has(f)) && (f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15)) {
            let where = 'other'
            for (let p = f.return; p; p = p.return) { const mp = p.tag === 5 ? p.memoizedProps : null; if (mp && mp['data-row-index'] != null) { where = window.__rowsBefore && window.__rowsBefore.has(String(mp['data-row-index'])) ? 'rowOld' : 'rowNew'; break } if (mp && mp.role === 'columnheader') { where = 'header'; break } }
            window.__touched[where] = (window.__touched[where] || 0) + 1
            if (f.flags & 1) window.__rendered[where] = (window.__rendered[where] || 0) + 1
          }
          if (f.child) st.push(f.child); if (f.sibling) st.push(f.sibling)
        }
        window.__prevFibers = cur
      } catch (e) { window.__renderedErr = String(e) }
    }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    checkDCE() {}, on() {}, off() {}, emit() {}, sub() { return () => {} },
  }
}, process.argv.includes('--gbcr-trace'))
const cdp = await page.context().newCDPSession(page)
// 2026-09-09:`--cpu-throttle=<rate>` 模擬 CI 慢機器(CDP Emulation.setCPUThrottlingRate);`--gbcr-trace` 把 getBoundingClientRect 的呼叫者取樣印出(診斷用,不影響判定)
const CPU_THROTTLE = Number((process.argv.find((a) => a.startsWith('--cpu-throttle=')) || '').split('=')[1] || 1)
if (CPU_THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
const GBCR_TRACE = process.argv.includes('--gbcr-trace')
if (GBCR_TRACE) page.on('console', (m) => { if (m.text().startsWith('GBCR-CALLERS')) console.log(m.text().slice(0, 1200)) })
await cdp.send('Performance.enable')
const metrics = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); const m = Object.fromEntries(metrics.map((x) => [x.name, x.value])); return { script: m.ScriptDuration, layout: m.LayoutCount, style: m.RecalcStyleCount } }

let failed = 0
let controlBad = 0, controlSeen = 0
for (const id of STORIES) {
  await page.goto(`${BASE}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const hasHook = await page.evaluate(() => window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size > 0)
  if (!hasHook) { console.log(`✗ ${id}:React 沒接上 DevTools hook 樁,commit 計數器無效`); failed++; continue }
  const m0 = await metrics()
  const r = await page.evaluate(async () => {
    const el = document.querySelector('[data-datatable-hscroll]')
    if (!el) return { crashed: true }
    if (el.scrollHeight <= el.clientHeight + 1) return null
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const rowsNow = () => new Set([...document.querySelectorAll('[data-datatable-panel] [data-row-index], [data-datatable-hscroll] [data-row-index]')].map((e) => e.closest('[data-datatable-panel],[data-datatable-hscroll]')?.getAttribute('data-datatable-panel') + ':' + e.getAttribute('data-row-index')))
    const visibleRows = () => document.querySelectorAll('[data-datatable-hscroll] [data-row-index]').length
    let attrs = 0, nodes = 0; const attrNames = {}
    const mo = new MutationObserver((list) => { for (const m of list) { if (m.type === 'attributes') { attrs++; attrNames[m.attributeName] = (attrNames[m.attributeName] || 0) + 1 } else nodes += m.addedNodes.length + m.removedNodes.length } })
    window.__dtRowRenderStats = { fresh: 0, missIdx: {} }
    const root = el.closest('[data-data-table-outer]') || el
    mo.observe(root, { subtree: true, childList: true, attributes: true })
    // 暖機到中段
    el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 3); await frame(); await frame()
    // 1px 步進:每次 render 的成本(不換列)
    window.__gbcr = 0; window.__gbcrBy = {}; window.__gbcrTrace = window.__gbcrTraceOn
    for (let i = 0; i < 30; i++) { el.scrollTop += 1; await frame() }
    const gbcrFine = window.__gbcr / 30
    window.__gbcrTrace = false
    if (window.__gbcrTraceOn) console.log('GBCR-CALLERS ' + JSON.stringify(Object.entries(window.__gbcrBy).sort((a, b) => b[1] - a[1]).slice(0, 8)))
    // 換列步進
    await frame(); attrs = 0; nodes = 0; window.__commits = 0; window.__rendered = {}; window.__touched = {}; window.__dtRowRenderStats.fresh = 0;
    window.__dtRowRenderStats.missIdx = {};
    const perStep = { renderedOld: [], touchedOld: [], header: [] }; for (const k of Object.keys(attrNames)) delete attrNames[k]
    let changed = 0
    const steps = 20
    for (let i = 0; i < steps; i++) {
      const before = rowsNow()
      // 「舊列」= 步前就存在、而且不是最近 2 步內才掛載的列:新列的掛載副作用鏈(Radix ref-state → 量測 → 雙 rAF 標籤摺疊 →
      // 圖片載入結果)會跨到下一步的量測窗,那是新列自己的成本,不是舊列被碰到。
      const nowRows = new Set([...document.querySelectorAll('[data-row-index]')].map((e) => e.getAttribute('data-row-index')))
      const recent = window.__recentNewRows || []
      const added = [...nowRows].filter((k) => !(window.__prevStepRows || nowRows).has(k))
      window.__recentNewRows = [added, ...recent].slice(0, 2)
      window.__prevStepRows = nowRows
      const recentSet = new Set(window.__recentNewRows.flat())
      window.__rowsBefore = new Set([...nowRows].filter((k) => !recentSet.has(k)))
      const snap = () => ({ ro: window.__rendered.rowOld || 0, to: window.__touched.rowOld || 0, h: (window.__rendered.header || 0) + (window.__touched.header || 0) })
      const s0 = snap()
      el.scrollTop += 60; await frame()
      const s1 = snap(); perStep.renderedOld.push(s1.ro - s0.ro); perStep.touchedOld.push(s1.to - s0.to); perStep.header.push(s1.h - s0.h)
      const after = rowsNow()
      let diff = 0; for (const k of after) if (!before.has(k)) diff++; for (const k of before) if (!after.has(k)) diff++
      changed += diff
    }
    await frame()
    mo.disconnect()
    return { gbcrFine, attrsPerStep: attrs / steps, nodesPerStep: nodes / steps, changedPerStep: changed / steps, commitsPerStep: window.__commits / steps, renderedOldPerStep: (window.__rendered.rowOld || 0) / steps, renderedHeaderPerStep: (window.__rendered.header || 0) / steps, touchedOldPerStep: (window.__touched.rowOld || 0) / steps, renderedOldMax: Math.max(0, ...perStep.renderedOld), touchedOldMax: Math.max(0, ...perStep.touchedOld), headerMax: Math.max(0, ...perStep.header), renderedNewPerStep: (window.__rendered.rowNew || 0) / steps, renderedOtherPerStep: (window.__rendered.other || 0) / steps, renderedErr: window.__renderedErr || null, visible: visibleRows(), freshPerStep: window.__dtRowRenderStats.fresh / steps, missIdx: window.__dtRowRenderStats.missIdx, epochIdx: window.__dtRowRenderStats.epochIdx ?? {}, attrNames }
  })
  if (SELFTEST && r && !r.crashed) {
    // 對照組(Codex R7 Q6):預算 0 對「本來就是 0」的 R5 永遠不會紅,所以另外證明計數器活著——點表頭全選
    //(selection 進 epoch → 全部列重算、headerCheckedState 進 headerEpoch → 表頭重算),表頭與步前既有列都必須量到 render。
    const ctrl = await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const cb = document.querySelector('[role="columnheader"] [role="checkbox"], [role="columnheader"] input[type="checkbox"]')
      if (!cb) return { none: true }
      window.__rowsBefore = new Set([...document.querySelectorAll('[data-row-index]')].map((e) => e.getAttribute('data-row-index')))
      window.__rendered = {}; window.__touched = {}
      cb.click(); await frame(); await frame()
      return { header: window.__rendered.header || 0, old: window.__rendered.rowOld || 0 }
    })
    if (ctrl.none) console.log(`⏭  ${id}:沒有全選框,對照組跳過`)
    else if (ctrl.header > 0 && ctrl.old > 0) { console.log(`✓ selftest 對照組:點全選後表頭 render ${ctrl.header}、舊列 render ${ctrl.old}(計數器活著)`); controlSeen++ }
    else { console.log(`✗ selftest 對照組:點全選後表頭 ${ctrl.header} / 舊列 ${ctrl.old} —— 計數器沒在數`); controlBad++ }
  }
  if (r && r.crashed) { console.log(`✗ ${id}:story 沒有渲染出捲動區(story 崩潰或 build 壞了),閘不能當「不適用」放行`); failed++; continue }
  if (!r) { console.log(`⏭  ${id}:沒有垂直溢出,不適用`); continue }
  const m1 = await metrics()
  const renderedInfo = `重繪元件/步:舊列 ${r.renderedOldPerStep.toFixed(1)} 表頭 ${r.renderedHeaderPerStep.toFixed(1)} 新列 ${r.renderedNewPerStep.toFixed(1)} 其他 ${r.renderedOtherPerStep.toFixed(1)}${r.renderedErr ? ' ERR ' + r.renderedErr : ''}`
  const info = `${renderedInfo};script ${((m1.script - m0.script) * 1000 / 50).toFixed(1)}ms/步 layout ${((m1.layout - m0.layout) / 50).toFixed(1)}/步 style ${((m1.style - m0.style) / 50).toFixed(1)}/步(含暖機與 1px 段,機器相關,只印)`
  const short = id.replace('design-system-components-datatable-展示--', '')
  const checks = [
    ['R0 既有列不重新執行:每步真的重算的列數 ≤ 換列數 + 2(結構斷言,Codex R6)', r.freshPerStep, r.changedPerStep + 2, `${r.freshPerStep.toFixed(1)} ≤ ${r.changedPerStep.toFixed(1)} + 2`],
    ['R1 舊列不重繪:屬性變動/步', r.attrsPerStep, BUDGET.attrPerRow * r.visible, `${r.attrsPerStep.toFixed(1)} ≤ ${BUDGET.attrPerRow}×${r.visible} 可見列`],
    ['R2 只建拆換進換出的列:節點增減/步', r.nodesPerStep, BUDGET.nodesPerRow * r.changedPerStep + BUDGET.nodesBase, `${r.nodesPerStep.toFixed(0)} ≤ ${BUDGET.nodesPerRow}×${r.changedPerStep.toFixed(1)} 換列 + ${BUDGET.nodesBase}`],
    ['R3 React commits/步', r.commitsPerStep, BUDGET.commits, `${r.commitsPerStep.toFixed(2)} ≤ ${BUDGET.commits}`],
    // R4/R5 結構斷言(2026-09-08 fiber 歸因):舊列(步前就存在的列)與表頭在捲動時不該有任何元件 render。
    // 修前 roadmap 每步舊列 2754 + 表頭 593 個元件重繪(dnd sensor options 每 render 換新 → 每列 listeners/ctxValue 換新
    // → render-prop 重產整列;表頭每 render 重呼叫 renderHeaderRow)。舊列容許值 10 = Avatar 圖片晚到的 state 更新。
    // 逐步最大值而不是平均(Codex R7:平均 10 可容許單一步 200);touched 含 bailout(PerformedWork 會漏算)。
    ['R4 舊列零重繪:單步內步前既有列裡被碰到的元件 fiber 數(最大值)', r.touchedOldMax, BUDGET.touchedOld, `max ${r.touchedOldMax} ≤ ${BUDGET.touchedOld}(render 最大 ${r.renderedOldMax},平均 render ${r.renderedOldPerStep.toFixed(1)} / touched ${r.touchedOldPerStep.toFixed(1)})`],
    ['R5 表頭零重繪:單步內表頭裡被碰到 + render 的元件數(最大值)', r.headerMax, BUDGET.renderedHeader, `max ${r.headerMax} ≤ ${BUDGET.renderedHeader}`],
    ['1px 步進 getBoundingClientRect/步', r.gbcrFine, BUDGET.gbcrFine, `${r.gbcrFine.toFixed(1)} ≤ ${BUDGET.gbcrFine}`],
  ]
  if (r.changedPerStep === 0 && !SELFTEST) { console.log(`✗ ${short}:60px 步進沒有換列,量到的不是換列路徑(儀器對照失敗)`); failed++ }
  if (r.renderedErr) { console.log(`✗ ${short}:fiber 歸因計數器丟例外(${r.renderedErr}),R4/R5 無效`); failed++ }
  for (const [name, v, budget, detail] of checks) {
    const ok = v <= budget
    if (!ok) failed++
    console.log(`${ok ? '✓' : '✗'} ${short} ${name}:${detail}`)
  }
  console.log(`   ${short} 資訊:${info};每步換列 ${r.changedPerStep.toFixed(1)} 列、可見 ${r.visible} 列;屬性變動名稱 ${JSON.stringify(r.attrNames)};快取 miss 的依賴索引 ${JSON.stringify(r.missIdx)}(0 row 1 idx 2 start 3 isLast 4 virtual 5 cols 6 regionWidth 7 sharedH 8 drop 9 dragging 10 anyDrag 11 epoch);epoch 被換掉的依賴索引 ${JSON.stringify(r.epochIdx)}`)
}
await browser.close(); server.close()
if (SELFTEST) { const ok = failed > 0 && controlBad === 0 && controlSeen > 0; console.log(ok ? '✓ selftest:預算 0 時計數器讓閘變紅,且正向對照組(全選)有量到表頭與舊列 render' : `✗ selftest:${failed ? '' : '預算 0 仍綠;'}${controlBad ? '對照組沒量到;' : ''}${controlSeen ? '' : '沒有任何 story 跑到對照組'}`); process.exit(ok ? 0 : 1) }
console.log(failed ? `✗ ${failed} 條超出捲動成本預算` : '✓ 捲動成本:舊列不重繪、只建拆換進換出的列')
process.exit(failed ? 1 : 0)
