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

import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolveA11yStaticFile, startA11yStaticServer } from './lib/a11y-static-server.mjs'

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

export async function auditUrlWithAxe({
  url,
  browserType = chromium,
  axeBundlePath = axeBundle,
  settleMs = 1000,
} = {}) {
  let browser
  try {
    browser = await browserType.launch()
    const page = await (await browser.newContext()).newPage()
    const response = await page.goto(url, { waitUntil: 'networkidle' })
    if (!response || !response.ok()) throw new Error(`owned app server returned ${response?.status() ?? 'no response'}`)
    if (settleMs > 0) await page.waitForTimeout(settleMs)

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
      logger.error(`  ❌ a11y audit infrastructure error:${error.message}`)
      errors.push({ app, auditError: error.message })
    } finally {
      await server?.stop()
    }
  }

  logger.log('')
  if (errors.length > 0) {
    logger.error(`❌ ${errors.length} app(s) have a11y issues`)
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
