#!/usr/bin/env node
// PeoplePicker baseline screenshots — Task 2 SSOT refactor 前的視覺基準(工具,不是閘;不在 CI)
// Refactor 後 re-run + visual diff 確認 0 regression
//
// 2026-09-25 修四件事(改前這支根本跑不起來):
//   1. `join` 沒 import → 一執行就 ReferenceError。
//   2. 每則 story 各開一個 page 再關掉:沙箱的 Chromium 一律 --single-process,關掉唯一的 page 會把 browser 帶走,
//      第二則起全部「Target page, context or browser has been closed」(lib/launch-browser.mjs 檔頭)。改成共用一個 page。
//   3. 「已渲染」用的是 networkidle + 固定睡 800ms(代理量),而且載入失敗被 catch 成一行 ✗ 之後繼續、最後 exit 0 ——
//      缺 story 檔時照樣「成功」寫出基準。改由共用的 openStory 證明渲染完成 + 版面靜止;任一則沒量到 = 儀器失效,
//      點名 story、附 404,exit 1,而且**一張都不寫**(全部拍成功才寫入,不留半套基準)。
//   4. 原本寫死 http://localhost:6006(dev server)。預設改成跟全部瀏覽器閘一樣,從本次獨佔的 storybook-static 快照供檔
//      (lib/a11y-static-server.mjs,有 404 帳本);仍要對 dev server 拍的話傳 --storybook-url=http://localhost:6006。
//
// Run: `node scripts/peoplepicker-baseline.mjs --update-baseline [--storybook-url=<origin>]`
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { ensureVisualBaselineDirectory, prepareVisualBaselineFile } from './lib/governance-visual-baselines.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
if (!process.argv.includes('--update-baseline')) {
  console.error('✗ refusing to rewrite committed governance baseline without --update-baseline')
  process.exit(2)
}
const urlArg = process.argv.find((a) => a.startsWith('--storybook-url='))?.slice('--storybook-url='.length)

const STORIES = [
  // 展示
  ['design-system-components-peoplepicker-展示--single',         'showcase-single'],
  ['design-system-components-peoplepicker-展示--multi',          'showcase-multi'],
  ['design-system-components-peoplepicker-展示--size-alignment', 'showcase-size'],
  // Anatomy
  ['design-system-components-peoplepicker-設計規格--overview',     'anatomy-overview'],
  ['design-system-components-peoplepicker-設計規格--inspector',    'anatomy-inspector'],
  ['design-system-components-peoplepicker-設計規格--mode-matrix',  'anatomy-mode-matrix'],
  ['design-system-components-peoplepicker-設計規格--size-matrix',  'anatomy-size-matrix'],
  ['design-system-components-peoplepicker-設計規格--color-matrix', 'anatomy-color-matrix'],
  ['design-system-components-peoplepicker-設計規格--state-behavior', 'anatomy-state-behavior'],
]

const server = urlArg ? null : await startA11yStaticServer({ rootDirectory: join(ROOT, 'storybook-static'), defaultFile: 'iframe.html' })
const BASE = urlArg ?? server.origin
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })
const shots = []
const instrumentFailures = []
for (const [id, label] of STORIES) {
  try {
    // 渲染完成(含 play)→ 畫面健康 → 字型 → 連續 10 影格靜止,才截圖(取代 networkidle + 固定睡 800ms)
    await openStory(page, `${BASE}/iframe.html?id=${id}&viewMode=story`, { settleFrames: 10, notFound: server?.notFound })
    shots.push([label, await page.screenshot({ fullPage: false })])
    console.log(`✓ ${label}`)
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrumentFailures.push(label)
    console.error(`✗ ${label}:${error.message}`)
  }
}
await browser.close()
await server?.stop()

if (instrumentFailures.length) {
  console.error(`\n✗ ${instrumentFailures.length} / ${STORIES.length} 則沒有量到(儀器失效,不是產品裁決):${instrumentFailures.join(', ')}`)
  console.error('✗ 基準一張都沒寫 —— 全部拍成功才寫入,不留半套基準。')
  process.exit(1)
}
const OUT = ensureVisualBaselineDirectory({ repoRoot: ROOT, collection: 'targeted', childPath: 'people-picker' })
for (const [label, png] of shots) {
  writeFileSync(prepareVisualBaselineFile({ repoRoot: ROOT, collection: 'targeted', childPath: `people-picker/${label}.png` }), png)
}
console.log(`\nbaseline saved → ${OUT}`)
