#!/usr/bin/env node
/**
 * DataTable 捲軸完整可見閘(Windows 幾何)—— 2026-09-08(Codex R4 補強版)
 *
 * 背景:Bug H(2026-04/05,治理帳 `2026-05-18-phaseB-codex-reply.md:2507`)「Windows 上水平/垂直捲軸
 * 各有一半溢出圓角外框」。當年的 interim 修法沒被實機驗過;macOS 的覆蓋式捲軸厚度 0,本機永遠看不到。
 * 本閘把 Windows 的幾何搬到任何機器上重現:
 *   1. 拿掉 Playwright headless 預設的 `--hide-scrollbars`(有它就永遠是 0px);
 *   2. 用不帶方向偽類的根規則 `::-webkit-scrollbar{width/height:N}` 建立佔版面的自繪捲軸
 *      (Chromium 在 `scrollbar-width`/`scrollbar-color` 非 auto 時忽略 webkit 規則,所以一併蓋回 auto);
 *   3. N = 17(Windows 傳統預設)與 11(`thin` = 2/3,Blink `kThinProportion = 2.f/3.f`),DPR 1 / 1.25 / 1.5;
 *   4. 另跑一組**原生 CSS**(DS 現行 `thin` + `scrollbar-color`、不強制任何 webkit 規則):Linux CI 的原生
 *      傳統捲軸會有厚度、macOS 覆蓋式為 0 → 後者明報「未覆蓋」而不是假綠。
 *
 * 斷言(每支 DataTable story、每個真的有溢出的捲動區,且在頂/中/底三個捲動位置各驗一次):
 *   A. 儀器有開:有溢出但捲軸厚度 0 → 強制組判紅、原生組記「未覆蓋」;
 *   B. 捲動區 border-box 落在每一層會裁切的祖先(overflow ≠ visible / contain paint)的 padding-box 內(容差 0.5px);
 *   C. 捲軸外側 3px / 內側 3px 用 elementFromPoint 打點,命中的必須是捲動區自己;
 *   D. 像素:捲軸**外側一半**的長條截圖,≥ 95% 像素是軌道色或拇指色(抓 `pointer-events:none` 的遮蓋物——
 *      hit-test 會放行、像素不會);
 *   E. 動態縮高(fill-height 的 story):slot 縮小 1 / 2 / 3px 後 350ms,B 仍成立(針對 compute() 舊 `<4px` 守衛)。
 *
 * 對照組(M32「儀器要先有對照組」,`--selftest`):(i) 捲動區加高 2px → B 必紅;(ii) 用 `pointer-events:none`
 * 的遮蓋物蓋住垂直捲軸外側一半 → C 仍綠、D 必紅。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const { PNG } = createRequire(join(REPO, 'package.json'))('pngjs')
const STATIC = join(REPO, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const QUICK = process.argv.includes('--quick') // PR 閘:6 支代表 story、Windows 預設幾何、中段位置;全矩陣(43 story × 5 幾何 × 3 位置)在排程閘 focus-deep-gates.yml
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const TRACK = 0xee, THUMB = 0x99

if (!existsSync(join(STATIC, 'index.json'))) { console.error('storybook-static/index.json 不存在,先 npm run build-storybook'); process.exit(2) }
const index = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8'))
let ids = Object.values(index.entries).filter((e) => e.type === 'story' && /datatable/i.test(e.id)).map((e) => e.id)
if (ONLY) ids = ids.filter((i) => i.includes(ONLY))
// PR 閘只跑 6 支代表性 story(填滿高度雙軸 / 虛擬捲動 / 釘選欄雙表 / 容器高度 / 自動列高 / 基本);
// 43 支全量在排程閘。2026-09-08 CI 實測:全量 --quick 讓瀏覽器閘那一步從 326s 漲到 660s,整個 job 撞 15 分鐘逾時。
const QUICK_STORIES = ['roadmap-all-in-one', 'virtual-scroll', 'pinned-columns', 'container-height', 'row-auto-height', '--basic']
if (QUICK && !ONLY) ids = ids.filter((i) => QUICK_STORIES.some((q) => i.endsWith(q) || i.includes(q + '-') || i.includes(q)))
if (SELFTEST) ids = [ids.find((i) => i.includes('roadmap-all-in-one')) ?? ids[0]]

const server = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
  const f = join(STATIC, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, r))
const BASE = `http://localhost:${server.address().port}`

const FULL = [{ sb: 17, dpr: 1 }, { sb: 11, dpr: 1 }, { sb: 17, dpr: 1.25 }, { sb: 17, dpr: 1.5 }, { native: true, dpr: 1 }]
const MATRIX = SELFTEST || QUICK ? [{ sb: 17, dpr: 1 }] : FULL // PR 閘只跑 Windows 預設幾何、只在中段位置驗(≈25s);原生組與頂/底位置在排程閘

// `--single-process` 沙箱:一個 browser 只能開一個 context(launch-browser.mjs 註解),每組幾何重開;
// 起來但第一頁就掛的偶發,重試最多 3 次。
async function openPage(dpr) {
  let last
  for (let i = 0; i < 3; i++) {
    const b = await launchBrowser({ ignoreDefaultArgs: ['--hide-scrollbars'] })
    try { return { b, page: await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr }) } }
    catch (e) { last = e; await b.close().catch(() => {}) }
  }
  throw last
}

/** 在頁面裡量一個捲動位置下的所有捲動區(B / C + 像素長條的座標)。 */
const INSPECT = `(() => {
  const out = []
  const box = (e) => e.getBoundingClientRect()
  const scrollers = [...document.querySelectorAll('[data-datatable-hscroll]')].filter((e) => {
    const c = getComputedStyle(e)
    return /auto|scroll/.test(c.overflowY + c.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
  })
  for (const el of scrollers) {
    el.scrollIntoView({ block: 'center', inline: 'nearest' }) // elementFromPoint / 截圖只認視窗內
    const sbV = el.offsetWidth - el.clientWidth, sbH = el.offsetHeight - el.clientHeight
    const hasV = el.scrollHeight > el.clientHeight + 1, hasH = el.scrollWidth > el.clientWidth + 1
    const r = box(el)
    // Playwright 非全頁截圖的 clip 是**視窗**座標(它自己加 scroll 位移),跟 getBoundingClientRect 同座標系
    const item = { index: scrollers.indexOf(el), sbV, sbH, hasV, hasH, rect: [r.left, r.top, r.right, r.bottom].map((n) => +n.toFixed(1)), clips: [], cover: {}, strips: {}, scroll: [scrollX, scrollY],
      fill: !!el.style.maxHeight, instrumentOff: (hasV && sbV === 0) || (hasH && sbH === 0) }
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const c = getComputedStyle(a)
      if (c.overflowX === 'visible' && c.overflowY === 'visible' && !/paint|content|strict/.test(c.contain)) continue
      const ar = box(a)
      const pad = { left: ar.left + parseFloat(c.borderLeftWidth), top: ar.top + parseFloat(c.borderTopWidth), right: ar.right - parseFloat(c.borderRightWidth), bottom: ar.bottom - parseFloat(c.borderBottomWidth) }
      const over = { right: +(r.right - pad.right).toFixed(2), bottom: +(r.bottom - pad.bottom).toFixed(2), left: +(pad.left - r.left).toFixed(2), top: +(pad.top - r.top).toFixed(2) }
      if (Object.values(over).some((v) => v > 0.5)) item.clips.push({ ancestor: a.tagName.toLowerCase() + '.' + [...a.classList].slice(0, 3).join('.'), over })
    }
    const who = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e === el || el.contains(e)) ? 'self' : (e ? e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 2).join('.') : 'NONE') }
    const midY = r.top + Math.min(120, r.height / 2), midX = r.left + Math.min(120, r.width / 2)
    const vw = innerWidth, vh = innerHeight
    if (hasV && sbV > 0) {
      item.cover.vOuter = who(r.right - 2, midY); item.cover.vInner = who(r.right - sbV + 2, midY)
      // 外側一半的長條,避開兩端圓角(8px)與 V/H 交會方塊,且裁到視窗內
      const x = r.right - sbV / 2, y0 = Math.max(0, r.top + 8), y1 = Math.min(vh, r.bottom - (hasH ? sbH : 0) - 8)
      if (y1 - y0 >= 20) item.strips.v = { x, y: y0, width: sbV / 2 - 1, height: y1 - y0 }
    }
    if (hasH && sbH > 0) {
      item.cover.hOuter = who(midX, r.bottom - 2); item.cover.hInner = who(midX, r.bottom - sbH + 2)
      const y = r.bottom - sbH / 2, x0 = Math.max(0, r.left + 8), x1 = Math.min(vw, r.right - (hasV ? sbV : 0) - 8)
      if (x1 - x0 >= 20 && y < vh) item.strips.h = { x: x0, y, width: x1 - x0, height: sbH / 2 - 1 }
    }
    out.push(item)
  }
  return out
})()`

/** 截圖前一刻:把第 i 個捲動區捲進視窗,回傳它此刻的視窗座標長條(同頁多表時不能沿用 INSPECT 的舊座標)。 */
const STRIPS_NOW = `((i) => {
  const scrollers = [...document.querySelectorAll('[data-datatable-hscroll]')].filter((e) => {
    const c = getComputedStyle(e)
    return /auto|scroll/.test(c.overflowY + c.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
  })
  const el = scrollers[i]; if (!el) return {}
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  const r = el.getBoundingClientRect(), sbV = el.offsetWidth - el.clientWidth, sbH = el.offsetHeight - el.clientHeight
  const hasV = el.scrollHeight > el.clientHeight + 1, hasH = el.scrollWidth > el.clientWidth + 1
  const strips = {}
  if (hasV && sbV > 0) { const x = r.right - sbV / 2, y0 = Math.max(0, r.top + 8), y1 = Math.min(innerHeight, r.bottom - (hasH ? sbH : 0) - 8); if (y1 - y0 >= 20) strips.v = { x, y: y0, width: sbV / 2 - 1, height: y1 - y0 } }
  if (hasH && sbH > 0) { const y = r.bottom - sbH / 2, x0 = Math.max(0, r.left + 8), x1 = Math.min(innerWidth, r.right - (hasV ? sbV : 0) - 8); if (x1 - x0 >= 20 && y < innerHeight) strips.h = { x: x0, y, width: x1 - x0, height: sbH / 2 - 1 } }
  return strips
})`

/** 像素:外側一半長條 ≥ 95% 是軌道色或拇指色。 */
async function stripOk(page, strip, dumpName) {
  const buf = await page.screenshot({ clip: strip, scale: 'css' })
  const png = PNG.sync.read(buf)
  if (dumpName) { const f = join(tmpdir(), `dt-scrollbar-${dumpName}.png`); writeFileSync(f, buf); console.log(`  (長條截圖:${f})`) }
  let ok = 0, total = 0
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]
    const near = (v) => Math.abs(r - v) <= 6 && Math.abs(g - v) <= 6 && Math.abs(b - v) <= 6
    total++; if (near(TRACK) || near(THUMB)) ok++
  }
  return { ratio: ok / total, total }
}

const FORCED_CSS = (sb) => `*{scrollbar-width:auto!important;scrollbar-color:auto!important} *::-webkit-scrollbar{width:${sb}px;height:${sb}px} *::-webkit-scrollbar-thumb{background:#999} *::-webkit-scrollbar-track{background:#eee}`
const failures = []
let checked = 0, uncovered = 0
const selftest = { clipRed: false, coverStillGreen: false, pixelRed: false }

for (const geo of MATRIX) {
  const { b, page } = await openPage(geo.dpr)
  for (const id of ids) {
    await page.goto(`${BASE}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'load' })
    if (!geo.native) await page.addStyleTag({ content: FORCED_CSS(geo.sb) })
    await page.waitForTimeout(900)
    const tag = geo.native ? 'native' : `sb=${geo.sb} dpr=${geo.dpr}`
    const positions = QUICK ? ['mid'] : ['top', 'mid', 'end']
    for (const pos of positions) {
      await page.evaluate((pos) => {
        for (const el of document.querySelectorAll('[data-datatable-hscroll]')) {
          const f = pos === 'top' ? 0 : pos === 'mid' ? 0.5 : 1
          el.scrollTop = (el.scrollHeight - el.clientHeight) * f
          el.scrollLeft = (el.scrollWidth - el.clientWidth) * f
        }
      }, pos)
      await page.waitForTimeout(150)
      const report = await page.evaluate(INSPECT)
      for (const it of report) {
        checked++
        const bad = []
        if (it.instrumentOff) { if (geo.native) { uncovered++; continue } bad.push('儀器沒開:有溢出但捲軸厚度 0') }
        if (it.clips.length) bad.push('被裁切 ' + JSON.stringify(it.clips))
        for (const [k, v] of Object.entries(it.cover)) if (v !== 'self') bad.push(`${k} 被 ${v} 蓋住`)
        const stripsNow = (!geo.native && pos === 'mid') ? await page.evaluate(`${STRIPS_NOW}(${it.index})`) : {}
        for (const [k, strip] of Object.entries(stripsNow)) {
          let { ratio } = await stripOk(page, strip)
          if (ratio < 0.95) ({ ratio } = await stripOk(page, strip, `${id.split('--').pop()}-${k}`)) // 失敗時存檔供人眼核對
          if (ratio < 0.95) bad.push(`${k} 軸外側一半只有 ${(ratio * 100).toFixed(0)}% 像素是捲軸色(文件捲動 ${it.scroll.join(',')})`)
        }
        if (bad.length) failures.push({ id, tag, pos, rect: it.rect, bad })
      }
    }
    // E. 動態縮高:fill-height 的 story,slot 縮 1/2/3px 後區塊不得再溢出
    if (!geo.native) {
      const fill = await page.evaluate(() => !!document.querySelector('[data-datatable-hscroll]')?.style.maxHeight)
      if (fill) for (const k of [1, 2, 3]) {
        const rep = await page.evaluate(async (k) => {
          const outer = document.querySelector('[data-data-table-outer]'); const slot = outer?.parentElement
          if (!slot) return 'noslot'
          slot.style.height = `${slot.getBoundingClientRect().height - k}px`
          await new Promise((r) => setTimeout(r, 350)); return 'shrunk'
        }, k)
        if (rep === 'shrunk') {
          const report = await page.evaluate(INSPECT)
          for (const it of report) if (it.clips.length) failures.push({ id, tag, pos: `slot−${k}px`, rect: it.rect, bad: ['縮高後仍被裁切 ' + JSON.stringify(it.clips)] })
          await page.evaluate(async () => { const slot = document.querySelector('[data-data-table-outer]')?.parentElement; if (slot) slot.style.height = ''; await new Promise((r) => setTimeout(r, 350)) })
        }
      }
    }
    if (SELFTEST) {
      // (i) 加高 2px → B 必紅
      await page.evaluate(() => { const el = [...document.querySelectorAll('[data-datatable-hscroll]')].find((e) => e.scrollHeight > e.clientHeight + 1); if (el) { const h = el.getBoundingClientRect().height + 2; el.style.maxHeight = `${h}px`; el.style.height = `${h}px`; el.style.flex = 'none' } })
      selftest.clipRed = (await page.evaluate(INSPECT)).some((it) => it.clips.length)
      await page.reload({ waitUntil: 'load' }); await page.addStyleTag({ content: FORCED_CSS(geo.sb) }); await page.waitForTimeout(900)
      // (ii) pointer-events:none 遮蓋垂直捲軸外側一半 → C 仍綠、D 必紅
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('[data-datatable-hscroll]')].find((e) => e.scrollHeight > e.clientHeight + 1); if (!el) return
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect(), sbV = el.offsetWidth - el.clientWidth
        const d = document.createElement('div'); d.id = 'selftest-overlay'
        Object.assign(d.style, { position: 'fixed', left: `${r.right - sbV / 2}px`, top: `${r.top}px`, width: `${sbV / 2}px`, height: `${r.height}px`, background: '#fff', pointerEvents: 'none', zIndex: 2147483647 })
        document.body.appendChild(d)
      })
      const rep = await page.evaluate(INSPECT)
      selftest.coverStillGreen = rep.every((it) => Object.values(it.cover).every((v) => v === 'self'))
      selftest.pixelRed = false
      for (const it of rep) { const st = await page.evaluate(`${STRIPS_NOW}(${it.index})`); if (st.v) { const { ratio } = await stripOk(page, st.v); if (ratio < 0.95) selftest.pixelRed = true } }
    }
  }
  await b.close()
}
server.close()

if (SELFTEST) {
  const ok = selftest.clipRed && selftest.coverStillGreen && selftest.pixelRed
  console.log(`${ok ? '✓' : '✗'} selftest:加高 2px → 裁切紅=${selftest.clipRed};pointer-events:none 遮蓋 → hit-test 仍綠=${selftest.coverStillGreen}、像素紅=${selftest.pixelRed}`)
  process.exit(ok ? 0 : 1)
}
console.log(`DataTable 捲軸可見閘:${ids.length} 支 story × ${MATRIX.length} 組幾何(${MATRIX.map((g) => g.native ? '原生' : `${g.sb}px@${g.dpr}`).join(' / ')}),檢查 ${checked} 個捲動區×位置${uncovered ? `;原生組 ${uncovered} 個為覆蓋式捲軸(厚度 0)未覆蓋` : ''}`)
for (const f of failures) console.log(`✗ ${f.id} [${f.tag} ${f.pos}] rect=${f.rect.join(',')} → ${f.bad.join(';')}`)
console.log(failures.length ? `✗ ${failures.length} 條失敗` : '✓ 全部捲動區完整在裁切框內、捲軸沒被蓋住、外側像素完整')
process.exit(failures.length ? 1 : 0)
