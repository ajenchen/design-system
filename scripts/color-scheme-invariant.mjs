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
 *   C3 **捲軸沒有兩個 owner**(2026-09-14 加)。同一支捲軸的軌道與 V/H 交會方塊若一個走原生
 *      (`@supports` 把 `scrollbar-color` 重設回 `auto`)、另一個吃 DS token
 *      (`::-webkit-scrollbar-corner { background: var(--...) }`),兩者由不同的人畫,
 *      **結構上不可能同色**。錨:user 2026-09-14 回報右下角方塊跟軌道不同色;根因是
 *      2026-09-08 把軌道改回原生時,corner 那條 token 規則變成孤兒卻沒一起拿掉。
 *
 * 對照組(`--selftest`):把 `color-scheme` 強制回 `normal`,C1/C2 都必須紅。
 *
 * 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
 * Storybook 回報渲染完成(含 play)+ render-health + 字型,才開始切 theme 量。取代原本「networkidle + 固定睡 300ms」:
 * 舊寫法在 story 開不起來(chunk 缺檔 / 錯誤頁)時照樣量根層 color-scheme 並回綠 —— 量的是 Storybook 錯誤頁,不是 DS 頁面(M37)。
 * 現在開不起來 = 儀器失效:點名 story、附同源 404、exit 2;不是產品裁決,`--selftest` 下也不算「對照組如預期紅」。
 *
 *   node scripts/color-scheme-invariant.mjs [--build=<dir>] [--selftest]
 */
import { join, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = arg('build', join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
let fail = 0
/** 載體 story 開不起來(StoryRenderInstrumentError):儀器失效,結尾 exit 2 */
let instrumentFailure = null
const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

try {
  const page = await browser.newPage({ viewport: { width: 600, height: 400 }, deviceScaleFactor: 2 })
  const index = JSON.parse(await (await fetch(`${server.origin}/index.json`)).text())
  const anyStory = Object.entries(index.entries).find(([, e]) => e.type === 'story')?.[0]
  if (!anyStory) throw new StoryRenderInstrumentError({ storyId: '(index.json)', kind: 'no-preview', reason: '建置的 index.json 裡沒有任何 story' })
  // 載體 story 只是讓 DS 樣式載進頁面;要保證的是「這一頁是渲染完成的 DS story」,不是「網路閒了 300ms」
  await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(anyStory)}&viewMode=story`, { notFound: server.notFound })
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
    // 等切 theme 之後觀測框背後 story 內容的 transition-colors 走完再截圖(頁面早已渲染完成,等的是顏色過渡,別截到中間值)
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

  // C3:靜態源碼檢查 —— macOS 是浮動捲軸,量不到原生軌道像素,所以這條驗「有沒有混合擁有」
  // 而不是驗顏色相等(驗不到的東西不要假裝驗到)。
  const css = readFileSync(join(REPO, 'packages/design-system/src/components/DataTable/data-table.css'), 'utf8')
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '') // 先剝註解,否則被說明文字騙走
  const nativeTrack = /@supports\s+selector\(::-webkit-scrollbar\)[\s\S]*?scrollbar-color:\s*auto/.test(code)
  const tokenCorner = /::-webkit-scrollbar-corner\s*\{[^}]*var\(--/.test(code)
  ck('C3 捲軸軌道與交會方塊不得一個原生一個吃 token(混合擁有 = 必然不同色)',
     !(nativeTrack && tokenCorner),
     nativeTrack && tokenCorner ? '軌道被 @supports 重設回 auto(原生),但 ::-webkit-scrollbar-corner 仍指定 var(--…)' : `軌道原生=${nativeTrack} / 交會方塊吃 token=${tokenCorner}`)
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  instrumentFailure = error
} finally {
  await browser.close()
  await server.stop()
}
if (instrumentFailure) {
  // 沒量到 ≠ 沒問題:載體 story 開不起來是儀器失效(exit 2),不是產品裁決,也絕不算通過(selftest 亦同)
  console.error(`✗ ${instrumentFailure.message}`)
  if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
  console.error('✗ color-scheme-invariant:儀器失效 —— 這次什麼都沒量到')
  process.exit(2)
}

if (SELFTEST) {
  if (fail === 0) { console.log('\n✗ 對照組:強制 color-scheme:normal 之後斷言全過 —— 儀器該紅卻沒紅'); process.exit(1) }
  console.log(`\n✓ 對照組:強制 normal 後 ${fail} 條如預期紅(儀器有效)`)
  process.exit(0)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ color-scheme 跟著 theme 走,且瀏覽器確實照做')
process.exit(fail ? 1 : 0)
