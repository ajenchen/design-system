#!/usr/bin/env node
// scan-asymmetric-icons.mjs —— 全 DS「展示」story 裡的 icon SVG 是否寬高相等(`npm run icons:scan`)
//
// 需要一個跑著的 Storybook:預設 dev server `http://localhost:6006`(`npm run storybook`);
// `SB_URL=<origin>`(或 `SB_PORT=<port>`)可指到任何一份 Storybook,例如靜態建置。
//
// **2026-09-25 根因修正(M37:沒量到被讀成沒發生)**:舊版導覽一律 `.catch(() => {})` 吞掉、固定睡 500ms
// 當「已渲染」、`#storybook-root` 裡找不到 svg 的 story 直接 `continue`,而且不論結果一律 exit 0 ——
// 於是 story 全部沒載起來(伺服器半掛、story chunk 缺檔)時,仍印「✓ 全 DS 0 個 asymmetric icons」。
// 要保證的性質是「每一則被掃的 story 都真的渲染完成了,而且量到的就是它的 icon」,量的卻是「過了 500 毫秒」。
// 現在:
//   · 每則 story 由共用的 openStory(lib/launch-browser.mjs)證明渲染完成(render phase = finished、非錯誤頁、
//     根節點有內容、無關鍵資源缺檔、無頁面例外)後,才在版面靜止的同一個 task 裡量 —— 證明不了 = 儀器失效,
//     點名 story 與缺的檔,**不跳過**;
//   · 連不上伺服器 / 索引裡沒有任何可掃的 story / 全部量到 0 個 icon → 儀器失效(INSTRUMENT-FAIL),exit 1;
//   · 量到不對稱 → ❌ 列出全部(不截斷),exit 1(之前印了 ❌ 仍 exit 0);
//   · 每則 story 的 svg 一次量完(舊版每則只量前 30 個 —— 掃描不得截斷,M10)。
// 渲染完成的 story 裡本來就沒有 icon 是合法的 0(很多元件沒有 icon),不算儀器失效。

import { INSTRUMENT_FAIL_MARKER, StoryRenderInstrumentError, launchBrowserOrSkip, openStory } from './lib/launch-browser.mjs'

const BASE = (process.env.SB_URL || `http://localhost:${process.env.SB_PORT || '6006'}`).replace(/\/+$/, '')
// icon 尺寸範圍:12–48px 的 icon;超過的是圖表 canvas / 插圖(recharts / d3 / svg illustration),不在 icon 對稱範圍
const ICON_MAX_PX = 64

const firstLine = (value) => String(value?.message ?? value).split('\n')[0]

function instrumentFail(message, lines = []) {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${message}`)
  for (const line of lines) console.error(`   ${line}`)
  console.error('   這是儀器失效(沒量到),不是產品裁決 —— 這次不能算「0 個不對稱」。')
  process.exit(1)
}

// ── 1. 索引:連不上 / 回非 200 / 不是 JSON → 儀器失效(舊版在這裡直接崩出堆疊)──
let index
try {
  const response = await fetch(`${BASE}/index.json`)
  if (!response.ok) instrumentFail(`Storybook 索引 ${BASE}/index.json 回 HTTP ${response.status}`)
  index = await response.json()
} catch (error) {
  instrumentFail(`連不上 Storybook(${BASE}/index.json:${firstLine(error)}${error?.cause ? ` / ${firstLine(error.cause.code ?? error.cause)}` : ''})`, [
    '先 `npm run storybook`(預設 http://localhost:6006),或以 SB_URL=<origin> 指到一份跑著的 Storybook。',
  ])
}

// 只掃 Components 的「展示」story(設計規格 / 設計原則 / Tokens / Patterns docs 太冗)
const STORIES = Object.values(index?.entries || {})
  .filter((entry) => entry.type === 'story' && entry.title?.startsWith('Design System/Components/') && entry.title.includes('展示'))
  .map((entry) => ({ id: entry.id, name: `${entry.title.split('/').slice(-1)[0]} / ${entry.name}` }))
if (STORIES.length === 0) {
  instrumentFail(`${BASE}/index.json 裡找不到任何「Design System/Components/…/展示」story —— 沒有東西可量(索引或篩選條件過時)`)
}
console.log(`Auto-discovered ${STORIES.length} component 展示 stories(${BASE})`)

// ── 2. 逐則開 story、渲染完成且版面靜止的同一個 task 裡量 ──
// 頁面端:#storybook-root 裡每個 svg 的 computed 寬高(openStory 以原始碼序列化執行,不得引用外部變數)
const measureIcons = () => Array.from(document.querySelectorAll('#storybook-root svg')).map((element) => {
  const style = getComputedStyle(element)
  return { w: style.width, h: style.height }
})

const browser = await launchBrowserOrSkip({}, { hint: 'icons:scan 需要 Chromium 才能量 story 裡的 icon。' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

let totalIcons = 0
let storiesWithIcons = 0
const asymmetric = []
const notMeasured = []
for (const story of STORIES) {
  let svgs
  try {
    const opened = await openStory(page, `${BASE}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, {
      label: story.id,
      settleFrames: 3,
      probe: measureIcons,
    })
    svgs = opened.probe
  } catch (error) {
    notMeasured.push({ story, reason: error instanceof StoryRenderInstrumentError ? error.detail : firstLine(error) })
    continue
  }
  if (!Array.isArray(svgs)) {
    notMeasured.push({ story, reason: `量測回傳不是陣列(${typeof svgs})` })
    continue
  }
  let icons = 0
  for (const { w, h } of svgs) {
    if (w === 'auto' || h === 'auto') continue
    const wPx = parseFloat(w)
    const hPx = parseFloat(h)
    if (Number.isNaN(wPx) || Number.isNaN(hPx)) continue
    if (wPx > ICON_MAX_PX || hPx > ICON_MAX_PX) continue
    icons++
    if (w !== h) asymmetric.push({ story: story.name, id: story.id, w, h })
  }
  totalIcons += icons
  if (icons > 0) storiesWithIcons++
}
await browser.close()

// ── 3. 判定:沒量到的先講(儀器失效優先於任何產品結論)──
const measured = STORIES.length - notMeasured.length
console.log(`\n${measured}/${STORIES.length} 則 story 量到;其中 ${storiesWithIcons} 則有 icon(共 ${totalIcons} 個 icons 量測)`)
console.log(`Asymmetric: ${asymmetric.length}`)
if (asymmetric.length > 0) {
  console.log('\n❌ 不對稱清單:')
  for (const item of asymmetric) console.log(`  ${item.story}: ${item.w}×${item.h}(${item.id})`)
}
if (notMeasured.length > 0) {
  instrumentFail(`${notMeasured.length}/${STORIES.length} 則 story 沒有量到(開不起來 / 沒渲染完成 / 缺檔)——`
    + '沒量到的 story 不得被讀成「沒有不對稱的 icon」', notMeasured.map(({ story, reason }) => `${story.id}:${reason}`))
}
if (totalIcons === 0) {
  instrumentFail(`${STORIES.length} 則 story 全部渲染完成,卻一個 icon 都沒量到 —— 量測本身失效(選擇器或尺寸篩選過時),不是「全 DS 0 個不對稱」`)
}
if (asymmetric.length > 0) process.exit(1)
console.log('✓ 全 DS 0 個 asymmetric icons')
