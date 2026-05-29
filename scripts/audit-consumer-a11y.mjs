#!/usr/bin/env node
// audit-consumer-a11y.mjs — Phase 5 consumer-side a11y check on built apps
//
// 在 ds-product-template CI 跑(audit.yml 後 build step):
//   1. apps/*/dist 已 build
//   2. serve each app via http.server
//   3. Playwright + @axe-core 跑 WCAG 2 A+AA
//   4. fail = block PR
//
// 對齊 DS repo `npm run a11y:check`(scripts/audit-a11y.mjs)的 consumer-side equivalent。

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const APPS_DIR = 'apps'
const PORT = 8930
const errors = []

const apps = readdirSync(APPS_DIR).filter(n => {
  const p = join(APPS_DIR, n, 'dist')
  return statSync(join(APPS_DIR, n)).isDirectory() && existsSync(p)
})

if (apps.length === 0) {
  console.error('❌ No apps/*/dist found — run `npm run build` first')
  process.exit(1)
}

console.log(`Apps to audit: ${apps.join(', ')}`)

for (const app of apps) {
  console.log(`\n=== Auditing ${app} ===`)
  const distPath = join(APPS_DIR, app, 'dist')
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', distPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise(r => setTimeout(r, 1500))

  try {
    const browser = await chromium.launch()
    const page = await (await browser.newContext()).newPage()
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    // Inject axe-core via CDN(simple bootstrap;production CI could vendor)
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js' })
    const violations = await page.evaluate(async () => {
      const results = await window.axe.run({ runOnly: ['wcag2a', 'wcag2aa'] })
      return results.violations
    })

    if (violations.length > 0) {
      console.error(`  ❌ ${violations.length} WCAG violation(s):`)
      for (const v of violations.slice(0, 5)) {
        console.error(`     - ${v.id}: ${v.description}(${v.nodes.length} node(s))`)
      }
      errors.push({ app, violations: violations.length })
    } else {
      console.log(`  ✅ 0 WCAG violations`)
    }

    await browser.close()
  } finally {
    server.kill('SIGTERM')
  }
}

console.log('')
if (errors.length > 0) {
  console.error(`❌ ${errors.length} app(s) have a11y issues`)
  process.exit(1)
}
console.log('✅ All apps pass WCAG 2 A + AA')
