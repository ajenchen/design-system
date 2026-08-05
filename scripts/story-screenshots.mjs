#!/usr/bin/env node
/**
 * story-screenshots.mjs — 指定 story id 的針對性截圖(M13 screenshot verify 機械化)。
 *
 * 用途:本機 sandbox 無法啟動瀏覽器時,經 story-screenshots.yml dispatch 在 CI 產出
 * 指定 story 的 PNG artifact。與 visual-audit.mjs(斷言/diff 稽核)分工:本工具零斷言,
 * 只產出人眼判讀用截圖。
 *
 * 前置:storybook-static/ 已建(npm run build-storybook)。
 * 用法:node scripts/story-screenshots.mjs --stories=<id1,id2,...> [--out=story-screenshots] [--viewport=800x900]
 */
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
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
const outDir = join(PROJECT_ROOT, arg('out', 'story-screenshots'))
const [vw, vh] = arg('viewport', '800x900').split('x').map(Number)
mkdirSync(outDir, { recursive: true })

const server = await startA11yStaticServer({ rootDirectory: join(PROJECT_ROOT, 'storybook-static'), defaultFile: 'iframe.html' })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: vw, height: vh } })
let failures = 0
for (const id of stories) {
  await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  // story 404 / render error 必須顯性 fail,不可產出誤導性空白截圖
  const errorText = await page.locator('.sb-show-errordisplay, .sb-nopreview').count()
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
