#!/usr/bin/env node
// verify-published-deploy.mjs — 跨 repo 交付健康度 canary(補 deep-audit 漏掉的「source→live 部署」那層)
//
// Why(2026-05-29 root cause):mirror workflow 從 2026-05-26 默默失敗(PAT 無 workflow scope)→
// published repo scaffold stale → netlify 部署舊 Storybook → 一片空白。稽核 dim 66/83 只驗 source +
// local fixture,沒有任何檢查確認「mirror 有沒有真的把 source 送達 live 部署」→ 漏抓數週。
// 本 script = 那層缺失的機械 canary。
//
// 3 層檢查(由淺到深):
//   L1 mirror-run health     — gh run:mirror workflow 最近一次 conclusion 必 success(免密碼,最便宜)
//   L2 source→published 同步  — published repo .storybook/main.ts 必等於本地 template(drift = mirror 沒送達)
//   L3 live-deploy render(可選)— 支援 template Edge Function Basic Auth 與既有 Netlify
//      dashboard password protection，playwright 通過驗證後逐故事斷言非空白
//
// 用法:
//   node scripts/verify-published-deploy.mjs                    # L1+L2(CI / audit 預設)
//   NETLIFY_LIVE_BASIC_AUTH=user:password node scripts/verify-published-deploy.mjs --live
//   NETLIFY_PREVIEW_PASSWORD=xxx node scripts/verify-published-deploy.mjs --live # legacy dashboard gate
//   … --live --site=<origin>   # L3 改驗別的部署(例:deploy preview,或本機起的 Storybook 建置 —— 驗 L3 本身用)
//
// L3 開故事的等待(2026-09-25,M37):原本每則故事**開一個新分頁**(`--single-process` 沙箱下同一個瀏覽器反覆
// newPage / close 不穩)、`goto(networkidle)` 失敗還 `.catch` 吞掉,再**固定睡 2.5 / 4 秒**當「渲染好了」的代理 ——
// 慢的網路上故事 2.6 秒才畫出來也會被判「空白」,反過來 networkidle 從不成立時也只是默默往下走。
// 現在全程共用一個分頁,每則經 lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)開啟:
//   story:等 Storybook 回報這則渲染完成(含 play)+ render-health(根節點非空、無關鍵資源失敗、無頁面例外);
//   docs :docs 沒有同一套 render phase,改等 docs 容器真的有內容(或 Storybook 錯誤頁出現)+ 文件層 render-health。
// 等不到 / 不健康 → 該則 L3 fail,訊息點名 story、附 Storybook 錯誤原文與 404 / 失敗請求。

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLISHED_REPO = 'ajenchen/ds-product-template'
const SITE = (process.argv.find((a) => a.startsWith('--site='))?.slice('--site='.length) || 'https://ds-product-template.netlify.app').replace(/\/+$/, '')
const WANT_LIVE = process.argv.includes('--live')

// docs 頁:docs 容器有內容(與原本的「非空白」判準同一條)或 Storybook 錯誤頁已出現 —— 兩者都是終點,回傳哪一種
const DOCS_SETTLED = () => {
  if (document.body?.classList.contains('sb-show-errordisplay')) return 'error'
  const r = document.querySelector('.sbdocs-wrapper, .sbdocs, #storybook-docs, #docs-root')
  return r && (r.childElementCount > 0 || (r.innerText || '').trim().length > 0) ? 'rendered' : false
}
let failed = false
const fail = (m) => { console.error('❌ ' + m); failed = true }
const ok = (m) => console.log('✓ ' + m)

// ── L1 mirror-run health ──────────────────────────────────────────────
try {
  const out = execSync(
    `gh run list --workflow=mirror-to-published-template.yml --limit 1 --json conclusion,status --jq '.[0].conclusion + "/" + .[0].status'`,
    { cwd: ROOT, encoding: 'utf8' },
  ).trim()
  if (out.startsWith('success')) ok(`L1 mirror workflow 最近一次:${out}`)
  else fail(`L1 mirror workflow 最近一次 = ${out}(非 success → published scaffold 可能 stale。看 gh run view 找原因)`)
} catch (e) {
  fail(`L1 無法查 mirror run(gh 沒裝/沒登入?):${e.message.split('\n')[0]}`)
}

// ── L2 source→published 同步(.storybook/main.ts parity)─────────────────
try {
  const localMain = readFileSync(join(ROOT, 'template/ds-product-template/.storybook/main.ts'), 'utf8')
  const b64 = execSync(`gh api repos/${PUBLISHED_REPO}/contents/.storybook/main.ts --jq '.content'`, {
    cwd: ROOT, encoding: 'utf8',
  }).trim()
  const pubMain = Buffer.from(b64, 'base64').toString('utf8')
  if (localMain.trim() === pubMain.trim()) ok('L2 published .storybook/main.ts === 本地 template(無 drift)')
  else fail('L2 published .storybook/main.ts ≠ 本地 template → mirror 沒把 source 送達(跑 mirror workflow 重新同步)')
} catch (e) {
  fail(`L2 無法比對 published main.ts:${e.message.split('\n')[0]}`)
}

// ── L3 live-deploy render(可選,需密碼)──────────────────────────────────
if (WANT_LIVE) {
  const basicAuth = process.env.NETLIFY_LIVE_BASIC_AUTH || ''
  const dashboardPassword = process.env.NETLIFY_PREVIEW_PASSWORD || ''
  const basicMatch = /^([^:\s]+):([^\s]+)$/.exec(basicAuth)
  if (!basicMatch && !dashboardPassword) {
    fail('L3 --live 需設 NETLIFY_LIVE_BASIC_AUTH=user:password(Edge Basic Auth)或 NETLIFY_PREVIEW_PASSWORD(legacy dashboard gate)')
  }
  else if (basicAuth && !basicMatch) fail('L3 NETLIFY_LIVE_BASIC_AUTH 必須是非空白 user:password')
  else {
    let browser
    try {
      browser = await launchBrowser()
      const ctx = await browser.newContext(basicMatch ? {
        httpCredentials: { username: basicMatch[1], password: basicMatch[2] },
      } : {})
      // 全程只用這一個分頁(`--single-process` 沙箱下同一個瀏覽器反覆 newPage / close 不穩,見 lib/launch-browser.mjs 檔頭)
      const page = await ctx.newPage()
      await page.goto(SITE + '/', { waitUntil: 'domcontentloaded' })
      const input = await page.$('input[name="password"]')
      if (input && dashboardPassword) {
        await input.fill(dashboardPassword)
        await page.keyboard.press('Enter')
        // 登入成功 = 密碼框消失(不是「網路閒下來了」);等不到就是登入失敗,不往下假裝有驗
        const loggedIn = await page.waitForSelector('input[name="password"]', { state: 'detached', timeout: 30_000 }).then(() => true, () => false)
        if (!loggedIn) throw new Error('dashboard 密碼送出後 30 秒密碼框仍在 —— 登入失敗(密碼錯或頁面改版),L3 沒有驗到任何故事')
      }
      // 讀部署 index 取所有故事
      const idxRes = await ctx.request.get(SITE + '/index.json')
      if (!idxRes.ok()) throw new Error(`讀不到 ${SITE}/index.json(HTTP ${idxRes.status()})`)
      const entries = JSON.parse(await idxRes.text()).entries || {}
      if (!Object.keys(entries).length) throw new Error(`${SITE}/index.json 沒有任何故事 —— 一則都沒驗,不能算通過`)
      for (const [id, e] of Object.entries(entries)) {
        const isDocs = e.type === 'docs'
        const view = isDocs ? 'docs' : 'story'
        const url = `${SITE}/iframe.html?id=${encodeURIComponent(id)}&viewMode=${view}`
        try {
          await openStory(page, url, isDocs
            // docs 內容在 docs 容器(#storybook-root 在 docs view 是空的),且 docs 沒有 story 的 render phase:
            // 以文件層 render-health(關鍵資源失敗 / 頁面例外)+ 等 docs 容器真的有內容
            ? { storybook: false, waitFor: DOCS_SETTLED }
            : {})
          if (isDocs && await page.evaluate(DOCS_SETTLED) === 'error') {
            const why = (await page.evaluate(() => document.getElementById('error-message')?.textContent ?? '')).trim().slice(0, 200)
            fail(`L3 docs 顯示 Storybook 錯誤頁:${id}(${why || '無錯誤原文'})`)
            continue
          }
          ok(`L3 render OK:${id}`)
        } catch (error) {
          if (!(error instanceof StoryRenderInstrumentError)) throw error
          fail(`L3 故事沒渲染出來(或空白):${id}(${view})—— ${error.detail}`)
        }
      }
    } catch (e) {
      fail(`L3 playwright 跑失敗:${e.message.split('\n')[0]}`)
    } finally {
      await browser?.close()
    }
  }
}

if (failed) { console.error('\n跨 repo 交付有問題 — 見上。'); process.exit(1) }
console.log('\n✅ 跨 repo 交付健康(source→published 同步' + (WANT_LIVE ? ' + live render' : '') + ')')
