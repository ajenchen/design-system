#!/usr/bin/env node
// audit-consumer-a11y.mjs — Phase 5 consumer-side a11y check on built apps
//
// 在 consumer repo CI 跑(audit.yml 後 build step):
//   1. apps/*/dist 已 build
//   2. serve each app from an owned ephemeral 127.0.0.1 capability
//   3. Playwright + @axe-core 跑 WCAG 2 A+AA
//   4. fail = block PR
//
// 對齊 DS repo `npm run a11y:check`(scripts/audit-a11y.mjs)的 consumer-side equivalent。
//
// **「頁面真的渲染出來了」由共用的 openStory(document 模式)證明,不再用固定睡眠代替**(2026-09-25,M37)。
// 錨例:app 的 bundle 404(dist/assets 缺檔)或 bundle 載入後什麼都沒掛上時,`#root` 是空的,axe 對一個
// 空白頁當然找不到任何違規 —— 舊版(`networkidle` + 固定睡 1000ms、沒有任何渲染檢查)於是印出
// 「✅ All apps pass WCAG 2 A + AA」、exit 0。要保證的性質是「axe 量的是 app 真正渲染出來的畫面」,
// 量的卻是「網路靜了、又過了一秒」。現在:根節點沒有內容 / 關鍵資源(document/script/stylesheet)缺檔 /
// 頁面例外 → 以 INSTRUMENT-FAIL(儀器失效:沒量到,不是產品裁決)的名義紅,並點名 app 與缺的檔。
//
// 交付面:這支腳本隨 fork 治理套件與 published template 交付給 consumer,所以它 import 的
// `lib/launch-browser.mjs` 與其依賴 `lib/storybook-render-health.mjs` 一併登記進四個發送清單:
// build-fork-governance.mjs 的 MANAGED_FILE_SOURCES / infra/governance/inventory/managed-repos.json /
// published-template-mirror-policy.json / build-published-template-mirror.mjs 的 ALLOWLIST;另外
// consumer-source-harness.mjs 的 TRUSTED_PRODUCT_CHECK_FILES(staged 的受保護檢查器)也必須是完整閉包。
// fork 產生器、mirror 產生器、test-consumer-source-harness 各有相依閉包檢查,test-setup-governance 由本檔的
// import 閉包推導清單並比對四個發送清單 —— 漏登記的相對 import 會當場擋下(2026-09-25 兩面實跑)。
// 先前為了不擴張交付面而就地抄一份 SANDBOX_ARGS;現在 launch-browser 本來就要交付,單一住所改回直接 import(M17)。

import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolveA11yStaticFile, startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { INSTRUMENT_FAIL_MARKER, SANDBOX_ARGS, StoryRenderInstrumentError, openStory } from './lib/launch-browser.mjs'

const require = createRequire(import.meta.url)
const axeBundle = require.resolve('axe-core/axe.min.js')
const SCRIPT_PATH = fileURLToPath(import.meta.url)

const APPS_DIR = 'apps'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptySingleLine(value, label) {
  if (typeof value !== 'string' || !value || /[\0\r\n]/.test(value)) throw new Error(`${label} must be a non-empty single-line string`)
  return value
}

/** Refuse malformed transport output instead of treating missing `length` as zero violations. */
export function validateAxeViolations(violations) {
  if (!Array.isArray(violations)) throw new Error('axe result violations must be an array')
  for (const [violationIndex, violation] of violations.entries()) {
    if (!isRecord(violation)) throw new Error(`axe violation ${violationIndex} must be an object`)
    nonEmptySingleLine(violation.id, `axe violation ${violationIndex} id`)
    nonEmptySingleLine(violation.description, `axe violation ${violationIndex} description`)
    if (!Array.isArray(violation.nodes) || violation.nodes.length === 0) {
      throw new Error(`axe violation ${violation.id} nodes must be a non-empty array`)
    }
    for (const [nodeIndex, node] of violation.nodes.entries()) {
      if (!isRecord(node)) throw new Error(`axe violation ${violation.id} node ${nodeIndex} must be an object`)
      if (typeof node.html !== 'string' || !node.html) throw new Error(`axe violation ${violation.id} node ${nodeIndex} html must be non-empty`)
      if (!Array.isArray(node.target) || node.target.length === 0) {
        throw new Error(`axe violation ${violation.id} node ${nodeIndex} target must be a non-empty array`)
      }
      for (const target of node.target) {
        const validTarget = typeof target === 'string'
          ? target.length > 0
          : Array.isArray(target) && target.length > 0 && target.every(part => typeof part === 'string' && part.length > 0)
        if (!validTarget) throw new Error(`axe violation ${violation.id} node ${nodeIndex} target is malformed`)
      }
    }
  }
  return violations
}

export function discoverBuiltApps(appsDir = APPS_DIR) {
  if (!existsSync(appsDir)) return []
  const appsInfo = lstatSync(appsDir)
  if (!appsInfo.isDirectory() || appsInfo.isSymbolicLink()) throw new Error('apps root must be a regular non-symlink directory')
  const apps = []
  for (const name of readdirSync(appsDir).sort()) {
    const appPath = join(appsDir, name)
    const info = lstatSync(appPath)
    if (info.isSymbolicLink()) throw new Error(`${name}: app root may not be a symlink`)
    if (info.isDirectory()) apps.push(name)
  }
  for (const app of apps) {
    const distPath = join(appsDir, app, 'dist')
    const indexPath = resolveA11yStaticFile(distPath, '/index.html')
    if (!indexPath) throw new Error(`${app}: dist/index.html must be one physically contained single-link regular file`)
  }
  return apps
}

export async function startStaticServer({ distPath } = {}) {
  return startA11yStaticServer({ rootDirectory: distPath, defaultFile: 'index.html' })
}

/**
 * 「這個 app 的頁面沒有渲染出來」的儀器失效(沒量到,不是產品裁決)。訊息以 INSTRUMENT-FAIL 開頭、點名 app,
 * 附缺的檔(同源 404)與失敗原因 —— 絕不被讀成「0 個違規」。
 */
export class ConsumerAppRenderError extends Error {
  constructor({ app, cause }) {
    const detail = cause instanceof StoryRenderInstrumentError ? cause.detail : String(cause?.message ?? cause).split('\n')[0]
    super(`${INSTRUMENT_FAIL_MARKER} app「${app}」的頁面沒有渲染出來 —— ${detail}。`
      + '這是儀器失效(沒量到),不是產品裁決:axe 沒有對一個空白 / 半載入的頁面下結論,這次不能算通過', { cause })
    this.name = 'ConsumerAppRenderError'
    this.app = app
    this.kind = cause instanceof StoryRenderInstrumentError ? cause.kind : 'unknown'
    this.failedRequests = cause instanceof StoryRenderInstrumentError ? cause.failedRequests : []
  }
}

export async function auditUrlWithAxe({
  url,
  app = url,
  notFound = null,
  browserType = chromium,
  axeBundlePath = axeBundle,
  // 版面連續靜止幾個影格才開始量(影格不是毫秒:慢的機器只會等久一點,不會提早取樣)。0 = 不等靜止。
  settleFrames = 10,
  // 「根節點出現內容」的等待上限(不是「已渲染」的代理 —— 成功一律由根節點真的有內容決定)。
  healthTimeoutMs = 15_000,
} = {}) {
  let browser
  try {
    // 用 repo 共用的沙箱參數(`lib/launch-browser.mjs` 的單一住所),不要自己起一套 ——
    // 2026-09-21 夜間 harness 實測:裸 launch 在受限沙箱起不來,而全 repo 其他瀏覽器閘都能跑,
    // 差別就只在這組參數。同一份程式在不同環境給不同答案,本身就是量具問題。
    browser = await browserType.launch({ headless: true, args: [...SANDBOX_ARGS] })
    const page = await (await browser.newContext()).newPage()
    // 共用的「真的渲染完成了」:document 模式 = 根節點(#root / main / body)有內容、document/script/stylesheet
    // 沒有缺檔、沒有頁面例外、渲染期間發出的請求全部結束、版面靜止 —— 任何一項不成立就丟,不量。
    try {
      await openStory(page, url, {
        storybook: false,
        label: app,
        notFound,
        requestsSettled: true,
        settleFrames,
        healthTimeoutMs,
      })
    } catch (error) {
      throw new ConsumerAppRenderError({ app, cause: error })
    }

    // Exact lockfile dependency: no mutable CDN code enters the protected audit.
    await page.addScriptTag({ path: axeBundlePath })
    return await page.evaluate(async () => {
      const results = await window.axe.run({ runOnly: ['wcag2a', 'wcag2aa'] })
      return results.violations
    })
  } finally {
    await browser?.close()
  }
}

export async function runConsumerA11yAudit({
  appsDir = APPS_DIR,
  logger = console,
  startServer = startStaticServer,
  auditUrl = auditUrlWithAxe,
  auditOptions = {},
} = {}) {
  let apps
  const errors = []

  try {
    apps = discoverBuiltApps(appsDir)
  } catch (error) {
    logger.error(`❌ invalid consumer build:${error.message}`)
    return 1
  }

  if (apps.length === 0) {
    logger.error('❌ No apps/*/dist found — run `npm run build` first')
    return 1
  }

  logger.log(`Apps to audit: ${apps.join(', ')}`)

  for (const app of apps) {
    logger.log(`\n=== Auditing ${app} ===`)
    const distPath = join(appsDir, app, 'dist')
    let server
    try {
      server = await startServer({ app, distPath })
      if (!server || !/^http:\/\/127\.0\.0\.1:\d+$/.test(server.origin || '') || typeof server.stop !== 'function') {
        throw new Error('static server did not return an owned IPv4 loopback capability')
      }
      const violations = validateAxeViolations(await auditUrl({
        ...auditOptions,
        url: server.origin,
        app,
        // 伺服器端的同源 404 帳本:缺檔時點名是哪個檔(瀏覽器事件可能晚到,伺服器記的不會)
        notFound: Array.isArray(server.notFound) ? server.notFound : null,
      }))

      if (violations.length > 0) {
        logger.error(`  ❌ ${violations.length} WCAG violation(s):`)
        for (const violation of violations.slice(0, 5)) {
          logger.error(`     - ${violation.id}: ${violation.description}(${violation.nodes.length} node(s))`)
        }
        errors.push({ app, violations: violations.length })
      } else {
        logger.log('  ✅ 0 WCAG violations')
      }
    } catch (error) {
      if (error instanceof ConsumerAppRenderError) {
        logger.error(`  ❌ ${error.message}`)
      } else {
        logger.error(`  ❌ ${INSTRUMENT_FAIL_MARKER} a11y audit infrastructure error:${error.message}`)
      }
      errors.push({ app, auditError: error.message })
    } finally {
      await server?.stop()
    }
  }

  logger.log('')
  if (errors.length > 0) {
    // **「儀器失效」與「產品有問題」要分開報**(2026-09-21)。
    // 原本兩者共用 errors 陣列、共用同一句「N app(s) have a11y issues」——
    // 於是瀏覽器起不來會被報成「這個 app 有無障礙問題」,指控一個不存在的問題。
    // 兩邊都照樣紅(缺證據不得放行),但**訊息必須指向正確的方向**,
    // 否則下一個人會拿著錯的線索去查錯的地方。
    const infrastructure = errors.filter((item) => item.auditError)
    const product = errors.filter((item) => !item.auditError)
    if (product.length > 0) logger.error(`❌ ${product.length} app(s) have a11y issues`)
    if (infrastructure.length > 0) {
      logger.error(`❌ ${INSTRUMENT_FAIL_MARKER}:${infrastructure.length} app(s) 量不到(儀器失效,不是產品有問題;沒量到不等於 0 個違規):`)
      for (const item of infrastructure) logger.error(`   - ${item.app}:${String(item.auditError).split('\n')[0]}`)
    }
    return 1
  }
  logger.log('✅ All apps pass WCAG 2 A + AA')
  return 0
}

const IS_MAIN = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH)
if (IS_MAIN) {
  const args = process.argv.slice(2)
  if (args.length !== 0 && !(args.length === 2 && args[0] === '--repo' && args[1])) {
    console.error('usage: audit-consumer-a11y.mjs [--repo <candidate>]')
    process.exit(2)
  }
  const repo = resolve(args.length === 0 ? process.cwd() : args[1])
  process.exitCode = await runConsumerA11yAudit({ appsDir: join(repo, APPS_DIR) })
}
