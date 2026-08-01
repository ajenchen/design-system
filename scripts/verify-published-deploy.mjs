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

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLISHED_REPO = 'ajenchen/ds-product-template'
const SITE = 'https://ds-product-template.netlify.app'
const WANT_LIVE = process.argv.includes('--live')
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
    try {
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      const ctx = await browser.newContext(basicMatch ? {
        httpCredentials: { username: basicMatch[1], password: basicMatch[2] },
      } : {})
      const login = await ctx.newPage()
      await login.goto(SITE + '/', { waitUntil: 'domcontentloaded' })
      const input = await login.$('input[name="password"]')
      if (input && dashboardPassword) {
        await input.fill(dashboardPassword)
        await login.keyboard.press('Enter')
        await login.waitForLoadState('networkidle').catch(() => {})
      }
      // 讀部署 index 取所有故事
      const idxRaw = await (await ctx.request.get(SITE + '/index.json')).text()
      const entries = JSON.parse(idxRaw).entries || {}
      for (const [id, e] of Object.entries(entries)) {
        const isDocs = e.type === 'docs'
        const view = isDocs ? 'docs' : 'story'
        const p = await ctx.newPage()
        await p.goto(`${SITE}/iframe.html?id=${id}&viewMode=${view}`, { waitUntil: 'networkidle' }).catch(() => {})
        // docs 頁較重,多等;且 docs 內容在 docs 容器(非 #storybook-root,後者在 docs view 是空的)
        await p.waitForTimeout(isDocs ? 4000 : 2500)
        const blank = await p.evaluate((docs) => {
          const sel = docs ? '.sbdocs-wrapper, .sbdocs, #storybook-docs, #docs-root' : '#storybook-root, #root'
          const r = document.querySelector(sel)
          return !r || (r.childElementCount === 0 && (r.innerText || '').trim().length === 0)
        }, isDocs)
        if (blank) fail(`L3 故事空白:${id}(${view})`)
        else ok(`L3 render OK:${id}`)
        await p.close()
      }
      await browser.close()
    } catch (e) {
      fail(`L3 playwright 跑失敗:${e.message.split('\n')[0]}`)
    }
  }
}

if (failed) { console.error('\n跨 repo 交付有問題 — 見上。'); process.exit(1) }
console.log('\n✅ 跨 repo 交付健康(source→published 同步' + (WANT_LIVE ? ' + live render' : '') + ')')
