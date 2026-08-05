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
 * 前置:storybook-static/ 已建(npm run build-storybook)。
 * 用法:node scripts/story-screenshots.mjs --stories=<id1,id2,...> [--out=story-screenshots] [--viewport=800x900] [--touch]
 *   --touch:行動裝置模擬(hasTouch + isMobile → Chromium `(pointer: coarse)` match),
 *   驗證 useIsTouchDevice native 分支(Select/Combobox 觸控路徑)的實際渲染。
 */
import { mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
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

const server = await startA11yStaticServer({ rootDirectory: join(PROJECT_ROOT, 'storybook-static'), defaultFile: 'iframe.html' })
const touch = process.argv.includes('--touch')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: vw, height: vh }, hasTouch: touch, isMobile: touch })
let failures = 0
for (const id of stories) {
  await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  // story 404 / render error 必須顯性 fail,不可產出誤導性空白截圖。
  // 必以 :visible 過濾 — .sb-nopreview 正常渲染時也存在(僅 hidden),裸 count 全數誤報(2026-08-05 首跑實證)
  const errorText = await page.locator('.sb-show-errordisplay:visible, .sb-nopreview:visible').count()
  const file = join(outDir, `${id.replaceAll('/', '_')}.png`)
  await page.screenshot({ path: file, fullPage: true })
  if (errorText > 0) {
    failures += 1
    console.error(`✗ ${id} — story error/404(截圖仍已存供診斷:${file})`)
  } else {
    console.log(`✓ ${file}`)
  }
}
await browser.close()
await server.stop()
process.exit(failures > 0 ? 1 : 0)
