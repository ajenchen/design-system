#!/usr/bin/env node
/**
 * `color-scheme` 必須跟著 theme 走(2026-09-12)
 *
 * user 截圖:dark mode 的 DataTable 右側捲軸是**亮色**的,跟 DS 的 token 對不上。
 *
 * 根因不在 token:`--scrollbar-track` / `--scrollbar-thumb` 一直都跟著 dark 翻
 * (實測 light `oklch(0 0 0 / 4%)` → dark `oklch(1 0 0 / 8%)`)。問題是**沒有人在用它們** ——
 * DataTable 走原生捲軸,而 `data-table.css` 在 Chromium 上把 `scrollbar-color` 重設回 `auto`
 * (理由見該檔:裸 `::-webkit-scrollbar` 會把 overlay 捲軸強制變成佔版面的捲軸)。
 * 於是捲軸長相完全由瀏覽器決定,而瀏覽器看的是 CSS 的 `color-scheme`。
 * 在這之前整個 DS 從沒宣告過 `color-scheme`,計算值是 `normal` → 永遠畫亮版。
 *
 * 這支閘驗兩件事:
 *   C1 根層與巢狀 theme 邊界的 `color-scheme` 計算值都等於該處的 theme
 *   C2 **瀏覽器真的照做**了 —— 放一個完全不吃我們樣式的原生控制項當觀測器,
 *      light 與 dark 下它的主要像素色必須不同。只驗 C1 等於相信宣告會生效,不是證據。
 *
 * 對照組(`--selftest`):把 `color-scheme` 強制回 `normal`,C1/C2 都必須紅。
 *
 *   node scripts/color-scheme-invariant.mjs [--build=<dir>] [--selftest]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = arg('build', join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
let fail = 0
const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

try {
  const page = await browser.newPage({ viewport: { width: 600, height: 400 }, deviceScaleFactor: 2 })
  const index = JSON.parse(await (await fetch(`${server.origin}/index.json`)).text())
  const anyStory = Object.entries(index.entries).find(([, e]) => e.type === 'story')?.[0]
  await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(anyStory)}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  if (SELFTEST) await page.addStyleTag({ content: ':root,[data-theme]{color-scheme:normal !important}' }).catch(() => {})

  // 觀測器:`all: revert` 讓它退回瀏覽器原生外觀,完全不吃 DS 樣式
  await page.evaluate(() => {
    const d = document.createElement('div')
    d.id = 'native-probe'
    d.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999'
    d.innerHTML = '<input type="checkbox" style="all:revert;width:20px;height:20px;margin:0"><progress value="0.4" style="all:revert;display:block;width:60px"></progress>'
    document.body.appendChild(d)
  })

  const dominant = async () => {
    const box = await page.locator('#native-probe').boundingBox()
    const png = PNG.sync.read(await page.screenshot({ clip: box }))
    const hist = new Map()
    for (let i = 0; i < png.data.length; i += 4) {
      const k = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`
      hist.set(k, (hist.get(k) ?? 0) + 1)
    }
    return [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  const seen = {}
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(320)
    const cs = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
    ck(`C1 ${theme}:根層 color-scheme = ${theme}`, cs === theme, `實際 ${cs}`)
    seen[theme] = await dominant()
  }
  ck('C2 原生控制項在兩個 theme 下真的長不一樣(瀏覽器確實照 color-scheme 畫)',
     seen.light !== seen.dark, `light 主色 ${seen.light} / dark 主色 ${seen.dark}`)

  // 巢狀 theme 邊界(tooltip / portal 內 data-theme="dark")也要翻
  const nested = await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    const n = document.createElement('div')
    n.setAttribute('data-theme', 'dark'); n.id = 'nested'
    document.body.appendChild(n)
    return getComputedStyle(n).colorScheme
  })
  ck('C1b 巢狀 [data-theme="dark"] 邊界內也翻成 dark', nested === 'dark', `實際 ${nested}`)
} finally {
  await browser.close()
  await server.stop()
}

if (SELFTEST) {
  if (fail === 0) { console.log('\n✗ 對照組:強制 color-scheme:normal 之後斷言全過 —— 儀器該紅卻沒紅'); process.exit(1) }
  console.log(`\n✓ 對照組:強制 normal 後 ${fail} 條如預期紅(儀器有效)`)
  process.exit(0)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ color-scheme 跟著 theme 走,且瀏覽器確實照做')
process.exit(fail ? 1 : 0)
