#!/usr/bin/env node
/**
 * story-screenshots.mjs — 指定 story id 的針對性截圖(M13 screenshot verify 機械化)。
 *
 * 用途:本機 sandbox 無法啟動瀏覽器時,經 story-screenshots.yml dispatch 在 CI 產出
 * 指定 story 的 PNG artifact。與 visual-audit.mjs(斷言/diff 稽核)分工:本工具零斷言,
 * 只產出人眼判讀用截圖。
 *
 * 分工(review F14 documented decision):visual-audit.mjs = 斷言/diff 稽核引擎(scenario 驅動);
 * 本工具 = 零斷言人眼判讀截圖(story id 驅動,CI artifact)。兩者 iframe 導航 shape 相似但
 * 契約不同,合併會把 dispatch 工具綁進稽核 scenario schema;維持分工、共通修正需雙向同步
 * (:visible 誤報修正已同步概念於兩處)。
 *
 * **這是工具,不是閘**(零斷言;但「story 沒開起來」必須顯性失敗,不能產出看似正常的截圖)。
 * 載入(2026-09-25):每則 story 由共用的 openStory(lib/launch-browser.mjs)開 —— 等 Storybook 回報渲染完成(含 play)、
 * 畫面健康、畫面裡每張圖(示範圖向遠端要真圖)載完並解碼、版面連續靜止 10 個影格(不拍到動畫中途)才截圖;
 * 取代舊的 networkidle + 固定睡 600ms + 「錯誤頁可見嗎」。
 * 開不起來 → 儀器失效:點名 story、列同源 404,截圖照存供診斷,exit 1。
 *
 * 前置:storybook-static/ 已建(npm run build-storybook)。
 * 用法:node scripts/story-screenshots.mjs --stories=<id1,id2,...> [--out=story-screenshots] [--viewport=800x900] [--touch] [--static-dir=<Storybook 建置>]
 *   --touch:行動裝置模擬(hasTouch + isMobile → Chromium `(pointer: coarse)` match),
 *   驗證觸控下的實際渲染(Select 的 useIsTouchDevice native 分支;Combobox 2026-09-18 起不分裝置,觸控下與桌機同一條路)。
 */
import { mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeDeterministicImageFailures, launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const stories = (arg('stories', '')).split(',').map((s) => s.trim()).filter(Boolean)
if (stories.length === 0) {
  console.error('❌ 必傳 --stories=<storyId1,storyId2,...>(完整 storybook story id)')
  process.exit(2)
}
// resolve(非 join):絕對 --out 路徑必須被尊重,join 會黏進 repo 下(review F12)
const outDir = resolve(PROJECT_ROOT, arg('out', 'story-screenshots'))
const [vw, vh] = arg('viewport', '800x900').split('x').map(Number)
if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw <= 0 || vh <= 0) {
  console.error(`❌ --viewport 格式必須為 <寬>x<高>(小寫 x,如 800x900),收到:${arg('viewport', '800x900')}`)
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const server = await startA11yStaticServer({ rootDirectory: resolve(PROJECT_ROOT, arg('static-dir', 'storybook-static')), defaultFile: 'iframe.html' })
const touch = process.argv.includes('--touch')
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: vw, height: vh }, hasTouch: touch, isMobile: touch })
let failures = 0
for (const id of stories) {
  // story 404 / render error / 空畫面 / 頁面例外必須顯性 fail,不可產出誤導性的截圖(openStory 丟 StoryRenderInstrumentError)
  let instrument = null
  let opened = null
  try {
    // 圖片:openStory 預設等畫面裡每張圖載完、解碼完,失敗 / 等不到 = 儀器失效並點名網址(lib「圖片就緒」區塊,2026-10-14)——
    // 取代原本的 requestsSettled(「請求全部結束」是網路層代理,圖到了不等於畫上了)。
    // demoImages 'network':這是給人看的截圖,示範圖要是真圖(本機合成圖只給不跟基準比的閘)
    opened = await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { demoImages: 'network', settleFrames: 10, notFound: server.notFound })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrument = error
  }
  const file = join(outDir, `${id.replaceAll('/', '_')}.png`)
  await page.screenshot({ path: file, fullPage: true })
  if (instrument) {
    failures += 1
    console.error(`✗ ${instrument.message}(截圖仍已存供診斷:${file})`)
  } else {
    console.log(`✓ ${file}`)
    // 確定性破圖(任何環境都載不到:RFC 保留名稱、同源 404、示範圖主機上真站沒有的網址)照拍,但點名 —— 照拍 ≠ 靜默拍下
    const brokenImages = describeDeterministicImageFailures(opened?.images?.deterministicFailures)
    if (brokenImages) console.warn(`  ${brokenImages}`)
  }
}
await browser.close()
await server.stop()
process.exit(failures > 0 ? 1 : 0)
