#!/usr/bin/env node
/**
 * DataTable 原生捲軸的顏色:跟著主題翻,而且**交會方塊與軌道同色**(2026-09-14)
 *
 * user 2026-09-14 問兩件事:暗色模式的捲軸有沒有照 SSOT 變、右下角 V/H 交會方塊要不要跟軌道一致。
 * 根因是兩個 owner:`@supports` 把 Chromium 的 `scrollbar-color` 重設回 `auto`(軌道交給瀏覽器依
 * `color-scheme` 畫),但 `::-webkit-scrollbar-corner` 還留著 `var(--scrollbar-track)` —— 兩邊換成
 * 不同的人畫,結構上不可能一致。已把 corner 那條拿掉,整支捲軸只剩一個 owner。
 *
 * **這支閘看的是真實像素,不是宣告**:
 *   S1 暗色的軌道顏色 ≠ 亮色的軌道顏色(證明 color-scheme 真的生效,不是只寫在 CSS 裡)
 *   S2 交會方塊 == 垂直軌道(同色才不會出現那塊突兀的方塊)
 *   S3 兩個主題都要真的量到 15px 的佔位捲軸(量不到就不是「通過」,是沒驗到)
 *
 * **能看到原生捲軸的關鍵**:拿掉 Playwright headless 預設的 `--hide-scrollbars`。
 * 不可以注入 `::-webkit-scrollbar` 去逼出捲軸 —— 那會建立自繪捲軸,把要觀測的原生配色換掉
 * (repo 既有的 data-table-scrollbar-visibility.mjs 就是這樣,所以它答不了顏色問題)。
 *
 * 對照組 `--selftest`:強制 `color-scheme: light` 於暗色主題,S1 必須紅。
 *
 *   node scripts/data-table-scrollbar-color.mjs [--build=<dir>] [--selftest]
 */
import http from 'node:http'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(arg('build', join(REPO, 'storybook-static')))
const SELFTEST = process.argv.includes('--selftest')
const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }

const serve = async (dir) => {
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
    const f = join(dir, p)
    if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
    r.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f))
  })
  await new Promise((r) => s.listen(0, r))
  return { server: s, base: `http://localhost:${s.address().port}` }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const px = (png, x, y) => { const i = (png.width * y + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]] }
const same = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
const show = (c) => `rgb(${c.join(',')})`

const { server, base } = await serve(BUILD)
let fail = 0
const ck = (n, ok, d = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${d ? ' | ' + d : ''}`); if (!ok) fail++ }
const seen = {}
try {
  for (const theme of ['light', 'dark']) {
    // `--single-process` 下一個 browser 只能一個 context,所以每個主題重開一次。
    const browser = await chromium.launch({
      headless: true, args: ['--single-process', '--no-sandbox'],
      ignoreDefaultArgs: ['--hide-scrollbars'], // ← 沒有這行就永遠是 0px 浮動捲軸,量不到任何顏色
    })
    const page = await browser.newPage({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 })
    await page.goto(`${base}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitUntil: 'load' })
    await page.waitForFunction(() => !!document.querySelector('[data-datatable-hscroll]'), null, { timeout: 30000 })
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    if (SELFTEST) await page.addStyleTag({ content: ':root,[data-theme]{color-scheme:light !important}' })
    await sleep(1200)

    const info = await page.evaluate(() => {
      const el = document.querySelector('[data-datatable-hscroll]')
      const r = el.getBoundingClientRect()
      return {
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        v: el.offsetWidth - el.clientWidth, hb: el.offsetHeight - el.clientHeight,
        cs: getComputedStyle(document.documentElement).colorScheme,
      }
    })
    ck(`S3 ${theme}:真的量到佔位捲軸(否則下面全是空轉)`, info.v > 0 && info.hb > 0, `垂直 ${info.v}px / 水平 ${info.hb}px、color-scheme=${info.cs}`)
    if (!(info.v > 0 && info.hb > 0)) { await browser.close(); continue }

    const shot = join(REPO, `.git/governance-runtime/scrollbar-${theme}.png`)
    const buf = await page.screenshot()
    const png = PNG.sync.read(buf)
    const right = info.x + info.w, bottom = info.y + info.h
    const vTrack = px(png, right - Math.ceil(info.v / 2), info.y + Math.round(info.h * 0.8))
    const hTrack = px(png, info.x + Math.round(info.w * 0.9), bottom - Math.ceil(info.hb / 2))
    const corner = px(png, right - Math.ceil(info.v / 2), bottom - Math.ceil(info.hb / 2))
    seen[theme] = { vTrack, hTrack, corner }
    ck(`S2 ${theme}:右下交會方塊與垂直軌道同色`, same(corner, vTrack), `交會 ${show(corner)} / 垂直軌道 ${show(vTrack)} / 水平軌道 ${show(hTrack)}`)
    void shot
    await browser.close()
  }
  if (seen.light && seen.dark) {
    ck('S1 暗色的軌道顏色 ≠ 亮色的軌道顏色(color-scheme 真的生效)',
      !same(seen.light.vTrack, seen.dark.vTrack, 10), `亮 ${show(seen.light.vTrack)} / 暗 ${show(seen.dark.vTrack)}`)
  } else { ck('S1 兩個主題都有量到', false, '缺其中一個') }
} finally { server.close() }

if (SELFTEST) {
  if (fail === 0) { console.log('\n✗ 對照組:強制 color-scheme:light 之後斷言全過 —— 量具該紅沒紅'); process.exit(1) }
  console.log(`\n✓ 對照組:${fail} 條如預期紅(量具有效)`); process.exit(0)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 捲軸跟著主題翻,交會方塊與軌道同色')
process.exit(fail ? 1 : 0)
